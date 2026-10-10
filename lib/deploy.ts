import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { join } from "node:path";
import { claspError, claspOrThrow, runClasp } from "@/lib/clasp";
import { getFiles, hashFiles, writeFile } from "@/lib/files";
import { srcDir } from "@/lib/local/paths";
import { assertRemoteUnchanged, recordRemote } from "@/lib/import";
import { enforceBoundManifest, parseBoundCreate, sheetUrl } from "@/lib/bound";
import { enforceWebAppManifest } from "@/lib/manifest";
import { withBackendNotice } from "@/lib/pages/backend-page";
import { withDispatcher, type SourceFile } from "@/lib/pages/dispatcher";
import { PagesRuntimeMissingError } from "@/lib/pages/runtime";
import { ensurePagesRuntime } from "@/lib/premium/content";
import { saveDeployment, updateProject } from "@/lib/projects";
import type { EgsDeployment, EgsProject } from "@/types/db";

/**
 * Deploy pipeline (server-only): pushes the project's src/ folder to the user's own Google account
 * through clasp, then publishes it as a web app. First deploy creates the script + deployment;
 * every later deploy PATCHes that same deployment (20-deployment cap per script + stable /exec URL).
 */

const INSTALL_TRIGGERS_RE = /\bfunction\s+installTriggers\s*\(/;
const MANIFEST = "appsscript.json";

/** Only Apps Script sources are pushed — anything else in src/ (README, notes) stays local. */
const CLASPIGNORE = ["**/**", `!${MANIFEST}`, "!**/*.gs", "!**/*.js", "!**/*.html", ""].join("\n");
const isPushed = (path: string): boolean => path === MANIFEST || /\.(gs|js|html)$/i.test(path);

/**
 * The set clasp pushes. A project whose front page lives on GitHub Pages (premium, lib/pages) also gets
 * the doPost dispatcher so the page outside GAS can call the script; everything else is unchanged.
 */
async function filesToPush(project: EgsProject, files: SourceFile[], pagesUrl?: string | null): Promise<SourceFile[]> {
  if (project.hosting !== "github") return files;
  // the dispatcher text is Pro content from the licence server (cached after the first online publish)
  const runtime = await ensurePagesRuntime();
  if (!runtime) throw new PagesRuntimeMissingError();
  const withRemote = withDispatcher(files, runtime.dispatcher);
  // once the page is on GitHub, the Google copy of it only points there (lib/pages/backend-page)
  return pagesUrl ? withBackendNotice(withRemote, pagesUrl, project.name) : withRemote;
}

/**
 * Run `clasp push` with the app's changes (the dispatcher, the backend notice page) present in src/ only
 * for the duration of the push: they are not project files, so added files are removed and swapped files
 * restored afterwards, and the editor never shows them.
 */
async function pushWithExtras(project: EgsProject, pushed: SourceFile[], own: SourceFile[]): Promise<void> {
  const dir = srcDir(project.id);
  const changed = pushed.filter((p) => own.find((f) => f.path === p.path)?.content !== p.content);
  try {
    for (const f of changed) await fsWriteFile(join(dir, f.path), f.content, "utf8");
    await claspOrThrow(["push", "--force"], dir);
  } finally {
    for (const f of changed) {
      const original = own.find((o) => o.path === f.path);
      if (original) await fsWriteFile(join(dir, f.path), original.content, "utf8");
      else await rm(join(dir, f.path), { force: true });
    }
  }
}

/** The oauthScopes declared in a manifest (bounded — it is AI-editable). */
function manifestScopes(manifest: string): string[] {
  try {
    const parsed = JSON.parse(manifest) as { oauthScopes?: unknown };
    return Array.isArray(parsed.oauthScopes)
      ? parsed.oauthScopes.filter((s): s is string => typeof s === "string" && s.length <= 256).slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

export interface DeployResult {
  execUrl?: string;
  scriptId: string;
  needsTriggerSetup: boolean;
  scriptEditorUrl: string;
  /** true when the files were identical to the last deploy → nothing was pushed (URL reused as-is). */
  unchanged: boolean;
  /** Manifest scopes added vs the previous deploy; the owner must re-authorize the script for these. */
  scopesAdded: string[];
  /** kind "bound": the Google Sheet the script lives in (there is no /exec URL) */
  sheetUrl?: string;
}

async function readManifest(projectId: string): Promise<string | null> {
  try {
    return await readFile(join(srcDir(projectId), MANIFEST), "utf8");
  } catch {
    return null;
  }
}

/** Point clasp at an existing script (so a moved/copied project folder still deploys to the right one). */
async function writeClaspConfig(projectId: string, scriptId: string): Promise<void> {
  const dir = srcDir(projectId);
  await fsWriteFile(join(dir, ".clasp.json"), JSON.stringify({ scriptId, rootDir: "" }, null, 2), "utf8");
}

const CREATED_SCRIPT = /script\.google\.com\/d\/([\w-]{20,})\/edit/;

/**
 * Create the Apps Script project. clasp overwrites appsscript.json with Google's default — restore ours.
 * If clasp created the remote script but then failed locally, keep the id it printed rather than
 * leaving an orphan in the user's Drive (and creating a second one on retry).
 */
async function createScript(project: EgsProject, manifest: string): Promise<string> {
  const dir = srcDir(project.id);
  await rm(join(dir, ".clasp.json"), { force: true });
  const r = await runClasp(["create-script", "--type", "standalone", `--title=${project.name}`, "--rootDir", "."], {
    projectDir: dir,
  });
  const printedId = r.stdout.match(CREATED_SCRIPT)?.[1] ?? null;
  let scriptId: string | null = null;
  try {
    scriptId = (JSON.parse(await readFile(join(dir, ".clasp.json"), "utf8")) as { scriptId?: string }).scriptId ?? null;
  } catch {
    scriptId = null;
  }
  scriptId ??= printedId;
  if (!scriptId) throw claspError("create-script", r);
  if (r.code !== 0) console.warn("[deploy] clasp create-script exited non-zero after creating", scriptId, r.stderr);
  await writeClaspConfig(project.id, scriptId);
  await writeFile(project.id, MANIFEST, manifest);
  return scriptId;
}

/**
 * "เปิด /dev": push the current files to the script's HEAD (the published /exec version is untouched)
 * and return the HEAD deployment's /dev URL. Needs one real deploy first (so the script exists).
 * /dev only renders for the owner signed in to that Google account — the UI opens it in a new tab.
 */
export async function pushHeadPreview(project: EgsProject): Promise<{ devUrl: string }> {
  if (!project.script_id) throw new Error("not_deployed");
  const dir = srcDir(project.id);
  const imported = project.origin === "imported";
  // an imported script keeps its own manifest; and Google's copy must not have moved under us
  if (imported) await assertRemoteUnchanged(project);
  else await writeFile(project.id, MANIFEST, enforceWebAppManifest(await readManifest(project.id)));
  await fsWriteFile(join(dir, ".claspignore"), CLASPIGNORE, "utf8");
  await writeClaspConfig(project.id, project.script_id);
  const own = (await getFiles(project.id)).filter((f) => isPushed(f.path));
  const pushed = await filesToPush(project, own);
  await pushWithExtras(project, pushed, own);
  if (imported) await recordRemote(project, hashFiles(pushed));
  const out = await claspOrThrow(["list-deployments", "--json"], dir);
  const start = out.indexOf("[");
  if (start < 0) throw new Error("clasp_deployments_unparsed");
  const list = JSON.parse(out.slice(start)) as { deploymentId: string; versionNumber?: number | null }[];
  const head = list.find((d) => d.versionNumber == null);
  if (!head) throw new Error("clasp_no_head_deployment");
  return { devUrl: `https://script.google.com/macros/s/${head.deploymentId}/dev` };
}

/**
 * Publish an imported script: its manifest is left as it is, Google's copy is checked for outside edits
 * first, and the script's EXISTING deployment is moved to the new version (same URL). A script without a
 * deployment (e.g. one bound to a sheet) only gets its code updated: no deployment is created for it.
 */
async function deployImported(project: EgsProject, opts: { pagesUrl?: string }): Promise<DeployResult> {
  const scriptId = project.script_id;
  if (!scriptId) throw new Error("not_imported");
  const dir = srcDir(project.id);
  const own = (await getFiles(project.id)).filter((f) => isPushed(f.path));
  if (own.length === 0) throw new Error("no_files");
  const files = await filesToPush(project, own, opts.pagesUrl ?? project.pages?.url);
  const deployHash = hashFiles(files);
  const needsTriggerSetup = files.some((f) => INSTALL_TRIGGERS_RE.test(f.content));
  const existing = project.deployment;
  const scriptEditorUrl = `https://script.google.com/d/${scriptId}/edit`;
  // with a deployment, "unchanged" means the deployment already runs this code; without one, that it was pushed
  const current = existing?.deployment_id ? existing.content_hash : project.remote?.pushed;
  if (current === deployHash) {
    return { execUrl: existing?.exec_url || undefined, scriptId, needsTriggerSetup, scriptEditorUrl, unchanged: true, scopesAdded: [] };
  }

  await assertRemoteUnchanged(project);
  await fsWriteFile(join(dir, ".claspignore"), CLASPIGNORE, "utf8");
  await writeClaspConfig(project.id, scriptId);
  await pushWithExtras(project, files, own);
  // Google now holds our code: record the new sync point before anything else can fail, or the next
  // publish would take our own push for an outside edit
  await recordRemote(project, deployHash);

  if (existing?.deployment_id) {
    const versionOut = await claspOrThrow(["create-version", `EasyGAS ${new Date().toISOString()}`], dir);
    const versionNumber = Number(versionOut.match(/version\s+(\d+)/i)?.[1]);
    if (!Number.isFinite(versionNumber)) throw new Error("clasp_version_unparsed");
    await claspOrThrow(["update-deployment", existing.deployment_id, "-V", String(versionNumber)], dir);
    await saveDeployment(project.id, { ...existing, version_number: versionNumber, content_hash: deployHash, updated_at: new Date().toISOString() });
  }
  return { execUrl: existing?.exec_url || undefined, scriptId, needsTriggerSetup, scriptEditorUrl, unchanged: false, scopesAdded: [] };
}

/**
 * A project bound to a Google Sheet that this app made (new, or cloned from a share): the first publish
 * creates a NEW Sheet with the script inside it, later ones push into that script. No web-app deployment,
 * and the manifest is not turned into a web app's.
 */
async function deployBound(project: EgsProject): Promise<DeployResult> {
  const dir = srcDir(project.id);
  if ((await getFiles(project.id)).length === 0) throw new Error("no_files");
  const manifest = enforceBoundManifest(await readManifest(project.id));
  await writeFile(project.id, MANIFEST, manifest);
  const files = (await getFiles(project.id)).filter((f) => isPushed(f.path));
  const hash = hashFiles(files);
  const needsTriggerSetup = files.some((f) => INSTALL_TRIGGERS_RE.test(f.content));

  let scriptId = project.script_id;
  let sheetId = project.bound_sheet_id;
  const done = (unchanged: boolean): DeployResult => ({
    scriptId: scriptId!,
    needsTriggerSetup,
    scriptEditorUrl: `https://script.google.com/d/${scriptId}/edit`,
    sheetUrl: sheetId ? sheetUrl(sheetId) : undefined,
    unchanged,
    scopesAdded: [],
  });
  if (scriptId && project.bound_push?.hash === hash) return done(true);

  await fsWriteFile(join(dir, ".claspignore"), CLASPIGNORE, "utf8");
  if (scriptId) {
    await writeClaspConfig(project.id, scriptId);
  } else {
    await rm(join(dir, ".clasp.json"), { force: true });
    const r = await runClasp(["create-script", "--type", "sheets", `--title=${project.name}`, "--rootDir", ".", "--json"], { projectDir: dir });
    const ids = parseBoundCreate(r.stdout);
    if (!ids) throw claspError("create-script", r);
    scriptId = ids.scriptId;
    sheetId = ids.sheetId;
    await updateProject(project.id, { script_id: scriptId, bound_sheet_id: sheetId });
    await writeClaspConfig(project.id, scriptId);
    await writeFile(project.id, MANIFEST, manifest); // clasp pulled Google's default manifest over ours
  }

  await claspOrThrow(["push", "--force"], dir);
  await updateProject(project.id, { bound_push: { hash, at: new Date().toISOString() } });
  return done(false);
}

/** `opts.pagesUrl`: where the GitHub copy of the front page lives (defaults to the last publish). */
export async function deployProject(_userId: string, project: EgsProject, opts: { pagesUrl?: string } = {}): Promise<DeployResult> {
  if (project.origin === "imported") return deployImported(project, opts);
  if (project.kind === "bound") return deployBound(project);
  const dir = srcDir(project.id);
  if ((await getFiles(project.id)).length === 0) throw new Error("no_files");

  const manifest = enforceWebAppManifest(await readManifest(project.id));
  await writeFile(project.id, MANIFEST, manifest);
  const own = (await getFiles(project.id)).filter((f) => isPushed(f.path));
  // throws before anything is pushed when a GitHub-hosted project defines its own doPost
  const files = await filesToPush(project, own, opts.pagesUrl ?? project.pages?.url);
  const deployHash = hashFiles(files);
  const needsTriggerSetup = files.some((f) => INSTALL_TRIGGERS_RE.test(f.content));
  const existing = project.deployment;

  if (existing?.content_hash === deployHash && existing.exec_url && project.script_id) {
    return {
      execUrl: existing.exec_url,
      scriptId: project.script_id,
      needsTriggerSetup,
      scriptEditorUrl: `https://script.google.com/d/${project.script_id}/edit`,
      unchanged: true,
      scopesAdded: [],
    };
  }

  const newScopes = manifestScopes(manifest);
  const prevScopes = existing?.oauth_scopes ?? [];
  const scopesAdded = existing && prevScopes.length > 0 ? newScopes.filter((s) => !prevScopes.includes(s)) : [];
  const storedScopes = newScopes.length > 0 ? newScopes : prevScopes;

  await fsWriteFile(join(dir, ".claspignore"), CLASPIGNORE, "utf8");
  let scriptId = project.script_id;
  if (scriptId) {
    await writeClaspConfig(project.id, scriptId);
  } else {
    scriptId = await createScript(project, manifest);
    await updateProject(project.id, { script_id: scriptId });
  }

  await pushWithExtras(project, files, own);
  const versionOut = await claspOrThrow(["create-version", `deploy ${new Date().toISOString()}`], dir);
  const versionNumber = Number(versionOut.match(/version\s+(\d+)/i)?.[1]);
  if (!Number.isFinite(versionNumber)) throw new Error("clasp_version_unparsed");

  let deploymentId = existing?.deployment_id ?? null;
  if (deploymentId) {
    await claspOrThrow(["update-deployment", deploymentId, "-V", String(versionNumber), `--description=${project.name}`], dir);
  } else {
    const out = await claspOrThrow(["create-deployment", "-V", String(versionNumber), `--description=${project.name}`], dir);
    deploymentId = out.match(/(AKfy[\w-]+)/)?.[1] ?? null;
    if (!deploymentId) throw new Error("clasp_deployment_unparsed");
  }

  const execUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
  const now = new Date().toISOString();
  const record: EgsDeployment = {
    id: existing?.id ?? randomUUID(),
    project_id: project.id,
    deployment_id: deploymentId,
    entry_type: "webapp",
    exec_url: execUrl,
    version_number: versionNumber,
    content_hash: deployHash,
    oauth_scopes: storedScopes,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await saveDeployment(project.id, record);
  // new scopes = Google asks the owner again → the "approve the backend" reminder comes back
  if (scopesAdded.length > 0 && project.backend_authorized_at) await updateProject(project.id, { backend_authorized_at: null });

  return {
    execUrl,
    scriptId,
    needsTriggerSetup,
    scriptEditorUrl: `https://script.google.com/d/${scriptId}/edit`,
    unchanged: false,
    scopesAdded,
  };
}

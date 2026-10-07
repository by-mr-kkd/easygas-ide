import { deployProject, type DeployResult } from "@/lib/deploy";
import { getFiles } from "@/lib/files";
import { buildStaticPage } from "@/lib/pages/static-page";
import { githubToken } from "@/lib/pages/github-auth";
import { createGitHubClient, gitBlobSha, PagesError, type FetchLike } from "@/lib/pages/github-api";
import { GITHUB_CLIENT_ID } from "@/lib/pages/config";
import { pagesUrlFor, repoNameFor, SHARE_PARAM, shareUrlFor } from "@/lib/pages/repo-name";
import { premiumStatus } from "@/lib/premium/status";
import { getProject, updateProject } from "@/lib/projects";
import type { EgsProject } from "@/types/db";

/**
 * "วางหน้าเว็บบน GitHub" (premium): publish the GAS web app as usual (deploy.ts adds the doPost
 * dispatcher for hosting === "github"), then put a static copy of the front page on the user's own
 * GitHub Pages, pointed at the deployment's /exec URL. Google blocks the camera inside GAS web apps;
 * a page on github.io is not.
 */

export interface PublishPagesResult {
  /** The app's main link from now on. */
  url: string;
  /** Same page; the parameter makes LINE open it in the device browser (its in-app browser blocks the camera). */
  shareUrl: string;
  repo: string;
  /** false when the Pages build was still running after the bounded wait (the URL works a little later). */
  built: boolean;
  deploy: DeployResult;
}

export type PublishStep = "deploy" | "build" | "repo" | "upload" | "pages" | "wait" | "save";
export { pagesUrlFor, repoNameFor, SHARE_PARAM, shareUrlFor };

export interface PublishDeps {
  fetchImpl?: FetchLike;
  onStep?: (step: PublishStep) => void;
  /** test seam: skip the real GAS deploy */
  deploy?: (project: EgsProject) => Promise<DeployResult>;
}

export async function publishToPages(userId: string, project: EgsProject, deps: PublishDeps = {}): Promise<PublishPagesResult> {
  if (!(await premiumStatus()).active) throw new PagesError("PREMIUM_REQUIRED", "ฟีเจอร์นี้สำหรับผู้ใช้ Pro");
  if (!GITHUB_CLIENT_ID) throw new PagesError("GITHUB_UNAVAILABLE", "ฟีเจอร์นี้ยังไม่เปิดใช้ในเวอร์ชันนี้");
  const auth = await githubToken();
  if (!auth) throw new PagesError("GITHUB_NOT_CONNECTED", "ยังไม่ได้เชื่อมบัญชี GitHub");
  const step = deps.onStep ?? (() => {});

  // 1. the backend: the normal GAS deploy (with the dispatcher, see deploy.ts); its own page becomes a
  // notice that links to the GitHub copy, whose address is known before anything is uploaded
  step("deploy");
  const repo = repoNameFor(project);
  const owner = auth.login;
  const url = pagesUrlFor(owner, repo);
  const deploy = await (deps.deploy ?? ((p: EgsProject) => deployProject(userId, p, { pagesUrl: url })))(project);
  if (!deploy.execUrl) throw new PagesError("GITHUB_API", "เผยแพร่บน Google แล้วแต่ไม่ได้ลิงก์ /exec กลับมา ลองใหม่อีกครั้ง");

  // 2. the front page as static files (throws a typed error when it cannot be made static)
  step("build");
  const files = await getFiles(project.id);
  const staticFiles = buildStaticPage(files, { execUrl: deploy.execUrl });

  // 3. the repo (reused on re-publish)
  step("repo");
  const gh = createGitHubClient(auth.token, deps.fetchImpl);
  if (!(await gh.getRepo(owner, repo))) await gh.createRepo(repo, `หน้าเว็บของ "${project.name}" สร้างด้วย EasyGAS IDE`);

  // 4. upload (PUT needs the current sha to overwrite)
  step("upload");
  let lastCommit: string | null = null;
  for (const f of staticFiles) {
    const sha = await gh.getFileSha(owner, repo, f.path);
    if (sha && sha === gitBlobSha(f.content)) continue; // unchanged: no commit, no extra Pages build
    lastCommit = (await gh.putFile(owner, repo, f.path, f.content, `EasyGAS publish ${new Date().toISOString()}`, sha)) ?? lastCommit;
  }

  // 5. switch Pages on (idempotent) and 6. wait for the build
  step("pages");
  await gh.enablePages(owner, repo);
  step("wait");
  const built = (await gh.waitForPagesBuild(owner, repo, { commit: lastCommit })) === "built";

  // 7. remember it on the project
  step("save");
  const published_at = new Date().toISOString();
  await updateProject(project.id, { pages: { repo, url, published_at } });

  return { url, shareUrl: shareUrlFor(url), repo, built, deploy };
}

/** What the publish UI needs to decide its state for a project (no secrets). */
export async function pagesStateFor(projectId: string): Promise<{
  hosting: "gas" | "github";
  pages: EgsProject["pages"] | null;
} | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  return { hosting: project.hosting === "github" ? "github" : "gas", pages: project.pages ?? null };
}

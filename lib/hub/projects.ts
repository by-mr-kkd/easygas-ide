import { getFile } from "@/lib/files";
import { listProjects } from "@/lib/projects";
import { runUrlFor } from "@/lib/run-link";
import { deploymentOf } from "./doc";

export type HubProject = { id: string; name: string; url: string; deployment: string };

/**
 * Published web apps of this app, for "เพิ่มจากโปรเจกต์ของฉัน" (here and, after a sync, in the Pro phone app).
 * A public app opens through run.easygaside.tech; one that needs a Google sign-in keeps its /exec link.
 */
export async function listHubProjects(): Promise<HubProject[]> {
  const out: HubProject[] = [];
  for (const p of await listProjects()) {
    const exec = p.deployment?.exec_url;
    if (!exec) continue;
    const deployment = deploymentOf(exec) ?? "";
    const manifest = (await getFile(p.id, "appsscript.json").catch(() => null))?.content;
    const run = p.hosting === "github" ? null : runUrlFor(exec, manifest);
    const url = p.hosting === "github" && p.pages?.url ? p.pages.url : run ?? exec;
    out.push({ id: p.id, name: p.name, url, deployment: run ? deployment : "" });
  }
  return out;
}

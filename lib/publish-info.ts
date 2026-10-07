/** Whether a script on Google is published, read from its deployments (Apps Script API). Pure. */

/** none = never published; webapp = a published version runs as a web app (url); other = published another way. */
export interface PublishInfo {
  kind: "webapp" | "other" | "none";
  version: number | null;
  url: string | null;
}

export interface ApiDeployment {
  deploymentConfig?: { versionNumber?: number };
  entryPoints?: { entryPointType?: string; webApp?: { url?: string } }[];
}

const isWeb = (d: ApiDeployment): boolean => !!d.entryPoints?.some((e) => e.entryPointType === "WEB_APP");

/** The HEAD deployment (no version) is the editor's test link: it does not count as published. */
export function publishInfoFrom(deployments: ApiDeployment[]): PublishInfo {
  const versioned = deployments
    .filter((d) => typeof d.deploymentConfig?.versionNumber === "number")
    .sort((a, b) => (b.deploymentConfig?.versionNumber ?? 0) - (a.deploymentConfig?.versionNumber ?? 0));
  if (versioned.length === 0) return { kind: "none", version: null, url: null };
  const web = versioned.find(isWeb);
  const picked = web ?? versioned[0];
  return {
    kind: web ? "webapp" : "other",
    version: picked.deploymentConfig?.versionNumber ?? null,
    url: web?.entryPoints?.find((e) => e.entryPointType === "WEB_APP")?.webApp?.url ?? null,
  };
}

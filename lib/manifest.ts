/**
 * Builds the appsscript.json manifest for a GAS web-app project.
 *
 * Critical for a working web-app deployment:
 *  - webapp.access = ANYONE_ANONYMOUS  → public URL (no Google login to view)
 *  - webapp.executeAs = USER_DEPLOYING → runs as the deploying user
 *  - runtimeVersion = V8               → modern JS
 *  - timeZone = Asia/Bangkok           → correct Utilities.formatDate behavior
 *
 * Without the `webApp` block, deployments.create returns no web-app entry point / url.
 */
export interface ManifestOptions {
  timeZone?: string;
  oauthScopes?: string[];
  access?: "MYSELF" | "DOMAIN" | "ANYONE" | "ANYONE_ANONYMOUS";
  executeAs?: "USER_ACCESSING" | "USER_DEPLOYING";
}

export function buildWebAppManifest(opts: ManifestOptions = {}): string {
  const manifest = {
    timeZone: opts.timeZone ?? "Asia/Bangkok",
    dependencies: {},
    exceptionLogging: "STACKDRIVER",
    runtimeVersion: "V8",
    webapp: {
      access: opts.access ?? "ANYONE_ANONYMOUS",
      executeAs: opts.executeAs ?? "USER_DEPLOYING",
    },
    ...(opts.oauthScopes && opts.oauthScopes.length > 0
      ? { oauthScopes: opts.oauthScopes }
      : {}),
  };
  return JSON.stringify(manifest, null, 2);
}

/**
 * Guarantee the deployed app is a PUBLIC web app that runs as the OWNER, on V8 — whatever the AI put
 * in the manifest. Returns the manifest text to write (a missing/unreadable one is replaced).
 */
export function enforceWebAppManifest(current: string | null): string {
  if (!current) return buildWebAppManifest();
  try {
    const m = JSON.parse(current) as Record<string, unknown>;
    const webapp = (m.webapp as Record<string, unknown> | undefined) ?? {};
    return JSON.stringify(
      {
        ...m,
        runtimeVersion: "V8",
        webapp: { ...webapp, access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" },
      },
      null,
      2,
    );
  } catch {
    return current; // malformed manifest — leave as-is (lint/critic flags it)
  }
}

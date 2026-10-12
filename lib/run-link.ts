/**
 * The link people open a published web app with (pure, tested). With several Google accounts signed in, Chrome turns
 * script.google.com/macros/s/<id>/exec into /macros/u/<n>/s/... and Google answers "ไม่สามารถเปิดไฟล์ได้ในเวลานี้"
 * (Google: multi-login is not supported for web apps). EasyGAS-Site `app/run/[id]` opens the app in an
 * `<iframe credentialless>` — no Google cookies, as if signed in to nothing — so a PUBLIC app (ANYONE_ANONYMOUS,
 * run as the owner) works there for everyone, the owner included. It lives on its own host: the installed Pro phone
 * app's scope is all of easygaside.tech, and Android would open the link inside it. Apps that need a Google
 * sign-in keep the plain /exec link (a credentialless frame cannot sign in), and so does the owner's one-time
 * permission step.
 */
export const RUN_ORIGIN = "https://run.easygaside.tech";

const EXEC = /^https:\/\/script\.google\.com\/macros\/s\/(AKfyc[A-Za-z0-9_-]{20,160})\/exec$/;

/** The manifest lets anyone open the app without a Google account, running as its owner. */
export function isPublicWebApp(manifestText: string | null | undefined): boolean {
  if (!manifestText) return false;
  try {
    const w = (JSON.parse(manifestText) as { webapp?: { access?: unknown; executeAs?: unknown } }).webapp;
    return w?.access === "ANYONE_ANONYMOUS" && w.executeAs === "USER_DEPLOYING";
  } catch {
    return false;
  }
}

/** run.easygaside.tech/<deploymentId> for a public app's /exec URL; null when it must stay on /exec. */
export function runUrlFor(execUrl: string | null | undefined, manifestText: string | null | undefined): string | null {
  const m = execUrl ? EXEC.exec(execUrl) : null;
  return m && isPublicWebApp(manifestText) ? `${RUN_ORIGIN}/${m[1]}` : null;
}

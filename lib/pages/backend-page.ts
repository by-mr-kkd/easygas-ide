import type { SourceFile } from "./dispatcher.ts";
import { findEntryPage } from "./static-page.ts";

/**
 * For a project whose front page lives on GitHub Pages, the Google copy of the page is only the backend:
 * its /exec link exists for Google's one-time permission screen and for doPost. Served as-is it shows the
 * whole app with a camera that cannot open, and people (the owner included) take it for the app. So the
 * pushed copy of the entry page is swapped for a short notice that links to the real page. Only the pushed
 * copy changes: the project's own Index.html is untouched (preview, editor and the Pages build use it).
 */

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function backendNoticeHtml(pagesUrl: string, appName: string): string {
  const url = esc(pagesUrl);
  const name = esc(appName);
  return `<!DOCTYPE html>
<html lang="th">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>
  body { margin: 0; padding: 24px 16px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f7f8; color: #1c2430; line-height: 1.6; }
  main { max-width: 480px; margin: 40px auto; background: #fff; border: 1px solid #dfe3e8; border-radius: 14px; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { margin: 0 0 16px; color: #55606e; font-size: 15px; }
  a.btn { display: block; text-align: center; padding: 14px; border-radius: 10px; background: #0f766e; color: #fff; font-weight: 600; text-decoration: none; }
  .url { margin-top: 12px; font-size: 13px; color: #7a8594; word-break: break-all; text-align: center; }
</style>
</head>
<body>
<main>
  <h1>${name}</h1>
  <p>หน้านี้เป็นระบบหลังบ้านบน Google ใช้งานแอปจากหน้านี้ไม่ได้ เปิดแอปจากลิงก์ด้านล่างแทน</p>
  <a class="btn" href="${url}">เปิดแอป</a>
  <p class="url">${url}</p>
</main>
</body>
</html>
`;
}

/** The files with the entry page replaced by the notice; unchanged when there is no entry page. */
export function withBackendNotice(files: SourceFile[], pagesUrl: string, appName: string): SourceFile[] {
  const entry = findEntryPage(files);
  if (!entry) return files;
  const notice = backendNoticeHtml(pagesUrl, appName);
  return files.map((f) => (f.path === entry.path ? { path: f.path, content: notice } : f));
}

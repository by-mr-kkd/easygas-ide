/**
 * Where the app points people outside itself (no server imports — pages and client components use it).
 * In the desktop app these open in the user's own browser (electron/main.js sends every https link there).
 */
export const LINKS = {
  /** The users' Facebook group: questions, examples, announcements. */
  facebookGroup: "https://www.facebook.com/groups/1715651209561919",
  /** Source code, releases and issues. */
  repo: "https://github.com/by-mr-kkd/easygas-ide",
} as const;

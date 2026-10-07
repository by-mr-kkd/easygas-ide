/**
 * Where the app points people outside itself (no server imports — pages and client components use it).
 * In the desktop app these open in the user's own browser (electron/main.js sends every https link there).
 */
export const LINKS = {
  /**
   * The users' Facebook group: questions, examples, announcements. Through the website, which sends
   * people to whatever group is set in its admin: the group can move without a new installer.
   */
  facebookGroup: "https://easygaside.tech/go/facebook",
  /** Source code, releases and issues. */
  repo: "https://github.com/by-mr-kkd/easygas-ide",
} as const;

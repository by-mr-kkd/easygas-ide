/** The home screen's views: the project list, the scripts in the user's Google account, a share link, the public shares, the user's hubs. */
export type StartMode = "new" | "existing" | "clone" | "shares" | "hub";

/** The query string value for the mode, defaulting to "new" (the project list) for anything else. */
export const startModeFrom = (value: string | string[] | undefined): StartMode =>
  value === "existing" ? "existing" : value === "clone" ? "clone" : value === "shares" ? "shares" : value === "hub" ? "hub" : "new";

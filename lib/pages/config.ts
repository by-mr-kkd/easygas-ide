/**
 * GitHub OAuth App used for "วางหน้าเว็บบน GitHub" (premium). The owner registers the app under the
 * account `by-mr-kkd` (device flow on, token expiry off).
 * A client id is public by design (device flow has no client secret), so it may ship in the build.
 */
const BUILT_IN_CLIENT_ID = "Ov23li6oYjc290CDSOpY";

/** The packaged app does not see build-time env vars, so the id ships as a constant; the env var only overrides it for testing. */
export const GITHUB_CLIENT_ID = process.env.EASYGAS_GITHUB_CLIENT_ID?.trim() || BUILT_IN_CLIENT_ID;

/**
 * GitHub's REST docs list the Pages endpoints (create site, get latest build) under the `repo` scope for
 * OAuth app tokens; `public_repo` alone is not enough to switch Pages on. So the app asks for `repo`.
 */
export const GITHUB_SCOPE = "repo";

export const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_API_URL = "https://api.github.com";
export const GITHUB_API_VERSION = "2022-11-28";

/** Where the user can also revoke the authorisation by hand. */
export const GITHUB_APPLICATIONS_URL = "https://github.com/settings/applications";

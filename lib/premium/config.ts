/**
 * Premium (no server imports — safe for client and server). The licence server is a Supabase project;
 * its functions take no API key, only the order's own secret.
 */
export const PREMIUM_SERVER = "https://jyidbspmdolmsinhdiye.supabase.co/functions/v1";

/** Ed25519 public key (raw 32 bytes, base64) that licence keys are checked against. */
export const LICENSE_PUBLIC_KEY = "siKUm093kW5iVqBhBBJ0TWHYJvjfBIKnviK05hZkhWQ=";

/** A licence key is `EGP1.<base64url payload JSON>.<base64url signature of the payload segment>`. */
export const LICENSE_PREFIX = "EGP1";

export interface LicensePayload {
  v: 1;
  /** licence id (uuid) */
  id: string;
  email: string;
  plan: "premium";
  /** issued at, unix seconds */
  iat: number;
}

/**
 * A licence works on a limited number of machines (2 by default, set on the server). The server hands each
 * registered machine an activation token `EGA1.<base64url payload JSON>.<base64url signature of "EGA1.<payload>">`
 * signed with the same key as licences; it expires after ~30 days and is renewed quietly while online.
 */
export const ACTIVATION_PREFIX = "EGA1";

/** Renew the activation token once it is this old (and the machine is online). */
export const ACTIVATION_REFRESH_DAYS = 7;

export interface ActivationPayload {
  v: 1;
  /** licence id the token belongs to */
  lid: string;
  /** sha256 hex of this machine's id */
  dev: string;
  /** issued at / expires at, unix seconds */
  iat: number;
  exp: number;
}

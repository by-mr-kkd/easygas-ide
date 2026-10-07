import { createHash, createPublicKey, verify } from "node:crypto";

/**
 * Rulebook pack format + trust checks (pure — no app imports, unit-tested in tests/rulebook.test.ts).
 *
 * A pack is one JSON file holding every rule card plus the index data used to pick cards for a task
 * (scripts/rulebook-build.mjs writes it). The app ships one pack and may download a newer one; a
 * downloaded pack becomes part of the AI's instructions on every user's machine, so it is accepted only
 * when an Ed25519 signature over its exact bytes matches a key built into the app.
 */

export const PACK_FORMAT = 1;
export const MAX_PACK_BYTES = 2_000_000;
const MAX_RULES = 60;
const MAX_RULE_BYTES = 64_000;
const MAX_TEXT = 300;
const MAX_LIST = 40;
const RULE_ID = /^[a-z0-9][a-z0-9-]{1,48}$/;
// ids become file names (<id>.md) for the CLI engine; Windows treats these as devices whatever the extension
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)$/;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export type RuleKind = "webapp" | "bound";

export interface RuleCard {
  id: string;
  title: string;
  /** One line (Thai): when the AI should read this card. Shown in the index. */
  when: string;
  keywords: string[];
  /** Wizard feature ids that make this card required reading. */
  features: string[];
  kinds: RuleKind[];
  /** Required reading for every new build of a matching kind. */
  baseline: boolean;
  bytes: number;
  sha256: string;
  content: string;
}

export interface RulebookPack {
  format: number;
  version: string;
  source: string;
  commit: string;
  minAppVersion: string;
  rules: RuleCard[];
}

export type RulebookErrorCode = "bad_signature" | "bad_format" | "too_large" | "downgrade" | "needs_newer_app";

export class RulebookError extends Error {
  code: RulebookErrorCode;
  constructor(code: RulebookErrorCode, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

/** Compare two x.y.z versions numerically (-1, 0, 1). Anything unparsable sorts lowest. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => (VERSION.test(v) ? v.split(".").map(Number) : [-1, -1, -1]);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

const bad = (detail: string): never => {
  throw new RulebookError("bad_format", detail);
};

function text(v: unknown, field: string, max = MAX_TEXT): string {
  if (typeof v !== "string" || v.length === 0 || v.length > max) bad(field);
  return v as string;
}

function list(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.length > MAX_LIST) bad(field);
  return (v as unknown[]).map((x) => text(x, field, 60));
}

function parseRule(raw: unknown): RuleCard {
  if (!raw || typeof raw !== "object") bad("rule");
  const r = raw as Record<string, unknown>;
  const id = text(r.id, "rule.id", 50);
  if (!RULE_ID.test(id) || WINDOWS_DEVICE.test(id)) bad(`rule.id ${id}`);
  const content = text(r.content, `${id}.content`, MAX_RULE_BYTES);
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_RULE_BYTES) bad(`${id}.content size`);
  if (r.bytes !== bytes) bad(`${id}.bytes`);
  if (r.sha256 !== createHash("sha256").update(content, "utf8").digest("hex")) bad(`${id}.sha256`);
  const kinds = list(r.kinds, `${id}.kinds`);
  if (kinds.length === 0 || kinds.some((k) => k !== "webapp" && k !== "bound")) bad(`${id}.kinds`);
  return {
    id,
    title: text(r.title, `${id}.title`),
    when: text(r.when, `${id}.when`),
    keywords: list(r.keywords, `${id}.keywords`),
    features: list(r.features, `${id}.features`),
    kinds: kinds as RuleKind[],
    baseline: r.baseline === true,
    bytes,
    sha256: r.sha256 as string,
    content,
  };
}

/** Validate an untrusted JSON value as a pack. Throws RulebookError("bad_format") with the bad field. */
export function parsePack(json: unknown): RulebookPack {
  if (!json || typeof json !== "object") bad("pack");
  const p = json as Record<string, unknown>;
  if (p.format !== PACK_FORMAT) bad("format");
  const version = text(p.version, "version", 20);
  const minAppVersion = text(p.minAppVersion, "minAppVersion", 20);
  if (!VERSION.test(version)) bad("version");
  if (!VERSION.test(minAppVersion)) bad("minAppVersion");
  if (!Array.isArray(p.rules) || p.rules.length === 0 || p.rules.length > MAX_RULES) bad("rules");
  const rules = (p.rules as unknown[]).map(parseRule);
  if (new Set(rules.map((r) => r.id)).size !== rules.length) bad("duplicate rule id");
  return {
    format: PACK_FORMAT,
    version,
    source: typeof p.source === "string" ? p.source.slice(0, MAX_TEXT) : "",
    commit: typeof p.commit === "string" ? p.commit.slice(0, 64) : "",
    minAppVersion,
    rules,
  };
}

/** True when `signatureB64` is a valid Ed25519 signature of `bytes` under ANY of the trusted keys. */
export function verifySignature(bytes: Uint8Array, signatureB64: string, publicKeysPem: string[]): boolean {
  const sig = signatureB64.trim();
  if (!/^[A-Za-z0-9+/]{86}==$/.test(sig)) return false; // 64 raw bytes, canonical base64
  const signature = Buffer.from(sig, "base64");
  return publicKeysPem.some((pem) => {
    try {
      return verify(null, bytes, createPublicKey(pem), signature);
    } catch {
      return false;
    }
  });
}

export interface AcceptOptions {
  publicKeys: string[];
  /** Version of the pack in use now; a download must be strictly newer (blocks replaying an old one). */
  currentVersion: string;
  appVersion: string;
}

/**
 * The single gate a DOWNLOADED pack passes before it may be installed: size → signature → shape →
 * newer than what we have → supported by this app. Order matters: nothing is parsed before the
 * signature over the raw bytes checks out.
 */
export function verifyAndParsePack(bytes: Uint8Array, signatureB64: string, opts: AcceptOptions): RulebookPack {
  if (bytes.byteLength > MAX_PACK_BYTES) throw new RulebookError("too_large");
  if (!verifySignature(bytes, signatureB64, opts.publicKeys)) throw new RulebookError("bad_signature");
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new RulebookError("bad_format", "json");
  }
  const pack = parsePack(json);
  if (compareVersions(pack.version, opts.currentVersion) <= 0) throw new RulebookError("downgrade", pack.version);
  if (compareVersions(pack.minAppVersion, opts.appVersion) > 0) throw new RulebookError("needs_newer_app", pack.minAppVersion);
  return pack;
}

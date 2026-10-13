/**
 * Share system 1.2, pure: the website's newer answers (versions, support, ratings, issues, reviews, follows,
 * proposals), parsed field by field. An older website sends none of these, so every parser falls back to an
 * empty / neutral value instead of throwing — the features they feed simply stay hidden.
 */

const SLUG_RE = /^[a-z0-9]{6,16}$/;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v: unknown, min = 0): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min ? n : min;
};
const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown, max: number): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, max).map(obj) : []);

// ---------- support mode ----------

export type SupportMode = "self" | "best_effort" | "service";
export const SUPPORT_MODES: { id: SupportMode; label: string; text: string }[] = [
  { id: "self", label: "แจกให้ปรับเอง", text: "ไม่รับแจ้งบัค คนที่โคลนไปถามในกระทู้ของลิงก์แทน" },
  { id: "best_effort", label: "รับแจ้งบัค แก้ตามสะดวก", text: "คนที่โคลนไปแจ้งปัญหาจากในโปรแกรมได้ คุณแก้เมื่อว่าง" },
  { id: "service", label: "มีบริการดูแล", text: "รับแจ้งปัญหาและดูแลให้ (บอกรายละเอียดในหมายเหตุ เช่น ช่องทางติดต่อ)" },
];
export const SUPPORT_NOTE_MAX = 300;
export const supportMode = (v: unknown): SupportMode => (v === "best_effort" || v === "service" ? v : "self");
export const supportLabel = (m: SupportMode): string => SUPPORT_MODES.find((s) => s.id === m)?.label ?? SUPPORT_MODES[0].label;

// ---------- issues ----------

export type IssueStatus = "open" | "looking" | "fixed" | "wontfix";
export const ISSUE_STATUSES: { id: IssueStatus; label: string }[] = [
  { id: "open", label: "เปิดอยู่" },
  { id: "looking", label: "กำลังดู" },
  { id: "fixed", label: "แก้แล้ว" },
  { id: "wontfix", label: "ไม่แก้" },
];
export const issueStatus = (v: unknown): IssueStatus => (v === "looking" || v === "fixed" || v === "wontfix" ? v : "open");
export const issueStatusLabel = (s: IssueStatus): string => ISSUE_STATUSES.find((x) => x.id === s)?.label ?? "เปิดอยู่";

// ---------- one share's extra fields (GET /api/share/<slug>) ----------

export type ShareVersionInfo = { version: number; notes: string; fixes: number[]; createdAt: string };
export type ShareMe = { cloned: number | null; published: boolean; following: boolean; review: { stars: number; body: string; version: number | null } | null; owner: boolean };
export type ShareExtras = {
  /** the website knows share system 1.2 (it sent at least one of the new fields) */
  v2: boolean;
  camera: boolean;
  /** only Pro may clone: GitHub Pages AND the camera (an older website: every GitHub share) */
  proOnly: boolean;
  support: { mode: SupportMode; note: string };
  rating: { avg: number | null; count: number };
  followers: number;
  issues: { open: number; fixed: number };
  versions: ShareVersionInfo[];
  parentInfo: { slug: string; version: number | null; title: string } | null;
  changes: string;
  me: ShareMe | null;
};

const fixesOf = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => intOrNull(x)).filter((x): x is number => x !== null).slice(0, 50) : []);

export function parseVersionInfos(v: unknown): ShareVersionInfo[] {
  return list(v, 40)
    .map((x) => ({ version: int(x.version, 1), notes: str(x.notes, 2000), fixes: fixesOf(x.fixes), createdAt: str(x.createdAt, 40) }))
    .sort((a, b) => b.version - a.version);
}

export function parseShareExtras(raw: unknown): ShareExtras {
  const s = obj(raw);
  const v2 = ["support", "rating", "versions", "camera", "proOnly", "followers", "parentShare"].some((k) => k in s);
  const support = obj(s.support);
  const rating = obj(s.rating);
  const issues = obj(s.issues);
  // the site keeps `parent` as the old slug string (1.1.x apps); the object is `parentShare` (an early draft sent it as `parent`)
  const parent = s.parentShare && typeof s.parentShare === "object" ? obj(s.parentShare) : s.parent && typeof s.parent === "object" ? obj(s.parent) : null;
  const parentSlug = parent ? str(parent.slug, 16) : "";
  const me = s.me && typeof s.me === "object" ? obj(s.me) : null;
  const review = me && me.review && typeof me.review === "object" ? obj(me.review) : null;
  const avg = Number(rating.avg);
  return {
    v2,
    camera: s.camera === true,
    proOnly: typeof s.proOnly === "boolean" ? s.proOnly : s.hosting === "github",
    support: { mode: supportMode(support.mode), note: str(support.note, SUPPORT_NOTE_MAX) },
    rating: { avg: rating.avg !== null && Number.isFinite(avg) && avg > 0 ? Math.round(Math.min(5, avg) * 10) / 10 : null, count: int(rating.count) },
    followers: int(s.followers),
    issues: { open: int(issues.open), fixed: int(issues.fixed) },
    versions: parseVersionInfos(s.versions),
    parentInfo: parent && SLUG_RE.test(parentSlug) ? { slug: parentSlug, version: intOrNull(parent.version), title: str(parent.title, 120) } : null,
    changes: str(s.changes, 2000),
    me: me
      ? {
          cloned: intOrNull(me.cloned),
          published: me.published === true,
          following: me.following === true,
          review: review ? { stars: Math.min(5, int(review.stars, 1)), body: str(review.body, 1000), version: intOrNull(review.version) } : null,
          owner: me.owner === true,
        }
      : null,
  };
}

// ---------- GET /api/share/<slug>/versions/<n> ----------

export type ShareVersionFiles = { version: number; files: { name: string; source: string }[]; notes: string; fixes: number[]; createdAt: string };

/** The raw files are re-checked by the caller (payload.fromShareFiles); here only the shape. Null = not usable. */
export function parseVersionFiles(raw: unknown): ShareVersionFiles | null {
  const r = obj(raw);
  if (!Array.isArray(r.files) || r.files.length === 0) return null;
  const files = list(r.files, 80)
    .filter((f) => typeof f.name === "string" && typeof f.source === "string")
    .map((f) => ({ name: String(f.name), source: String(f.source) }));
  if (files.length === 0) return null;
  return { version: int(r.version, 1), files, notes: str(r.notes, 2000), fixes: fixesOf(r.fixes), createdAt: str(r.createdAt, 40) };
}

// ---------- POST /api/share/updates ----------

export type ShareUpdate = { slug: string; title: string; latest: number; versions: { version: number; notes: string; fixes: { number: number; title: string }[]; createdAt: string }[] };
export type MyIssue = { slug: string; number: number; title: string; status: IssueStatus; fixedIn: number | null; ownerNote: string; updatedAt: string };

export function parseUpdates(raw: unknown): { updates: ShareUpdate[]; myIssues: MyIssue[] } {
  const r = obj(raw);
  const updates = list(r.updates, 60)
    .filter((u) => SLUG_RE.test(str(u.slug, 16)))
    .map((u) => ({
      slug: str(u.slug, 16),
      title: str(u.title, 120),
      latest: int(u.latest, 1),
      versions: list(u.versions, 20)
        .map((v) => ({
          version: int(v.version, 1),
          notes: str(v.notes, 2000),
          fixes: list(v.fixes, 50)
            .filter((f) => intOrNull(f.number) !== null)
            .map((f) => ({ number: intOrNull(f.number) as number, title: str(f.title, 140) })),
          createdAt: str(v.createdAt, 40),
        }))
        .sort((a, b) => b.version - a.version),
    }));
  const myIssues = list(r.myIssues, 100)
    .filter((i) => SLUG_RE.test(str(i.slug, 16)) && intOrNull(i.number) !== null)
    .map((i) => ({
      slug: str(i.slug, 16),
      number: intOrNull(i.number) as number,
      title: str(i.title, 140),
      status: issueStatus(i.status),
      fixedIn: intOrNull(i.fixedIn),
      ownerNote: str(i.ownerNote, 500),
      updatedAt: str(i.updatedAt, 40),
    }));
  return { updates, myIssues };
}

/** GET /api/share/following */
export function parseFollowing(raw: unknown): { slug: string; title: string; latest: number }[] {
  return list(obj(raw).follows, 200)
    .filter((f) => SLUG_RE.test(str(f.slug, 16)))
    .map((f) => ({ slug: str(f.slug, 16), title: str(f.title, 120), latest: int(f.latest, 1) }));
}

// ---------- reviews ----------

export type ShareReview = { author: string; stars: number; body: string; version: number | null; verifiedUse: boolean; createdAt: string; updatedAt: string };

export function parseReviews(raw: unknown): { avg: number | null; count: number; reviews: ShareReview[] } {
  const r = obj(raw);
  const avg = Number(r.avg);
  return {
    avg: r.avg !== null && Number.isFinite(avg) && avg > 0 ? Math.round(Math.min(5, avg) * 10) / 10 : null,
    count: int(r.count),
    reviews: list(r.reviews, 50).map((x) => ({
      author: str(x.author, 60) || "ไม่ระบุชื่อ",
      stars: Math.min(5, int(x.stars, 1)),
      body: str(x.body, 1000),
      version: intOrNull(x.version),
      verifiedUse: x.verifiedUse === true,
      createdAt: str(x.createdAt, 40),
      updatedAt: str(x.updatedAt, 40),
    })),
  };
}

// ---------- issues ----------

export type ShareIssue = {
  number: number;
  title: string;
  body: string;
  version: number | null;
  status: IssueStatus;
  fixedIn: number | null;
  ownerNote: string;
  author: string;
  details: { changedFiles: string[]; errors: string };
  createdAt: string;
  updatedAt: string;
};

export function parseIssues(raw: unknown): ShareIssue[] {
  return list(obj(raw).issues, 100)
    .filter((i) => intOrNull(i.number) !== null)
    .map((i) => {
      const d = obj(i.details);
      return {
        number: intOrNull(i.number) as number,
        title: str(i.title, 140) || "(ไม่มีหัวข้อ)",
        body: str(i.body, 4000),
        version: intOrNull(i.version),
        status: issueStatus(i.status),
        fixedIn: intOrNull(i.fixedIn),
        ownerNote: str(i.ownerNote, 500),
        author: str(i.author, 60) || "ไม่ระบุชื่อ",
        details: { changedFiles: Array.isArray(d.changedFiles) ? d.changedFiles.filter((x): x is string => typeof x === "string").slice(0, 60).map((x) => x.slice(0, 100)) : [], errors: str(d.errors, 2000) },
        createdAt: str(i.createdAt, 40),
        updatedAt: str(i.updatedAt, 40),
      };
    });
}

// ---------- proposals ----------

export type ProposalStatus = "open" | "merged" | "declined";
export type ShareProposal = { id: string; forkSlug: string; forkVersion: number | null; title: string; summary: string; status: ProposalStatus; author: string; createdAt: string };
export const PROPOSAL_ID = /^[0-9a-f-]{8,40}$/i;

export function parseProposals(raw: unknown): ShareProposal[] {
  return list(obj(raw).proposals, 100)
    .filter((p) => PROPOSAL_ID.test(str(p.id, 40)) && SLUG_RE.test(str(p.forkSlug, 16)))
    .map((p) => ({
      id: str(p.id, 40),
      forkSlug: str(p.forkSlug, 16),
      forkVersion: intOrNull(p.forkVersion),
      title: str(p.title, 140) || "(ไม่มีหัวข้อ)",
      summary: str(p.summary, 2000),
      status: p.status === "merged" || p.status === "declined" ? p.status : "open",
      author: str(p.author, 60) || "ไม่ระบุชื่อ",
      createdAt: str(p.createdAt, 40),
    }));
}

// ---------- the home screen's "ต้นฉบับมี vN" ----------

/**
 * Which cloned projects are behind their share: the newest version the website reports per slug, against the
 * version each project last took. Pure, so the list and the code screen agree.
 */
export function behindSource(projects: { id: string; slug: string; version: number }[], updates: ShareUpdate[]): Record<string, number> {
  const latest = new Map(updates.map((u) => [u.slug, u.latest]));
  const out: Record<string, number> = {};
  for (const p of projects) {
    const l = latest.get(p.slug);
    if (l && l > p.version) out[p.id] = l;
  }
  return out;
}

/** My reported issues whose status changed since I last looked (seen = "slug#number" → status). */
export function changedIssues(myIssues: MyIssue[], seen: Record<string, string>): MyIssue[] {
  return myIssues.filter((i) => {
    const before = seen[`${i.slug}#${i.number}`];
    return before === undefined ? i.status !== "open" : before !== i.status;
  });
}

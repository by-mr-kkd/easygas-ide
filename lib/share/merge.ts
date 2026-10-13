/**
 * Taking a share's newer version into a project cloned from it (and a fork's changes into its parent), pure.
 *
 *   base   = the share's files at the version the project was cloned from (or last updated to)
 *   latest = the share's files now (or a fork's files, for a proposal)
 *   mine   = the project's files here
 *
 * Per file: unchanged on one side → the other side wins; changed on both sides (differently) → the AI merges
 * it, through ONE message the user sends from the chat box (never written around the build gate or the AI
 * pick). Line endings are ignored when comparing.
 */

export type CodeFile = { path: string; content: string };
/** same = nothing to do · take = only the source changed (write / delete) · mine = only this project changed ·
 *  both = changed on both sides */
export type FileClass = "same" | "take" | "mine" | "both";
export type FilePlan = { path: string; cls: FileClass; base: string | null; latest: string | null; mine: string | null };

const norm = (s: string | null): string | null => (s === null ? null : s.replace(/\r\n?/g, "\n"));
/** Files the app keeps for itself never take part (".clasp.json", ".claspignore"). */
const own = (path: string): boolean => path.startsWith(".") || path.includes("/.");

function toMap(files: CodeFile[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of files) if (!own(f.path)) m.set(f.path, f.content);
  return m;
}

export function classifyFiles(base: CodeFile[], latest: CodeFile[], mine: CodeFile[]): FilePlan[] {
  const b = toMap(base);
  const l = toMap(latest);
  const m = toMap(mine);
  const paths = [...new Set([...b.keys(), ...l.keys(), ...m.keys()])].sort((x, y) => x.localeCompare(y));
  return paths.map((path) => {
    const bv = b.get(path) ?? null;
    const lv = l.get(path) ?? null;
    const mv = m.get(path) ?? null;
    const [nb, nl, nm] = [norm(bv), norm(lv), norm(mv)];
    const cls: FileClass = nl === nm ? "same" : nl === nb ? "mine" : nm === nb ? "take" : "both";
    return { path, cls, base: bv, latest: lv, mine: mv };
  });
}

export type UpdatePlan = { writes: CodeFile[]; deletes: string[]; conflicts: FilePlan[]; kept: string[] };

/** What "รับอัปเดต" does with a classification: takes are applied, conflicts go to the AI, mine stay. */
export function updatePlan(plans: FilePlan[]): UpdatePlan {
  const out: UpdatePlan = { writes: [], deletes: [], conflicts: [], kept: [] };
  for (const p of plans) {
    if (p.cls === "take") {
      if (p.latest === null) out.deletes.push(p.path);
      else out.writes.push({ path: p.path, content: p.latest });
    } else if (p.cls === "both") out.conflicts.push(p);
    else if (p.cls === "mine") out.kept.push(p.path);
  }
  return out;
}

// ---------- line diff ----------

const MAX_CELLS = 4_000_000;
type Op = { t: " " | "-" | "+"; line: string };

/** A line diff (LCS), common prefix/suffix trimmed first. Huge files fall back to "all out, all in". */
export function diffLines(a: string, b: string): Op[] {
  const A = norm(a)!.split("\n");
  const B = norm(b)!.split("\n");
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);
  const head: Op[] = A.slice(0, pre).map((line) => ({ t: " ", line }));
  const tail: Op[] = A.slice(A.length - suf).map((line) => ({ t: " ", line }));
  const n = a2.length;
  const m = b2.length;
  let mid: Op[];
  if (n === 0 || m === 0 || n * m > MAX_CELLS) {
    mid = [...a2.map((line) => ({ t: "-" as const, line })), ...b2.map((line) => ({ t: "+" as const, line }))];
  } else {
    // lcs[i][j] = LCS length of a2[i..] and b2[j..], one flat array
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) lcs[i * w + j] = a2[i] === b2[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    mid = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a2[i] === b2[j]) {
        mid.push({ t: " ", line: a2[i] });
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) mid.push({ t: "-", line: a2[i++] });
      else mid.push({ t: "+", line: b2[j++] });
    }
    while (i < n) mid.push({ t: "-", line: a2[i++] });
    while (j < m) mid.push({ t: "+", line: b2[j++] });
  }
  return [...head, ...mid, ...tail];
}

export function diffStats(a: string | null, b: string | null): { added: number; removed: number } {
  if (a === null && b === null) return { added: 0, removed: 0 };
  if (a === null) return { added: norm(b)!.split("\n").length, removed: 0 };
  if (b === null) return { added: 0, removed: norm(a)!.split("\n").length };
  let added = 0;
  let removed = 0;
  for (const op of diffLines(a, b)) {
    if (op.t === "+") added++;
    else if (op.t === "-") removed++;
  }
  return { added, removed };
}

/** A unified diff (hunks with `context` lines around each change); "" when the texts are equal. */
export function unifiedDiff(a: string | null, b: string | null, context = 3): string {
  const ops = diffLines(a ?? "", b ?? "");
  if (!ops.some((o) => o.t !== " ")) return "";
  const out: string[] = [];
  let i = 0;
  let aLine = 1;
  let bLine = 1;
  const pos: { a: number; b: number }[] = ops.map((o) => {
    const p = { a: aLine, b: bLine };
    if (o.t !== "+") aLine++;
    if (o.t !== "-") bLine++;
    return p;
  });
  while (i < ops.length) {
    if (ops[i].t === " ") {
      i++;
      continue;
    }
    const start = Math.max(0, i - context);
    let end = i;
    // extend while the next change is within 2×context lines
    for (;;) {
      while (end < ops.length && ops[end].t !== " ") end++;
      let k = end;
      while (k < ops.length && ops[k].t === " " && k - end < context * 2) k++;
      if (k < ops.length && ops[k].t !== " ") end = k;
      else break;
    }
    const stop = Math.min(ops.length, end + context);
    const slice = ops.slice(start, stop);
    const aCount = slice.filter((o) => o.t !== "+").length;
    const bCount = slice.filter((o) => o.t !== "-").length;
    out.push(`@@ -${pos[start].a},${aCount} +${pos[start].b},${bCount} @@`);
    for (const o of slice) out.push(`${o.t}${o.line}`);
    i = stop;
  }
  return out.join("\n");
}

// ---------- what changed, in words ----------

/** "แก้ Code.gs (+12 −3)" / "เพิ่ม Util.gs" / "ลบ Old.gs", one per line: a fork's "what changed" fallback. */
export function changeSummary(base: CodeFile[], mine: CodeFile[]): string {
  const lines: string[] = [];
  for (const p of classifyFiles(base, mine, base)) {
    // latest = mine and mine = base, so "take" marks every file this project changed against the base
    if (p.cls !== "take") continue;
    if (p.base === null) lines.push(`เพิ่ม ${p.path}`);
    else if (p.latest === null) lines.push(`ลบ ${p.path}`);
    else {
      const s = diffStats(p.base, p.latest);
      lines.push(`แก้ ${p.path} (+${s.added} −${s.removed})`);
    }
  }
  return lines.join("\n");
}

/** Paths this project changed against the base (an issue report attaches them; names only, never code). */
export function changedPaths(base: CodeFile[], mine: CodeFile[]): string[] {
  return classifyFiles(base, mine, base)
    .filter((p) => p.cls === "take")
    .map((p) => p.path);
}

// ---------- the chat message for files changed on both sides ----------

const PER_DIFF = 12_000;
const TOTAL = 60_000;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…(ตัดส่วนที่เหลือ ดูไฟล์เต็มได้ในโปรเจกต์)`;
}

/**
 * ONE message for the chat box asking the AI to merge the files changed on both sides. It carries what the
 * source changed (base → latest) and what this project changed (base → mine) as diffs; the AI reads the
 * current file itself. The user reads it and presses send — the app never sends it.
 */
export function mergeMessage(input: { kind: "update" | "proposal"; title: string; from: number | null; to: number | null; conflicts: FilePlan[] }): string {
  const who = input.kind === "update" ? "ต้นฉบับ" : "ทางแยก";
  const span = input.from && input.to ? ` (v${input.from} → v${input.to})` : input.to ? ` (v${input.to})` : "";
  const head =
    input.kind === "update"
      ? `รับอัปเดตจากต้นฉบับ "${input.title}"${span}: ไฟล์ด้านล่างถูกแก้ทั้งในต้นฉบับและในโปรเจกต์นี้ ช่วยรวมให้ในไฟล์ของโปรเจกต์ — เก็บสิ่งที่ฉันแก้ไว้ และเพิ่มสิ่งที่ต้นฉบับเปลี่ยน ถ้าสองฝั่งขัดกันให้ถามฉันก่อน ไฟล์อื่นที่แอปอัปเดตให้แล้วไม่ต้องแตะ`
      : `รับข้อเสนอจากทางแยก "${input.title}"${span}: ไฟล์ด้านล่างถูกแก้ทั้งในทางแยกและในโปรเจกต์นี้ ช่วยรวมให้ในไฟล์ของโปรเจกต์ — เก็บสิ่งที่ฉันแก้ไว้ และเพิ่มสิ่งที่ทางแยกเปลี่ยน ถ้าสองฝั่งขัดกันให้ถามฉันก่อน`;
  const parts: string[] = [head];
  let budget = TOTAL;
  for (const c of input.conflicts) {
    const theirs = c.latest === null ? `(${who}ลบไฟล์นี้)` : clip(unifiedDiff(c.base, c.latest), PER_DIFF);
    const mine = c.mine === null ? "(ฉันลบไฟล์นี้)" : clip(unifiedDiff(c.base, c.mine), PER_DIFF);
    const block = `### ${c.path}\nสิ่งที่${who}เปลี่ยน (เดิม → ${who}):\n\`\`\`diff\n${theirs}\n\`\`\`\nสิ่งที่ฉันแก้ (เดิม → ของฉัน):\n\`\`\`diff\n${mine}\n\`\`\``;
    if (block.length > budget) {
      parts.push(`### ${c.path}\n(ยาวเกินจะใส่ในข้อความ เทียบเองได้จากปุ่ม "เทียบกับต้นฉบับ")`);
      continue;
    }
    budget -= block.length;
    parts.push(block);
  }
  return parts.join("\n\n");
}

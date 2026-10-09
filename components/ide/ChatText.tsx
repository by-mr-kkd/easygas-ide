import type { ReactNode } from "react";

/**
 * The small slice of Markdown the AIs actually write in chat — **bold**, `code`, "- " / "1. " lists and
 * "#" headings — drawn as React elements (never HTML, so nothing the AI writes can inject markup). Anything
 * else stays as typed. Safe on a half-streamed message: an unclosed ** or ` just shows as text.
 */

const INLINE = /\*\*([^*\n]+?)\*\*|`([^`\n]+?)`/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[1] !== undefined ? (
        <strong key={`${key}-${n++}`} className="font-semibold">
          {m[1]}
        </strong>
      ) : (
        <code key={`${key}-${n++}`} className="rounded bg-sunken px-1 py-px font-mono text-[0.92em]">
          {m[2]}
        </code>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.split("\n")) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,4}\s+(.*)$/.exec(line);
    const prev = out[out.length - 1];
    if (bullet || num) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? num)![1];
      if (prev && prev.kind === kind) prev.items.push(item);
      else out.push({ kind, items: [item] });
    } else if (head) out.push({ kind: "h", text: head[1] });
    else if (prev && prev.kind === "p" && line.trim() !== "") prev.text += `\n${line}`;
    else if (line.trim() !== "") out.push({ kind: "p", text: line });
  }
  return out;
}

export function ChatText({ text }: { text: string }) {
  return (
    <div className="space-y-2 break-words">
      {blocks(text).map((b, i) => {
        const k = String(i);
        if (b.kind === "h") return <p key={k} className="font-semibold">{inline(b.text, k)}</p>;
        if (b.kind === "p") return <p key={k} className="whitespace-pre-wrap">{inline(b.text, k)}</p>;
        const items = b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>);
        return b.kind === "ul" ? (
          <ul key={k} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        ) : (
          <ol key={k} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        );
      })}
    </div>
  );
}

import { CheckIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

export type GuideStep = {
  /** the step numbers drawn on the screenshot (one picture can carry two); none = a moment with no number */
  n: number[];
  title: string;
  body: string;
  /** file under public/guide/<folder>, with its pixel size so the layout does not jump while it loads */
  img?: { src: string; w: number; h: number; alt: string };
};

/** A fold-out, numbered walkthrough with screenshots (connecting Google, connecting GitHub). */
export function StepGuide({
  title,
  note,
  folder,
  steps,
  open,
}: {
  title: string;
  /** small text on the right of the heading, e.g. how long it takes */
  note?: string;
  /** public/guide/<folder> */
  folder: string;
  steps: GuideStep[];
  open: boolean;
}) {
  return (
    <details className="group card mt-4 overflow-hidden" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-sunken [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
        {title}
        {note && <span className="hint ml-auto hidden font-normal sm:inline">{note}</span>}
      </summary>
      <ol className="divide-y divide-line border-t border-line">
        {steps.map((s) => (
          <li key={s.title} className="flex gap-3 px-4 py-4">
            <span className="badge badge-ok mt-0.5 h-6 shrink-0 px-2 tabular-nums">
              {s.n.length > 0 ? s.n.join(" – ") : <CheckIcon className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{s.title}</p>
              <p className="hint mt-0.5">{s.body}</p>
              {s.img && (
                <img
                  src={`/guide/${folder}/${s.img.src}`}
                  width={s.img.w}
                  height={s.img.h}
                  alt={s.img.alt}
                  loading="lazy"
                  className="mt-3 h-auto max-w-full rounded-lg border border-line"
                  style={{ width: Math.min(s.img.w, 640) }}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

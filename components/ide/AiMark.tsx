import { useId } from "react";

/**
 * The AI's little mark above each of its replies in the chat (glyph drawn by Codex, 2026-10-11): a white
 * chat bubble with "</>" on a green → sky → violet disc, and a gold sparkle. `active` = this reply is being
 * written right now: a gradient ring runs round the disc, the bubble breathes, the sparkle twinkles and the
 * disc glows (app/globals.css .ai-mark-active). Gradient ids come from useId: many replies show it at once.
 */
export function AiMark({ active = false, className = "h-5 w-5" }: { active?: boolean; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = `ai-fill-${id}`;
  const ring = `ai-ring-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`ai-mark ${active ? "ai-mark-active" : ""} ${className}`}>
      <defs>
        <linearGradient id={fill} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="0.55" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id={ring} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="0.5" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      {/* only shown while answering: a bright arc that runs round the disc */}
      <circle className="ai-mark-ring" cx="12" cy="12" r="11.2" stroke={`url(#${ring})`} strokeWidth="1.5" strokeLinecap="round" pathLength={100} strokeDasharray="38 62" />
      <circle cx="12" cy="12" r="9.6" fill={`url(#${fill})`} />
      <g className="ai-mark-core" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.3 8h5.4a1.8 1.8 0 0 1 1.8 1.8v3.4a1.8 1.8 0 0 1-1.8 1.8h-3.1L8.6 16.6V15a1.8 1.8 0 0 1-1.1-1.7V9.8A1.8 1.8 0 0 1 9.3 8Z" />
        <path d="m10.7 10.3-1.1 1.2 1.1 1.2m2.6-2.4 1.1 1.2-1.1 1.2" />
      </g>
      <path
        className="ai-mark-spark"
        d="M19.2 1.6 20 3.6 22 4.4 20 5.2 19.2 7.2 18.4 5.2 16.4 4.4 18.4 3.6Z"
        fill="#fbbf24"
        stroke="#fff"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Three dots that bounce in turn: the reply has started but no words have arrived yet. */
export function TypingDots() {
  return (
    <span className="typing-dots inline-flex items-center gap-1 py-1" role="status" aria-label="AI กำลังพิมพ์">
      <span />
      <span />
      <span />
    </span>
  );
}

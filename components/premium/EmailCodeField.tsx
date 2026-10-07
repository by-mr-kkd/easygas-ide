"use client";

/** The 6-digit code from the email. Digits only, one-time-code autofill, Enter submits. */
export function EmailCodeField({
  id,
  value,
  onChange,
  onEnter,
  describedBy,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      placeholder="123456"
      spellCheck={false}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      className="field w-32 shrink-0 text-center font-mono tracking-[0.3em]"
    />
  );
}

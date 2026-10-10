"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { saveEngineAction, setClaudeQuotaAction } from "@/app/settings/actions";
import type { LlmProvider } from "@/lib/llm/catalog";
import type { EngineId, KeyId } from "@/lib/settings";
import { ApiKeyForm } from "./ApiKeyForm";
import { CliOverview } from "./CliOverview";
import { CliSetup } from "./CliSetup";

interface ProviderOption {
  id: LlmProvider;
  label: string;
  /** Which stored key this provider uses (several providers can share one). */
  keyId: KeyId;
}

interface KeyOption {
  id: KeyId;
  label: string;
  hint: string;
  hasKey: boolean;
}

interface Choice {
  engine: EngineId;
  provider: LlmProvider;
  cliModel: string;
}

const ENGINE_CARDS: { id: EngineId; title: string; body: string }[] = [
  { id: "api", title: "API key", body: "จ่ายตามที่ใช้จริงให้ผู้ให้บริการ AI โดยตรง ใส่คีย์ของคุณด้านล่าง" },
  {
    id: "claude-cli",
    title: "Claude Code (สมาชิกรายเดือน)",
    body: "ใช้แพ็กเกจ Claude Pro/Max ของคุณผ่านโปรแกรม Claude Code ที่ติดตั้งและล็อกอินไว้ในเครื่อง",
  },
  {
    id: "codex-cli",
    title: "Codex (สมาชิก ChatGPT)",
    body: "ใช้แพ็กเกจ ChatGPT ของคุณผ่านโปรแกรม Codex ที่ติดตั้งและล็อกอินไว้ในเครื่อง",
  },
  {
    id: "muse-cli",
    title: "Muse Code (สมาชิก Meta)",
    body: "ใช้แพ็กเกจ Muse Code รายเดือนของคุณผ่านโปรแกรม Muse Code ที่ติดตั้งและล็อกอินไว้ในเครื่อง",
  },
];

const CLI_MODELS = [
  { id: "", label: "ค่าเริ่มต้นของ Claude Code" },
  { id: "sonnet", label: "Sonnet" },
  { id: "opus", label: "Opus" },
  { id: "haiku", label: "Haiku" },
];

/**
 * Which AI writes the code. Each choice is a radio card, and the chosen card opens its own setup
 * right under it (the provider + its key, or the CLI's install / sign-in). Picking an engine,
 * provider or model saves at once — there is no separate save button for those.
 */
export function EngineForm(props: {
  engine: EngineId;
  provider: LlmProvider;
  cliModel: string;
  providers: ProviderOption[];
  keys: KeyOption[];
  claudeFound: boolean;
  codexFound: boolean;
  museFound: boolean;
  /** the "แสดงโควตา Claude" switch */
  claudeQuota: boolean;
}) {
  const [claudeQuota, setClaudeQuota] = useState(props.claudeQuota);
  async function toggleClaudeQuota(on: boolean) {
    setClaudeQuota(on);
    await setClaudeQuotaAction(on).catch(() => setClaudeQuota(!on));
  }
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>({ engine: props.engine, provider: props.provider, cliModel: props.cliModel });
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  // what the server last accepted (to fall back to), and which request is the newest
  const confirmed = useRef<Choice>(choice);
  const latest = useRef(0);

  async function commit(next: Choice) {
    setChoice(next);
    setStatus("saving");
    setError(null);
    const mine = ++latest.current;
    const r = await saveEngineAction(next).catch((): { ok: boolean; error?: string } => ({ ok: false }));
    if (r.ok) confirmed.current = next;
    if (mine !== latest.current) return; // a newer choice is already on its way
    if (!r.ok) {
      setChoice(confirmed.current);
      setStatus("idle");
      return setError(r.error ?? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
    setStatus("saved");
    router.refresh();
  }

  const selectedKeyId = props.providers.find((p) => p.id === choice.provider)?.keyId;
  const selectedKey = props.keys.find((k) => k.id === selectedKeyId);
  const otherKeys = props.keys.filter((k) => k.id !== selectedKeyId);
  const hasKey = (id: KeyId) => props.keys.some((k) => k.id === id && k.hasKey);

  const setup: Record<EngineId, React.ReactNode> = {
    api: (
      <>
        <div>
          <label className="label" htmlFor="provider">
            ผู้ให้บริการ AI
          </label>
          <select
            id="provider"
            value={choice.provider}
            onChange={(e) => commit({ ...choice, provider: e.target.value as LlmProvider })}
            className="field mt-1.5"
          >
            {props.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {hasKey(p.keyId) ? " (ใส่คีย์แล้ว)" : ""}
              </option>
            ))}
          </select>
        </div>
        {selectedKey && <ApiKeyForm key={selectedKey.id} keyId={selectedKey.id} label={selectedKey.label} hint={selectedKey.hint} hasKey={selectedKey.hasKey} required />}
        <p className="hint">
          คีย์เก็บไว้ในเครื่องของคุณเท่านั้น และส่งตรงไปยังผู้ให้บริการ AI ที่คุณเลือก ไม่ผ่านเซิร์ฟเวอร์อื่น
          โปรเจกต์ที่สร้างไปแล้วจะใช้ผู้ให้บริการเดิมต่อ (ประวัติแชทผูกกับรูปแบบของผู้ให้บริการนั้น)
        </p>
        {otherKeys.length > 0 && (
          <details className="group">
            <summary className="btn btn-secondary btn-sm">
              <ChevronRightIcon className="h-4 w-4 transition-transform group-open:rotate-90" />
              คีย์ของผู้ให้บริการอื่น
            </summary>
            <div className="mt-2 space-y-2">
              {otherKeys.map((k) => (
                <ApiKeyForm key={k.id} keyId={k.id} label={k.label} hint={k.hint} hasKey={k.hasKey} />
              ))}
            </div>
          </details>
        )}
      </>
    ),
    "claude-cli": (
      <>
        <CliSetup tool="claude" found={props.claudeFound} />
        <div>
          <label className="label" htmlFor="cli-model">
            โมเดล
          </label>
          <select
            id="cli-model"
            value={choice.cliModel}
            onChange={(e) => commit({ ...choice, cliModel: e.target.value })}
            className="field mt-1.5"
          >
            {CLI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 hover:bg-sunken">
          <input
            type="checkbox"
            checked={claudeQuota}
            onChange={(e) => void toggleClaudeQuota(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">แสดงโควตา Claude ที่เหลือในแถบล่างของโปรเจกต์</span>
            <span className="hint block">
              Claude Code ไม่มีคำสั่งบอกโควตา เมื่อเปิด แอปจะใช้การล็อกอินของ Claude Code ในเครื่องถาม Anthropic เอง (1 คำขอเล็ก ๆ ทุก 5 นาที)
              ไม่เก็บ ไม่ส่งที่อื่น ปิดเมื่อไหร่ก็หยุดอ่านทันที
            </span>
          </span>
        </label>
        <p className="hint">
          การใช้งานนับรวมในโควตาแพ็กเกจ Claude ของคุณ EasyGAS ไม่เก็บข้อมูลล็อกอินของ Claude
          {claudeQuota ? " อ่านชั่วคราวเฉพาะตอนถามโควตาตามที่เปิดไว้ด้านบน" : " และไม่อ่านเลยตราบใดที่สวิตช์ด้านบนปิดอยู่"}
        </p>
      </>
    ),
    "codex-cli": (
      <>
        <CliSetup tool="codex" found={props.codexFound} />
        <p className="hint">
          การใช้งานนับรวมในโควตาแพ็กเกจ ChatGPT ของคุณ EasyGAS ไม่เห็นและไม่เก็บข้อมูลล็อกอินของ ChatGPT
          ในโหมดนี้ Codex เขียนไฟล์และรันคำสั่งในเครื่องเองไม่ได้ แอปส่งไฟล์ของโปรเจกต์ให้ แล้วเป็นคนบันทึกการแก้ไขเอง
        </p>
      </>
    ),
    "muse-cli": (
      <>
        <CliSetup tool="muse" found={props.museFound} />
        <p className="hint">
          การใช้งานนับรวมในโควตาแพ็กเกจ Muse Code ของคุณ EasyGAS ไม่เห็นและไม่เก็บข้อมูลล็อกอินของ Meta
          ในโหมดนี้ Muse Code เขียนไฟล์และรันคำสั่งในเครื่องเองไม่ได้ แอปส่งไฟล์ของโปรเจกต์ให้ แล้วเป็นคนบันทึกการแก้ไขเอง
        </p>
        <p className="hint">
          ถ้าเคยบันทึก API key ไว้ใน Muse Code โปรแกรมจะใช้คีย์นั้นก่อนการล็อกอินรายเดือน และคิดเงินตามการใช้งาน
          ถ้าต้องการใช้แพ็กเกจรายเดือน ให้ออกจากระบบใน Muse Code (<code className="font-mono">muse logout</code>) แล้วล็อกอินใหม่ผ่านเบราว์เซอร์
          ส่วน MCP server และ hook ที่คุณตั้งไว้ใน Muse Code เองจะยังทำงานตามปกติ
        </p>
      </>
    ),
  };

  return (
    <div className="space-y-3">
      <CliOverview
        found={{ claude: props.claudeFound, codex: props.codexFound, muse: props.museFound }}
        engine={choice.engine}
        onUse={(engine) => commit({ ...choice, engine })}
      />
      <h2 className="pt-2 text-sm font-semibold text-fg">เลือก AI ที่ใช้</h2>
      <div role="radiogroup" aria-label="AI ที่ใช้สร้างโค้ด" className="space-y-2">
        {ENGINE_CARDS.map((c) => {
          const selected = choice.engine === c.id;
          return (
            <div key={c.id} className={`card overflow-hidden ${selected ? "border-accent" : "hover:border-line-strong"}`}>
              <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${selected ? "bg-accent-soft" : "hover:bg-sunken"}`}>
                <input
                  type="radio"
                  name="engine"
                  className="mt-1 h-4 w-4 shrink-0 accent-accent"
                  checked={selected}
                  onChange={() => commit({ ...choice, engine: c.id })}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{c.title}</span>
                  <span className="hint mt-0.5 block">{c.body}</span>
                </span>
              </label>
              {selected && <div className="space-y-4 border-t border-line px-4 py-4">{setup[c.id]}</div>}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="callout callout-danger">
          {error}
        </p>
      )}
      <p className="hint min-h-5" aria-live="polite">
        {status === "saving" ? "กำลังบันทึก…" : status === "saved" ? "บันทึกแล้ว" : ""}
      </p>
    </div>
  );
}

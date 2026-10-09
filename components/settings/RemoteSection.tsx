"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, ClipboardDocumentIcon, DevicePhoneMobileIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import {
  cancelPairAction,
  pairPhoneAction,
  remoteStatusAction,
  removeRemoteDeviceAction,
  setRemoteAction,
  setRemotePinAction,
  setRelayNameAction,
  type RemoteView,
} from "@/app/settings/remote-actions";

const POLL_MS = 1500;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "—");

function phaseText(v: RemoteView): string {
  switch (v.phase) {
    case "off":
      return "ปิดอยู่";
    case "starting":
      return "กำลังเปิด…";
    case "downloading":
      return `กำลังดาวน์โหลดตัวเชื่อมต่อของ Cloudflare (ครั้งแรกครั้งเดียว) ${Math.round(v.progress * 100)}%`;
    case "connecting":
      return "กำลังขอลิงก์จาก Cloudflare…";
    case "on":
      return "พร้อมใช้";
    case "error":
      return `เปิดไม่สำเร็จ: ${v.error ?? "ไม่ทราบสาเหตุ"}`;
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm shrink-0"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <CheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
      {done ? "คัดลอกแล้ว" : "คัดลอก"}
    </button>
  );
}

function Pairing({ v, onCancel }: { v: RemoteView; onCancel: () => void }) {
  const p = v.pairing!;
  const [qr, setQr] = useState<string | null>(null);
  const [left, setLeft] = useState(Math.max(0, p.expiresAt - Date.now()));
  useEffect(() => {
    if (!p.link) return;
    let alive = true;
    import("qrcode")
      .then((m) => m.toDataURL(p.link!, { errorCorrectionLevel: "M", margin: 2, width: 480 }))
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [p.link]);
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, p.expiresAt - Date.now())), 1000);
    return () => clearInterval(t);
  }, [p.expiresAt]);
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  return (
    <div className="mt-3 flex flex-wrap items-center gap-5 rounded-xl border border-line bg-sunken p-4">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR สำหรับจับคู่มือถือ" width={180} height={180} className="rounded-lg bg-white" />
      ) : (
        <div className="grid h-[180px] w-[180px] place-items-center rounded-lg bg-surface text-xs text-muted">รอลิงก์…</div>
      )}
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-semibold text-fg">สแกน QR ด้วยกล้องมือถือ</p>
        <p className="hint mt-1">
          {v.relayUrl ? "หรือเปิด easygaside.tech/app ในมือถือ ใส่ชื่อลิงก์ แล้วพิมพ์ตัวเลขนี้" : "หรือเปิดลิงก์ด้านบนในมือถือ แล้วพิมพ์ตัวเลขนี้"}
        </p>
        <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.3em] text-fg">{p.code}</p>
        <p className="hint mt-1">{left > 0 ? `ใช้ได้อีก ${mm}:${ss} นาที ใช้ได้ครั้งเดียว` : "หมดเวลาแล้ว กดจับคู่ใหม่"}</p>
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

/** Pro: the fixed link, its own name, and how to get the app + notifications on the phone. */
function ProLink({ v, onView }: { v: RemoteView; onView: (next: RemoteView) => void }) {
  const [name, setName] = useState(v.relayName ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  if (!v.relayUrl) return <p className="hint mt-2">กำลังลงทะเบียนลิงก์ประจำเครื่องกับเซิร์ฟเวอร์ Pro…</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await setRelayNameAction(name);
      if (r.ok) {
        onView(r.view);
        setMsg({ ok: true, text: "ตั้งชื่อแล้ว ลิงก์เดิมแบบสุ่มยังใช้ได้เหมือนเดิม" });
      } else setMsg({ ok: false, text: r.error });
    } catch {
      setMsg({ ok: false, text: "ตั้งชื่อไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-sunken px-3 py-3">
      <p className="text-sm font-semibold text-fg">ลิงก์ประจำเครื่อง (Pro)</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-[13px] text-fg">{v.relayUrl}</code>
        <CopyButton text={v.relayUrl} />
      </div>
      <form onSubmit={save} className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">easygaside.tech/r/</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24))}
          placeholder="ชื่อของคุณ เช่น somchai-shop"
          aria-label="ชื่อลิงก์"
          autoComplete="off"
          className="field w-56 font-mono placeholder:font-sans"
        />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={saving || name.length < 3 || name === v.relayName}>
          {v.relayName ? "เปลี่ยนชื่อ" : "ตั้งชื่อ"}
        </button>
      </form>
      <p className="hint mt-1">a–z ตัวเลข และขีด ยาว 3–24 ตัว ห้ามซ้ำกับคนอื่น เปลี่ยนได้เดือนละครั้ง</p>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-accent-text" : "text-danger"}`}>{msg.text}</p>}
      <p className="hint mt-3">
        ในมือถือ เปิด <span className="font-medium text-fg">easygaside.tech/app</span> แล้วเพิ่มลงหน้าจอโฮม จะได้แอป EasyGAS ที่เปิดคอมเครื่องนี้ได้ทุกเมื่อ
        และเปิดแจ้งเตือนเมื่อ AI ทำเสร็จหรือถามกลับได้ในแอปนั้น
      </p>
    </div>
  );
}

/** Settings → ใช้จากมือถือ: switch remote access, pair phones, PIN, paired devices (docs/REMOTE-PLAN.md). */
export function RemoteSection({ initial }: { initial: RemoteView }) {
  const [v, setV] = useState(initial);
  const [mode, setMode] = useState(initial.mode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [justPaired, setJustPaired] = useState<string | null>(null);
  const deviceCount = useRef(initial.devices.length);

  // follow a start (download, tunnel) and an open pairing code until they settle
  // also wait for a Pro machine's fixed link to register (just after the key was entered)
  const settling = (v.enabled && v.phase !== "on" && v.phase !== "error") || !!v.pairing || (v.pro && v.enabled && v.mode === "tunnel" && v.phase === "on" && !v.relayUrl);
  useEffect(() => {
    if (!settling) return;
    const t = setInterval(() => {
      remoteStatusAction()
        .then((next) => {
          if (next.devices.length > deviceCount.current) setJustPaired(next.devices[next.devices.length - 1].name);
          deviceCount.current = next.devices.length;
          setV(next);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [settling]);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ทำไม่สำเร็จ");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(on: boolean, m = mode) {
    const r = await run(() => setRemoteAction(on, m));
    if (!r) return;
    if (r.ok) setV(r.view);
    else setError(r.error);
  }

  async function savePin(value: string | null) {
    setPinMsg(null);
    const r = await run(() => setRemotePinAction(value));
    if (!r) return;
    if (r.ok) {
      setV(r.view);
      setPin("");
      setPinMsg(value ? "บันทึก PIN แล้ว" : "เลิกใช้ PIN แล้ว");
    } else setPinMsg(r.error);
  }

  return (
    <div className="space-y-4">
      {/* on/off + which way */}
      <div className="card px-4 py-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={v.enabled}
            disabled={busy}
            onChange={(e) => void toggle(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">เปิดให้มือถือสั่งงานคอมเครื่องนี้</span>
            <span className="hint block">มือถือเปิดเบราว์เซอร์ใช้ EasyGAS IDE ได้ทุกอย่างเหมือนนั่งหน้าคอม AI และไฟล์ยังทำงานบนคอมเครื่องนี้</span>
          </span>
        </label>

        <fieldset className="mt-4 space-y-2" disabled={busy}>
          {(
            [
              ["tunnel", "จากที่ไหนก็ได้ (แนะนำ)", "ผ่านลิงก์ https ของ Cloudflare ไม่ต้องตั้งค่าเราเตอร์ ครั้งแรกดาวน์โหลดตัวเชื่อมต่อ 55 MB"],
              [
                "lan",
                "Wi-Fi เดียวกันเท่านั้น",
                "มือถือกับคอมต้องต่อ Wi-Fi เดียวกัน ข้อมูลใน Wi-Fi ไม่เข้ารหัส ใช้เฉพาะ Wi-Fi บ้านหรือที่ทำงานที่ไว้ใจ ห้ามใช้ Wi-Fi สาธารณะ ครั้งแรก Windows จะถามเรื่องไฟร์วอลล์ ให้อนุญาตเฉพาะเครือข่ายส่วนตัว (Private)",
              ],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1">
              <input
                type="radio"
                name="remote-mode"
                checked={mode === id}
                onChange={() => {
                  setMode(id);
                  if (v.enabled) void toggle(true, id);
                }}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{label}</span>
                <span className="hint block">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {v.enabled && (
          <p className={`mt-3 text-sm ${v.phase === "error" ? "text-danger" : v.phase === "on" ? "text-accent-text" : "text-muted"}`} role="status">
            {phaseText(v)}
          </p>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {/* link + pairing */}
      {v.enabled && v.phase === "on" && v.url && (
        <div className="card px-4 py-4">
          <p className="text-sm font-semibold text-fg">ลิงก์สำหรับมือถือ</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2 text-[13px] text-fg">{v.url}</code>
            <CopyButton text={v.url} />
          </div>
          {v.mode === "tunnel" &&
            (v.pro ? (
              <ProLink v={v} onView={setV} />
            ) : (
              <div className="mt-2">
                <p className="hint">ลิงก์นี้ใช้ได้ตราบที่คอมเปิดอยู่ ถ้าคอมรีสตาร์ตหรือปิดแอป ลิงก์จะเปลี่ยนและต้องจับคู่ใหม่</p>
                <p className="hint mt-1">
                  <Link href="/settings?s=premium" className="underline">
                    Pro
                  </Link>{" "}
                  เพิ่ม: ลิงก์ถาวรที่ตั้งชื่อเองได้ · ติดตั้งเป็นแอปบนมือถือ · แจ้งเตือนเมื่อ AI ทำเสร็จหรือถามกลับ
                </p>
              </div>
            ))}

          {v.pairing ? (
            <Pairing v={v} onCancel={() => void run(cancelPairAction).then((n) => n && setV(n))} />
          ) : (
            <button
              type="button"
              className="btn btn-primary mt-4"
              disabled={busy}
              onClick={() => {
                setJustPaired(null);
                void run(pairPhoneAction).then((n) => n && setV(n));
              }}
            >
              <DevicePhoneMobileIcon className="h-4 w-4" />
              จับคู่มือถือ
            </button>
          )}
          {justPaired && <p className="mt-3 text-sm font-medium text-accent-text">จับคู่ {justPaired} แล้ว</p>}
        </div>
      )}

      {/* PIN */}
      <div className="card px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <LockClosedIcon className="h-4 w-4 text-muted" />
          PIN {v.pinSet ? <span className="badge badge-ok">ตั้งแล้ว</span> : <span className="badge">ยังไม่ตั้ง</span>}
        </p>
        <p className="hint mt-1">
          {v.pro
            ? "Pro ต้องมี PIN มือถือจะถามตอนเริ่มใช้และหลังไม่ได้ใช้ 30 นาที ใส่ผิด 5 ครั้งล็อก 15 นาที"
            : "ไม่บังคับ แต่แนะนำ กันกรณีมือถือหลุดมือ มือถือจะถามตอนเริ่มใช้และหลังไม่ได้ใช้ 30 นาที ใส่ผิด 5 ครั้งล็อก 15 นาที"}
        </p>
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void savePin(pin);
          }}
        >
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="ตัวเลข 6 หลัก"
            aria-label="PIN ใหม่"
            className="field w-40 font-mono tracking-[0.25em] placeholder:font-sans placeholder:tracking-normal"
          />
          <button type="submit" className="btn btn-secondary" disabled={busy || pin.length !== 6}>
            {v.pinSet ? "เปลี่ยน PIN" : "ตั้ง PIN"}
          </button>
          {v.pinSet && !v.pro && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void savePin(null)}>
              เลิกใช้ PIN
            </button>
          )}
        </form>
        {pinMsg && <p className="mt-2 text-sm text-muted">{pinMsg}</p>}
        <p className="hint mt-2">ลืม PIN ตั้งใหม่ได้ที่หน้านี้บนคอมเท่านั้น</p>
      </div>

      {/* devices */}
      <div className="card px-4 py-4">
        <p className="text-sm font-semibold text-fg">มือถือที่จับคู่แล้ว</p>
        {v.devices.length === 0 ? (
          <p className="hint mt-1">ยังไม่มี</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {v.devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block text-sm font-medium text-fg">{d.name}</span>
                  <span className="hint block">
                    จับคู่ {fmt(d.pairedAt)} · ใช้ล่าสุด {fmt(d.lastSeenAt)}
                    {d.push ? " · แจ้งเตือนเปิดอยู่" : ""}
                  </span>
                </span>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void run(() => removeRemoteDeviceAction(d.id)).then((n) => n && setV(n))}>
                  ถอน
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint mt-2">ถอนแล้วเครื่องนั้นเข้าไม่ได้ทันที มือถือหายหรือไม่แน่ใจ ถอนไว้ก่อนแล้วจับคู่ใหม่ได้เสมอ</p>
      </div>

      <div className="space-y-1.5 px-1">
        <p className="hint">ระหว่างเปิดใช้: คอมจะไม่เข้าโหมดพัก และปิดหน้าต่างแล้วแอปยังทำงานต่อที่ไอคอนมุมขวาล่างของ Windows (ออกจากแอปได้จากเมนูของไอคอนนั้น)</p>
        <p className="hint">แบบ “จากที่ไหนก็ได้” ข้อมูลวิ่งผ่าน Cloudflare แบบเข้ารหัส https ไปถึงคอมของคุณ ไม่ผ่านเซิร์ฟเวอร์ของ EasyGAS</p>
        <p className="hint">จากมือถือทำได้ทุกอย่างยกเว้น หน้านี้ การติดตั้ง AI และการถอนการติดตั้งแอป ซึ่งทำได้บนคอมเท่านั้น</p>
      </div>
    </div>
  );
}

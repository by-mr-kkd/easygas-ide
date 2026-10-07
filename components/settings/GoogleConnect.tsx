"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { googleLogoutAction, googleStatusAction, startGoogleLoginAction } from "@/app/settings/actions";

const POLL_MS = 2000;
const POLL_LIMIT_MS = 5 * 60 * 1000;

/**
 * Connect the publishing account through clasp's own Google sign-in, then poll until it lands.
 * Also embedded in a dialog by the IDE: `onConnected` fires once when the sign-in is seen, and
 * `plain` drops the card frame so it can sit inside another surface.
 */
export function GoogleConnect({
  loggedIn,
  email,
  onConnected,
  plain = false,
}: {
  loggedIn: boolean;
  email: string | null;
  onConnected?: () => void;
  plain?: boolean;
}) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // the poll outlives the render that started it, so it calls whatever callback is current
  const onConnectedRef = useRef(onConnected);
  useEffect(() => {
    onConnectedRef.current = onConnected;
  });

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function connect() {
    setBusy(true);
    await startGoogleLoginAction();
    setBusy(false);
    setWaiting(true);
    const startedAt = Date.now();
    let inFlight = false;
    timer.current = setInterval(async () => {
      if (inFlight) return; // a slow check must not stack up behind the next tick
      inFlight = true;
      try {
        const s = await googleStatusAction();
        if (s.loggedIn || Date.now() - startedAt > POLL_LIMIT_MS) {
          if (timer.current) clearInterval(timer.current);
          setWaiting(false);
          router.refresh();
          if (s.loggedIn) onConnectedRef.current?.();
        }
      } catch {
        /* transient — keep polling until the time limit */
      } finally {
        inFlight = false;
      }
    }, POLL_MS);
  }

  async function logout() {
    setBusy(true);
    await googleLogoutAction();
    setBusy(false);
    router.refresh();
  }

  const usersettings = `https://script.google.com/home/usersettings${email ? `?authuser=${encodeURIComponent(email)}` : ""}`;

  return (
    <div className={plain ? "" : "card px-4 py-4"}>
      {loggedIn ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="min-w-0 flex-1 basis-40 truncate text-sm font-semibold text-fg">{email ?? "บัญชี Google"}</span>
          <span className="badge badge-ok">เชื่อมแล้ว</span>
          <button type="button" onClick={logout} disabled={busy} className="btn btn-danger btn-sm">
            ยกเลิกการเชื่อมต่อ
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-fg">
            ระบบจะเปิดหน้าล็อกอินของ Google ในเบราว์เซอร์ เลือกบัญชีที่จะใช้เผยแพร่ แล้วกดอนุญาต
          </p>
          <button type="button" onClick={connect} disabled={busy || waiting} className="btn btn-primary mt-3 max-w-full">
            <span className="truncate">{waiting ? "รอการอนุญาตในเบราว์เซอร์…" : "เชื่อมต่อ Google"}</span>
          </button>
        </>
      )}
      <p className="hint mt-3">
        ต้องเปิด Apps Script API ให้บัญชีนี้หนึ่งครั้ง{" "}
        <a href={usersettings} target="_blank" rel="noreferrer" className="link whitespace-nowrap">
          เปิดที่ usersettings <ArrowTopRightOnSquareIcon className="inline h-3.5 w-3.5 align-[-2px]" />
        </a>
      </p>
    </div>
  );
}

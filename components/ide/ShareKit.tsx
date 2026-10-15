"use client";

import { useEffect, useState } from "react";
import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, ClipboardDocumentIcon, PaintBrushIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { describeShareAction, sharePictureAction } from "@/app/projects/share-actions";
import { compressDataUrl, cropDataUrl } from "@/lib/client/image-compress";
import { svgToJpeg } from "@/lib/client/svg-raster";
import type { KitPicture } from "@/lib/client/share-pictures";
import { buildPicturePrompt, DEFAULT_SPEC, PICTURE_FONTS, PICTURE_LANGS, PICTURE_SIZES, PICTURE_STYLES, PROMPT_MAX, type PictureSpec } from "@/lib/share/picture-prompt";
import { useProjectStore } from "@/store/useProjectStore";

const PHOTOS_MAX = 4;

/**
 * "เตรียมแชร์" under the chat's next steps: the pictures and the words for the share page (and social posts), made here
 * and handed to the share dialog (ShareButton reads the store's sharePics / shareDraft when it opens and sends them with
 * the share). Two buttons:
 * - ให้ AI สร้างรูป: the app writes a prompt from the user's picks (lib/share/picture-prompt), they read / edit it, and
 *   "สร้างรูปตามนี้" sends it to the AI picked in the chat (lib/share/picture: an image model when the pick has one, else an
 *   SVG drawing turned into a JPEG here); every result is cropped to the picked box
 * - ให้ AI เขียนคำอธิบาย: the same "ให้ AI สรุป" as the dialog, shown here first
 * Nothing leaves the computer until the share dialog sends it (a download stays on this computer).
 */
export function ShareKit({ projectId, projectName, engineReady, aiLabel }: { projectId: string; projectName: string; engineReady: boolean; aiLabel: string | null }) {
  const shots = useProjectStore((s) => s.shots);
  const addShot = useProjectStore((s) => s.addShot);
  const removeShot = useProjectStore((s) => s.removeShot);
  const pics = useProjectStore((s) => s.sharePics);
  const setPics = useProjectStore((s) => s.setSharePics);
  const draft = useProjectStore((s) => s.shareDraft);
  const setDraft = useProjectStore((s) => s.setShareDraft);
  const aiChoice = useProjectStore((s) => s.aiChoice);

  const [drawOpen, setDrawOpen] = useState(false);
  // ย่อ = only the buttons row stays; the form, the pictures and the description fold away (nothing is lost)
  const [folded, setFolded] = useState(false);
  const [spec, setSpec] = useState<PictureSpec>(DEFAULT_SPEC);
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [describing, setDescribing] = useState(false);
  const [describeError, setDescribeError] = useState("");
  const [copied, setCopied] = useState(false);

  // the prompt follows the picks until the user edits it by hand; "เขียนใหม่จากตัวเลือก" brings it back
  const builtPrompt = buildPicturePrompt(projectName, draft ?? "", spec);
  useEffect(() => {
    if (!promptTouched) setPrompt(builtPrompt);
  }, [builtPrompt, promptTouched]);

  async function draw() {
    setDrawing(true);
    setDrawError("");
    const size = PICTURE_SIZES[spec.size];
    const r = await sharePictureAction(projectId, aiChoice ?? undefined, { prompt, size: spec.size, useCode: !(draft ?? "").trim() }).catch(() => null);
    try {
      if (!r) throw new Error("AI สร้างรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
      if (!r.ok) throw new Error(r.error);
      const p = r.data;
      const raw = p.kind === "image" ? (await compressDataUrl(p.dataUrl, 2000)).dataUrl : (await svgToJpeg(p.svg, p.width, p.height)).dataUrl;
      const pic = await cropDataUrl(raw, size.w, size.h);
      const id = `ai-${Date.now()}`;
      addShot({ id, dataUrl: pic.dataUrl, width: size.w, height: size.h, at: Date.now(), by: `${p.by}${p.how === "drawing" ? " · วาดเป็น SVG" : ""} · ${size.label.split(" · ")[0]}` });
      setFolded(false);
      // the box asked for is the slot it goes to, when that slot is free
      if (spec.size === "cover" && !pics.cover) setPics({ ...pics, cover: pic.dataUrl });
      else if (spec.size === "photo" && pics.photos.length < PHOTOS_MAX) setPics({ ...pics, photos: [...pics.photos, pic.dataUrl] });
    } catch (e) {
      setDrawError(e instanceof Error ? e.message : "AI สร้างรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setDrawing(false);
    }
  }

  async function describe() {
    setDescribing(true);
    setDescribeError("");
    const r = await describeShareAction(projectId, aiChoice ?? undefined).catch(() => null);
    setDescribing(false);
    if (!r) return setDescribeError("AI สรุปไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) return setDescribeError(r.error);
    setDraft(r.data);
    setFolded(false);
  }

  const isCover = (s: KitPicture) => pics.cover === s.dataUrl;
  const photoIndex = (s: KitPicture) => pics.photos.indexOf(s.dataUrl);
  const setCover = (s: KitPicture) => setPics({ cover: isCover(s) ? null : s.dataUrl, photos: pics.photos.filter((p) => p !== s.dataUrl) });
  const togglePhoto = (s: KitPicture) => {
    if (photoIndex(s) >= 0) return setPics({ ...pics, photos: pics.photos.filter((p) => p !== s.dataUrl) });
    if (pics.photos.length >= PHOTOS_MAX) return;
    setPics({ cover: isCover(s) ? null : pics.cover, photos: [...pics.photos, s.dataUrl] });
  };
  const picked = (pics.cover ? 1 : 0) + pics.photos.length;
  const pick = <K extends keyof PictureSpec>(key: K, value: PictureSpec[K]) => setSpec((s) => ({ ...s, [key]: value }));
  // the toggle shows only when there is something below the buttons; folded, it counts what is hidden
  const hasBody = drawOpen || shots.length > 0 || !!draft;
  const foldedCount = shots.length + (draft ? 1 : 0);

  return (
    // the card the user picked from the mock-ups (2026-10-15): a corner ribbon says PREVIEW, two tall buttons with a
    // sub-line, and a dashed-off bottom row that counts what is ready and folds the rest
    <div className="share-kit relative mt-4 space-y-3 overflow-hidden rounded-2xl border border-line bg-surface px-3.5 pb-3 pt-3.5">
      <span className="share-kit-ribbon" aria-hidden="true">
        PREVIEW
      </span>
      <div className="flex items-center gap-3 pr-12">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-ai-soft text-ai">
          <ArrowUpTrayIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold leading-tight">เตรียมแชร์ให้คนอื่นโคลน</span>
          <span className="mt-0.5 block text-xs text-muted">รูปและคำอธิบายไปรอในหน้าต่างแชร์เอง</span>
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setFolded(false);
            setDrawOpen((v) => (folded ? true : !v));
          }}
          disabled={!engineReady}
          aria-expanded={drawOpen}
          title={`ให้ ${aiLabel ?? "AI ที่เลือกในแชต"} สร้างรูปจากพร้อมท์ที่แอปเขียนให้ อ่านและแก้ได้ก่อนส่ง (ใช้โควตา AI)`}
          className="share-kit-btn"
        >
          <PaintBrushIcon className="h-[18px] w-[18px] flex-none" />
          <span className="min-w-0 text-left leading-tight">
            ให้ AI สร้างรูป
            <span className="block text-[11px] font-medium text-faint">ปก · OG · โพสต์</span>
          </span>
        </button>
        <button
          type="button"
          onClick={describe}
          disabled={!engineReady || describing}
          title="ให้ AI ที่เลือกในแชตอ่านโค้ดแล้วเขียนคำอธิบายสำหรับหน้าแชร์ แก้ต่อได้ในหน้าต่างแชร์ (ใช้โควตา AI)"
          className="share-kit-btn"
        >
          <SparklesIcon className="h-[18px] w-[18px] flex-none" />
          <span className="min-w-0 text-left leading-tight">
            {describing ? "กำลังเขียน…" : "ให้ AI เขียนคำอธิบาย"}
            <span className="block text-[11px] font-medium text-faint">สำหรับหน้าแชร์</span>
          </span>
        </button>
      </div>
      {describeError && <p className="text-xs font-semibold text-danger">{describeError}</p>}
      {hasBody && (
        <div className="flex items-center justify-between gap-2 border-t border-dashed border-line pt-2.5">
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <span className={`h-1.5 w-1.5 flex-none rounded-full ${foldedCount ? "share-kit-dot bg-accent" : "bg-line-strong"}`} aria-hidden="true" />
            {foldedCount ? `ทำไว้แล้ว รูป ${shots.length} · คำอธิบาย ${draft ? 1 : 0}` : "กำลังเตรียม"}
          </span>
          <button
            type="button"
            onClick={() => setFolded((v) => !v)}
            aria-expanded={!folded}
            title={folded ? "แสดงฟอร์ม รูป และคำอธิบายที่ทำไว้" : "ยุบให้เหลือแค่ปุ่ม ของที่ทำไว้ยังอยู่"}
            className="btn btn-ghost btn-sm"
          >
            {folded ? "ขยาย" : "ย่อ"}
            {folded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronUpIcon className="h-4 w-4" />}
          </button>
        </div>
      )}

      {!folded && drawOpen && (
        <div className="space-y-2.5 rounded-lg border border-line bg-surface p-2.5 text-xs">
          <label className="block">
            <span className="mb-1 block font-semibold">ขนาด / เอาไปใช้ทำอะไร</span>
            <select value={spec.size} onChange={(e) => pick("size", e.target.value as PictureSpec["size"])} className="field h-7 w-full text-xs">
              {(Object.keys(PICTURE_SIZES) as PictureSpec["size"][]).map((k) => (
                <option key={k} value={k}>
                  {PICTURE_SIZES[k].label} ({PICTURE_SIZES[k].w}×{PICTURE_SIZES[k].h})
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1 block font-semibold">ข้อความในรูป</span>
            <div className="seg flex-wrap" role="group" aria-label="ภาษาข้อความในรูป">
              {(Object.keys(PICTURE_LANGS) as PictureSpec["lang"][]).map((k) => (
                <button key={k} type="button" onClick={() => pick("lang", k)} aria-pressed={spec.lang === k} className="seg-item h-7 px-2 text-xs">
                  {PICTURE_LANGS[k]}
                </button>
              ))}
            </div>
          </div>
          {spec.lang !== "none" && (
            <div>
              <span className="mb-1 block font-semibold">ฟอนต์</span>
              <div className="seg flex-wrap" role="group" aria-label="สไตล์ฟอนต์">
                {(Object.keys(PICTURE_FONTS) as PictureSpec["font"][]).map((k) => (
                  <button key={k} type="button" onClick={() => pick("font", k)} aria-pressed={spec.font === k} className="seg-item h-7 px-2 text-xs">
                    {PICTURE_FONTS[k].label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="mb-1 block font-semibold">สไตล์ภาพ</span>
            <div className="seg flex-wrap" role="group" aria-label="สไตล์ภาพ">
              {(Object.keys(PICTURE_STYLES) as PictureSpec["style"][]).map((k) => (
                <button key={k} type="button" onClick={() => pick("style", k)} aria-pressed={spec.style === k} className="seg-item h-7 px-2 text-xs">
                  {PICTURE_STYLES[k].label}
                </button>
              ))}
            </div>
          </div>
          <input
            value={spec.hint}
            onChange={(e) => pick("hint", e.target.value)}
            maxLength={300}
            placeholder="เพิ่มเติม (ไม่บังคับ) เช่น โทนฟ้า มีปฏิทินกับกราฟ ไม่เอาสีแดง"
            className="field h-7 w-full text-xs"
          />
          <label className="block">
            <span className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold">พร้อมท์ที่จะส่งให้ {aiLabel ?? "AI"} · อ่านแล้วแก้ได้</span>
              {promptTouched && (
                <button
                  type="button"
                  onClick={() => {
                    setPromptTouched(false);
                    setPrompt(builtPrompt);
                  }}
                  className="link text-[11px]"
                >
                  เขียนใหม่จากตัวเลือก
                </button>
              )}
            </span>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPromptTouched(true);
                setPrompt(e.target.value.slice(0, PROMPT_MAX));
              }}
              rows={6}
              className="field w-full font-mono text-[11px] leading-relaxed"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="hint">
              Codex (แผนรายเดือน) ChatGPT และ Gemini (คีย์ API) สร้างเป็นรูปจริง · Claude Code / Muse Code และคีย์อื่นวาดเป็นกราฟิก SVG แล้วแอปแปลงเป็นรูปให้ (ข้อความไทยในรูปจากโมเดลรูปภาพอาจสะกดเพี้ยน แบบ SVG ถูกเสมอ)
            </span>
            <button type="button" onClick={draw} disabled={drawing || !engineReady || !prompt.trim()} className="btn btn-primary btn-sm">
              <PaintBrushIcon className="h-4 w-4" />
              {drawing ? "กำลังสร้าง…" : "สร้างรูปตามนี้"}
            </button>
          </div>
          {drawError && <p className="font-semibold text-danger">{drawError}</p>}
        </div>
      )}

      {!folded && shots.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">รูปที่เตรียมไว้</span>
            <span className="text-muted">
              รูปปก {pics.cover ? "1" : "0"}/1 · รูปประกอบ {pics.photos.length}/{PHOTOS_MAX}
            </span>
          </div>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {shots.map((s) => {
              const cover = isCover(s);
              const pi = photoIndex(s);
              return (
                <figure key={s.id} className="w-44 flex-none">
                  <div className={`relative overflow-hidden rounded-md border ${cover || pi >= 0 ? "border-accent" : "border-line"} bg-sunken`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.dataUrl} alt="" className="aspect-16/10 w-full object-contain" />
                    {(cover || pi >= 0) && (
                      <span className="absolute left-1 top-1 rounded bg-accent px-1 text-[10px] font-semibold text-on-accent">{cover ? "รูปปก" : `รูปที่ ${pi + 1}`}</span>
                    )}
                    <span className="absolute right-1 top-1 flex gap-0.5">
                      <a href={s.dataUrl} download={`${projectName.replace(/[\\/:*?"<>|]+/g, "-")}-${s.id}.jpg`} aria-label="ดาวน์โหลดรูปนี้" title="ดาวน์โหลดไปโพสต์เอง" className="rounded bg-surface/90 p-0.5 text-muted hover:text-ink">
                        <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                      </a>
                      <button type="button" onClick={() => removeShot(s.id)} aria-label="ลบรูปนี้" className="rounded bg-surface/90 p-0.5 text-muted hover:text-ink">
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                  <figcaption className="mt-1 flex items-center gap-1">
                    <button type="button" onClick={() => setCover(s)} aria-pressed={cover} className={`btn btn-sm h-6 flex-1 px-1 text-[11px] ${cover ? "btn-primary" : "btn-ghost"}`}>
                      {cover && <CheckIcon className="h-3 w-3" />}
                      รูปปก
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePhoto(s)}
                      aria-pressed={pi >= 0}
                      disabled={pi < 0 && pics.photos.length >= PHOTOS_MAX}
                      className={`btn btn-sm h-6 flex-1 px-1 text-[11px] ${pi >= 0 ? "btn-primary" : "btn-ghost"}`}
                    >
                      {pi >= 0 && <CheckIcon className="h-3 w-3" />}
                      รูปประกอบ
                    </button>
                  </figcaption>
                  <p className="truncate text-[10px] text-faint" title={s.by}>
                    {s.by}
                  </p>
                </figure>
              );
            })}
          </div>
          <p className="hint mt-1.5 text-xs">{picked ? "รูปที่เลือกจะไปอยู่ในหน้าต่างแชร์ (ปุ่มแชร์บนแถบด้านบน) กดแชร์หรือบันทึกรูปที่นั่นเพื่อส่งขึ้นเว็บ · รูปสำหรับโพสต์กดดาวน์โหลดได้" : "กด รูปปก หรือ รูปประกอบ ใต้รูปที่ต้องการใช้ หรือดาวน์โหลดไปโพสต์เอง"}</p>
        </div>
      )}

      {!folded && draft && (
        <div className="rounded-lg border border-line bg-surface p-2.5 text-sm">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">คำอธิบายสำหรับหน้าแชร์</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(draft).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="btn btn-ghost btn-sm h-6 px-1.5 text-[11px]"
              >
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                {copied ? "คัดลอกแล้ว" : "คัดลอก"}
              </button>
              <button type="button" onClick={() => setDraft(null)} aria-label="ทิ้งคำอธิบายนี้" className="btn btn-ghost btn-sm btn-icon h-6 w-6">
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{draft}</p>
          <p className="hint mt-1.5 text-xs">จะถูกใส่ในช่อง เล่าสั้น ๆ ของหน้าต่างแชร์ให้เอง (ถ้าช่องยังว่าง) แก้ต่อได้ที่นั่น · พร้อมท์สร้างรูปก็ใช้ข้อความนี้บอก AI ว่าระบบทำอะไร</p>
        </div>
      )}
    </div>
  );
}

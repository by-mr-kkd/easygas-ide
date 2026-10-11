"use client";

import { CommandLineIcon, ComputerDesktopIcon, DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * The preview's controls as they appear in the toolbar row of a wide window: the "simulated" badge,
 * the device frame and the console. The frame and the console itself live in PreviewPane; the state
 * they share is in the store, so the pane needs no header of its own.
 */
export function PreviewTools() {
  const ready = useProjectStore((s) => s.previewReady);
  const device = useProjectStore((s) => s.previewDevice);
  const setDevice = useProjectStore((s) => s.setPreviewDevice);
  const consoleOpen = useProjectStore((s) => s.previewConsole);
  const setConsole = useProjectStore((s) => s.setPreviewConsole);
  const errors = useProjectStore((s) => s.previewErrors);

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip
        label="หน้าตาเหมือนของจริง แต่ปุ่มที่บันทึกหรือดึงข้อมูลยังไม่ทำงาน ต้องเผยแพร่ก่อนแล้วเปิดจากลิงก์ของแอป"
        placement="bottom"
      >
        <span className="badge cursor-help">พรีวิวจำลอง</span>
      </Tooltip>
      {ready && (
        <>
          <div className="seg" role="group" aria-label="ขนาดจอ">
            <Tooltip label="จอคอมพิวเตอร์" placement="bottom">
              <button
                type="button"
                onClick={() => setDevice("desktop")}
                aria-label="จอคอมพิวเตอร์"
                aria-pressed={device === "desktop"}
                className="seg-item h-6 px-2"
              >
                <ComputerDesktopIcon className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label="จอมือถือ" placement="bottom">
              <button
                type="button"
                onClick={() => setDevice("mobile")}
                aria-label="จอมือถือ"
                aria-pressed={device === "mobile"}
                className="seg-item h-6 px-2"
              >
                <DevicePhoneMobileIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
          <Tooltip label="ข้อความและ error จากหน้าพรีวิว" placement="bottom">
            <button type="button" onClick={() => setConsole(!consoleOpen)} aria-pressed={consoleOpen} className="btn btn-ghost btn-sm">
              <CommandLineIcon className="h-4 w-4" />
              Console
              {errors > 0 && <span className="rounded-full bg-danger-soft px-1.5 text-xs font-semibold text-danger">{errors}</span>}
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );
}

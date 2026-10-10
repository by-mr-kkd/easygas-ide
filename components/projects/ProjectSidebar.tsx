"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownTrayIcon, FolderOpenIcon, GlobeAltIcon, MagnifyingGlassIcon, TableCellsIcon, TrashIcon } from "@heroicons/react/24/outline";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import type { EgsProject } from "@/types/db";

const KIND_LABEL: Record<string, string> = { webapp: "เว็บแอป", bound: "ผูก Sheet" };
/** a search box appears once the list is longer than this */
const SEARCH_FROM = 5;

function Row({ project, deployed, onDelete }: { project: EgsProject; deployed: boolean; onDelete: () => void }) {
  const KindIcon = project.kind === "bound" ? TableCellsIcon : GlobeAltIcon;
  return (
    <li className="group relative">
      <Link
        href={`/projects/${project.id}`}
        className="flex items-center gap-2.5 rounded-lg py-1.5 pl-2 pr-10 transition hover:bg-line/60 focus-visible:bg-line/60 md:pr-2 md:group-hover:pr-10 md:group-focus-within:pr-10"
      >
        <span className={`icon-chip shrink-0 ${deployed ? "tone-accent" : "tone-info"}`}>
          <KindIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-snug text-fg">{project.name}</span>
          <span className="flex items-center gap-1.5 text-[11.5px] leading-snug text-muted">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${deployed ? "bg-accent" : "bg-line-strong"}`} aria-hidden />
            <span className="truncate">
              {deployed ? "เผยแพร่แล้ว" : "ยังไม่เผยแพร่"} · {project.origin === "imported" ? "จาก Google" : project.origin === "cloned" ? "โคลนจากลิงก์" : (KIND_LABEL[project.kind] ?? project.kind)} ·{" "}
              {new Date(project.updated_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
            </span>
          </span>
        </span>
      </Link>
      {/* shown on hover / keyboard on a wide window; always on a touch-sized one */}
      <button
        type="button"
        onClick={onDelete}
        title="ลบโปรเจกต์"
        aria-label={`ลบโปรเจกต์ ${project.name}`}
        className="btn btn-ghost btn-sm btn-icon absolute right-1 top-1/2 -translate-y-1/2 hover:bg-danger-soft hover:text-danger md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

/**
 * The project panel of the home screen: every project in this app, newest first, one click to open. On a
 * wide window it is the left panel of the app shell (full height, its own scrollbar); on a phone the same
 * list comes under the work box as a card.
 */
export function ProjectSidebar({
  projects,
  deployed,
  googleConnected,
}: {
  projects: EgsProject[];
  deployed: Record<string, string | undefined>;
  googleConnected: boolean;
}) {
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<EgsProject | null>(null);
  const deployedCount = projects.filter((p) => deployed[p.id]).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  return (
    <aside
      aria-labelledby="projects-title"
      data-tour="projects"
      className="card mx-4 mb-5 flex flex-col overflow-hidden md:m-0 md:min-h-0 md:w-[260px] md:shrink-0 md:rounded-none md:border-0 md:border-r md:bg-panel"
    >
      <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-3">
        <FolderOpenIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <h2 id="projects-title" className="text-[12.5px] font-semibold text-muted">
          โปรเจกต์ของฉัน
        </h2>
        {projects.length > 0 && <span className="count ml-auto">{projects.length}</span>}
      </div>

      {projects.length >= SEARCH_FROM && (
        <label className="relative block px-2.5 pb-1.5">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาโปรเจกต์"
            aria-label="ค้นหาโปรเจกต์"
            className="field h-8 w-full pl-8 text-[13px]"
          />
        </label>
      )}

      {projects.length === 0 ? (
        <p className="hint px-4 py-5">
          ยังไม่มีโปรเจกต์ สร้างอันแรกจากช่อง <b>อยากได้ระบบอะไร?</b> ทุกอย่างที่สร้างจะมาอยู่ที่นี่ กดเปิดแก้ต่อได้ตลอด
        </p>
      ) : shown.length === 0 ? (
        <p className="hint px-4 py-5 text-center">ไม่มีโปรเจกต์ที่ตรงกับ “{query.trim()}”</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
          {shown.map((p) => (
            <Row key={p.id} project={p} deployed={!!deployed[p.id]} onDelete={() => setDeleting(p)} />
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2.5 text-[12px]">
        {deployedCount > 0 && (
          <span className="flex items-center gap-1.5 text-muted">
            เผยแพร่แล้ว <span className="count">{deployedCount}</span>
          </span>
        )}
        {googleConnected && (
          <Link href="/projects?mode=existing" className="link ml-auto flex items-center gap-1 no-underline">
            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            สคริปต์ในบัญชี Google
          </Link>
        )}
      </div>

      {deleting && <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />}
    </aside>
  );
}

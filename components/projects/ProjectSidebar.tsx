"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownTrayIcon, FolderOpenIcon, GlobeAltIcon, MagnifyingGlassIcon, TableCellsIcon, TrashIcon } from "@heroicons/react/24/outline";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import type { EgsProject } from "@/types/db";

const KIND_LABEL: Record<string, string> = { webapp: "เว็บแอป", bound: "ผูก Sheet" };
/** a search box appears once the list is longer than this */
const SEARCH_FROM = 6;

function Row({ project, deployed, onDelete }: { project: EgsProject; deployed: boolean; onDelete: () => void }) {
  const KindIcon = project.kind === "bound" ? TableCellsIcon : GlobeAltIcon;
  return (
    <li className="group relative">
      <Link
        href={`/projects/${project.id}`}
        className="flex items-start gap-2.5 rounded-lg py-2 pl-2.5 pr-11 transition hover:bg-sunken focus-visible:bg-sunken lg:pr-2.5 lg:group-hover:pr-11 lg:group-focus-within:pr-11"
      >
        <span className={`icon-chip mt-px shrink-0 ${deployed ? "tone-accent" : "tone-info"}`}>
          <KindIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{project.name}</span>
          <span className="hint flex items-center gap-1.5">
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
        className="btn btn-ghost btn-sm btn-icon absolute right-1.5 top-1.5 hover:bg-danger-soft hover:text-danger lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

/**
 * The left column of the home screen: every project in this app, newest first, one click to open. It is
 * the same list on a phone, just under the composer instead of beside it.
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
    <aside aria-labelledby="projects-title" data-tour="projects" className="card flex flex-col overflow-hidden lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <FolderOpenIcon className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
        <h2 id="projects-title" className="text-sm font-semibold">
          โปรเจกต์ของฉัน
        </h2>
        {projects.length > 0 && <span className="badge ml-auto tabular-nums">{projects.length}</span>}
      </div>

      {projects.length >= SEARCH_FROM && (
        <label className="relative block border-b border-line px-3 py-2">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาโปรเจกต์"
            aria-label="ค้นหาโปรเจกต์"
            className="field h-8 w-full pl-8 text-sm"
          />
        </label>
      )}

      {projects.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <span className="icon-chip tone-info mx-auto mb-2 h-9 w-9">
            <FolderOpenIcon className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold">ยังไม่มีโปรเจกต์</p>
          <p className="hint mt-1">
            สร้างอันแรกจากช่อง <b>อยากได้ระบบอะไร?</b> ทุกอย่างที่สร้างจะมาอยู่ที่นี่ กดเปิดแก้ต่อได้ตลอด
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="hint px-4 py-6 text-center">ไม่มีโปรเจกต์ที่ตรงกับ “{query.trim()}”</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {shown.map((p) => (
            <Row key={p.id} project={p} deployed={!!deployed[p.id]} onDelete={() => setDeleting(p)} />
          ))}
        </ul>
      )}

      {(deployedCount > 0 || googleConnected) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
          {deployedCount > 0 && <span className="hint">เผยแพร่แล้ว {deployedCount}</span>}
          {googleConnected && (
            <Link href="/projects?mode=existing" className="link ml-auto flex items-center gap-1 text-[13px]">
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
              สคริปต์ในบัญชี Google
            </Link>
          )}
        </div>
      )}

      {deleting && <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />}
    </aside>
  );
}

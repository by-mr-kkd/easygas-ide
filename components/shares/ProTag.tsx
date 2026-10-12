/** The yellow mark on a share whose front page is on GitHub Pages: only EasyGAS Pro can clone it. */
export function ProTag({ className = "" }: { className?: string }) {
  return (
    <span title="โค้ดนี้วางหน้าเว็บบน GitHub โคลนได้เฉพาะผู้ใช้ EasyGAS Pro" className={`pro-badge ${className}`}>
      PRO
    </span>
  );
}

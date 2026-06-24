/** "Ver mais" das secções de produto (modo de secção única): revela mais linhas. */
let mounted = false;

export function mountSectionsUI(): void {
  if (mounted) return;
  mounted = true;
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-load-more]");
    if (!btn) return;
    e.preventDefault();
    const section = btn.closest("[data-section]");
    const grid = section?.querySelector("[data-section-grid]");
    if (!grid) return;
    const hidden = Array.from(grid.querySelectorAll<HTMLElement>("[data-extra]"))
      .filter((el) => el.style.display === "none");
    const step = parseInt(btn.dataset.step ?? "8", 10) || 8;
    hidden.slice(0, step).forEach((el) => { el.style.display = ""; });
    if (hidden.length <= step) btn.remove();
  });
}

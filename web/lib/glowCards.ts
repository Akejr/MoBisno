/**
 * Cartões com brilho que segue o rato — a linguagem visual das secções da
 * plataforma (`mobisno.store`).
 *
 * Estava dentro de `web/views/landing.ts` como `mountBento`, privado. Saiu para
 * aqui quando a segunda página precisou do mesmo efeito: a alternativa era
 * copiar o CSS e o `mousemove`, e duas folhas com o mesmo `id` fazem a segunda
 * ser ignorada em silêncio — o tipo de divergência que só se descobre a olhar
 * para o ecrã.
 *
 * A grelha `.mb-bento` e os modificadores `.bento-col-2` / `.bento-row-2` fazem
 * parte do mesmo desenho e vieram com ele.
 */

/** Injeta a folha de estilo dos cartões, uma vez. */
export function ensureGlowCardStyle(): void {
  if (document.getElementById("mb-bento-style")) return;
  const st = document.createElement("style");
  st.id = "mb-bento-style";
  st.textContent =
    ".mb-bento{display:grid;grid-template-columns:repeat(1,1fr);gap:1rem}" +
    "@media(min-width:768px){.mb-bento{grid-template-columns:repeat(3,1fr);grid-auto-rows:minmax(112px,auto)}}" +
    ".bento-item{position:relative;background:#f9fafb;border:1px solid #e9e9e9;border-radius:1rem;padding:1.25rem 1.35rem;overflow:hidden;transition:border-color .3s ease,box-shadow .3s ease}" +
    ".bento-item::before{content:'';position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity .3s ease;background:radial-gradient(450px circle at var(--mouse-x,50%) var(--mouse-y,50%),rgba(249,89,1,.12),transparent 42%);pointer-events:none;z-index:0}" +
    ".bento-item:hover{border-color:rgba(249,89,1,.45);box-shadow:0 16px 40px -18px rgba(249,89,1,.35)}" +
    ".bento-item:hover::before{opacity:1}" +
    ".bento-item>*{position:relative;z-index:1}" +
    "@media(min-width:768px){.bento-col-2{grid-column:span 2}.bento-row-2{grid-row:span 2}}" +
    // Entrada escalonada. `--i` é o índice do cartão, posto por quem monta.
    "@media(prefers-reduced-motion:no-preference){"
    + ".mb-rise{opacity:0;transform:translateY(14px);animation:mb-rise .55s cubic-bezier(.22,.61,.36,1) forwards;animation-delay:calc(var(--i,0)*45ms)}"
    + "@keyframes mb-rise{to{opacity:1;transform:none}}}";
  document.head.appendChild(st);
}

/**
 * Liga o brilho aos cartões dentro de `root` (ou em todo o documento).
 *
 * O efeito é de rato: em toque não há `mousemove`, e o cartão fica com o estado
 * de repouso — que é legível por si, não depende do brilho.
 */
export function mountGlowCards(root: ParentNode = document): void {
  ensureGlowCardStyle();
  root.querySelectorAll<HTMLElement>(".bento-item").forEach((item) => {
    if (item.dataset.glowOn === "1") return; // não duplicar ouvintes em re-render
    item.dataset.glowOn = "1";
    item.addEventListener("mousemove", (e) => {
      const r = item.getBoundingClientRect();
      item.style.setProperty("--mouse-x", `${(e as MouseEvent).clientX - r.left}px`);
      item.style.setProperty("--mouse-y", `${(e as MouseEvent).clientY - r.top}px`);
    });
  });
}

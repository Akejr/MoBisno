/**
 * Carrossel de testemunhos (modelo Lumière). Liga os pontos e as setas de
 * navegação de qualquer secção `[data-lx-testi]` presente no `root`. Funciona
 * tanto na loja publicada como na pré-visualização do editor.
 */

/** Ativa o(s) carrossel(éis) de testemunhos dentro de `root`. */
export function mountTestimonials(root: HTMLElement | Document = document): void {
  root.querySelectorAll<HTMLElement>("[data-lx-testi]").forEach((section) => {
    if (section.dataset.lxTestiMounted === "1") return;
    section.dataset.lxTestiMounted = "1";

    const slides = Array.from(section.querySelectorAll<HTMLElement>("[data-lx-slide]"));
    const dots = Array.from(section.querySelectorAll<HTMLElement>("[data-lx-dot]"));
    if (slides.length <= 1) return;

    let index = 0;
    const show = (i: number): void => {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle("hidden", k !== index));
      dots.forEach((d, k) => { d.style.background = k === index ? "#5e5e5b" : "#c8c6c2"; });
    };

    dots.forEach((d, k) => d.addEventListener("click", () => show(k)));
    section.querySelector<HTMLElement>("[data-lx-prev]")?.addEventListener("click", () => show(index - 1));
    section.querySelector<HTMLElement>("[data-lx-next]")?.addEventListener("click", () => show(index + 1));

    show(0);
  });
}

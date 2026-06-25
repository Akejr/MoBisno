/**
 * Mascote do assistente de IA (canto inferior direito do editor).
 *
 * Adaptado de um componente React "olhos que seguem o rato" para TS vanilla.
 * Por agora é apenas visual (ainda não responde) — as pupilas seguem o cursor
 * e a borda usa a cor da plataforma (#F95901). Montado dentro do contentor do
 * editor, por isso é removido automaticamente ao mudar de ecrã.
 */

const ACCENT = "#F95901";
const WIDGET_ID = "mb-ai-agent";

/** Cria um olho (branco, borda laranja) e devolve {eye, pupil}. */
function makeEye(): { eye: HTMLElement; pupil: HTMLElement } {
  const eye = document.createElement("div");
  eye.style.cssText = [
    "position:relative",
    "background:#fff",
    `border:3px solid ${ACCENT}`,
    "border-radius:9999px",
    "height:30px",
    "width:30px",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "box-shadow:0 1px 3px rgba(0,0,0,.15)",
  ].join(";");

  const pupil = document.createElement("div");
  pupil.style.cssText = [
    "position:absolute",
    "background:#1c1b1b",
    "border-radius:9999px",
    "height:11px",
    "width:11px",
    "transition:transform .05s linear",
  ].join(";");

  const glint = document.createElement("div");
  glint.style.cssText = "position:absolute;bottom:2px;right:2px;width:4px;height:4px;background:#fff;border-radius:9999px";
  pupil.appendChild(glint);
  eye.appendChild(pupil);
  return { eye, pupil };
}

/**
 * Monta o mascote no contentor indicado (ou no #app). Remove qualquer instância
 * anterior. Devolve uma função para o desmontar.
 */
export function mountAiAgent(host?: HTMLElement | null): () => void {
  document.getElementById(WIDGET_ID)?.remove();

  const root = host ?? document.getElementById("app") ?? document.body;

  const widget = document.createElement("div");
  widget.id = WIDGET_ID;
  widget.setAttribute("title", "Assistente IA (em breve)");
  widget.style.cssText = [
    "position:fixed",
    "right:20px",
    "bottom:20px",
    "z-index:80",
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:10px 12px",
    "background:#fff",
    "border:1px solid rgba(0,0,0,.08)",
    "border-radius:9999px",
    "box-shadow:0 8px 28px -8px rgba(0,0,0,.35)",
    "cursor:pointer",
    "user-select:none",
    "transition:transform .15s ease, box-shadow .15s ease",
  ].join(";");

  const eyesWrap = document.createElement("div");
  eyesWrap.style.cssText = "display:flex;gap:5px";
  const e1 = makeEye();
  const e2 = makeEye();
  eyesWrap.appendChild(e1.eye);
  eyesWrap.appendChild(e2.eye);
  widget.appendChild(eyesWrap);

  widget.addEventListener("mouseenter", () => { widget.style.transform = "translateY(-2px)"; widget.style.boxShadow = "0 12px 32px -8px rgba(249,89,1,.45)"; });
  widget.addEventListener("mouseleave", () => { widget.style.transform = "none"; widget.style.boxShadow = "0 8px 28px -8px rgba(0,0,0,.35)"; });

  root.appendChild(widget);

  const eyes = [e1, e2];
  function update(mx: number, my: number): void {
    for (const { eye, pupil } of eyes) {
      const rect = eye.getBoundingClientRect();
      if (!rect.width) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(my - cy, mx - cx);
      const maxMove = rect.width * 0.22;
      pupil.style.transform = `translate(${(Math.cos(angle) * maxMove).toFixed(1)}px, ${(Math.sin(angle) * maxMove).toFixed(1)}px)`;
    }
  }

  const onMove = (e: MouseEvent): void => update(e.clientX, e.clientY);
  document.addEventListener("mousemove", onMove);

  return () => {
    document.removeEventListener("mousemove", onMove);
    widget.remove();
  };
}

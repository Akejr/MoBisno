/**
 * Controlador do hero "Mosaico 3D" — porta vanilla do componente React
 * (framer-motion) para a loja publicada. Reproduz a mesma mecânica: sequência
 * de introdução (scatter → linha → círculo), morph círculo → arco por scroll
 * virtual, "shuffle" do arco, parallax do rato e flip 3D (CSS no hover).
 *
 * Inicializado a partir da view (a loja corre JS após o render); o `<script>`
 * dentro do template não executa, por isso a animação vive aqui.
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

interface CardState { x: number; y: number; rot: number; scale: number; opacity: number; }

const MAX_SCROLL = 3000;

function initOne(stage: HTMLElement, interactive: boolean): void {
  const cards = Array.from(stage.querySelectorAll<HTMLElement>(".mb-mc-card"));
  const text = stage.querySelector<HTMLElement>(".mb-mc-text");
  const N = cards.length;
  if (!N) return;

  let W = stage.clientWidth || stage.offsetWidth;
  let H = stage.clientHeight || stage.offsetHeight;
  const ro = new ResizeObserver(() => { W = stage.clientWidth; H = stage.clientHeight; });
  ro.observe(stage);

  // Posições espalhadas (início), iguais ao componente original.
  const scatter: CardState[] = cards.map(() => ({
    x: (Math.random() - 0.5) * 1500,
    y: (Math.random() - 0.5) * 1000,
    rot: (Math.random() - 0.5) * 180,
    scale: 0.6,
    opacity: 0,
  }));

  const cur: CardState[] = cards.map(() => ({ x: 0, y: 0, rot: 0, scale: 0.6, opacity: 0 }));

  let phase: "scatter" | "line" | "circle" = "scatter";
  const t1 = window.setTimeout(() => { phase = "line"; }, 500);
  const t2 = window.setTimeout(() => { phase = "circle"; }, 2500);

  // Scroll virtual + molas (valores suavizados).
  let vScroll = 0;
  let smMorph = 0, smRot = 0, smMouse = 0;
  let mouseTX = 0;
  let textOpacity = 0;

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    vScroll = clamp(vScroll + e.deltaY, 0, MAX_SCROLL);
  };
  let touchY = 0;
  const onTouchStart = (e: TouchEvent): void => { touchY = e.touches[0]!.clientY; };
  const onTouchMove = (e: TouchEvent): void => {
    const y = e.touches[0]!.clientY;
    vScroll = clamp(vScroll + (touchY - y), 0, MAX_SCROLL);
    touchY = y;
  };
  const onMouseMove = (e: MouseEvent): void => {
    const r = stage.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouseTX = nx * 100;
  };

  if (interactive) {
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("mousemove", onMouseMove);
  }

  let raf = 0;
  const PI = Math.PI;

  function cleanup(): void {
    cancelAnimationFrame(raf);
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    ro.disconnect();
    stage.removeEventListener("wheel", onWheel);
    stage.removeEventListener("touchstart", onTouchStart);
    stage.removeEventListener("touchmove", onTouchMove);
    stage.removeEventListener("mousemove", onMouseMove);
  }

  function frame(): void {
    if (!document.body.contains(stage)) { cleanup(); return; }

    // Modo não-interativo (editor): forma o arco automaticamente após o círculo.
    if (!interactive && phase === "circle") vScroll += (600 - vScroll) * 0.04;

    // Molas (aproximação por interpolação estável).
    smMorph += (clamp(vScroll / 600, 0, 1) - smMorph) * 0.08;
    smRot += (clamp((vScroll - 600) / (MAX_SCROLL - 600), 0, 1) - smRot) * 0.08;
    smMouse += (mouseTX - smMouse) * 0.1;
    textOpacity += ((phase === "circle" ? 1 : 0) - textOpacity) * 0.08;

    const isMobile = W < 768;
    const minDim = Math.min(W, H);
    const circleRadius = Math.min(minDim * 0.35, 350);
    const baseRadius = Math.min(W, H * 1.5);
    const arcRadius = baseRadius * (isMobile ? 1.4 : 1.1);
    const arcCenterY = H * (isMobile ? 0.35 : 0.25) + arcRadius - H / 2;
    const spread = isMobile ? 100 : 130;
    const startAngle = -90 - spread / 2;
    const stepAngle = N > 1 ? spread / (N - 1) : 0;
    const boundedRotation = -smRot * (spread * 0.8);

    for (let i = 0; i < N; i++) {
      let tg: CardState;
      if (phase === "scatter") {
        tg = scatter[i]!;
      } else if (phase === "line") {
        const sp = 70;
        const total = N * sp;
        tg = { x: i * sp - total / 2, y: 0, rot: 0, scale: 1, opacity: 1 };
      } else {
        const ca = (i / N) * 360;
        const cr = (ca * PI) / 180;
        const cpX = Math.cos(cr) * circleRadius;
        const cpY = Math.sin(cr) * circleRadius;
        const cpR = ca + 90;
        const aa = startAngle + i * stepAngle + boundedRotation;
        const ar = (aa * PI) / 180;
        const apX = Math.cos(ar) * arcRadius + smMouse;
        const apY = Math.sin(ar) * arcRadius + arcCenterY;
        const apR = aa + 90;
        const apS = isMobile ? 1.4 : 1.8;
        tg = {
          x: lerp(cpX, apX, smMorph),
          y: lerp(cpY, apY, smMorph),
          rot: lerp(cpR, apR, smMorph),
          scale: lerp(1, apS, smMorph),
          opacity: 1,
        };
      }
      const c = cur[i]!;
      c.x += (tg.x - c.x) * 0.12;
      c.y += (tg.y - c.y) * 0.12;
      c.rot += (tg.rot - c.rot) * 0.12;
      c.scale += (tg.scale - c.scale) * 0.12;
      c.opacity += (tg.opacity - c.opacity) * 0.15;
      const el = cards[i]!;
      el.style.transform = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px) rotate(${c.rot.toFixed(1)}deg) scale(${c.scale.toFixed(3)})`;
      el.style.opacity = c.opacity.toFixed(2);
    }

    if (text) {
      text.style.opacity = textOpacity.toFixed(2);
      text.style.transform = `translateY(${lerp(18, 0, textOpacity).toFixed(1)}px)`;
    }
    raf = requestAnimationFrame(frame);
  }

  // Estado inicial: começa espalhado e invisível.
  for (let i = 0; i < N; i++) {
    Object.assign(cur[i]!, scatter[i]!);
    cards[i]!.style.opacity = "0";
  }
  if (text) text.style.opacity = "0";
  raf = requestAnimationFrame(frame);
}

/** Inicializa todos os heros "Mosaico 3D" presentes em `root` (idempotente). */
export function mountMosaicoHeroes(root: ParentNode, opts: { interactive?: boolean } = {}): void {
  const interactive = opts.interactive ?? true;
  root.querySelectorAll<HTMLElement>("[data-mosaico-hero]").forEach((stage) => {
    if (stage.dataset.mosaicoInit === "1") return;
    stage.dataset.mosaicoInit = "1";
    initOne(stage, interactive);
  });
}

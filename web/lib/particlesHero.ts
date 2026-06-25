/**
 * Controlador do hero "Partículas (rede)" — porta vanilla de um fundo de
 * partículas em canvas que se ligam por linhas e reagem ao rato. Inicializado a
 * partir da view (a loja corre JS após o render). As partículas usam a cor da
 * marca (`--brand`). Escopado ao próprio canvas (não à janela).
 */

interface RGB { r: number; g: number; b: number; }

function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return { r: 124, g: 58, b: 237 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Lê a cor principal (`--brand`) começando no elemento e subindo na árvore. */
function readBrand(el: HTMLElement): string {
  let node: HTMLElement | null = el;
  while (node) {
    const v = getComputedStyle(node).getPropertyValue("--brand").trim();
    if (v) return v;
    node = node.parentElement;
  }
  return "#7c3aed";
}

interface P { x: number; y: number; dx: number; dy: number; size: number; }

function initCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;
  let particles: P[] = [];
  const mouse = { x: null as number | null, y: null as number | null, radius: 160 };

  const brandVar = readBrand(canvas);
  const { r, g, b } = hexToRgb(brandVar);

  function build(): void {
    particles = [];
    const count = Math.min(Math.floor((w * h) / 5000), 280);
    for (let i = 0; i < count; i++) {
      const size = Math.random() * 2 + 1;
      particles.push({
        x: Math.random() * (w - size * 4) + size * 2,
        y: Math.random() * (h - size * 4) + size * 2,
        dx: Math.random() * 0.4 - 0.2,
        dy: Math.random() * 0.4 - 0.2,
        size,
      });
    }
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const onMove = (e: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouse.x = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height ? x : null;
    mouse.y = mouse.x === null ? null : y;
  };
  const onOut = (): void => { mouse.x = null; mouse.y = null; };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseout", onOut);

  let raf = 0;

  function connect(): void {
    const maxDist = (w / 7) * (h / 7);
    for (let a = 0; a < particles.length; a++) {
      for (let bb = a + 1; bb < particles.length; bb++) {
        const pa = particles[a]!, pb = particles[bb]!;
        const dist = (pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2;
        if (dist >= maxDist) continue;
        const opacity = 1 - dist / 20000;
        let near = false;
        if (mouse.x !== null && mouse.y !== null) {
          const dm = Math.sqrt((pa.x - mouse.x) ** 2 + (pa.y - mouse.y) ** 2);
          near = dm < mouse.radius;
        }
        ctx!.strokeStyle = near
          ? `rgba(255,255,255,${opacity.toFixed(3)})`
          : `rgba(${r},${g},${b},${(opacity * 0.7).toFixed(3)})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(pa.x, pa.y);
        ctx!.lineTo(pb.x, pb.y);
        ctx!.stroke();
      }
    }
  }

  function frame(): void {
    if (!document.body.contains(canvas)) {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onOut);
      return;
    }
    ctx!.fillStyle = "#0a0a12";
    ctx!.fillRect(0, 0, w, h);
    for (const p of particles) {
      if (p.x > w || p.x < 0) p.dx = -p.dx;
      if (p.y > h || p.y < 0) p.dy = -p.dy;
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < mouse.radius + p.size && distance > 0) {
          const force = (mouse.radius - distance) / mouse.radius;
          p.x -= (dx / distance) * force * 5;
          p.y -= (dy / distance) * force * 5;
        }
      }
      p.x += p.dx;
      p.y += p.dy;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2, false);
      ctx!.fillStyle = `rgba(${r},${g},${b},0.85)`;
      ctx!.fill();
    }
    connect();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

/** Inicializa todos os heros "Partículas" presentes em `root` (idempotente). */
export function mountParticlesHeroes(root: ParentNode): void {
  root.querySelectorAll<HTMLCanvasElement>("[data-particles-hero]").forEach((canvas) => {
    if (canvas.dataset.particlesInit === "1") return;
    canvas.dataset.particlesInit = "1";
    initCanvas(canvas);
  });
}

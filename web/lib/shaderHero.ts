/**
 * Fundo animado em WebGL2 — nuvens de luz quente, à cor da plataforma.
 *
 * Porte para TypeScript vanilla de um componente React. O que aqui muda em
 * relação ao original, e porquê:
 *
 * - **Sem a maquinaria de ponteiro.** O original mantinha uma classe
 *   `PointerHandler` para alimentar `move`, `touch`, `pointerCount` e `pointers`.
 *   O sombreador que desenha estas nuvens **não declara nenhum desses
 *   uniformes** — `getUniformLocation` devolvia `null` e cada `uniform2f` era
 *   descartado em silêncio. Ficariam quatro ouvintes de eventos e uma classe a
 *   correr a cada frame para não fazer nada.
 * - **Mede o elemento, não a janela.** O original assumia ecrã inteiro
 *   (`window.innerWidth/Height`). Aqui o fundo é de uma secção, e a medida vem do
 *   `ResizeObserver` do contentor — senão numa secção de 60vh o desenho fica
 *   esticado.
 * - **Pára quando não está a ser visto.** Fora do ecrã, com o separador em
 *   segundo plano, ou depois de a vista ser substituída, o ciclo é interrompido.
 *   Um sombreador com cinco oitavas de ruído por pixel é caro: deixá-lo a correr
 *   invisível aquece o telemóvel e come bateria por nada.
 * - **Degrada em vez de rebentar.** Sem WebGL2 (telemóveis antigos, contexto
 *   recusado por falta de memória), fica um degradê CSS com as mesmas cores. Um
 *   retângulo preto no topo da página seria pior do que não ter efeito.
 * - **Respeita `prefers-reduced-motion`.** Desenha um frame e fica quieto.
 *
 * O sombreador é de Matthias Hurrle (@atzedent) e a atribuição fica no próprio
 * texto do sombreador, onde ele a escreveu.
 */

/** Vértices do quadrilátero que cobre o ecrã (dois triângulos em faixa). */
const VERTICES = new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]);

const VERTEX_SRC = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

/**
 * Sombreador de fragmento: nuvens de ruído fractal com filamentos de luz.
 *
 * Não mexer nas constantes sem ver o resultado — `.25/.137/.05` é a mistura que
 * dá o tom laranja da MôBisno em vez do azul-acinzentado do original.
 */
const FRAGMENT_SRC = `#version 300 es
/**********
made by Matthias Hurrle (@atzedent)
*/
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
/**
 * Tom das nuvens. É **o** ajuste de cor deste sombreador: o original trazia
 * (.25,.137,.05), um marrom escuro. Isto é o mesmo laranja mais claro e mais
 * saturado, para o fundo ler como cor da marca e não como sombra.
 *
 * Subir muito mais tira contraste ao texto branco por cima; a escuridão do centro
 * é compensada pelo degradê radial da vista.
 */
#define TINT vec3(.62,.34,.12)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float a=rnd(i),b=rnd(i+vec2(1,0)),c=rnd(i+vec2(0,1)),d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) {
    t+=a*noise(p);
    p*=2.*m;
    a*=.5;
  }
  return t;
}
float clouds(vec2 p) {
  float d=1., t=.0;
  for (float i=.0; i<3.; i++) {
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a);
    d=a;
    p*=2./(i+1.);
  }
  return t;
}
void main(void) {
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,bg*TINT,d);
  }
  O=vec4(col,1);
}`;

/** Degradê de reserva, nas cores do sombreador. Usado quando não há WebGL2. */
export const SHADER_FALLBACK_CSS =
  "radial-gradient(120% 90% at 50% 15%, rgba(255,150,60,.42), transparent 62%),"
  + "radial-gradient(85% 65% at 15% 85%, rgba(255,196,110,.24), transparent 72%),"
  + "#000";

/**
 * Limite da resolução de desenho.
 *
 * `devicePixelRatio` chega a 3 ou 4 num telemóvel; desenhar a essa densidade
 * multiplica por nove o custo de um sombreador que já é pesado. Metade da
 * densidade é indistinguível num fundo difuso como este, e é o que o original
 * também fazia.
 */
const MAX_SCALE = 1.5;

function drawScale(): number {
  return Math.min(MAX_SCALE, Math.max(1, 0.5 * (window.devicePixelRatio || 1)));
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("shaderHero: compilação falhou", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Monta o fundo animado dentro de `host` e devolve a função que o desmonta.
 *
 * O `host` tem de ser posicionado (`relative`/`absolute`): o `canvas` é colocado
 * em `position:absolute` a cobri-lo.
 */
export function mountShaderHero(host: HTMLElement | null): () => void {
  if (!host) return () => {};
  const root: HTMLElement = host;

  const fallback = (): (() => void) => {
    root.style.background = SHADER_FALLBACK_CSS;
    return () => { root.style.background = ""; };
  };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;background:#000";

  let gl: WebGL2RenderingContext | null = null;
  try {
    // `powerPreference: low-power` e sem `antialias`: é um fundo difuso, não há
    // arestas para suavizar, e num portátil isto evita acordar a placa dedicada.
    gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
  } catch {
    gl = null;
  }
  if (!gl) return fallback();

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = vs && fs ? gl.createProgram() : null;
  if (!vs || !fs || !program) return fallback();

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("shaderHero: ligação falhou", gl.getProgramInfoLog(program));
    return fallback();
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, VERTICES, gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "resolution");
  const uTime = gl.getUniformLocation(program, "time");

  root.appendChild(canvas);

  const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let frame = 0;
  let visible = true;
  let disposed = false;

  function resize(): void {
    if (!gl) return;
    const scale = drawScale();
    const w = Math.max(1, Math.round(root.clientWidth * scale));
    const h = Math.max(1, Math.round(root.clientHeight * scale));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    draw(performance.now());
  }

  function draw(now: number): void {
    if (!gl || !program) return;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (uResolution) gl.uniform2f(uResolution, canvas.width, canvas.height);
    if (uTime) gl.uniform1f(uTime, now * 1e-3);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function loop(now: number): void {
    // A vista pode ter sido substituída (navegação): sem isto o ciclo continuava
    // a desenhar num `canvas` que já não está na página.
    if (disposed || !canvas.isConnected) { stop(); return; }
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function start(): void {
    if (disposed || frame || reduceMotion) return;
    frame = requestAnimationFrame(loop);
  }

  function stop(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  const onVisibility = (): void => {
    if (document.hidden || !visible) stop();
    else start();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(root);
  if (!ro) window.addEventListener("resize", resize);

  // Fora do ecrã não se desenha. Numa página com o hero no topo, é o que impede o
  // sombreador de continuar a correr enquanto se lê o resto.
  const io = typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      onVisibility();
    }, { rootMargin: "80px" })
    : null;
  io?.observe(root);

  resize();
  if (reduceMotion) draw(0);
  else start();

  return () => {
    disposed = true;
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
    ro?.disconnect();
    io?.disconnect();
    if (!ro) window.removeEventListener("resize", resize);
    // Liberta o contexto de forma explícita: um `canvas` só desligado do DOM pode
    // ficar com o contexto vivo até o coletor passar, e o número de contextos
    // WebGL por página é limitado (o navegador descarta o mais antigo).
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  };
}

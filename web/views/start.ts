/**
 * `/start` — página de entrada para anúncios: **só o hero**, e mais nada.
 *
 * Não é uma segunda página inicial. É onde aterra quem clica num anúncio, e por
 * isso não tem barra de navegação, secções, rodapé nem assistente: cada coisa
 * dessas é uma saída, e uma página de anúncio tem um só caminho — o botão.
 *
 * Também não é indexada. O tráfego é pago e a mensagem repete a da homepage;
 * deixá-la indexada punha-a a competir com a home nos resultados de pesquisa.
 *
 * O fundo é o sombreador de `web/lib/shaderHero.ts`.
 */
import { render, $, esc } from "../lib/dom.js";
import { mountShaderHero } from "../lib/shaderHero.js";

/**
 * Conteúdo do hero. Um só sítio para mexer no texto de campanha.
 *
 * A descrição é curta de propósito: num anúncio, quem lê está de passagem. Diz o
 * que a pessoa não precisa de fazer (programar, alugar loja) e deixa a curiosidade
 * para o botão.
 */
const HERO = {
  badge: "MôBisno — a plataforma angolana de lojas online",
  line1: "Cria a tua loja",
  line2: "online em minutos",
  subtitle: "Sem código, sem complicações. Agora é fácil ter a própria loja online.",
  cta: { label: "Conhecer MôBisno", href: "/" },
};

/**
 * Animações de entrada.
 *
 * Ficam numa folha injetada, e não em classes utilitárias, porque são
 * `@keyframes` com atrasos escalonados — o Tailwind não os gera a partir do
 * `content` e uma classe inventada seria removida pelo purge. O `id` impede a
 * segunda montagem de acrescentar uma folha repetida.
 *
 * `prefers-reduced-motion`: tudo entra sem deslocação e sem atraso.
 */
function injectStyle(): void {
  if (document.getElementById("mb-start-style")) return;
  const st = document.createElement("style");
  st.id = "mb-start-style";
  st.textContent = `
    @keyframes mbStartDown{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:translateY(0)}}
    @keyframes mbStartUp{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:translateY(0)}}
    .mb-start-down{opacity:0;animation:mbStartDown .8s cubic-bezier(.16,1,.3,1) forwards}
    .mb-start-up{opacity:0;animation:mbStartUp .8s cubic-bezier(.16,1,.3,1) forwards}
    .mb-d1{animation-delay:.15s}.mb-d2{animation-delay:.3s}.mb-d3{animation-delay:.45s}.mb-d4{animation-delay:.6s}
    .mb-start-cta{
      background:rgba(249,89,1,.14);
      border:1px solid rgba(255,196,140,.45);
      color:#ffeada;
      transition:background .25s ease, border-color .25s ease, color .25s ease, transform .25s ease, box-shadow .25s ease;
    }
    .mb-start-cta:hover,.mb-start-cta:focus-visible{
      background:rgba(249,89,1,.3);
      border-color:rgba(255,214,170,.85);
      color:#fff;
      transform:translateY(-2px);
      box-shadow:0 16px 38px -16px rgba(249,89,1,.75);
    }
    .mb-start-cta:active{transform:translateY(0) scale(.98)}
    .mb-start-cta .material-symbols-outlined{transition:transform .25s ease}
    .mb-start-cta:hover .material-symbols-outlined{transform:translateX(4px)}
    @media(prefers-reduced-motion:reduce){
      .mb-start-down,.mb-start-up{animation:none;opacity:1;transform:none}
      .mb-start-cta,.mb-start-cta:hover,.mb-start-cta .material-symbols-outlined{transition:none;transform:none}
    }`;
  document.head.appendChild(st);
}

export function renderStart(): void {
  injectStyle();

  // Laranja claro nas duas linhas do título, do mais claro para o mais quente.
  const gradA = "background:linear-gradient(90deg,#ffe9c9,#ffd08a,#ffb25e);-webkit-background-clip:text;background-clip:text;color:transparent";
  const gradB = "background:linear-gradient(90deg,#ffd08a,#ffa94d,#ff8a3d);-webkit-background-clip:text;background-clip:text;color:transparent";

  render(`
  <!-- Ecra inteiro, sem cabecalho nem rodape: e uma pagina de anuncio. O
       contentor tem de ser posicionado, porque o canvas do sombreador cobre-o em
       absoluto. Sem acentos graves neste comentario: vive dentro de um template
       literal. -->
  <section id="hero-shader" class="relative isolate overflow-hidden bg-black font-sans text-white" style="min-height:100vh;min-height:100dvh">
    <!-- Escurece o centro para o texto se ler sobre as nuvens claras. -->
    <div class="absolute inset-0 z-[1] pointer-events-none" style="background:radial-gradient(74% 60% at 50% 46%, rgba(0,0,0,.74), rgba(0,0,0,.28) 62%, transparent 78%)"></div>

    <div class="relative z-[2] flex flex-col items-center justify-center text-center px-margin-mobile md:px-margin-desktop py-16" style="min-height:100vh;min-height:100dvh">
      <!-- Emblema, sem ligacao: diz de quem e a pagina e o que e, sem oferecer
           uma saida. O logotipo solto por cima do titulo competia com ele. -->
      <div class="mb-start-down inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm backdrop-blur-md" style="background:rgba(249,89,1,.14);border:1px solid rgba(255,196,140,.4)">
        <span aria-hidden="true">✨</span>
        <span style="color:#ffe3cc">${esc(HERO.badge)}</span>
      </div>

      <!-- drop-shadow e nao text-shadow: com background-clip:text o glifo e
           pintado pelo fundo recortado, e o filtro e o que separa as letras das
           nuvens de forma fiavel. Sem isto o titulo laranja claro sobre nuvens
           laranja perde contraste. -->
      <h1 class="mt-10 text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] max-w-5xl" style="filter:drop-shadow(0 6px 26px rgba(0,0,0,.6))">
        <span class="block mb-start-up mb-d1" style="${gradA}">${esc(HERO.line1)}</span>
        <span class="block mb-start-up mb-d2" style="${gradB}">${esc(HERO.line2)}</span>
      </h1>

      <p class="mt-6 max-w-xl text-lg sm:text-xl font-light leading-relaxed mb-start-up mb-d3" style="color:#fff6ef;text-shadow:0 2px 14px rgba(0,0,0,.6)">${esc(HERO.subtitle)}</p>

      <!-- O hover vive numa classe, nao em estilos inline: pseudo-classes nao se
           escrevem no atributo style. A seta desloca-se um pouco, que e o sinal
           de que o botao leva a algum lado. -->
      <div class="mt-10 mb-start-up mb-d4">
        <a href="${esc(HERO.cta.href)}" class="mb-start-cta inline-flex items-center justify-center gap-2 rounded-full px-9 py-4 text-base font-bold backdrop-blur-sm">
          ${esc(HERO.cta.label)} <span class="material-symbols-outlined text-[20px]">arrow_forward</span>
        </a>
      </div>
    </div>
  </section>`);

  mountShaderHero($("#hero-shader"));
}

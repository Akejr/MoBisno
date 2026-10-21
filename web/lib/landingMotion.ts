/**
 * Movimento da página inicial que depende do scroll: os blocos que entram ao
 * chegar ao ecrã e os números que contam.
 *
 * ## O HTML não depende disto
 *
 * O servidor envia a página no estado final, com tudo visível. Este módulo só
 * prepara o que ainda está **fora do ecrã** quando a página arranca (a classe
 * {@link ARMED}) e fá-lo entrar quando lá chega ({@link IN}). O que já está à
 * vista fica como está: esconder para voltar a mostrar era um piscar no
 * primeiro ecrã.
 *
 * Sem JavaScript, sem `IntersectionObserver` ou com «reduzir movimento», nada é
 * preparado e portanto nada é escondido. As regras de CSS que escondem vivem em
 * `LANDING_CSS` (`web/views/landingHtml.ts`) e exigem sempre a classe
 * {@link ARMED}; `tests/landingCopy.test.ts` confirma as duas metades.
 *
 * ## O que se anima
 *
 *  - `[data-motion]`: o bloco que se observa. Ao entrar no ecrã recebe
 *    {@link IN}, e o CSS anima os filhos `[data-reveal]`, `[data-pop]` e
 *    `[data-draw]`, cada um com o seu atraso (`--d`).
 *  - `[data-count]`: um número que conta de zero até ao valor que já está
 *    escrito. Acaba **sempre** no texto original, por isso o valor final é o que
 *    o servidor escreveu, ao carácter.
 */
import { kzWhole } from "../../src/services/seo.js";

/** Classe que prepara um bloco para entrar. É a única que permite esconder. */
export const ARMED = "mb-armed";
/** Classe que o faz entrar. */
export const IN = "mb-in";

/** Até onde, na altura do ecrã, um bloco conta como «já à vista». */
const VISIBLE_UNTIL = 0.9;
/** Duração da contagem dos números, em ms. */
const COUNT_MS = 1200;

/** O observador da página em vigor: cada visita à página inicial cria o seu. */
let observer: IntersectionObserver | null = null;

/** Prepara e liga o movimento dos blocos de `root`. Chamar depois de desenhar. */
export function mountLandingMotion(root: ParentNode = document): void {
  observer?.disconnect();
  observer = null;
  if (typeof IntersectionObserver !== "function") return;
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const altura = window.innerHeight || document.documentElement.clientHeight || 0;
  if (altura <= 0) return;

  const preparados: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>("[data-motion]").forEach((el) => {
    const caixa = el.getBoundingClientRect();
    // Já à vista: fica como o servidor o desenhou.
    if (caixa.bottom > 0 && caixa.top < altura * VISIBLE_UNTIL) return;
    el.classList.add(ARMED);
    el.querySelectorAll<HTMLElement>("[data-count]").forEach(prepararContagem);
    preparados.push(el);
  });
  if (!preparados.length) return;

  const obs = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      const el = entrada.target as HTMLElement;
      obs.unobserve(el);
      el.classList.add(IN);
      el.querySelectorAll<HTMLElement>("[data-count]").forEach(contar);
    }
  }, { rootMargin: `0px 0px -${Math.round((1 - VISIBLE_UNTIL) * 100)}% 0px`, threshold: 0 });
  preparados.forEach((el) => obs.observe(el));
  observer = obs;
}

/** O número como se escreve durante a contagem: percentagem ou Kwanzas inteiros. */
function formatar(valor: number, formato: string | undefined): string {
  const n = Math.round(valor);
  return formato === "kz" ? kzWhole(n) : `${n}%`;
}

/** Guarda o texto final e põe o número a zero, à espera de entrar no ecrã. */
function prepararContagem(el: HTMLElement): void {
  if (el.dataset.countFinal !== undefined) return;
  el.dataset.countFinal = el.textContent ?? "";
  el.textContent = formatar(0, el.dataset.countFormat);
}

/** Conta até ao valor e acaba no texto original. */
function contar(el: HTMLElement): void {
  const final = el.dataset.countFinal;
  if (final === undefined) return;
  const alvo = Number(el.dataset.count);
  if (!Number.isFinite(alvo) || alvo <= 0) {
    el.textContent = final;
    return;
  }
  const inicio = performance.now();
  const passo = (agora: number): void => {
    // A página mudou entretanto: o número já não está no ecrã.
    if (!el.isConnected) return;
    const t = Math.min(1, Math.max(0, (agora - inicio) / COUNT_MS));
    const suave = 1 - Math.pow(1 - t, 3);
    el.textContent = t >= 1 ? final : formatar(alvo * suave, el.dataset.countFormat);
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

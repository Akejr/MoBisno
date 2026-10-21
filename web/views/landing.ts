/**
 * Página inicial: desenha `landingHtml()`, liga o movimento e troca os botões
 * de quem tem sessão.
 *
 * O topo entra só com CSS (`LANDING_CSS`); as secções de baixo entram ao rolar,
 * por `mountLandingMotion` (`web/lib/landingMotion.ts`).
 */
import { mountSectionNav, consumePendingSection, scrollToSection } from "../templates/platformChrome.js";
import { render, renderedFromSsr, $ } from "../lib/dom.js";
import { currentOwnerId } from "../composition.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import { applyPlatformSeo } from "../lib/seo.js";
import { mountLandingMotion } from "../lib/landingMotion.js";
import { landingHtml, landingNavActions, landingHeroActions } from "./landingHtml.js";

/**
 * Desenha a página inicial.
 *
 * O HTML vem de `landingHtml()`, o mesmo que o servidor pré-renderiza, e é
 * desenhado **antes** de se saber se há sessão: o primeiro ecrã é o do servidor,
 * adotado tal como está, e quem tem sessão vê os botões trocados para «Abrir
 * Dashboard» assim que ela é lida.
 */
export async function renderLanding(): Promise<void> {
  render(landingHtml());
  const adotada = renderedFromSsr();

  mountTypewriter(adotada);
  // Antes do salto para uma secção pedida noutra página: a secção de destino
  // fica preparada e entra com movimento quando lá se chega.
  mountLandingMotion(document.getElementById("app") ?? document);
  mountSectionNav();
  // Chegámos aqui por um clique numa secção feito noutra página: o destino ficou
  // guardado e é agora que existe algo para onde rolar. `requestAnimationFrame`
  // dá um frame ao layout; sem isso a posição é calculada antes de as secções
  // terem altura, e a página fica a meio.
  const pending = consumePendingSection();
  if (pending) requestAnimationFrame(() => scrollToSection(pending));
  mountAiAgent(document.getElementById("app"), { screen: "site" });
  applyPlatformSeo();

  // Sessão: só troca os botões. Se a página entretanto mudou, não toca em nada.
  let loggedIn = false;
  try { loggedIn = (await currentOwnerId()) !== null; } catch { loggedIn = false; }
  if (!loggedIn) return;
  const navCta = $("#cta-nav");
  const heroActions = $("#hero-actions");
  if (!navCta || !heroActions) return;
  const navBox = navCta.parentElement;
  if (navBox) navBox.innerHTML = landingNavActions(true);
  heroActions.innerHTML = landingHeroActions(true);
}

/**
 * Milissegundos por carácter. A 130 ms a frase leva cerca de 1,3 s, que é o
 * ritmo a que se lê alguém a escrever.
 */
const TYPE_SPEED_MS = 130;

/**
 * Escreve `[data-typed]` letra a letra, como se estivesse a ser digitado.
 *
 * ## O texto verdadeiro está no HTML
 *
 * O elemento chega com o texto completo, e é essa a versão que o Google lê, que
 * um leitor de ecrã anuncia e que aparece se o JavaScript não correr. Esta função
 * guarda-o, esvazia o elemento e reescreve-o: é enriquecimento, nunca a fonte.
 *
 * ## Página vinda do servidor: só o cursor
 *
 * Quando a página foi adotada do HTML pré-renderizado (`adotada`), o texto já
 * esteve no ecrã. Apagá-lo para o voltar a escrever era o salto que a
 * pré-renderização existe para evitar: fica o texto e acrescenta-se só o cursor
 * a piscar. A escrita letra a letra continua nas navegações dentro da SPA.
 *
 * «em minutos» é o **último** elemento do título, por isso pode crescer com as
 * letras sem reposicionar mais nada.
 */
function mountTypewriter(adotada: boolean): void {
  if (!document.getElementById("mb-type-style")) {
    const st = document.createElement("style");
    st.id = "mb-type-style";
    // Cursor rectangular com piscar em degraus (`steps`): um cursor de texto
    // acende e apaga, não desvanece.
    st.textContent =
      ".mb-caret{display:inline-block;width:.5ch;height:.86em;vertical-align:-.06em;margin-left:.06em;background:currentColor}"
      + "@media(prefers-reduced-motion:no-preference){.mb-caret{animation:mb-blink 1s steps(1,end) infinite}"
      + "@keyframes mb-blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}}";
    document.head.appendChild(st);
  }

  const el = $("[data-typed]");
  if (!el) return;
  const full = el.textContent ?? "";
  if (!full) return;

  // Quem pediu menos movimento fica com o texto completo, sem cursor.
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const caret = document.createElement("span");
  caret.className = "mb-caret";
  caret.setAttribute("aria-hidden", "true");

  if (adotada) {
    el.appendChild(caret);
    return;
  }

  // `aria-label` mantém o nome acessível completo enquanto o conteúdo visível
  // está a ser construído; sem isso um leitor de ecrã leria texto a meio.
  el.setAttribute("aria-label", full);
  el.textContent = "";
  el.appendChild(caret);

  let i = 0;
  const step = (): void => {
    // A vista pode ter sido substituída a meio (navegação): sem isto o
    // temporizador continuava a escrever num nó que já não está na página.
    if (!el.isConnected) return;
    i += 1;
    caret.before(document.createTextNode(full.charAt(i - 1)));
    if (i < full.length) window.setTimeout(step, TYPE_SPEED_MS);
  };
  window.setTimeout(step, 320); // deixa o topo assentar antes de começar
}

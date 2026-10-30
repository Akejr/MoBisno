/**
 * Mascote do assistente de IA (canto inferior direito do editor).
 *
 * Adaptado de um componente React "olhos que seguem o rato" para TS vanilla.
 * Por agora é apenas visual (ainda não responde) — as pupilas seguem o cursor
 * e a borda usa a cor da plataforma (#F95901). Montado dentro do contentor do
 * editor, por isso é removido automaticamente ao mudar de ecrã.
 */

import { assistantContextFor, scopeFor, type AssistantScreen } from "./assistantContext.js";

const ACCENT = "#F95901";
const WIDGET_ID = "mb-ai-agent";
/** Folha de estilos do assistente (pontos a escrever e animações do painel). */
const STYLE_ID = "mb-ai-agent-style";

/**
 * Animações do painel, definidas **neste** módulo.
 *
 * O painel e o véu usavam `mbBubbleIn`, que só existia na folha de estilos do
 * assistente de criação (`web/views/wizard.ts`): em todos os outros ecrãs a
 * animação não existia e o painel aparecia de repente. `mbBubbleIn` tem aqui
 * exatamente a mesma definição que lá — com as duas folhas na página, ganha a
 * última, e o resultado é o mesmo. O véu só esmaece (`mbAiFadeIn`): deslocar e
 * encolher um véu de ecrã inteiro mostrava as margens da página a tremer.
 */
const PANEL_KEYFRAMES =
  "@keyframes mbBubbleIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}"
  + "@keyframes mbAiFadeIn{from{opacity:0}to{opacity:1}}";

/**
 * Desmontagem da instância montada agora. Há no máximo uma por página: montar
 * de novo desmonta a anterior **por inteiro** — o mascote, os ouvintes do
 * `document` e o temporizador do balão. Antes só o elemento era removido, e
 * cada ecrã visitado deixava mais um `mousemove`, um `keydown` e um
 * `setInterval` presos à página, que nunca saíam.
 */
let unmountCurrent: (() => void) | null = null;

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
 * Monta o mascote no contentor indicado (ou no #app). Desmonta qualquer
 * instância anterior. Devolve uma função para o desmontar.
 *
 * Também se desmonta sozinho quando o mascote sai da página (o ecrã seguinte
 * redesenhou o `#app` sem o montar): o primeiro movimento do rato, tecla ou
 * tique do balão a seguir retira os ouvintes e o temporizador.
 */
export function mountAiAgent(
  host?: HTMLElement | null,
  opts?: { scope?: "editor" | "site"; screen?: AssistantScreen; bottom?: number },
): () => void {
  unmountCurrent?.();
  // Um mascote deixado por outra cópia do módulo (recarregamento em
  // desenvolvimento) também sai.
  document.getElementById(WIDGET_ID)?.remove();
  // `screen` é a forma preferida: diz em que ecrã o utilizador está e traz a
  // orientação desse ecrã. O `scope` continua aceite para quem ainda não passa
  // `screen`, e é derivado dele quando ambos existem.
  const screen: AssistantScreen = opts?.screen ?? (opts?.scope === "site" ? "site" : "editor");
  const scope = opts?.scope ?? scopeFor(screen);
  // Distância ao fundo. O canto inferior direito costuma estar livre, mas no
  // assistente de criação vive lá o botão de enviar da conversa — sem desvio, o
  // mascote tapava-o.
  const bottom = opts?.bottom ?? 20;
  // Legenda do painel. Dizia sempre «sobre o editor», o que era falso em todos os
  // outros ecrãs onde o assistente passou a estar.
  const subtitle = screen === "editor"
    ? "Tira dúvidas sobre o editor"
    : scope === "site" ? "Tira dúvidas sobre o MôBisno" : "Tira dúvidas sobre a plataforma";

  const root = host ?? document.getElementById("app") ?? document.body;

  const widget = document.createElement("div");
  widget.id = WIDGET_ID;
  widget.setAttribute("title", "Assistente IA: tira dúvidas");
  widget.style.cssText = [
    "position:fixed",
    "right:20px",
    `bottom:${bottom}px`,
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

  // Balão de fala (aparece periodicamente).
  const bubble = document.createElement("div");
  bubble.style.cssText = [
    "position:absolute",
    "bottom:calc(100% + 12px)",
    "right:0",
    "max-width:230px",
    "background:#fff",
    "color:#1c1b1b",
    "font-size:13px",
    "line-height:1.4",
    "font-weight:500",
    "padding:10px 14px",
    "border-radius:14px",
    `border:1px solid ${ACCENT}`,
    "box-shadow:0 10px 30px -8px rgba(0,0,0,.3)",
    "white-space:normal",
    "opacity:0",
    "transform:translateY(6px) scale(.96)",
    "transform-origin:bottom right",
    "transition:opacity .25s ease, transform .25s ease",
    "pointer-events:none",
  ].join(";");
  bubble.textContent = "Se tiver alguma dúvida, só me perguntar 🙂";
  const tail = document.createElement("div");
  tail.style.cssText = `position:absolute;bottom:-6px;right:22px;width:11px;height:11px;background:#fff;border-right:1px solid ${ACCENT};border-bottom:1px solid ${ACCENT};transform:rotate(45deg)`;
  bubble.appendChild(tail);
  widget.appendChild(bubble);

  let hideTimer = 0;
  const showBubble = (): void => {
    if (!widget.isConnected) { unmount(); return; }
    bubble.style.opacity = "1";
    bubble.style.transform = "translateY(0) scale(1)";
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      bubble.style.opacity = "0";
      bubble.style.transform = "translateY(6px) scale(.96)";
    }, 15000); // fica visível 15s
  };
  // A cada 2 min mostra o balão.
  const bubbleInterval = window.setInterval(showBubble, 120000);

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

  const onMove = (e: MouseEvent): void => {
    if (!widget.isConnected) { unmount(); return; }
    update(e.clientX, e.clientY);
  };
  document.addEventListener("mousemove", onMove);

  // --------------------------- Chat de perguntas ---------------------------
  const ENDPOINT = "/api/assistant";
  const escHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  /** Mini-markdown para as respostas do bot: **negrito** (laranja), listas e parágrafos. */
  function renderMd(text: string): string {
    const inline = (s: string): string =>
      escHtml(s)
        .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${ACCENT};font-weight:700">$1</strong>`)
        .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
    const lines = text.replace(/\r/g, "").split("\n");
    let html = "";
    let inList = false;
    const closeList = (): void => { if (inList) { html += "</ul>"; inList = false; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { closeList(); continue; }
      const li = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
      if (li) {
        if (!inList) { html += `<ul style="margin:2px 0;padding-left:16px;list-style:disc;display:flex;flex-direction:column;gap:3px">`; inList = true; }
        html += `<li>${inline(li[1]!)}</li>`;
      } else {
        closeList();
        html += `<p style="margin:0 0 6px">${inline(line)}</p>`;
      }
    }
    closeList();
    return html || escHtml(text);
  }
  const chatHistory: { role: "user" | "assistant"; content: string }[] = [];
  let panel: HTMLElement | null = null;
  let backdrop: HTMLElement | null = null;
  /** `overflow` que o `body` tinha antes de a folha o bloquear. */
  let bodyOverflow = "";
  /** Posição da página quando a folha abriu, para a repor ao fechar. */
  let scrollAtOpen = 0;
  /** Desliga os ouvintes do `visualViewport` da folha aberta (ver `followViewport`). */
  let stopFollow: (() => void) | null = null;

  /**
   * Ecrã estreito — telemóvel na prática. Decidido no momento de abrir, e não por
   * media query, porque o painel é construído com estilos em linha.
   */
  const isNarrow = (): boolean =>
    typeof matchMedia === "function" ? matchMedia("(max-width: 640px)").matches : window.innerWidth <= 640;

  function closeChat(): void {
    // Só a folha do telemóvel bloqueia o scroll (e só ela tem véu). Repor o
    // `overflow` sem a folha aberta apagaria o de quem o tivesse posto depois —
    // e o desmonte chama isto sempre, a cada mudança de ecrã.
    const eraFolha = backdrop !== null;
    stopFollow?.();
    panel?.remove();
    panel = null;
    backdrop?.remove();
    backdrop = null;
    // Devolve o scroll à página e o mascote ao canto. O teclado pode ter
    // deslocado a página por baixo da folha: ela volta ao sítio onde estava.
    if (eraFolha) {
      document.body.style.overflow = bodyOverflow;
      if (Math.abs(window.scrollY - scrollAtOpen) > 2) window.scrollTo(0, scrollAtOpen);
    }
    widget.style.display = "";
  }

  /**
   * Mantém a folha do telemóvel em cima do teclado.
   *
   * No Safari do iPhone, abrir o teclado não encolhe a página: encolhe só a
   * parte que se vê, e desloca-a para o campo de escrita aparecer. A folha
   * estava presa ao fundo da página (`bottom:0`), por isso ficava por baixo do
   * teclado e fora do sítio: a conversa descia, o cabeçalho saía do ecrã, e via-se
   * a loja entre o campo e o teclado.
   *
   * Agora, a cada mudança da parte visível (`visualViewport`), a folha encosta o
   * fundo ao fundo dela, que é o cimo do teclado quando ele está aberto, e nunca
   * fica mais alta do que ela. É a técnica da conversa de criação de loja
   * (`fitToViewport` em `web/views/wizard.ts`). No Chrome de Android a página já
   * encolhe sozinha (`interactive-widget=resizes-content`), e isto dá o mesmo.
   */
  function followViewport(sheetEl: HTMLElement): void {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = (): boolean => {
      if (!sheetEl.isConnected) { stop(); return false; }
      const visible = Math.round(vv.height);
      const h = Math.max(240, Math.min(640, visible - 24));
      const layout = document.documentElement.clientHeight || window.innerHeight;
      sheetEl.style.top = `${Math.round(vv.offsetTop + visible - h)}px`;
      sheetEl.style.bottom = "auto";
      sheetEl.style.height = `${h}px`;
      sheetEl.style.maxHeight = "none";
      // Com o teclado aberto, a margem da barra do iPhone fica escondida por ele.
      sheetEl.style.paddingBottom = layout - visible > 120 ? "0px" : "env(safe-area-inset-bottom)";
      return true;
    };
    // O teclado abriu ou fechou: a última mensagem fica à vista.
    const onResize = (): void => { if (fit() && panel) scrollMsgs(); };
    const onScroll = (): void => { fit(); };
    function stop(): void {
      vv!.removeEventListener("resize", onResize);
      vv!.removeEventListener("scroll", onScroll);
      if (stopFollow === stop) stopFollow = null;
    }
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onScroll);
    stopFollow = stop;
    fit();
  }

  function msgsEl(): HTMLElement { return panel!.querySelector("[data-msgs]") as HTMLElement; }
  function scrollMsgs(): void { const m = msgsEl(); m.scrollTop = m.scrollHeight; }

  function addMsg(role: "user" | "assistant", text: string): void {
    const row = document.createElement("div");
    row.style.cssText = `display:flex;${role === "user" ? "justify-content:flex-end" : "justify-content:flex-start"}`;
    const bubble = role === "user"
      ? `<div style="max-width:82%;background:${ACCENT};color:#fff;border-radius:14px;border-bottom-right-radius:4px;padding:8px 12px;font-size:13.5px;line-height:1.45;white-space:pre-wrap">${escHtml(text)}</div>`
      : `<div style="max-width:82%;background:#fff;color:#1c1b1b;border:1px solid #eef0f2;border-radius:14px;border-bottom-left-radius:4px;padding:9px 13px;font-size:13.5px;line-height:1.5">${renderMd(text)}</div>`;
    row.innerHTML = bubble;
    msgsEl().appendChild(row);
    // Resposta do bot: mostra o INÍCIO da mensagem; do utilizador: vai ao fim.
    if (role === "assistant") msgsEl().scrollTop = Math.max(0, row.offsetTop - 8);
    else scrollMsgs();
  }

  function addTyping(): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-start";
    row.innerHTML = `<div style="background:#fff;border:1px solid #eef0f2;border-radius:14px;border-bottom-left-radius:4px;padding:10px 14px;display:flex;gap:4px">
      <span class="mb-ai-dot"></span><span class="mb-ai-dot" style="animation-delay:.15s"></span><span class="mb-ai-dot" style="animation-delay:.3s"></span></div>`;
    msgsEl().appendChild(row);
    scrollMsgs();
    return row;
  }

  async function send(): Promise<void> {
    const input = panel!.querySelector("[data-input]") as HTMLInputElement;
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    addMsg("user", q);
    const priorHistory = chatHistory.slice();
    chatHistory.push({ role: "user", content: q });
    const typing = addTyping();
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `context` traz os factos da plataforma (derivados de
        // `src/services/plans.ts`, nunca escritos à mão) e a orientação deste
        // ecrã. É o que impede o assistente de responder com informação velha.
        body: JSON.stringify({
          question: q,
          history: priorHistory,
          scope,
          context: assistantContextFor(screen),
        }),
      });
      typing.remove();
      if (!r.ok) { addMsg("assistant", "Não consegui responder agora. Tenta novamente daqui a pouco."); return; }
      const data = await r.json();
      const ans = (data && data.answer) ? String(data.answer) : "Sem resposta.";
      addMsg("assistant", ans);
      chatHistory.push({ role: "assistant", content: ans });
    } catch {
      typing.remove();
      addMsg("assistant", "Estou sem ligação de momento. Tenta novamente mais tarde.");
    }
  }

  function openChat(): void {
    if (panel) { closeChat(); return; }
    // `id` novo de propósito: uma folha com o nome antigo (sem as animações do
    // painel) que tivesse ficado na página não impede a nova de entrar.
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement("style");
      st.id = STYLE_ID;
      st.textContent = "@keyframes mbAiDot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}"
        + ".mb-ai-dot{width:6px;height:6px;border-radius:9999px;background:#9ca3af;display:inline-block;animation:mbAiDot 1.2s infinite}"
        // A folha inferior do telemóvel entra a subir, não a crescer de um canto.
        + "@keyframes mbSheetIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}"
        + PANEL_KEYFRAMES;
      document.head.appendChild(st);
    }
    panel = document.createElement("div");
    /**
     * No telemóvel o painel é uma **folha inferior** encostada às três margens,
     * não uma caixinha flutuante.
     *
     * A caixa de 340 px posicionada a 84 px do fundo dava, num ecrã de telemóvel,
     * uma janela minúscula sobre a página, e ao aparecer o teclado o resultado era
     * o que se viu: a página atrás a saltar e a vista a ficar torta. Encostada às
     * margens, a folha ocupa o espaço que existe e o teclado empurra-a de baixo,
     * que é o comportamento normal de uma conversa no telemóvel.
     *
     * `dvh` e não `vh`: `vh` no telemóvel conta a barra do navegador que se
     * esconde, e a folha ficava mais alta do que o ecrã.
     */
    const sheet = isNarrow();
    panel.style.cssText = sheet
      ? [
        "position:fixed", "left:0", "right:0", "bottom:0", "z-index:90",
        "width:100%", "height:min(86dvh,640px)", "max-height:calc(100dvh - 24px)",
        "display:flex", "flex-direction:column", "background:#fff",
        "border-top:1px solid rgba(0,0,0,.08)", "border-radius:20px 20px 0 0",
        "box-shadow:0 -12px 40px -12px rgba(0,0,0,.45)", "overflow:hidden",
        "animation:mbSheetIn .28s cubic-bezier(.16,1,.3,1) both",
        "padding-bottom:env(safe-area-inset-bottom)",
      ].join(";")
      : [
        "position:fixed", "right:20px", `bottom:${bottom + 64}px`, "z-index:90",
        "width:min(340px,calc(100vw - 32px))", `height:min(460px,calc(100vh - ${bottom + 120}px))`,
        "display:flex", "flex-direction:column", "background:#fff",
        "border:1px solid rgba(0,0,0,.08)", "border-radius:18px",
        "box-shadow:0 18px 50px -12px rgba(0,0,0,.4)", "overflow:hidden",
        "animation:mbBubbleIn .25s ease both",
      ].join(";");
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #f0f1f2">
        <div style="width:34px;height:34px;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#fff;background:${ACCENT}"><span class="material-symbols-outlined" style="font-size:20px">smart_toy</span></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;color:#111827;line-height:1.1">Assistente MôBisno</div>
          <div style="font-size:11px;color:#9ca3af">${subtitle}</div>
        </div>
        <!-- Alvo de toque maior no telemóvel: 30px é pequeno para um dedo. -->
        <button data-close type="button" aria-label="Fechar o assistente" style="flex:none;width:${sheet ? 40 : 30}px;height:${sheet ? 40 : 30}px;border-radius:9999px;border:none;background:#f3f4f6;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center"><span class="material-symbols-outlined" style="font-size:${sheet ? 22 : 18}px">close</span></button>
      </div>
      <div data-msgs style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f9fafb"></div>
      <form data-form style="display:flex;gap:8px;padding:10px;border-top:1px solid #f0f1f2;background:#fff">
        <!-- font-size 16px no telemóvel NÃO é estética: o Safari do iOS dá zoom
             automático a qualquer campo com letra menor do que 16px, e era isso
             que fazia a página inteira crescer ao tocar na caixa de escrever. -->
        <input data-input type="text" placeholder="Escreve a tua pergunta…" autocomplete="off" enterkeyhint="send" style="flex:1;min-width:0;border:1px solid #e5e7eb;border-radius:9999px;padding:10px 14px;outline:none;font-size:${sheet ? 16 : 14}px;color:#111827" />
        <button type="submit" style="flex:none;width:40px;height:40px;border-radius:9999px;border:none;color:#fff;background:${ACCENT};cursor:pointer;display:flex;align-items:center;justify-content:center"><span class="material-symbols-outlined" style="font-size:20px">arrow_upward</span></button>
      </form>`;
    if (sheet) {
      // Véu atrás da folha: escurece a página, fecha ao toque fora, e impede que
      // um toque a passar ao lado acerte num botão da página que está por baixo.
      backdrop = document.createElement("div");
      backdrop.style.cssText = "position:fixed;inset:0;z-index:89;background:rgba(0,0,0,.45);animation:mbAiFadeIn .2s ease both";
      backdrop.addEventListener("click", closeChat);
      root.appendChild(backdrop);
      // A página atrás deixa de rolar. Era isto que fazia a vista «fugir» quando o
      // teclado aparecia e o dedo arrastava sobre a conversa.
      bodyOverflow = document.body.style.overflow;
      scrollAtOpen = window.scrollY;
      document.body.style.overflow = "hidden";
      // O mascote fica debaixo da folha; escondê-lo evita os olhos a espreitar.
      widget.style.display = "none";
    }

    root.appendChild(panel);
    if (sheet) followViewport(panel);
    panel.querySelector("[data-close]")!.addEventListener("click", closeChat);
    panel.querySelector("[data-form]")!.addEventListener("submit", (e) => { e.preventDefault(); void send(); });
    // Repõe o histórico anterior (se houver) ou mostra a saudação.
    if (!chatHistory.length) {
      addMsg("assistant", scope === "site"
        ? "Olá! Sou o assistente do MôBisno. Aqui escolhes um modelo pronto de site (uma loja completa, já montada) e personalizas os textos, as fotografias e as cores. Pergunta-me o que quiseres: como começar a tua loja, os planos, ou o que dá (ou não) para fazer."
        : screen === "editor"
          ? "Olá! Pergunta-me o que quiseres sobre o editor. Por exemplo: \u201ccomo aumento o tamanho do logótipo?\u201d"
          : "Olá! Pergunta-me o que quiseres sobre este ecrã ou sobre a plataforma. Por exemplo: \u201cquantas lojas posso criar?\u201d");
    } else {
      for (const m of chatHistory) addMsg(m.role, m.content);
    }
    // Foco automático **só no computador**. No telemóvel, dar foco ao abrir puxa o
    // teclado de imediato, rouba metade do ecrã e desloca a página antes de a
    // pessoa ter lido a saudação. Ela toca na caixa quando quiser escrever.
    if (!sheet) (panel.querySelector("[data-input]") as HTMLInputElement).focus();
  }

  widget.addEventListener("click", openChat);

  // Escape fecha, como qualquer painel sobreposto.
  const onKey = (e: KeyboardEvent): void => {
    if (!widget.isConnected) { unmount(); return; }
    if (e.key === "Escape" && panel) closeChat();
  };
  document.addEventListener("keydown", onKey);

  let unmounted = false;
  /** Desmonta esta instância. Idempotente: chamar duas vezes não faz nada. */
  function unmount(): void {
    if (unmounted) return;
    unmounted = true;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("keydown", onKey);
    window.clearInterval(bubbleInterval);
    window.clearTimeout(hideTimer);
    closeChat();
    widget.remove();
    if (unmountCurrent === unmount) unmountCurrent = null;
  }
  unmountCurrent = unmount;
  return unmount;
}

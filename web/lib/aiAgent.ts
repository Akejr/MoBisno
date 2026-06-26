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
export function mountAiAgent(host?: HTMLElement | null, opts?: { scope?: "editor" | "site" }): () => void {
  document.getElementById(WIDGET_ID)?.remove();
  const scope = opts?.scope ?? "editor";

  const root = host ?? document.getElementById("app") ?? document.body;

  const widget = document.createElement("div");
  widget.id = WIDGET_ID;
  widget.setAttribute("title", "Assistente IA — tira dúvidas");
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

  const onMove = (e: MouseEvent): void => update(e.clientX, e.clientY);
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

  function closeChat(): void { panel?.remove(); panel = null; }

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
        body: JSON.stringify({ question: q, history: priorHistory, scope }),
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
    if (!document.getElementById("mb-ai-dot-style")) {
      const st = document.createElement("style");
      st.id = "mb-ai-dot-style";
      st.textContent = "@keyframes mbAiDot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}.mb-ai-dot{width:6px;height:6px;border-radius:9999px;background:#9ca3af;display:inline-block;animation:mbAiDot 1.2s infinite}";
      document.head.appendChild(st);
    }
    panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed", "right:20px", "bottom:84px", "z-index:90",
      "width:min(340px,calc(100vw - 32px))", "height:min(460px,calc(100vh - 140px))",
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
          <div style="font-size:11px;color:#9ca3af">Tira dúvidas sobre o editor</div>
        </div>
        <button data-close type="button" style="width:30px;height:30px;border-radius:9999px;border:none;background:#f3f4f6;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center"><span class="material-symbols-outlined" style="font-size:18px">close</span></button>
      </div>
      <div data-msgs style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f9fafb"></div>
      <form data-form style="display:flex;gap:8px;padding:10px;border-top:1px solid #f0f1f2;background:#fff">
        <input data-input type="text" placeholder="Escreve a tua pergunta…" autocomplete="off" style="flex:1;min-width:0;border:1px solid #e5e7eb;border-radius:9999px;padding:9px 14px;outline:none;font-size:14px;color:#111827" />
        <button type="submit" style="flex:none;width:40px;height:40px;border-radius:9999px;border:none;color:#fff;background:${ACCENT};cursor:pointer;display:flex;align-items:center;justify-content:center"><span class="material-symbols-outlined" style="font-size:20px">arrow_upward</span></button>
      </form>`;
    root.appendChild(panel);
    panel.querySelector("[data-close]")!.addEventListener("click", closeChat);
    panel.querySelector("[data-form]")!.addEventListener("submit", (e) => { e.preventDefault(); void send(); });
    // Repõe o histórico anterior (se houver) ou mostra a saudação.
    if (!chatHistory.length) {
      addMsg("assistant", scope === "site"
        ? "Olá! Sou o assistente do MôBisno. Pergunta-me o que quiseres — o que é a plataforma, o que dá (ou não) para fazer, planos e como começar a tua loja."
        : "Olá! Pergunta-me o que quiseres sobre o editor — por exemplo: \u201ccomo aumento o tamanho do logótipo?\u201d");
    } else {
      for (const m of chatHistory) addMsg(m.role, m.content);
    }
    (panel.querySelector("[data-input]") as HTMLInputElement).focus();
  }

  widget.addEventListener("click", openChat);

  return () => {
    document.removeEventListener("mousemove", onMove);
    window.clearInterval(bubbleInterval);
    window.clearTimeout(hideTimer);
    closeChat();
    widget.remove();
  };
}

/**
 * Envio de email pelo **Resend** — e os dois avisos que a Plataforma manda
 * quando uma venda digital é paga.
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * ## Quem recebe o quê
 *
 * - **O Dono**: «Recebeu uma venda» — o valor, a comissão da MôBisno, o que fica
 *   disponível para levantar, o que foi comprado e quem comprou. É o aviso que
 *   faltava: até agora, uma venda por Referência paga de madrugada só era
 *   descoberta quando o Dono abrisse o painel.
 * - **O comprador**: «A sua compra» com o resumo e a **ligação da factura**
 *   emitida pela empresa da loja (quando já existe).
 *
 * ## Regras
 *
 * - Enviar email **nunca** pode fazer falhar uma venda. Todas as funções
 *   devolvem `true`/`false` e nunca lançam; quem chama ignora o resultado.
 * - Sem `RESEND_API_KEY` não há envio e fica um aviso no registo — a venda
 *   segue.
 * - O conteúdo é escapado: o nome de um produto ou de um comprador entra no
 *   HTML do email.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** Remetente verificado no Resend. */
const FROM = process.env.RESEND_FROM || "MôBisno <vendas@mobisno.store>";

/** Timeout do envio, em ms. */
const TIMEOUT_MS = 10_000;

/** Escapa texto para HTML. */
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Email com forma mínima de email. */
function isEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** «12.500,00 Kz» — o mesmo formato do resto da Plataforma. */
function kz(valor) {
  const n = Number(valor);
  const seguro = Number.isFinite(n) ? n : 0;
  return `${seguro.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
}

/** O Resend está configurado? */
export function resendConfigured() {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Envia um email. Devolve `true` se o Resend o aceitou.
 *
 * Nunca lança: um erro de email não pode interromper a confirmação de uma venda.
 */
export async function sendEmail({ to, subject, html, replyTo }) {
  if (!resendConfigured()) {
    console.warn("[resend] RESEND_API_KEY não configurada: email não enviado");
    return false;
  }
  if (!isEmail(to)) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [String(to).trim()],
        subject,
        html,
        ...(isEmail(replyTo) ? { reply_to: String(replyTo).trim() } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      console.error("[resend]", r.status, detalhe.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[resend]", e);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------- Modelos ------------------------------- */

const ACENTO = "#F95901";

/** Moldura comum dos emails: largura fixa, sem imagens, legível em qualquer cliente. */
function moldura({ titulo, corpo, rodape }) {
  return `<!doctype html><html lang="pt"><body style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb" cellpadding="0" cellspacing="0">
      <tr><td style="padding:20px 24px;border-bottom:1px solid #f3f4f6">
        <span style="font-size:18px;font-weight:800;color:${ACENTO}">MôBisno</span>
      </td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${titulo}</h1>
        ${corpo}
      </td></tr>
      <tr><td style="padding:16px 24px;background:#fafafa;border-top:1px solid #f3f4f6;font-size:12px;color:#6b7280">
        ${rodape}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Tabela com as linhas da encomenda. */
function linhasHtml(items) {
  const linhas = (Array.isArray(items) ? items : [])
    .map((i) => {
      const q = Math.max(1, Math.round(Number(i?.productQuantity) || 1));
      const preco = Number(i?.productPrice) || 0;
      return `<tr>
        <td style="padding:6px 0;font-size:14px">${esc(i?.productName || "Artigo")} <span style="color:#6b7280">× ${q}</span></td>
        <td style="padding:6px 0;font-size:14px;text-align:right;white-space:nowrap">${esc(kz(preco * q))}</td>
      </tr>`;
    })
    .join("");
  return linhas ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>` : "";
}

/** Uma linha «etiqueta: valor». */
function campo(etiqueta, valor) {
  if (!valor) return "";
  return `<tr><td style="padding:3px 0;font-size:14px;color:#6b7280">${esc(etiqueta)}</td>
    <td style="padding:3px 0;font-size:14px;text-align:right">${esc(valor)}</td></tr>`;
}

/** Botão-ligação (usa tabela: os clientes de email ignoram muito CSS). */
function botao(href, rotulo) {
  return `<a href="${esc(href)}" style="display:inline-block;background:${ACENTO};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">${esc(rotulo)}</a>`;
}

/**
 * Aviso ao **Dono**: recebeu uma venda.
 *
 * Mostra o valor, a comissão e o líquido, porque é a primeira pergunta que o
 * Dono faz — e porque esconder a comissão num email de boas notícias é a melhor
 * forma de a tornar uma surpresa desagradável no levantamento.
 */
export function ownerSaleEmail({ storeName, orderId, total, fee, net, feeLabel, method, items, customer, invoiceUrl, panelUrl }) {
  const metodo = method === "mcx" ? "Multicaixa Express" : method === "reference" ? "Referência Bancária" : "Pagamento digital";
  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Acabou de receber um pagamento na loja <strong>${esc(storeName)}</strong>, por ${esc(metodo)}.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px">
      ${campo("Valor da venda", kz(total))}
      ${campo(`Comissão MôBisno (${feeLabel})`, `− ${kz(fee)}`)}
      <tr><td style="padding:10px 0 0;font-size:15px;font-weight:800;border-top:1px solid #f3f4f6">Fica disponível para levantar</td>
        <td style="padding:10px 0 0;font-size:15px;font-weight:800;text-align:right;border-top:1px solid #f3f4f6;color:${ACENTO}">${esc(kz(net))}</td></tr>
    </table>
    <h2 style="margin:20px 0 6px;font-size:15px">O que foi comprado</h2>
    ${linhasHtml(items)}
    <h2 style="margin:20px 0 6px;font-size:15px">Quem comprou</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${campo("Nome", customer?.name)}
      ${campo("Telemóvel", customer?.phone)}
      ${campo("Email", customer?.email)}
      ${campo("Morada", customer?.address)}
      ${campo("Área", customer?.area)}
    </table>
    <p style="margin:24px 0 0">${botao(panelUrl, "Ver no painel")}</p>
    ${invoiceUrl ? `<p style="margin:12px 0 0;font-size:14px"><a href="${esc(invoiceUrl)}" style="color:${ACENTO}">Ver a factura emitida</a></p>` : ""}`;
  return {
    subject: `Nova venda de ${kz(total)} em ${storeName}`,
    html: moldura({
      titulo: "Recebeu uma venda",
      corpo,
      rodape: `Encomenda ${esc(String(orderId).slice(0, 8))}. O dinheiro das vendas digitais é transferido para a conta da sua empresa a seu pedido, no separador «Pagamentos».`,
    }),
  };
}

/** Aviso ao **comprador**: a compra está paga, e aqui está a factura. */
export function buyerReceiptEmail({ storeName, orderId, total, items, invoiceUrl, storeUrl, replyTo }) {
  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Obrigado pela sua compra em <strong>${esc(storeName)}</strong>. O pagamento de <strong>${esc(kz(total))}</strong> foi confirmado.</p>
    <h2 style="margin:0 0 6px;font-size:15px">A sua encomenda</h2>
    ${linhasHtml(items)}
    ${invoiceUrl ? `<p style="margin:24px 0 0">${botao(invoiceUrl, "Ver a factura")}</p>` : ""}
    ${storeUrl ? `<p style="margin:12px 0 0;font-size:14px"><a href="${esc(storeUrl)}" style="color:${ACENTO}">Voltar à loja</a></p>` : ""}`;
  return {
    subject: `A sua compra em ${storeName}, ${kz(total)}`,
    html: moldura({
      titulo: "Pagamento confirmado",
      corpo,
      rodape: invoiceUrl
        ? `Encomenda ${esc(String(orderId).slice(0, 8))}. A factura é emitida por ${esc(storeName)}. Para falar sobre a encomenda, responda a este email.`
        : `Encomenda ${esc(String(orderId).slice(0, 8))}. A factura chega por email assim que for emitida. Para falar sobre a encomenda, responda a este email.`,
    }),
    replyTo,
  };
}

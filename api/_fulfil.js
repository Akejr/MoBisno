/**
 * O que acontece **depois** de uma venda digital ser paga: a factura da empresa
 * do Dono e os dois avisos por email.
 *
 * Ficheiro com prefixo `_` → o Vercel NÃO o trata como endpoint.
 *
 * ## A regra que manda aqui
 *
 * **Nada disto pode fazer falhar uma venda.** O cliente pagou; a factura e os
 * emails são obrigações nossas, não condições da entrega. Por isso tudo aqui é
 * «melhor esforço»: a função não lança, e o que falhar fica gravado na encomenda
 * (`invoice_status`, `invoice_error`) para ser tentado outra vez — o
 * «Já paguei — verificar» e a abertura do separador «Pagamentos» voltam a tentar.
 *
 * ## Quem emite a factura
 *
 * A **empresa verificada da loja**, com as credenciais Vero dela
 * (`store_payments.vero_org_id` / `vero_api_key`). Quem vende é o Dono; a
 * MôBisno só cobra a comissão. Uma loja sem credenciais fica com
 * `invoice_status = 'skipped'` e vende normalmente.
 */
import { veroEnsureCustomer, veroCreateInvoice, veroInvoiceStatus, veroUsable, veroPdfUrl } from "./_vero.js";
import { sendEmail, ownerSaleEmail, buyerReceiptEmail } from "./_resend.js";
import { PLATFORM_FEE_RATE } from "./_shared.js";
import { PLATFORM_APEX, STORE_APEX } from "./_seo.js";

/** A comissão por extenso, a partir da taxa — nunca escrita à mão. */
const FEE_LABEL = `${Number((PLATFORM_FEE_RATE * 100).toFixed(2))}%`;

/** Linhas da factura a partir das linhas da encomenda, mais entrega e desconto. */
export function invoiceLines(order) {
  const items = Array.isArray(order.products) ? order.products : [];
  const linhas = items.map((i) => ({
    description: String(i?.productName || "Artigo"),
    quantity: Math.max(1, Math.round(Number(i?.productQuantity) || 1)),
    unitPriceKz: Number(i?.productPrice) || 0,
  }));
  const entrega = Number(order.delivery_fee) || 0;
  if (entrega > 0) linhas.push({ description: "Entrega", quantity: 1, unitPriceKz: entrega });

  const desconto = Number(order.discount_amount) || 0;
  const total = Number(order.amount) || 0;
  // Com desconto, a soma das linhas não bate com o que o cliente pagou. O
  // documento fiscal tem de mostrar **o valor cobrado**, por isso nesse caso a
  // factura leva uma linha só com o total — é também o que o guia do Vero
  // recomenda quando há descontos proporcionais.
  if (desconto > 0 || !linhas.length) {
    return [{ description: `Compra em ${String(order.storeName || "loja")}`, quantity: 1, unitPriceKz: total }];
  }
  return linhas;
}

/**
 * Emite a factura de uma encomenda paga, se ainda não existir.
 *
 * @returns `{ status, invoiceUrl }` — o estado gravado na encomenda.
 */
async function emitirFactura(db, order, creds) {
  if (!veroUsable(creds)) {
    await db.from("orders").update({ invoice_status: "skipped", invoice_error: null }).eq("id", order.id);
    return { status: "skipped", invoiceUrl: null };
  }
  const cliente = order.customer && typeof order.customer === "object" ? order.customer : {};
  const nif = typeof cliente.nif === "string" && cliente.nif.trim() ? cliente.nif.trim() : null;

  const c = await veroEnsureCustomer(creds, { nif, name: cliente.name });
  if (!c.ok) {
    await db.from("orders").update({ invoice_status: "failed", invoice_error: c.code }).eq("id", order.id);
    return { status: "failed", invoiceUrl: null };
  }

  const inv = await veroCreateInvoice(creds, {
    customerId: c.id,
    consumidorFinal: c.consumidorFinal,
    // A referência da venda: uma retentativa devolve o mesmo documento em vez de
    // emitir um segundo documento fiscal da mesma venda.
    idempotencyKey: order.id,
    lines: invoiceLines(order),
  });
  if (!inv.ok) {
    await db.from("orders").update({ invoice_status: "failed", invoice_error: inv.code }).eq("id", order.id);
    return { status: "failed", invoiceUrl: null };
  }

  // `pending` até a AGT validar. Não há webhook para esse desfecho: é relido na
  // próxima passagem por aqui.
  const estado = inv.status === "validated" ? "validated" : inv.status === "rejected" ? "rejected" : "pending";
  await db.from("orders").update({
    invoice_id: inv.id,
    invoice_number: inv.number,
    invoice_status: estado,
    invoice_error: null,
    invoice_url: inv.pdfUrl,
    invoice_issued_at: new Date().toISOString(),
  }).eq("id", order.id);
  return { status: estado, invoiceUrl: inv.pdfUrl };
}

/** Relê o estado na AGT de uma factura que ficou `pending`. */
async function atualizarEstadoAgt(db, order, creds) {
  if (!veroUsable(creds) || !order.invoice_id) return;
  const r = await veroInvoiceStatus(creds, order.invoice_id);
  if (!r.ok) return;
  const estado = r.status === "validated" ? "validated" : r.status === "rejected" ? "rejected" : "pending";
  if (estado === order.invoice_status && !r.error) return;
  await db.from("orders").update({
    invoice_status: estado,
    invoice_number: r.number || order.invoice_number,
    invoice_error: r.error || null,
  }).eq("id", order.id);
}

/**
 * Trata uma encomenda que acabou de ser paga: factura + emails.
 *
 * Idempotente pelo estado da factura: chamada duas vezes, não emite dois
 * documentos (o `idempotencyKey` do Vero garante-o) e não manda o email ao Dono
 * outra vez (`notified_at`).
 *
 * Nunca lança.
 */
export async function fulfilPaidOrder(db, orderId) {
  try {
    const { data: order } = await db
      .from("orders")
      .select("id, store_id, method, status, amount, fee, net, delivery_fee, discount_amount, products, customer, invoice_id, invoice_number, invoice_status, invoice_url, notified_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || order.status !== "paid") return;

    const { data: store } = await db
      .from("stores").select("id, name, identifier, owner_id").eq("id", order.store_id).maybeSingle();
    if (!store) return;
    order.storeName = store.name;

    const [{ data: pay }, { data: prof }] = await Promise.all([
      db.from("store_payments").select("vero_org_id, vero_api_key, company_name").eq("store_id", store.id).maybeSingle(),
      db.from("profiles").select("email").eq("id", store.owner_id).maybeSingle(),
    ]);
    const creds = { orgId: pay?.vero_org_id || "", apiKey: pay?.vero_api_key || "" };

    /* ------------------------------ Factura ------------------------------ */
    let invoiceUrl = order.invoice_url || null;
    if (!order.invoice_id && order.invoice_status !== "skipped") {
      const r = await emitirFactura(db, order, creds);
      invoiceUrl = r.invoiceUrl || invoiceUrl;
    } else if (order.invoice_status === "failed") {
      const r = await emitirFactura(db, order, creds);
      invoiceUrl = r.invoiceUrl || invoiceUrl;
    } else if (order.invoice_status === "pending") {
      await atualizarEstadoAgt(db, order, creds);
      invoiceUrl = order.invoice_url || (order.invoice_id ? veroPdfUrl(order.invoice_id) : null);
    }

    /* ------------------------------- Emails ------------------------------- */
    // Só uma vez por encomenda: o aviso é de «recebeu uma venda», não de «a
    // factura mudou de estado».
    if (order.notified_at) return;
    const cliente = order.customer && typeof order.customer === "object" ? order.customer : {};
    const storeUrl = `https://${store.identifier}.${STORE_APEX}`;
    const panelUrl = `https://${PLATFORM_APEX}/painel/pagamentos`;

    const paraDono = ownerSaleEmail({
      storeName: store.name,
      orderId: order.id,
      total: Number(order.amount) || 0,
      fee: Number(order.fee) || 0,
      net: Number(order.net) || 0,
      feeLabel: FEE_LABEL,
      method: order.method,
      items: order.products,
      customer: cliente,
      invoiceUrl,
      panelUrl,
    });
    const enviados = [];
    if (prof?.email) {
      enviados.push(sendEmail({ to: prof.email, subject: paraDono.subject, html: paraDono.html, replyTo: cliente.email }));
    }
    if (cliente.email) {
      const paraComprador = buyerReceiptEmail({
        storeName: store.name,
        orderId: order.id,
        total: Number(order.amount) || 0,
        items: order.products,
        invoiceUrl,
        storeUrl,
        replyTo: prof?.email,
      });
      enviados.push(sendEmail({
        to: cliente.email, subject: paraComprador.subject, html: paraComprador.html, replyTo: paraComprador.replyTo,
      }));
    }
    if (enviados.length) await Promise.all(enviados);
    await db.from("orders").update({ notified_at: new Date().toISOString() }).eq("id", order.id);
  } catch (e) {
    // Um erro aqui não pode propagar-se para a confirmação da venda.
    console.error("fulfilPaidOrder", e);
  }
}

/**
 * POST /api/payment — inicia um pagamento digital (Multicaixa Express ou
 * Referência Bancária).
 *
 * Dois tipos:
 *  - `kind: "store"` — encomenda numa loja. Corpo:
 *      { kind, storeId, method, lines: [{ id, variantKey?, quantity }],
 *        customer?: { name, phone, nif, email, address, area },
 *        discountCode?, expectedTotal?, phone? }
 *    O montante é calculado no servidor (`api/_payments.js`). `expectedTotal` é o
 *    total que o comprador viu: se divergir do calculado, responde
 *    `409 PRICE_CHANGED` em vez de cobrar outro valor.
 *  - `kind: "plan"` — subscrição de uma loja. Corpo: { kind, storeId, method }.
 *    O montante é o do domínio (`PLAN_PRICE_KZ`), o Dono vem do token da sessão
 *    (`Authorization: Bearer <access_token>`) e o telemóvel vem do perfil dele:
 *    nenhum dos três se lê do corpo. `phone` só é aceite quando a conta ainda
 *    não tem número gravado, e é esse o caso que responde `PHONE_REQUIRED`.
 *
 * Sem fornecedor de pagamentos ligado (`api/_provider.js`) responde
 * `503 PAYMENTS_UNAVAILABLE` antes de tocar na base de dados.
 *
 * Resposta: { success, kind, id, method, status ("paid" | "open"), amount,
 *             reference?: { entity, number, dueDate }, invoiceUrl? }
 */
import { admin, readBody, send, missingEnvMessage, providerProducts, dbCause } from "./_shared.js";
import { getPaymentProvider, PAYMENTS_UNAVAILABLE } from "./_provider.js";
import { PLATFORM_APEX, platformOrigin, STORE_APEX } from "./_seo.js";
import {
  requestedLines, cleanCustomer, priceStoreOrder, createStoreOrder, saveProviderResult,
  markNotPaid, ownerFromRequest, createPlanPayment,
} from "./_payments.js";

/** Telemóvel angolano no formato 244XXXXXXXXX, ou `""` se não for um. */
function aoPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const n = digits.startsWith("244") ? digits : digits.length === 9 ? `244${digits}` : digits;
  return /^2449\d{8}$/.test(n) ? n : "";
}

/**
 * Os três endereços que a cobrança leva: onde o fornecedor avisa, e para onde o
 * cliente volta depois de pagar (ou de desistir).
 *
 * O `callback_url` leva o segredo (`?k=`): é a prova que autentica a notificação
 * (`api/_provider.js`), e viaja de servidor para servidor — nunca passa pelo
 * navegador de ninguém. Os de retorno levam o id do pagamento, para a página
 * saber o que verificar; **não é por aí que a venda é dada por paga**.
 *
 * O da subscrição leva também a loja (`&loja=`): o regresso recarrega a página,
 * e sem ela o painel abria na primeira loja do Dono, não na que ele pagou.
 */
function callbackUrls({ host, kind, id, returnBase, storeId }) {
  const plataforma = platformOrigin(host);
  const segredo = encodeURIComponent(process.env.WIPAY_WEBHOOK_SECRET || "");
  const daLoja = storeId ? `&loja=${encodeURIComponent(storeId)}` : "";
  const retorno = `${returnBase}?pagamento=${encodeURIComponent(id)}&tipo=${kind}${daLoja}`;
  return {
    callbackUrl: `${plataforma}/api/payment-webhook?k=${segredo}`,
    successUrl: retorno,
    failureUrl: `${retorno}&falhou=1`,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { success: false, error: "Método não permitido." });

  /*
   * O domínio deste pedido. **Nunca estava declarado**: `callbackUrls` e
   * `platformOrigin(host)` liam uma variável livre, e o `ReferenceError` caía no
   * `catch` do fim como um «Erro interno ao iniciar o pagamento» — ou seja,
   * nenhum pagamento jamais funcionou, e o 500 não dizia porquê.
   *
   * A mesma leitura de `api/prerender.js`, `api/robots.js` e `api/sitemap.js`.
   */
  const host = (req.headers?.host || PLATFORM_APEX).split(":")[0];

  const provider = getPaymentProvider();
  if (!provider) return send(res, 503, PAYMENTS_UNAVAILABLE);

  const db = admin();
  if (!db) return send(res, 500, { success: false, error: missingEnvMessage(), code: "SERVER_NOT_CONFIGURED" });

  const body = await readBody(req);
  const kind = body.kind === "plan" ? "plan" : "store";
  const method = body.method === "mcx" ? "mcx" : body.method === "reference" ? "reference" : null;
  if (!method) return send(res, 400, { success: false, error: "Método inválido.", code: "INVALID_METHOD" });

  /*
   * O telemóvel que o pedido traz. É exigido em **qualquer** pagamento digital,
   * e não só no Multicaixa Express: o fornecedor identifica o pagador por ele ao
   * criar a cobrança (`wizaCreateCharge` recusa sem ele), antes de o cliente
   * escolher o método.
   *
   * Numa encomenda vem do comprador, que não tem conta aqui. Na subscrição
   * **não vem**: o Dono já confirmou o número da conta para poder publicar, e
   * voltar a pedi-lo na janela de pagamento é pedir o que a plataforma já sabe.
   * No ramo do plano é lido do perfil, e o do corpo fica como recurso.
   */
  const phoneDoPedido = aoPhone(body.phone ?? body.customer?.phone);
  if (!phoneDoPedido && kind === "store") {
    return send(res, 400, { success: false, error: "Indique um número de telemóvel angolano válido (9 algarismos, a começar por 9).", code: "MISSING_PHONE" });
  }

  try {
    if (kind === "plan") {
      const ownerId = await ownerFromRequest(db, req);
      if (!ownerId) return send(res, 401, { success: false, error: "Inicie sessão para pagar a subscrição.", code: "UNAUTHENTICATED" });
      // A subscrição é de uma loja (migração 0025), e só o dono dela a paga.
      const storeId = String(body.storeId || "");
      if (!storeId) return send(res, 400, { success: false, error: "Escolha a loja a subscrever.", code: "MISSING_STORE" });
      const { data: loja } = await db.from("stores").select("id, name, owner_id").eq("id", storeId).maybeSingle();
      if (!loja || loja.owner_id !== ownerId) {
        return send(res, 404, { success: false, error: "Loja não encontrada.", code: "STORE_NOT_FOUND" });
      }
      /*
       * O telemóvel do Dono vem da conta dele: é o número que ele confirmou
       * para poder publicar (`api/phone-verify.js` grava-o em `profiles.phone`).
       * A Wiza exige um para criar a cobrança — não se pode simplesmente
       * largar. O que se larga é o campo: a janela do painel pedia outra vez o
       * que a plataforma já tinha, e deixava pagar com um número diferente do
       * da conta.
       *
       * O do corpo só serve de recurso: uma conta que já existia quando a
       * coluna nasceu (migração 0027) ficou confirmada sem número gravado. Sem
       * nenhum dos dois, `PHONE_REQUIRED` — e é só nesse caso que a janela
       * mostra o campo.
       */
      const { data: perfil } = await db.from("profiles").select("phone").eq("id", ownerId).maybeSingle();
      const phone = aoPhone(perfil?.phone) || phoneDoPedido;
      if (!phone) {
        return send(res, 400, {
          success: false, code: "PHONE_REQUIRED",
          error: "A sua conta não tem um telemóvel confirmado. Indique o número para continuar.",
        });
      }

      const payment = await createPlanPayment(db, ownerId, method, loja.id);
      // A causa vai na resposta: «não foi possível» sem ela é indistinguível de
      // uma migração que falta, e foi o que esteve a esconder uma coluna
      // inexistente enquanto nenhum pagamento funcionava.
      if (!payment.ok) {
        return send(res, 500, { success: false, error: `Não foi possível registar o pagamento: ${payment.cause}`, code: "PERSIST_FAILED" });
      }

      const urls = callbackUrls({
        host, kind, id: payment.id, returnBase: `${platformOrigin(host)}/painel/plano`, storeId: loja.id,
      });
      const descricao = `Subscrição da loja ${loja.name || "MôBisno"} (30 dias)`;
      const r = await provider.createPayment({
        method, amount: payment.amount, reference: payment.id,
        description: descricao, phone,
        items: [{ productName: descricao, productPrice: payment.amount, productQuantity: 1 }],
        payee: null, ...urls,
      });
      if (!r.ok) {
        await markNotPaid(db, "plan_payments", payment.id, "failed");
        return send(res, 502, { success: false, error: r.error || "Pagamento recusado.", code: r.code || "PAYMENT_FAILED" });
      }
      await saveProviderResult(db, "plan_payments", payment.id, r);
      return send(res, 200, {
        success: true, kind, id: payment.id, method, status: "open",
        amount: payment.amount, hostedUrl: r.hostedUrl ?? null,
        reference: r.referenceInfo ?? null, invoiceUrl: r.invoiceUrl ?? null,
      });
    }

    const storeId = String(body.storeId || "");
    const customer = cleanCustomer(body.customer);
    const priced = await priceStoreOrder(db, {
      storeId, lines: requestedLines(body.lines), area: customer.area, discountCode: body.discountCode,
    });
    if (!priced.ok) return send(res, priced.status, { success: false, error: priced.error, code: priced.code });

    const expected = Number(body.expectedTotal);
    if (body.expectedTotal !== undefined && (!Number.isFinite(expected) || Math.abs(expected - priced.total) > 0.5)) {
      return send(res, 409, {
        success: false, code: "PRICE_CHANGED", total: priced.total,
        error: "O total da encomenda mudou. Confirme o novo valor antes de pagar.",
      });
    }

    const criada = await createStoreOrder(db, priced, { method, customer });
    if (!criada.ok) {
      return send(res, 500, { success: false, error: `Não foi possível registar a encomenda: ${criada.cause}`, code: "PERSIST_FAILED" });
    }
    const orderId = criada.id;

    const items = [...priced.lines];
    if (priced.deliveryFee > 0) {
      items.push({ productName: `Entrega${customer.area ? `: ${customer.area}` : ""}`, productPrice: priced.deliveryFee, productQuantity: 1 });
    }
    // O cliente volta à própria loja: ao subdomínio dela em produção, ou ao
    // caminho `/loja/<id>` quando a loja é servida pelo domínio da Plataforma.
    const naPlataforma = String(host).toLowerCase().includes(PLATFORM_APEX);
    const returnBase = naPlataforma
      ? `${platformOrigin(host)}/loja/${encodeURIComponent(priced.store.identifier || "")}/checkout`
      : `https://${priced.store.identifier}.${STORE_APEX}/checkout`;
    const urls = callbackUrls({ host, kind, id: orderId, returnBase });

    const r = await provider.createPayment({
      method, amount: priced.total, reference: orderId,
      description: `Encomenda ${priced.store.name}`, phone: phoneDoPedido,
      customer: { name: customer.name, nif: customer.nif, phone: customer.phone, email: customer.email },
      items: providerProducts(items),
      payee: { iban: priced.payee.iban, beneficiaryName: priced.payee.beneficiary_name, bankName: priced.payee.bank_name },
      ...urls,
    });
    if (!r.ok) {
      await markNotPaid(db, "orders", orderId, "failed");
      return send(res, 502, { success: false, error: r.error || "Pagamento recusado.", code: r.code || "PAYMENT_FAILED" });
    }
    await saveProviderResult(db, "orders", orderId, r);
    // Nenhum pagamento está pago no momento em que é criado: o cliente ainda vai
    // pagar na página do fornecedor. Quem decide é `/api/payment-status`.
    return send(res, 200, {
      success: true, kind, id: orderId, method, status: "open",
      amount: priced.total, hostedUrl: r.hostedUrl ?? null,
      reference: r.referenceInfo ?? null, invoiceUrl: r.invoiceUrl ?? null,
    });
  } catch (e) {
    // Também aqui: a mensagem da excepção é o que distingue um `ReferenceError`
    // no nosso código de uma falha do fornecedor.
    console.error("payment", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return send(res, 500, { success: false, error: `Erro interno ao iniciar o pagamento: ${detalhe}`, code: "INTERNAL" });
  }
}

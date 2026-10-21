/**
 * Guardas das secções do Dashboard do Dono.
 *
 * O painel foi refeito: nove secções numa ordem pedida pelo Dono, «Criar
 * logótipo» fora, a taxa de entrega, os códigos de desconto e as avaliações com
 * separador próprio, as Configurações reduzidas ao que está «Em breve», um só
 * plano e a verificação de empresa para os pagamentos digitais. Estas asserções
 * protegem o que é fácil voltar a estragar sem que nada falhe:
 *
 *  - a lista das secções, a ordem e os rótulos (o assistente e a navegação de
 *    telemóvel dependem deles);
 *  - as Configurações sem campos, sem compras e sem preços, com o «Em breve» a
 *    vir de `COMING_SOON` e não de uma lista escrita à mão no painel;
 *  - o formulário da verificação a validar com `validateVerification`, que
 *    devolve todos os erros de uma vez;
 *  - o preço do Plano a sair de `PLAN_PRICE_KZ`, sem número escrito à mão.
 *
 * O HTML é desenhado a sério, com dados de exemplo: `web/views/dashboard/markup.ts`
 * é puro (dados → texto). Entra por `import()` com o especificador **numa
 * constante**, como em `tests/sectionDesign.test.ts`: com um import estático o
 * `tsc` seguia-o até `web/lib/dom.ts` e compilava-o num programa sem DOM,
 * partindo o `npm run build`. A forma do módulo é declarada aqui à mão pelo
 * mesmo motivo.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PLAN_HIGHLIGHTS, PLAN_NAME, PLAN_PERIOD_DAYS, PLAN_PRICE_KZ } from "../src/services/plans.js";
import { COMING_SOON, COMING_SOON_LABELS, type ComingSoonFeature } from "../src/services/comingSoon.js";
import { resolveBilling, type BillingState } from "../src/services/billing.js";
import { formatKz } from "../src/services/format.js";
import { PLATFORM_CONTACT_EMAIL } from "../src/services/domains.js";
import {
  COMPANY_DOCUMENTS, VERIFICATION_STATUS_LABEL, formatIban, validateVerification,
  type CompanyDocumentId, type VerificationForm, type VerificationStatus,
} from "../src/services/paymentVerification.js";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const DASHBOARD = ler("web/views/dashboard.ts");
const PASTA = "web/views/dashboard";
const MODULOS: Record<string, string> = Object.fromEntries(
  readdirSync(join(ROOT, PASTA)).filter((f) => f.endsWith(".ts")).map((f) => [f, ler(`${PASTA}/${f}`)]),
);
/** Todo o código do painel: a moldura e os separadores. */
const TODO = [DASHBOARD, ...Object.values(MODULOS)].join("\n");
/**
 * O mesmo, sem comentários. As guardas sobre o que o ecrã faz não podem
 * tropeçar na história contada nos comentários («saiu o interruptor da MoMenu»).
 */
const CODIGO = TODO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const mod = (f: string): string => {
  const t = MODULOS[f];
  expect(t, `${PASTA}/${f} não existe`).toBeDefined();
  return t!;
};

/* ---------------------- Forma do módulo, declarada à mão ---------------------- */

interface Verificacao {
  status: VerificationStatus;
  companyName: string;
  companyNif: string;
  bankName: string;
  beneficiaryName: string;
  iban: string;
  documents: Record<CompanyDocumentId, string | null>;
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}
interface Codigo {
  id: string; storeId: string; code: string; type: "percent" | "fixed"; value: number; active: boolean;
  uses: number; maxUses: number | null; expiresAt: string | null; createdAt: string;
}
interface Avaliacao {
  id: string; storeId: string; productId: string; author: string; rating: number; comment: string; approved: boolean; createdAt: string;
}
interface DocEstado { busy: boolean; error: string | null; fileName: string | null }
interface Entrega { mode?: "single" | "perArea"; flatFee?: number; fees?: Record<string, number>; freeAbove?: number }
interface Markup {
  CONFIG_SOON: readonly { feature: ComingSoonFeature; icon: string; title: string; text: string }[];
  configHtml(o: { smsCredits: number; customDomain?: string; metaPixelId?: string; gaId?: string }): string;
  deleteStoreHtml(storeName: string): string;
  PLAN_PRICE_TEXT: string;
  planHtml(o: { billing: BillingState; providerReady: boolean; storeName: string; identifier: string }): string;
  planActivationMailto(storeName: string, identifier: string): string;
  DOCUMENT_FORMATS_TEXT: string;
  verificationFormHtml(o: { draft: VerificationForm; status: VerificationStatus; docs: Record<CompanyDocumentId, DocEstado>; editing: boolean }): string;
  verificationErrorsHtml(errors: readonly { field: string; message: string }[]): string;
  verificationNoticeHtml(v: Verificacao, o: { providerReady: boolean; digitalVisible: boolean }): string;
  verificationSummaryHtml(v: Verificacao): string;
  verificationStatusPill(status: VerificationStatus): string;
  DISCOUNT_STATE: Record<"ativo" | "inativo" | "caducado" | "esgotado", { label: string; tone: string }>;
  discountListHtml(items: readonly { code: Codigo; state: "ativo" | "inativo" | "caducado" | "esgotado" }[]): string;
  discountFormHtml(minDate: string): string;
  reviewsHtml(items: readonly Avaliacao[], names: ReadonlyMap<string, string>): string;
  buildDelivery(d: { mode: "single" | "perArea"; flat: string; free: string; areas: readonly { area: string; on: boolean; fee: string }[] }):
    | { ok: true; value: Entrega }
    | { ok: false; errors: Partial<Record<"flat" | "free" | "areas", string>>; badAreas: string[] };
  deliveryEditorHtml(d: Entrega | undefined): string;
  whatsappCardHtml(phone: string): string;
}

let M: Markup;

beforeAll(async () => {
  // `location` mínimo antes de qualquer import de `web/` (como em sectionDesign).
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
  const especificador = "../web/views/dashboard/markup.js";
  M = (await import(especificador)) as Markup;
});

/* ------------------------------ Dados de exemplo ------------------------------ */

const DIA = 86_400_000;
const AGORA = Date.now();
const ativa = resolveBilling({ planExpiresAt: new Date(AGORA + 12 * DIA).toISOString() }, AGORA);
const inativa = resolveBilling({ planExpiresAt: null }, AGORA);
const caducada = resolveBilling({ planExpiresAt: new Date(AGORA - 3 * DIA).toISOString() }, AGORA);
const admin = resolveBilling({ planExpiresAt: null, isAdmin: true }, AGORA);

const docsVazios = (): Record<CompanyDocumentId, DocEstado> => ({
  matricula: { busy: false, error: null, fileName: null },
  certidao: { busy: false, error: null, fileName: null },
});
const formVazio = (): VerificationForm => ({
  companyName: "", companyNif: "", bankName: "", beneficiaryName: "", iban: "", documents: { matricula: null, certidao: null },
});
const verificacao = (status: VerificationStatus, extra: Partial<Verificacao> = {}): Verificacao => ({
  status, companyName: "Kitanda Lda", companyNif: "5417000000", bankName: "BAI", beneficiaryName: "Kitanda Lda",
  iban: "AO06004400006729503010102", documents: { matricula: "s/matricula-1.pdf", certidao: "s/certidao-1.pdf" },
  rejectionReason: null, submittedAt: "2026-05-01T10:00:00.000Z", reviewedAt: null, ...extra,
});

/** Os nove separadores, lidos da lista única da moldura. */
function seccoes(): { tab: string; href: string; label: string }[] {
  const i = DASHBOARD.indexOf("const DASH_SECTIONS");
  expect(i, "DASH_SECTIONS não encontrada em web/views/dashboard.ts").toBeGreaterThan(-1);
  const bloco = DASHBOARD.slice(i, DASHBOARD.indexOf("];", i));
  return [...bloco.matchAll(/\{ tab: "([a-z]+)", href: "([^"]+)", icon: "[a-z_0-9]+", label: "([^"]+)" \}/g)]
    .map((m) => ({ tab: m[1]!, href: m[2]!, label: m[3]! }));
}

/* ================================== Secções ================================== */

describe("Secções do painel — a lista, a ordem e os rótulos", () => {
  it("são nove, por esta ordem, com estes rótulos", () => {
    expect(seccoes().map((s) => s.label)).toEqual([
      "Início", "Produtos", "Taxa de entrega", "Código de desconto", "Avaliações",
      "Análises", "Pagamentos", "Plano", "Configurações",
    ]);
  });

  it("cada ligação é #/painel/<separador>, e o Início é #/painel", () => {
    for (const s of seccoes()) {
      expect(s.href, `ligação errada para ${s.label}`).toBe(s.tab === "inicio" ? "#/painel" : `#/painel/${s.tab}`);
    }
  });

  it("a barra lateral, os atalhos de telemóvel e o título leem a mesma lista", () => {
    expect(DASHBOARD).toContain("DASH_SECTIONS.map((s) => navItem(s.href, s.icon, s.label, tab === s.tab))");
    expect(DASHBOARD).toContain("DASH_SECTIONS.map((s) => navChip(s.href, s.icon, s.label, tab === s.tab))");
    expect(DASHBOARD).toContain("DASH_SECTIONS.find((s) => s.tab === tab)?.label");
  });

  it("cada separador tem quem o desenhe e um ecrã de assistente", () => {
    const render = DASHBOARD.slice(DASHBOARD.indexOf("const TAB_RENDER"), DASHBOARD.indexOf("function tabFromPath"));
    const ecras = DASHBOARD.slice(DASHBOARD.indexOf("const DASH_SCREEN"), DASHBOARD.indexOf("const TAB_RENDER"));
    for (const s of seccoes()) {
      expect(render, `sem render para ${s.tab}`).toMatch(new RegExp(`\\b${s.tab}: render[A-Z]`));
      expect(ecras, `sem ecrã de assistente para ${s.tab}`).toMatch(new RegExp(`\\b${s.tab}: "[a-z]+"`));
    }
  });

  it("um separador que já não existe cai no Início e corrige o endereço", () => {
    // O antigo `#/painel/logotipo` não pode abrir um painel sem secção realçada.
    const fn = DASHBOARD.slice(DASHBOARD.indexOf("function tabFromPath"), DASHBOARD.indexOf("/** Indicador de espera"));
    expect(fn).toContain('DASH_SECTIONS.some((s) => s.tab === pedido)');
    expect(fn).toContain('{ tab: "inicio", known: false }');
    expect(DASHBOARD).toContain('if (!known) history.replaceState(history.state, "", "/painel");');
  });

  it("«Criar logótipo» saiu, e com ele todo o código do gerador", () => {
    const labels = seccoes().map((s) => s.label);
    expect(labels).not.toContain("Criar logótipo");
    expect(seccoes().map((s) => s.tab)).not.toContain("logotipo");
    for (const proibido of ["logoApi", "logoCompose", "logoPurchase", "smsCheckout", "renderLogotipo", "LOGO_GENERATOR_VERSION", "generateLogos", "Meus logótipos"]) {
      expect(CODIGO, `ainda há rasto de ${proibido}`).not.toContain(proibido);
    }
  });

  it("os separadores novos vivem em ficheiros próprios", () => {
    for (const f of ["inicio.ts", "produtos.ts", "entregas.ts", "descontos.ts", "avaliacoes.ts", "analises.ts", "pagamentos.ts", "plano.ts", "config.ts"]) {
      expect(mod(f)).toMatch(/export async function render[A-Z][a-z]+\(ctx: DashCtx\): Promise<void>/);
    }
  });
});

/* =============================== Configurações =============================== */

describe("Configurações — três funcionalidades «Em breve», sem campos nem preços", () => {
  it("são exatamente Domínio próprio, Marketing e pixels e SMS de confirmação", () => {
    const html = M.configHtml({ smsCredits: 0 });
    const titulos = [...html.matchAll(/<h2 class="font-black text-gray-900">([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(titulos).toEqual(["Domínio próprio", "Marketing e pixels", "SMS de confirmação"]);
  });

  it("cada uma diz «Em breve» exatamente quando COMING_SOON a bloqueia", () => {
    const html = M.configHtml({ smsCredits: 0 });
    for (const c of M.CONFIG_SOON) {
      const bloco = html.slice(html.indexOf(`data-config="${c.feature}"`));
      const item = bloco.slice(0, bloco.indexOf("</li>"));
      expect(item.includes("Em breve"), `«Em breve» errado em ${c.title}`).toBe(COMING_SOON[c.feature]);
      // O leitor de ecrã ouve o nome completo da funcionalidade.
      if (COMING_SOON[c.feature]) expect(item).toContain(COMING_SOON_LABELS[c.feature]);
    }
    // As três funcionalidades do domínio estão todas lá, nem mais nem menos.
    expect(M.CONFIG_SOON.map((c) => c.feature).sort()).toEqual((Object.keys(COMING_SOON) as ComingSoonFeature[]).sort());
  });

  it("não tem campos, nem botões de compra, nem preços", () => {
    const html = M.configHtml({ smsCredits: 120, customDomain: "www.loja.co.ao", metaPixelId: "123", gaId: "G-1" });
    for (const proibido of ["<input", "<button", "<select", "Kz", "Comprar", "pacote"]) {
      expect(html, `as Configurações não podem ter ${proibido}`).not.toContain(proibido);
    }
  });

  it("o que já estava gravado aparece como guardado (Em breve desliga, não apaga)", () => {
    const html = M.configHtml({ smsCredits: 120, customDomain: "www.loja.co.ao", metaPixelId: "123", gaId: "G-1" });
    expect(html).toContain("Saldo guardado: 120 SMS");
    expect(html).toContain("Domínio guardado: www.loja.co.ao");
    expect(html).toContain("Meta Pixel 123");
  });

  it("o «Em breve» vem do domínio, não de uma constante escrita no painel", () => {
    expect(TODO).not.toMatch(/const COMING_SOON\s*=/);
    expect(mod("markup.ts")).toContain('from "../../../src/services/comingSoon.js"');
    expect(mod("markup.ts")).toContain("isComingSoon(c.feature)");
    // O separador só lê: não grava domínio, pixels nem SMS.
    expect(mod("config.ts")).not.toContain("saveCustomization");
  });

  it("a zona de perigo só apaga depois de escrito o nome da loja", () => {
    const html = M.deleteStoreHtml("Kitanda <Lda>");
    expect(html).toContain("Apagar a loja");
    expect(html).toMatch(/id="delete-store" disabled/);
    expect(html).toContain("Kitanda &lt;Lda&gt;");
    expect(mod("config.ts")).toContain("(confirmacao?.value.trim() ?? \"\") === store.name.trim()");
    expect(mod("config.ts")).toContain("deleteStore(ownerId, store.id)");
  });
});

/* ============================ Pagamentos digitais ============================ */

describe("Pagamentos digitais — verificação da empresa", () => {
  it("o envio valida com validateVerification e mostra todos os erros de uma vez", () => {
    const src = mod("pagamentos.ts");
    expect(src).toContain("const r = validateVerification(rascunho);");
    expect(src).toContain("for (const erro of r.errors) setFieldError(`vf-${erro.field}`, erro.message);");
    expect(src).toContain("verificationErrorsHtml(r.errors)");
    expect(src).toContain("submitPaymentVerification(store.id, r.value)");
    expect(src).toContain("uploadCompanyDocument(store.id, id, file)");
  });

  it("o resumo dos erros tem um botão por erro, com a frase do domínio", () => {
    const r = validateVerification(formVazio());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const html = M.verificationErrorsHtml(r.errors);
    expect(html).toContain(`Há ${r.errors.length} campos por corrigir:`);
    for (const e of r.errors) {
      expect(html).toContain(`data-focus="vf-${e.field}"`);
      expect(html).toContain(e.message);
    }
  });

  it("o formulário tem os campos pedidos, o IBAN formatado e os dois documentos", () => {
    const draft = { ...formVazio(), iban: "AO06004400006729503010102" };
    const html = M.verificationFormHtml({ draft, status: "none", docs: docsVazios(), editing: false });
    for (const rotulo of ["Nome da empresa", "NIF da empresa", "Banco", "Titular da conta", "IBAN", ...COMPANY_DOCUMENTS.map((d) => d.label)]) {
      expect(html, `rótulo ausente: ${rotulo}`).toContain(`>${rotulo}</label>`);
    }
    expect(html).toContain(`value="${formatIban(draft.iban)}"`);
    expect(M.DOCUMENT_FORMATS_TEXT).toBe("PDF, JPG ou PNG até 10 MB.");
    expect(html).toContain(M.DOCUMENT_FORMATS_TEXT);
    expect(html).toContain("Enviar para aprovação");
    // Cada campo tem um sítio para o seu erro.
    for (const f of ["companyName", "companyNif", "bankName", "beneficiaryName", "iban", "matricula", "certidao"]) {
      expect(html).toContain(`id="vf-${f}-err"`);
    }
  });

  it("o estado dos documentos é mostrado, e substituir é escolher outro ficheiro", () => {
    const draft = { ...formVazio(), documents: { matricula: "s/m.pdf", certidao: null } };
    const docs = docsVazios();
    docs.matricula = { busy: false, error: null, fileName: "matricula.pdf" };
    docs.certidao = { busy: true, error: null, fileName: null };
    const html = M.verificationFormHtml({ draft, status: "none", docs, editing: false });
    expect(html).toContain("Carregado: matricula.pdf");
    expect(html).toContain("Escolher outro ficheiro substitui este no pedido.");
    expect(html).toContain("A carregar…");
  });

  it("alterar dados aprovados avisa antes que voltam a ser analisados", () => {
    const html = M.verificationFormHtml({ draft: formVazio(), status: "approved", docs: docsVazios(), editing: true });
    expect(html).toContain("Os dados voltam a ser analisados");
    expect(html).toContain("Enviar de novo");
    expect(html).toContain('id="vf-cancel"');
    expect(mod("pagamentos.ts")).toContain("editando && changeRequiresReview(v.status)");
  });

  it("cada estado tem o rótulo do domínio e a explicação certa", () => {
    for (const s of ["none", "pending", "approved", "rejected"] as const) {
      expect(M.verificationStatusPill(s)).toContain(VERIFICATION_STATUS_LABEL[s]);
    }
    expect(M.verificationNoticeHtml(verificacao("pending"), { providerReady: false, digitalVisible: false })).toContain("A equipa MôBisno está a analisar");
    const rejeitado = M.verificationNoticeHtml(verificacao("rejected", { rejectionReason: "Certidão ilegível" }), { providerReady: false, digitalVisible: false });
    expect(rejeitado).toContain("Motivo:");
    expect(rejeitado).toContain("Certidão ilegível");
  });

  it("aprovado sem serviço de pagamentos: nota honesta, sem datas prometidas", () => {
    const nota = M.verificationNoticeHtml(verificacao("approved"), { providerReady: false, digitalVisible: false });
    expect(nota).toContain("assim que o serviço de pagamentos estiver ligado");
    expect(nota.replace(/<[^>]+>/g, "")).not.toMatch(/\d/);
  });

  it("o resumo só de leitura mostra o IBAN formatado e os documentos", () => {
    const html = M.verificationSummaryHtml(verificacao("pending"));
    expect(html).toContain(formatIban("AO06004400006729503010102"));
    for (const d of COMPANY_DOCUMENTS) expect(html).toContain(d.label);
    expect(html).not.toContain("<input");
  });

  it("o WhatsApp está sempre ativo e o número é o campo «Número de WhatsApp»", () => {
    const html = M.whatsappCardHtml("+244 923 456 789");
    expect(html).toContain("Sempre ativo");
    expect(html).toContain(">Número de WhatsApp</label>");
    expect(mod("pagamentos.ts")).toContain("whatsapp: { ...(custom.whatsapp ?? {}), phone }");
  });

  it("os levantamentos usam a conta aprovada, e só ela", () => {
    const src = mod("pagamentos.ts");
    expect(src).toContain('const conta: WithdrawalAccount | null = verificacao.status === "approved"');
    expect(src).toContain("requestWithdrawal(store.id, ownerId, available, conta)");
    const W = ler("web/supabase/withdrawals.ts");
    expect(W).toContain('Pick<PaymentVerification, "bankName" | "beneficiaryName" | "iban">');
    expect(W).not.toContain("PaymentConfig");
  });

  it("vendas e levantamentos só aparecem com pagamentos digitais ou com histórico", () => {
    expect(mod("pagamentos.ts")).toContain("const mostrarVendas = digitalVisible || orders.length > 0 || withdrawals.length > 0;");
    expect(mod("pagamentos.ts")).toContain("const digitalVisible = digitalPaymentsVisible(store);");
  });

  it("saíram a MoMenu, o interruptor «Pagamentos online» e o espelho custom.payments", () => {
    for (const proibido of ["MoMenu", "Pagamentos online", "online-toggle", "onlineEnabled", "custom.payments", "payments: {", ".payments ="]) {
      expect(CODIGO, `ainda há ${proibido} no painel`).not.toContain(proibido);
    }
  });

  it("a chave do Vero só entra: o campo sai sempre vazio e o painel nunca a lê", () => {
    // `apiKey` e `API key` estiveram nesta lista de proibidos, por causa da
    // chave do fornecedor antigo guardada em `custom.payments`. Há de novo um
    // campo de chave no painel, mas é outra coisa: é a chave do **Vero da
    // empresa do Dono**, e continua a ser um segredo. Logo a guarda deixa de
    // ser «a palavra não aparece» e passa a ser o que interessa — a chave
    // escreve-se e nunca se volta a ler.
    const MK = mod("markup.ts");
    expect(MK).toContain('id: "vero-key", label: "Chave secreta (API key)", value: "", type: "password"');
    // Quem desenha o cartão sabe *se* existe chave, não qual é.
    expect(MK).toContain("hasKey");
    expect(CODIGO, "o painel está a ler a coluna da chave").not.toContain("vero_api_key");

    // E o acesso à base de dados pede as colunas derivadas, não a chave.
    const SUPA = ler("web/supabase/payments.ts");
    const colunas = /const VERIFICATION_COLUMNS\s*=\s*\r?\n?\s*"([^"]*)"/.exec(SUPA)?.[1] ?? "";
    expect(colunas, "VERIFICATION_COLUMNS não encontrado").not.toBe("");
    expect(colunas).toContain("vero_key_set");
    expect(colunas).toContain("vero_key_test");
    expect(colunas, "a chave secreta está a ser carregada para a página").not.toContain("vero_api_key");
  });
});

/* =================================== Plano =================================== */

describe("Plano — um só plano, preço do domínio", () => {
  const precoEsperado = `${formatKz(PLAN_PRICE_KZ).replace(/,00 Kz$/, " Kz")}/${PLAN_PERIOD_DAYS === 30 ? "mês" : `${PLAN_PERIOD_DAYS} dias`}`;

  it("não há preço escrito à mão no código do painel", () => {
    expect(TODO).not.toContain("10.000");
    expect(TODO).not.toContain("10000");
    expect(TODO).not.toContain("10_000");
  });

  it("o preço sai de PLAN_PRICE_KZ e do período", () => {
    expect(M.PLAN_PRICE_TEXT).toBe(precoEsperado);
    const html = M.planHtml({ billing: inativa, providerReady: false, storeName: "Kitanda", identifier: "kitanda" });
    expect(html).toContain(formatKz(PLAN_PRICE_KZ).replace(/,00 Kz$/, " Kz"));
    expect(html).toContain(`Plano ${PLAN_NAME}`);
    for (const h of PLAN_HIGHLIGHTS) expect(html, `destaque ausente: ${h}`).toContain(h);
  });

  it("sem escalões, sem ciclo anual, sem preço por loja", () => {
    const html = M.planHtml({ billing: ativa, providerReady: true, storeName: "Kitanda", identifier: "kitanda" });
    for (const proibido of ["anual", "Anual", "por loja", "Básico", "Profissional", "Empresarial", "POUPA", "Poupa"]) {
      expect(html, `o Plano não pode falar de ${proibido}`).not.toContain(proibido);
    }
  });

  it("os quatro estados: ativa até, inativa, caducada e conta de administração", () => {
    const html = (b: BillingState): string => M.planHtml({ billing: b, providerReady: false, storeName: "K", identifier: "k" });
    expect(html(ativa)).toContain("Ativa até ");
    expect(html(ativa)).toContain("Faltam 12 dias");
    expect(html(inativa)).toContain("Inativa");
    expect(html(caducada)).toContain("Caducada");
    expect(html(admin)).toContain("Conta de administração");
    // A conta de administração não paga: não há botão nem email para isso.
    expect(html(admin)).not.toContain("mailto:");
  });

  it("sem serviço de pagamentos: explicação honesta e email com o identificador no assunto", () => {
    const html = M.planHtml({ billing: inativa, providerReady: false, storeName: "Kitanda", identifier: "kitanda-luanda" });
    expect(html).not.toContain('id="plan-pay"');
    expect(html).toContain("Pagamento online da subscrição: em breve");
    expect(html).toContain(PLATFORM_CONTACT_EMAIL);
    const mailto = M.planActivationMailto("Kitanda", "kitanda-luanda");
    expect(mailto.startsWith(`mailto:${PLATFORM_CONTACT_EMAIL}?subject=`)).toBe(true);
    const assunto = decodeURIComponent(new URL(mailto.replace("mailto:", "http://x/")).searchParams.get("subject") ?? "");
    expect(assunto).toContain("kitanda-luanda");
  });

  it("com serviço de pagamentos: o botão abre o checkout do plano", () => {
    const html = M.planHtml({ billing: inativa, providerReady: true, storeName: "Kitanda", identifier: "kitanda" });
    expect(html).toContain('id="plan-pay"');
    expect(html).not.toContain('id="plan-mailto"');
    expect(mod("plano.ts")).toContain("openPlanCheckout({ onPaid: () => { void ctx.reload(); } });");
    expect(mod("plano.ts")).toContain("if (!PAYMENTS_PROVIDER_READY) return;");
  });
});

/* ============================ Código de desconto ============================ */

describe("Código de desconto — criar, estado, usos e validade", () => {
  const codigo = (id: string, extra: Partial<Codigo> = {}): Codigo => ({
    id, storeId: "s", code: id.toUpperCase(), type: "percent", value: 10, active: true,
    uses: 3, maxUses: 10, expiresAt: null, createdAt: "", ...extra,
  });

  it("os quatro estados de discountState têm rótulo", () => {
    expect(Object.fromEntries(Object.entries(M.DISCOUNT_STATE).map(([k, v]) => [k, v.label]))).toEqual({
      ativo: "Ativo", inativo: "Inativo", caducado: "Caducado", esgotado: "Esgotado",
    });
    expect(mod("descontos.ts")).toContain("discountState(code)");
  });

  it("a lista mostra o estado, os usos, a validade e as ações", () => {
    const html = M.discountListHtml([
      { code: codigo("a"), state: "ativo" },
      { code: codigo("b", { active: false }), state: "inativo" },
      { code: codigo("c", { expiresAt: "2020-01-01T00:00:00.000Z" }), state: "caducado" },
      { code: codigo("d", { uses: 10, type: "fixed", value: 2500, maxUses: null }), state: "esgotado" },
    ]);
    for (const r of ["Ativo", "Inativo", "Caducado", "Esgotado"]) expect(html).toContain(r);
    expect(html).toContain("3 de 10 usos");
    expect(html).toContain("10 usos · sem limite");
    expect(html).toContain("Válido até");
    expect(html).toContain("Sem data-limite");
    expect(html).toContain('aria-label="Apagar o código A"');
    expect(html).toContain(">Ativar</button>");
    expect(html).toContain(">Desativar</button>");
  });

  it("o formulário pede código, tipo, valor, limite de usos e validade", () => {
    const html = M.discountFormHtml("2026-01-01");
    for (const r of ["Código", "Tipo", "Valor", "Limite de usos", "Válido até"]) expect(html).toContain(`>${r}`);
    expect(html).toContain(">Percentagem</option>");
    expect(html).toContain(">Valor fixo</option>");
    expect(html).toContain('type="date"');
    expect(html).toContain('min="2026-01-01"');
    expect(mod("descontos.ts")).toContain("maxUses: maxRaw === \"\" ? null : Number(maxRaw)");
    expect(mod("descontos.ts")).toContain("createDiscount(store.id, entrada)");
  });
});

/* ================================= Avaliações ================================= */

describe("Avaliações — moderação, as por aprovar primeiro", () => {
  const av = (id: string, approved: boolean): Avaliacao => ({
    id, storeId: "s", productId: "p1", author: `Cliente ${id}`, rating: 4, comment: "Bom", approved, createdAt: "2026-05-01T10:00:00.000Z",
  });

  it("por aprovar vem antes das publicadas, com a contagem", () => {
    const html = M.reviewsHtml([av("1", true), av("2", false), av("3", false)], new Map([["p1", "Camisola"]]));
    expect(html.indexOf("Por aprovar")).toBeGreaterThan(-1);
    expect(html.indexOf("Por aprovar")).toBeLessThan(html.indexOf("Publicadas"));
    expect(html).toContain("2 por aprovar");
    expect(html).toContain("Camisola");
    expect(html).toContain('aria-label="4 de 5 estrelas"');
  });

  it("as ações são Aprovar, Esconder e Apagar", () => {
    const html = M.reviewsHtml([av("1", true), av("2", false)], new Map());
    expect(html).toContain("Aprovar</button>");
    expect(html).toContain("Esconder</button>");
    expect(html).toContain("Apagar</button>");
    expect(html.match(/data-rv-approve=/g)).toHaveLength(1);
    expect(html.match(/data-rv-hide=/g)).toHaveLength(1);
    expect(html.match(/data-rv-del=/g)).toHaveLength(2);
  });

  it("explica que as novas só aparecem depois de aprovadas", () => {
    expect(mod("avaliacoes.ts")).toContain("As avaliações novas só aparecem na página do produto depois de as aprovar.");
  });
});

/* ============================== Taxa de entrega ============================== */

describe("Taxa de entrega — a mesma gravação de sempre", () => {
  const AREAS = [{ area: "Talatona", on: true, fee: "2000" }, { area: "Viana", on: false, fee: "" }];

  it("valor único grava { mode, flatFee, freeAbove }", () => {
    const r = M.buildDelivery({ mode: "single", flat: "1500", free: "20000", areas: AREAS });
    expect(r).toEqual({ ok: true, value: { mode: "single", flatFee: 1500, freeAbove: 20000 } });
  });

  it("por área grava { mode, fees, freeAbove } só com as áreas marcadas", () => {
    const r = M.buildDelivery({ mode: "perArea", flat: "", free: "", areas: AREAS });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ mode: "perArea", fees: { Talatona: 2000 }, freeAbove: undefined });
    // `freeAbove` ausente não chega à base de dados (o JSON deixa-o cair).
    expect(JSON.parse(JSON.stringify(r.value))).toEqual({ mode: "perArea", fees: { Talatona: 2000 } });
  });

  it("devolve todos os erros de uma vez", () => {
    const r = M.buildDelivery({ mode: "perArea", flat: "", free: "-5", areas: [{ area: "Talatona", on: true, fee: "" }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.free).toBeTruthy();
    expect(r.errors.areas).toContain("Talatona");
    expect(r.badAreas).toEqual(["Talatona"]);
    const semAreas = M.buildDelivery({ mode: "perArea", flat: "", free: "", areas: [{ area: "Talatona", on: false, fee: "" }] });
    expect(semAreas.ok).toBe(false);
    const semTaxa = M.buildDelivery({ mode: "single", flat: "", free: "", areas: [] });
    expect(semTaxa.ok).toBe(false);
  });

  it("o editor tem «Valor único», «Por área» e «Entrega grátis acima de»", () => {
    const html = M.deliveryEditorHtml({ mode: "perArea", fees: { Talatona: 2000 } });
    expect(html).toContain(">Valor único</button>");
    expect(html).toContain(">Por área</button>");
    expect(html).toContain("Entrega grátis acima de (Kz)");
    expect(html).toMatch(/data-area="Talatona"[\s\S]*?checked/);
    expect(mod("entregas.ts")).toContain("custom.delivery = r.value;");
  });
});

/* ======================= HTML sem restos de programação ======================= */

describe("Nenhum ecrã mostra «undefined», «NaN» ou «[object Object]»", () => {
  it("todos os desenhos, com dados de exemplo e com dados vazios", () => {
    const amostras: [string, string][] = [
      ["config vazia", M.configHtml({ smsCredits: 0 })],
      ["config com dados", M.configHtml({ smsCredits: 5, customDomain: "a.co.ao", metaPixelId: "1", gaId: "G-1" })],
      ["apagar", M.deleteStoreHtml("Loja")],
      ...[ativa, inativa, caducada, admin].flatMap((b, i): [string, string][] => [
        [`plano ${i} sem serviço`, M.planHtml({ billing: b, providerReady: false, storeName: "K", identifier: "k" })],
        [`plano ${i} com serviço`, M.planHtml({ billing: b, providerReady: true, storeName: "K", identifier: "k" })],
      ]),
      ["formulário vazio", M.verificationFormHtml({ draft: formVazio(), status: "none", docs: docsVazios(), editing: false })],
      ...(["none", "pending", "approved", "rejected"] as const).map((s): [string, string] =>
        [`aviso ${s}`, M.verificationNoticeHtml(verificacao(s), { providerReady: false, digitalVisible: false })]),
      ["resumo", M.verificationSummaryHtml(verificacao("approved", { reviewedAt: "2026-05-02T10:00:00.000Z" }))],
      ["descontos vazios", M.discountListHtml([])],
      ["formulário de desconto", M.discountFormHtml("2026-01-01")],
      ["avaliações vazias", M.reviewsHtml([], new Map())],
      ["entrega vazia", M.deliveryEditorHtml(undefined)],
      ["entrega única", M.deliveryEditorHtml({ mode: "single", flatFee: 1500 })],
      ["whatsapp", M.whatsappCardHtml("")],
    ];
    for (const [nome, html] of amostras) {
      expect(html, `«${nome}» mostra undefined`).not.toMatch(/undefined|NaN|\[object /);
    }
  });
});

/* ===================== Imports que deixaram de existir ===================== */

describe("Nada do que saiu do domínio continua a ser importado", () => {
  it("sem configuração MoMenu, pacotes de SMS, ciclos ou preço por loja", () => {
    for (const nome of ["getPaymentConfig", "savePaymentConfig", "PaymentConfig", "SMS_PACKAGES", "SMS_UNIT_PRICE",
      "openSmsCheckout", "BILLING_PERIODS", "PERIOD_LABEL", "priceFor", "yearlySavingKz", "paidStores", "BillingPeriod"]) {
      expect(CODIGO, `${nome} ainda aparece no painel`).not.toContain(nome);
    }
    expect(CODIGO).not.toMatch(/\bPRICE_KZ\b/);
  });

  it("canPublishStore recebe só o estado da subscrição", () => {
    const chamadas = [...CODIGO.matchAll(/canPublishStore\(([^)]*)\)/g)].map((m) => m[1]!);
    expect(chamadas.length).toBeGreaterThan(0);
    for (const args of chamadas) expect(args, `canPublishStore(${args})`).not.toContain(",");
  });

  it("openPlanCheckout recebe só { onPaid }", () => {
    const chamadas = [...CODIGO.matchAll(/openPlanCheckout\(\{([^}]*)\}/g)].map((m) => m[1]!.trim());
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) expect(c.startsWith("onPaid:")).toBe(true);
  });
});

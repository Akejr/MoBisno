/**
 * Guardas do separador «Início» e da moldura do Dashboard do Dono.
 *
 * O «Início» responde ao que o Dono quer saber ao entrar, por esta ordem: a loja
 * está no ar (uma faixa, com o botão de publicar sujeito à subscrição da loja)?
 * Que encomendas e vendas chegaram (`vendas.ts`)? O que falta fazer («Próximos
 * passos», compactos, calculados dos dados reais) e há movimento (o funil dos
 * últimos 30 dias)? As encomendas e as vendas vieram de «Pagamentos», que passou
 * a ser só configuração.
 *
 * O HTML do «Início» é desenhado a sério a partir de `web/views/dashboard/markup.ts`
 * (puro), que entra por `import()` com o especificador numa constante — como em
 * `tests/sectionDesign.test.ts`, para o `tsc` não o seguir até ao DOM. O resto
 * são asserções sobre o texto-fonte, o mesmo padrão `readFileSync` de
 * `tests/dashboardAnalytics.test.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canDeleteOrder, orderEffectiveStatus, type OrderLifecycle } from "../src/services/payments.js";
import { canPublishStore, resolveBilling, type BillingState, type PublishDecision } from "../src/services/billing.js";
import { WA_DEFAULT_PHONE } from "../src/services/storeCustom.js";
import { VERIFICATION_STATUS_LABEL, type VerificationStatus } from "../src/services/paymentVerification.js";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const DASHBOARD = ler("web/views/dashboard.ts");
const INICIO = ler("web/views/dashboard/inicio.ts");
const MARKUP = ler("web/views/dashboard/markup.ts");
const PAGAMENTOS = ler("web/views/dashboard/pagamentos.ts");
const VENDAS = ler("web/views/dashboard/vendas.ts");
const PAYMENTS = ler("web/supabase/payments.ts");
const WITHDRAWALS = ler("web/supabase/withdrawals.ts");
const CONTEXT = ler("web/lib/assistantContext.ts");
const MIGRACAO = ler("supabase/migrations/0021_orders_owner_delete.sql");
const MODULOS = readdirSync(join(ROOT, "web/views/dashboard")).filter((f) => f.endsWith(".ts"))
  .map((f) => ({ f: `web/views/dashboard/${f}`, texto: ler(`web/views/dashboard/${f}`) }));

/* ---------------------- Forma do módulo, declarada à mão ---------------------- */

interface Funil { visits: number; views: number; carts: number; whatsapp: number }
interface Passo {
  id: string; title: string; text: string; done: boolean; optional: boolean; href: string | null; cta: string; status: string | null;
}
interface Venda {
  id: string; method: "mcx" | "reference" | "whatsapp"; status: "open" | "paid" | "failed" | "cancelled";
  amount: number; fee: number; net: number; subtotal: number | null; deliveryFee: number; discountAmount: number;
  invoiceUrl: string | null; referenceNumber: string | null; referenceEntity: string | null; dueDate: string | null;
  customer: { name?: string; phone?: string; nif?: string } | null; products: unknown[]; createdAt: string; paidAt: string | null;
}
interface Markup {
  storeStatusHtml(o: { state: "Publicada" | "Rascunho"; billing: BillingState; publish: PublishDecision; storeUrl: string; previewUrl: string }): string;
  phoneNoticeHtml(o: { phone: string | null }): string;
  onboardingHtml(o: { storeName: string; steps: readonly Passo[] }): string;
  funnelHtml(c: Funil): string;
  funnelConversion(c: Funil): string;
  nextSteps(i: {
    products: number; hasLogo: boolean; whatsappOk: boolean; deliveryOk: boolean;
    published: boolean; accessActive: boolean; verification: VerificationStatus;
  }): Passo[];
  nextStepsHtml(steps: readonly Passo[]): string;
  whatsappConfigured(custom: unknown): boolean;
  deliveryConfigured(d: { mode?: "single" | "perArea"; flatFee?: number; fees?: Record<string, number> } | undefined): boolean;
  orderRowHtml(o: Venda): string;
}

let M: Markup;

beforeAll(async () => {
  const g = globalThis as unknown as { location?: unknown };
  if (!g.location) g.location = { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost" };
  const especificador = "../web/views/dashboard/markup.js";
  M = (await import(especificador)) as Markup;
});

const AGORA = Date.now();
const ativa = resolveBilling({ planExpiresAt: new Date(AGORA + 10 * 86_400_000).toISOString() }, AGORA);
const inativa = resolveBilling({ planExpiresAt: null }, AGORA);
const URL_LOJA = "https://kitanda.sualoja.digital";
const PREVIA = "/previsualizar/kitanda";

/** As três decisões de `canPublishStore`, pelos nomes que o ecrã lhes dá. */
const PODE: PublishDecision = { allowed: true, reason: "ok" };
const SEM_PLANO: PublishDecision = { allowed: false, reason: "sem-subscricao" };
const SEM_TELEFONE: PublishDecision = { allowed: false, reason: "telefone-por-confirmar" };

const semNada = {
  products: 0, hasLogo: false, whatsappOk: false, deliveryOk: false,
  published: false, accessActive: false, verification: "none" as VerificationStatus,
};

/* ================================== Início ================================== */

describe("Início — estado da loja, encomendas, próximos passos e funil", () => {
  it("pinta a faixa e os cartões a partir das funções do markup e de vendas.ts", () => {
    expect(INICIO).toContain("storeStatusHtml({ state: store.state, billing, publish: publicar, storeUrl: ctx.storeUrl, previewUrl: ctx.previewUrl })");
    expect(INICIO).toContain("vendasHtml(vendas)");
    expect(INICIO).toContain("ligarVendas(ctx, vendas, () => renderInicio(ctx));");
    expect(INICIO).toContain("funnelHtml({ visits: analytics.visits30, views: analytics.views30, carts: analytics.carts30, whatsapp: analytics.whatsapp30 })");
    expect(INICIO).toContain("nextStepsHtml(passos)");
    expect(INICIO).toContain("Olá, ${esc(primeiroNome)}");
  });

  it("os próximos passos saem dos dados reais da loja", () => {
    expect(INICIO).toContain("products: products.length");
    expect(INICIO).toContain("hasLogo: logo !== null");
    expect(INICIO).toContain("whatsappOk: whatsappConfigured(custom)");
    expect(INICIO).toContain("deliveryOk: deliveryConfigured(custom.delivery)");
    expect(INICIO).toContain('published: store.state === "Publicada"');
    expect(INICIO).toContain("accessActive: billing.accessActive");
    expect(INICIO).toContain("verification: verification.status");
  });

  it("as leituras correm numa onda só, com as encomendas e as vendas", () => {
    expect(INICIO).toContain("await Promise.all([");
    for (const leitura of ["productRepository.listByStore(store.id)", "getStoreAnalytics(store.id)", "getCustomization(store.id)", "assetRepository.findLogo(store.id)", "getPaymentVerification(store.id)", "loadVendas(store)"]) {
      expect(INICIO).toContain(leitura);
    }
    for (const leitura of ["listWhatsappOrders(store.id)", "listOrders(store.id, ORDERS_LIMIT)", "listWithdrawals(store.id)", "getOrderStats(store.id)", "committedWithdrawals(store.id)"]) {
      expect(VENDAS, `${leitura} saiu das leituras das vendas`).toContain(leitura);
    }
    // «Pagamentos» é só configuração: já não lê encomendas nem vendas.
    for (const fora of ["listOrders", "getOrderStats", "listWithdrawals", "listWhatsappOrders", "requestWithdrawal"]) {
      expect(PAGAMENTOS, `${fora} não pertence a «Pagamentos»`).not.toContain(fora);
    }
  });
});

describe("Estado da loja — Publicada ou Rascunho, e publicar sujeito à subscrição", () => {
  it("rascunho com subscrição: botão «Publicar a loja»", () => {
    const html = M.storeStatusHtml({ state: "Rascunho", billing: ativa, publish: PODE, storeUrl: URL_LOJA, previewUrl: PREVIA });
    expect(html).toContain("Rascunho");
    expect(html).toMatch(/id="toggle-state" data-next="Publicada"/);
    expect(html).toContain("Publicar a loja");
    expect(html).toContain("Ainda só você a vê");
    // Por publicar, o endereço abre a pré-visualização: a loja não existe na web.
    expect(html).toContain(`href="${PREVIA}"`);
  });

  it("sem subscrição: o botão fica desligado e a frase diz porquê e onde resolver", () => {
    const html = M.storeStatusHtml({ state: "Rascunho", billing: inativa, publish: SEM_PLANO, storeUrl: URL_LOJA, previewUrl: PREVIA });
    expect(html).not.toContain('id="toggle-state"');
    expect(html).toMatch(/<button type="button" disabled aria-describedby="publish-why"/);
    expect(html).toContain("Ative a subscrição para publicar");
    expect(html).toContain('href="#/painel/plano"');
  });

  it("telemóvel por confirmar: o botão fica desligado e a frase manda confirmar, não pagar", () => {
    // São dois impedimentos diferentes, e resolvem-se em sítios diferentes:
    // mandar «ver o plano» a quem só tem de escrever um código de SMS é a
    // não-resposta que esta guarda impede.
    const html = M.storeStatusHtml({ state: "Rascunho", billing: ativa, publish: SEM_TELEFONE, storeUrl: URL_LOJA, previewUrl: PREVIA });
    expect(html).not.toContain('id="toggle-state"');
    expect(html).toMatch(/<button type="button" disabled aria-describedby="publish-why"/);
    expect(html).toContain("Confirme o número de telemóvel para publicar.");
    expect(html).toContain('id="verify-phone"');
    expect(html).not.toContain("Ative a subscrição para publicar");
  });

  it("publicada e com subscrição: no ar, com «Despublicar» e o endereço público", () => {
    const html = M.storeStatusHtml({ state: "Publicada", billing: ativa, publish: PODE, storeUrl: URL_LOJA, previewUrl: PREVIA });
    expect(html).toContain("Publicada");
    expect(html).toMatch(/id="toggle-state" data-next="Rascunho"/);
    expect(html).toContain("Despublicar");
    expect(html).toContain("A loja está no ar");
    expect(html).toContain(`href="${URL_LOJA}"`);
    expect(html).toContain("kitanda.sualoja.digital");
    expect(html).toContain('id="copy-url"');
  });

  it("publicada sem subscrição: diz que está fora do ar e não manda para um endereço morto", () => {
    const html = M.storeStatusHtml({ state: "Publicada", billing: inativa, publish: SEM_PLANO, storeUrl: URL_LOJA, previewUrl: PREVIA });
    expect(html).toContain("fora do ar");
    expect(html).not.toContain(`href="${URL_LOJA}"`);
    expect(html).toContain(`href="${PREVIA}"`);
  });

  it("publicar passa por canPublishStore antes de ir à base de dados", () => {
    const fn = INICIO.slice(INICIO.indexOf("async function mudarEstado("));
    expect(fn).toContain("const decisao = canPublishStore(ctx.billing, ctx.phoneVerified);");
    expect(fn).toContain("if (!decisao.allowed)");
    expect(fn).toContain('go("#/painel/plano")');
    // Cada impedimento leva ao sítio onde se resolve: o telemóvel abre o modal,
    // a subscrição muda de separador.
    expect(fn).toContain('decisao.reason === "telefone-por-confirmar"');
    expect(fn).toContain("openPhoneVerify({");
    expect(fn.indexOf("canPublishStore(")).toBeLessThan(fn.indexOf("setStoreState("));
    // Despublicar pede confirmação: a loja sai da web para os clientes.
    expect(fn).toContain("confirm(");
    expect(fn).toContain("await ctx.reload();");
  });

  it("copiar o endereço tem saída quando a área de transferência não existe", () => {
    expect(INICIO).toContain("copyText(ctx.storeUrl)");
    expect(INICIO).toContain("Copie o endereço à mão:");
  });
});

describe("Telemóvel por confirmar — o aviso que falta fechar", () => {
  /**
   * Quem escolheu «Não recebi o código» no assistente ficou com a conta criada
   * e a loja por publicar. Sem este aviso, saía do assistente sem saber o que
   * ficou pendente — e encontrava um botão de publicar desligado sem explicação.
   */
  it("o Início mostra o aviso só a quem tem o número por confirmar", () => {
    expect(INICIO).toContain("ctx.phoneVerified ? \"\" : `<div class=\"mt-6\">${phoneNoticeHtml({ phone: ctx.phone })}</div>`");
  });

  it("o aviso diz o que está em causa e abre o modal de confirmação", () => {
    const html = M.phoneNoticeHtml({ phone: "244923456789" });
    expect(html).toContain("Confirme o seu telemóvel");
    expect(html).toContain("a loja não pode ser publicada");
    expect(html).toContain('id="verify-phone-card"');
    // O número é mostrado legível, a partir da função do domínio.
    expect(html).toContain("+244 923 456 789");
  });

  it("sem número gravado, o aviso não inventa um", () => {
    const html = M.phoneNoticeHtml({ phone: null });
    expect(html).toContain("Confirme o seu telemóvel");
    expect(html).not.toMatch(/\+244/);
  });

  it("os dois botões abrem o mesmo modal, e confirmar redesenha o painel", () => {
    expect(INICIO).toContain('for (const id of ["verify-phone", "verify-phone-card"])');
    expect(INICIO).toContain("onVerified: () => { void ctx.reload(); }");
  });

  it("a decisão de publicar usa o telemóvel da conta, não o da loja", () => {
    // O número é da conta e serve todas as lojas dela: ler o estado por loja
    // dava avisos diferentes em separadores do mesmo painel.
    expect(INICIO).toContain("canPublishStore(billing, ctx.phoneVerified)");
    expect(DASHBOARD).toContain("readPhoneStatus(ownerId)");
    expect(DASHBOARD).toContain("phoneVerified: telefone.verified");
  });

  it("uma conta de administrador publica sem confirmar nada", () => {
    expect(DASHBOARD).toContain("isAdmin ? { verified: true, phone: phoneStatus.phone } : phoneStatus");
    expect(canPublishStore(resolveBilling({ planExpiresAt: null, isAdmin: true }), false).allowed).toBe(true);
  });
});

describe("Loja recém-criada — um cartão com os passos, não três cartões vazios", () => {
  /**
   * O que o Dono reportou: «a tela de painel/início quando a pessoa acaba de
   * criar a loja continua muito confusa».
   *
   * E estava: uma loja criada há cinco minutos não tem produtos, nem
   * encomendas, nem visitas. A grelha mostrava as encomendas vazias (a ocupar
   * dois terços da largura), o funil vazio, e a única coisa útil — o que falta
   * fazer — era a coluna mais estreita, com setas que não se leem como botões.
   */
  it("o Início só troca de desenho quando NADA aconteceu", () => {
    // Não é «poucos produtos» nem «poucas visitas»: é zero em tudo o que o
    // ecrã mostraria. Um só sinal de vida e o painel volta a ser o painel.
    expect(INICIO).toContain("const semNada = products.length === 0");
    for (const sinal of ["lidas.waOrders.length === 0", "lidas.orders.length === 0", "analytics.visits30 === 0"]) {
      expect(INICIO, `sinal de vida ignorado: ${sinal}`).toContain(sinal);
    }
    expect(INICIO).toContain("onboardingHtml({ storeName: store.name, steps: passos })");
  });

  it("nesse estado não se desenha nenhum cartão vazio", () => {
    const bloco = INICIO.slice(INICIO.indexOf("const pintado = ctx.paint("), INICIO.indexOf("if (!pintado) return;"));
    const ternario = bloco.indexOf("semNada");
    expect(ternario, "o desenho não depende de `semNada`").toBeGreaterThan(-1);
    // As encomendas e o funil ficam no outro ramo do mesmo ternário.
    expect(bloco.indexOf("vendasHtml(vendas)")).toBeGreaterThan(ternario);
    expect(bloco.indexOf("funnelHtml(")).toBeGreaterThan(ternario);
    // E sem cartões no ecrã, não se ligam eventos a eles.
    expect(INICIO).toContain("if (!semNada) ligarVendas(ctx, vendas, () => renderInicio(ctx));");
  });

  it("o cartão diz o nome da loja, o progresso e todos os passos", () => {
    const html = M.onboardingHtml({ storeName: "Kitanda", steps: M.nextSteps(semNada) });
    expect(html).toContain("Vamos pôr a Kitanda a vender");
    expect(html).toContain("Comece pelos produtos");
    for (const passo of M.nextSteps(semNada)) expect(html, passo.title).toContain(passo.title);
  });

  it("só o primeiro passo que falta tem o botão principal: há sempre uma próxima coisa óbvia", () => {
    const html = M.onboardingHtml({ storeName: "Kitanda", steps: M.nextSteps(semNada) });
    // `BTN_PRIMARY` é o único com o laranja de fundo; os outros são secundários.
    const primarios = [...html.matchAll(/bg-\[#F95901\]/g)].length;
    expect(primarios, "mais do que uma ação principal").toBe(1);
    // E é o do primeiro passo por fazer.
    const antes = html.slice(0, html.indexOf("bg-[#F95901]"));
    expect(antes).toContain("Adicionar produtos");
    expect(antes).not.toContain("Taxa de entrega");
  });

  it("com passos feitos, o destaque passa ao seguinte e os feitos ficam ticados", () => {
    const html = M.onboardingHtml({
      storeName: "Kitanda",
      steps: M.nextSteps({ ...semNada, products: 4, hasLogo: true, whatsappOk: true }),
    });
    expect(html).toContain("3 de 5 passos feitos");
    const antes = html.slice(0, html.indexOf("bg-[#F95901]"));
    expect(antes).toContain("Taxa de entrega");
    // Um passo feito não oferece botão nenhum.
    expect(html).toMatch(/data-step="produtos" data-done="true"/);
  });

  it("a verificação em análise não oferece botão: está nas mãos da MôBisno", () => {
    const html = M.onboardingHtml({
      storeName: "Kitanda",
      steps: M.nextSteps({ ...semNada, verification: "pending" }),
    });
    const item = html.slice(html.indexOf('data-step="empresa"'));
    expect(item).toContain(VERIFICATION_STATUS_LABEL.pending);
    expect(item).not.toContain("Enviar os dados");
  });

  it("diz onde as encomendas vão aparecer, para o ecrã vazio não parecer o ecrã final", () => {
    const html = M.onboardingHtml({ storeName: "Kitanda", steps: M.nextSteps(semNada) });
    expect(html).toMatch(/As encomendas e as vendas aparecem aqui/);
  });

  it("nada deste desenho mostra «undefined», «NaN» ou «[object Object]»", () => {
    for (const steps of [M.nextSteps(semNada), M.nextSteps({ ...semNada, accessActive: true, products: 2 })]) {
      expect(M.onboardingHtml({ storeName: "Kitanda <Lda>", steps })).not.toMatch(/undefined|NaN|\[object /);
    }
  });
});

describe("Funil de compra — os quatro passos dos últimos 30 dias", () => {
  it("mostra os quatro passos, por ordem, com os números", () => {
    const html = M.funnelHtml({ visits: 200, views: 340, carts: 25, whatsapp: 9 });
    const passos = [...html.matchAll(/data-funnel-step="([a-z]+)"/g)].map((m) => m[1]);
    expect(passos).toEqual(["visits", "views", "carts", "whatsapp"]);
    for (const r of ["Visitas", "Produtos vistos", "Adições ao carrinho", "Encomendas por WhatsApp"]) expect(html).toContain(r);
    for (const n of ["200", "340", "25", "9"]) expect(html).toContain(`>${n}</span>`);
    expect(html).toContain("5% das visitas terminaram numa encomenda por WhatsApp.");
  });

  it("sem movimento diz o que fazer, em vez de mostrar quatro zeros", () => {
    const html = M.funnelHtml({ visits: 0, views: 0, carts: 0, whatsapp: 0 });
    expect(html).toContain("Ainda sem movimento nos últimos 30 dias");
    expect(html).not.toContain("data-funnel-step");
  });

  it("a conversão só é escrita quando os números a suportam", () => {
    expect(M.funnelConversion({ visits: 0, views: 0, carts: 0, whatsapp: 0 })).toBe("");
    // Mais encomendas do que visitas: «150%» seria uma conta certa a dizer uma coisa errada.
    expect(M.funnelConversion({ visits: 2, views: 0, carts: 0, whatsapp: 3 })).toBe("");
    expect(M.funnelConversion({ visits: 300, views: 0, carts: 0, whatsapp: 1 })).toContain("Menos de 1%");
  });
});

describe("Próximos passos — calculados, e cada um leva ao sítio onde se faz", () => {
  it("são seis, o último opcional, e cada um aponta para o separador certo", () => {
    const passos = M.nextSteps(semNada);
    expect(passos.map((p) => p.id)).toEqual(["produtos", "personalizar", "whatsapp", "entrega", "publicar", "empresa"]);
    expect(passos.filter((p) => p.optional).map((p) => p.id)).toEqual(["empresa"]);
    const destino = Object.fromEntries(passos.map((p) => [p.id, p.href]));
    expect(destino).toEqual({
      produtos: "#/painel/produtos", personalizar: "#/personalizar", whatsapp: "#/painel/pagamentos",
      entrega: "#/painel/entregas", publicar: "#/painel/plano", empresa: "#/painel/pagamentos",
    });
    expect(passos.every((p) => !p.done)).toBe(true);
  });

  it("com a subscrição ativa, o passo de publicar é o próprio botão de publicar", () => {
    const passos = M.nextSteps({ ...semNada, accessActive: true });
    const publicar = passos.find((p) => p.id === "publicar")!;
    expect(publicar.href).toBeNull();
    expect(publicar.cta).toBe("Publicar a loja");
    expect(M.nextStepsHtml(passos)).toContain("data-step-publish");
    expect(INICIO).toContain('querySelectorAll<HTMLButtonElement>("[data-step-publish]")');
  });

  it("nenhum desenho do Início mostra «undefined», «NaN» ou «[object Object]»", () => {
    const amostras = [
      M.storeStatusHtml({ state: "Rascunho", billing: inativa, publish: SEM_PLANO, storeUrl: URL_LOJA, previewUrl: PREVIA }),
      M.storeStatusHtml({ state: "Publicada", billing: ativa, publish: PODE, storeUrl: URL_LOJA, previewUrl: PREVIA }),
      M.storeStatusHtml({ state: "Rascunho", billing: ativa, publish: SEM_TELEFONE, storeUrl: URL_LOJA, previewUrl: PREVIA }),
      M.phoneNoticeHtml({ phone: "244923456789" }),
      M.phoneNoticeHtml({ phone: null }),
      M.funnelHtml({ visits: 0, views: 0, carts: 0, whatsapp: 0 }),
      M.funnelHtml({ visits: 3, views: 1, carts: 0, whatsapp: 0 }),
      M.nextStepsHtml(M.nextSteps(semNada)),
      M.nextStepsHtml(M.nextSteps({ ...semNada, verification: "rejected", accessActive: true })),
    ];
    for (const html of amostras) expect(html).not.toMatch(/undefined|NaN|\[object /);
  });

  it("cada passo fica feito com o dado que o prova", () => {
    const passos = M.nextSteps({
      products: 3, hasLogo: true, whatsappOk: true, deliveryOk: true, published: true, accessActive: true, verification: "approved",
    });
    expect(passos.every((p) => p.done)).toBe(true);
    const html = M.nextStepsHtml(passos);
    expect(html).toContain("5 de 5 passos feitos");
    expect(html).toContain("A loja está pronta a vender");
  });

  it("a verificação em análise aparece como tal, sem botão para enviar de novo", () => {
    const passos = M.nextSteps({ ...semNada, verification: "pending" });
    const empresa = passos.find((p) => p.id === "empresa")!;
    expect(empresa.status).toBe(VERIFICATION_STATUS_LABEL.pending);
    const html = M.nextStepsHtml(passos);
    const item = html.slice(html.indexOf('data-step="empresa"'));
    expect(item).toContain(VERIFICATION_STATUS_LABEL.pending);
    expect(item).not.toContain("Enviar os dados");
  });

  it("o número predefinido da plataforma não conta como WhatsApp do Dono", () => {
    expect(M.whatsappConfigured({})).toBe(false);
    expect(M.whatsappConfigured({ whatsapp: { phone: WA_DEFAULT_PHONE } })).toBe(false);
    expect(M.whatsappConfigured({ whatsapp: { phone: "+244 923 456 789" } })).toBe(true);
    expect(M.deliveryConfigured(undefined)).toBe(false);
    expect(M.deliveryConfigured({ mode: "perArea", fees: {} })).toBe(false);
    expect(M.deliveryConfigured({ mode: "single", flatFee: 0 })).toBe(true);
  });
});

/* ================================== Moldura ================================== */

describe("Menu de secções em telemóvel — o Dono tinha de poder sair da secção", () => {
  it("a navegação lateral continua escondida em telemóvel", () => {
    expect(DASHBOARD).toContain('<aside class="hidden md:flex');
  });

  it("existe navegação de secções própria para telemóvel", () => {
    expect(DASHBOARD).toMatch(/<nav aria-label="Secções do painel" class="md:hidden flex gap-1 overflow-x-auto/);
    expect(DASHBOARD).toContain("function navChip(");
  });

  it("a secção ativa é anunciada, e não só pintada", () => {
    expect(DASHBOARD).toMatch(/function navItem[\s\S]*?aria-current="page"/);
    expect(DASHBOARD).toMatch(/function navChip[\s\S]*?aria-current="page"/);
  });

  it("o menu não se sobrepõe ao cabeçalho nem deixa passar conteúdo por baixo", () => {
    // Cabeçalho e atalhos ficam num invólucro pegajoso só, sem medida escrita à mão.
    expect(DASHBOARD).toContain('<div class="sticky top-0 z-40">');
    expect(DASHBOARD).not.toMatch(/top-\[\d+px\]/);
  });

  it("em telemóvel o Dono também troca de loja: o mesmo menu, sem id repetido", () => {
    expect(DASHBOARD.match(/\$\{menu\}/g)).toHaveLength(2);
    expect(DASHBOARD).not.toMatch(/id="store-switch/);
    expect(DASHBOARD).toContain('document.querySelectorAll<HTMLButtonElement>("[data-store-switch-to]")');
    // O resumo do menu tem nome para o leitor de ecrã.
    expect(DASHBOARD).toContain('<span class="sr-only">Loja em edição: </span>');
    // Fecha ao tocar fora e com Escape, com os ouvintes ligados uma vez só.
    expect(DASHBOARD).toContain("if (!storeMenuCloseBound) {");
  });

  it("«Nova loja» diz o que custa antes de o Dono a criar, com o preço do domínio", () => {
    const menu = DASHBOARD.slice(DASHBOARD.indexOf("function storeMenuHtml("), DASHBOARD.indexOf("function shellHtml("));
    expect(menu).toContain('href="#/criar"');
    expect(menu).toContain("Nova loja");
    expect(menu).toContain("Grátis até publicar. Depois, ${esc(PLAN_PRICE_TEXT)} ${esc(PLAN_UNIT_LABEL)}.");
  });

  it("terminar sessão, «Nova loja» e a Administração também existem em telemóvel", () => {
    expect(DASHBOARD.match(/data-logout/g)!.length).toBeGreaterThanOrEqual(2);
    expect(DASHBOARD).toContain('document.querySelectorAll<HTMLElement>("[data-logout]")');
    const barra = DASHBOARD.slice(DASHBOARD.indexOf('<div class="md:hidden flex items-center gap-2'));
    // «Nova loja» vive dentro do menu de loja, que a barra também mostra.
    expect(barra).toContain("${menu}");
    expect(barra).toContain('aria-label="Terminar sessão"');
    expect(barra).toContain('aria-label="Dashboard de Administração"');
  });

  it("um desenho atrasado não pinta por cima do mais recente", () => {
    // Trocar de separador duas vezes depressa punha os dois a desenhar; o mais
    // lento ganhava, e ligava os eventos dele ao ecrã do outro.
    expect(DASHBOARD).toContain("const seq = ++renderSeq;");
    expect(DASHBOARD).toContain("if (seq !== renderSeq) return false;");
    expect(DASHBOARD).toContain("if (seq === renderSeq) mountAiAgent(");
    for (const { f, texto } of MODULOS) {
      if (!/ctx\.paint\(/.test(texto)) continue;
      // Quem liga eventos depois de pintar confirma primeiro que pintou.
      if (/addEventListener/.test(texto)) expect(texto, `${f} liga eventos sem confirmar que pintou`).toContain("if (!pintado) return;");
    }
  });

  it("o assistente fica fora do conteúdo, e as pinturas do separador não o levam", () => {
    expect(DASHBOARD).toContain('<div id="dash-content"');
    expect(DASHBOARD).toContain("slot.innerHTML = content;");
  });
});

/* ============================ Vendas digitais ============================ */

describe("Apagar transações expiradas — a lista deixa de crescer para sempre", () => {
  it("a decisão é uma função pura: só a referência expirada é apagável", () => {
    const expirada: OrderLifecycle = { status: "open", method: "reference", dueDate: "2020-01-01T00:00:00.000Z" };
    expect(canDeleteOrder(expirada)).toBe(true);
    for (const row of [
      { status: "open", method: "reference", dueDate: "2999-01-01T00:00:00.000Z" }, // ainda pagável
      { status: "paid", method: "reference", dueDate: "2020-01-01T00:00:00.000Z", paidAt: "2020-01-01T00:00:00.000Z" },
      { status: "failed", method: "reference", dueDate: "2020-01-01T00:00:00.000Z" },
      { status: "cancelled", method: "reference", dueDate: "2020-01-01T00:00:00.000Z" },
      { status: "open", method: "mcx", dueDate: null },
    ] as OrderLifecycle[]) {
      expect(canDeleteOrder(row), `${row.status}/${row.method} não devia ser apagável`).toBe(false);
    }
    expect(orderEffectiveStatus(expirada)).toBe("expired");
  });

  it("a ação de apagar aparece só nas linhas expiradas", () => {
    const fn = MARKUP.slice(MARKUP.indexOf("export function orderRowHtml(o: OrderRow)"));
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).toContain("const apagavel = canDeleteOrder(o);");
    expect(corpo).toMatch(/apagavel \?[^:]*data-order-del/);
    expect(MARKUP.match(/data-order-del="/g)).toHaveLength(1);
  });

  it("a linha expirada diz «Expirada» e oferece «Apagar registo»; a paga não", () => {
    const base: Venda = {
      id: "o1", method: "reference", status: "open", amount: 5000, fee: 100, net: 4900, subtotal: 5000, deliveryFee: 0,
      discountAmount: 0, invoiceUrl: null, referenceNumber: "123 456 789", referenceEntity: "00123",
      dueDate: "2020-01-01T00:00:00.000Z", customer: { name: "Ana" }, products: [], createdAt: "2019-12-28T10:00:00.000Z", paidAt: null,
    };
    const expirada = M.orderRowHtml(base);
    expect(expirada).toContain("Expirada");
    expect(expirada).toContain("Apagar registo");
    expect(expirada).toContain("A referência passou a data-limite e já não pode ser paga.");
    // O resumo é um botão que diz se está aberto: abre-se também com o teclado.
    expect(expirada).toMatch(/<button type="button" data-order-toggle="o1" aria-expanded="false" aria-controls="order-detail-o1"/);
    const paga = M.orderRowHtml({ ...base, status: "paid", paidAt: "2019-12-29T10:00:00.000Z" });
    expect(paga).toContain("Paga");
    expect(paga).not.toContain("Apagar registo");
  });

  it("a confirmação diz que é definitivo, porque é", () => {
    const fn = VENDAS.slice(VENDAS.indexOf("const apagarVenda = async"));
    expect(fn).toContain("confirm(");
    expect(fn).toMatch(/para sempre/);
    expect(fn).toContain("não é possível recuperá-la");
  });

  it("«apagado» só se diz quando a linha desapareceu mesmo", () => {
    expect(PAYMENTS).toContain("export async function deleteOrder(");
    expect(PAYMENTS).toContain('.delete().eq("id", orderId).select("id")');
    expect(PAYMENTS).toContain("return (data ?? []).length > 0;");
  });

  it("a lista, a contagem e a paginação ficam coerentes sem recarregar o ecrã", () => {
    const fn = VENDAS.slice(VENDAS.indexOf("const apagarVenda = async"), VENDAS.indexOf("desenhar();\n", VENDAS.indexOf("const apagarVenda = async")) + 40);
    expect(fn).toContain("orders.splice(i, 1)");
    expect(fn).toContain('document.getElementById("orders-count")');
    expect(fn).toContain("desenhar();");
    expect(fn).not.toContain("rerender(");
  });

  it("o disponível para levantar é o líquido menos o que já foi pedido", () => {
    expect(WITHDRAWALS).toContain('filter((r) => r.status !== "rejected")');
    expect(VENDAS).toContain("const available = Math.max(0, Math.round((stats.netReceived - committed) * 100) / 100);");
  });

  it("a guarda de verdade é a política de `delete`, e exclui as pagas duas vezes", () => {
    expect(MIGRACAO).toContain("drop policy if exists orders_owner_delete on public.orders;");
    expect(MIGRACAO).toContain("create policy orders_owner_delete on public.orders");
    expect(MIGRACAO).toContain("for delete using (");
    expect(MIGRACAO).toContain("public.owns_store(store_id)");
    expect(MIGRACAO).toContain("status <> 'paid'");
    expect(MIGRACAO).toContain("paid_at is null");
    expect(MIGRACAO).toContain("public.order_reference_expired(status, method, reference_due_date)");
  });
});

/* ======================== Cor e armadilhas de texto ======================== */

describe("Cor da plataforma — nunca a cor da loja", () => {
  it("nenhum ficheiro do painel usa var(--brand)", () => {
    // `var(--brand)` é a cor do tema da loja publicada (`web/lib/theme.ts`); num
    // ecrã de painel resolve para o que estiver no `:root` do momento.
    expect(DASHBOARD).not.toContain("var(--brand");
    for (const { f, texto } of MODULOS) expect(texto, f).not.toContain("var(--brand");
  });

  it("o laranja vem de uma constante, e o texto pequeno usa o tom escuro", () => {
    const UI = ler("web/views/dashboard/ui.ts");
    expect(UI).toContain('export const ACCENT = "#F95901";');
    expect(UI).toContain('export const ACCENT_INK = "#C2410C";');
    expect(INICIO).not.toContain("#F95901");
  });
});

describe("Armadilha do template literal — acento grave em comentário HTML", () => {
  it("não há acento grave dentro de comentários HTML no painel", () => {
    // Um acento grave dentro de `<!-- -->` fecha a cadeia do template literal e o
    // build parte com um erro que não aponta para a linha certa.
    expect(DASHBOARD).not.toMatch(/<!--[^>]*`/);
    for (const { f, texto } of MODULOS) expect(texto, f).not.toMatch(/<!--[^>]*`/);
  });
});

/* ================= Orientação do assistente (assistantContext) ================= */

/*
 * Asserções sobre `web/lib/assistantContext.ts`, que muda na mesma alteração que
 * o ecrã (`.kiro/steering/assistente.md`): a orientação do «Início» usa os
 * rótulos que o Dono vê agora, incluindo os das encomendas e das vendas, que
 * vieram de «Pagamentos».
 */
describe("Orientação do assistente — acompanha o que o ecrã mostra", () => {
  const guia = (() => {
    const i = CONTEXT.indexOf("painel: `ECRÃ");
    expect(i, "orientação do ecrã painel não encontrada").toBeGreaterThan(-1);
    return CONTEXT.slice(i, CONTEXT.indexOf("`,", i));
  })();

  it("nomeia o estado da loja e as ações pelos rótulos que o Dono vê", () => {
    for (const rotulo of ["Publicada", "Rascunho", "Publicar a loja", "Despublicar", "Copiar"]) {
      expect(guia, `rótulo ausente da orientação: ${rotulo}`).toContain(rotulo);
    }
    // Os estados antigos saíram do ecrã: sobreviver na orientação era mandar o
    // Dono procurar um rótulo que ele não vê.
    expect(guia).not.toContain("Não publicada");
  });

  it("descreve o funil e os próximos passos, que são o que o Início mostra agora", () => {
    expect(guia).toContain("Funil de compra");
    expect(guia).toContain("Próximos passos");
    for (const passo of ["Visitas", "Produtos vistos", "Adições ao carrinho", "Encomendas por WhatsApp"]) {
      expect(guia, `passo ausente da orientação: ${passo}`).toContain(passo);
    }
    expect(guia).toContain("Ainda sem movimento nos últimos 30 dias");
  });

  it("descreve as encomendas e as vendas aqui, que é onde elas estão agora", () => {
    // Enquanto estiveram em «Pagamentos», a orientação descrevia-as lá. Depois
    // de mudarem de sítio, descrevê-las lá seria o mesmo defeito dos escalões de
    // preço: uma resposta que manda procurar no ecrã errado.
    for (const rotulo of ["Encomendas por WhatsApp", "Recebido (líquido)", "Disponível para levantar", "Solicitar levantamento", "Referências pendentes"]) {
      expect(guia, `rótulo ausente da orientação do Início: ${rotulo}`).toContain(rotulo);
    }
    const inicioPag = CONTEXT.indexOf("pagamentos: `ECRÃ");
    const pagamentos = CONTEXT.slice(inicioPag, CONTEXT.indexOf("`,", inicioPag));
    expect(pagamentos).toMatch(/só configuração/);
    for (const rotulo of ["Recebido (líquido)", "Disponível para levantar", "Solicitar levantamento", "Referências pendentes"]) {
      expect(pagamentos, `${rotulo} já não é de «Pagamentos»`).not.toContain(rotulo);
    }
  });
});

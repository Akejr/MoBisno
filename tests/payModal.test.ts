/**
 * O pagamento num modal por cima da página, e não noutra página.
 *
 * O Dono pediu-o: «quando clicar abra o modal da Wiza. Modal, não outra página
 * nem nada». O checkout das lojas e a subscrição no painel levavam a página
 * inteira para o fornecedor, e o cliente saía da loja a meio da compra.
 *
 * O que não se pode perder pelo caminho:
 *
 *  - **Quem decide se a página do fornecedor cabe no modal é ela**, pelos
 *    cabeçalhos. `wipay.ao` responde `X-Frame-Options: SAMEORIGIN`; um `iframe`
 *    recusado fica em branco, e o navegador não o diz a quem o embute. O
 *    servidor lê os cabeçalhos quando cria a cobrança (`api/_frame.js`) e o
 *    modal abre a página à parte quando ela não se deixa embutir.
 *  - **Quem diz «pago» é sempre o servidor** (`/api/payment-status`). O modal
 *    pergunta enquanto está aberto; o endereço de regresso só o apressa.
 *  - **O regresso dentro do modal não desenha a loja numa caixa**: avisa a
 *    página de cima e para (`paymentReturnInFrame`, no arranque).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const ESP_FRAME = "../api/_frame.js";
const { frameableFromHeaders } = (await import(ESP_FRAME)) as {
  frameableFromHeaders(xfo: string | null, csp: string | null, origens: string[]): boolean;
};

const LOJA = "https://kitanda.sualoja.digital";
const PAINEL = "https://mobisno.store";

describe("A página do fornecedor deixa-se embutir? Pelos cabeçalhos dela", () => {
  it("X-Frame-Options a proibir: não", () => {
    for (const xfo of ["SAMEORIGIN", "sameorigin", "DENY", "ALLOW-FROM https://x.ao"]) {
      expect(frameableFromHeaders(xfo, null, [LOJA]), xfo).toBe(false);
    }
  });

  it("sem cabeçalhos que proíbam: sim", () => {
    expect(frameableFromHeaders(null, null, [LOJA])).toBe(true);
    expect(frameableFromHeaders("", "default-src 'self'", [LOJA])).toBe(true);
  });

  it("frame-ancestors decide quando existe, e ganha ao X-Frame-Options", () => {
    expect(frameableFromHeaders(null, "frame-ancestors 'self'", [LOJA])).toBe(false);
    expect(frameableFromHeaders(null, "frame-ancestors 'none'", [LOJA])).toBe(false);
    expect(frameableFromHeaders(null, "frame-ancestors *", [LOJA])).toBe(true);
    expect(frameableFromHeaders(null, "frame-ancestors https:", [LOJA])).toBe(true);
    expect(frameableFromHeaders(null, "default-src 'self'; frame-ancestors https://*.sualoja.digital", [LOJA])).toBe(true);
    expect(frameableFromHeaders(null, "frame-ancestors https://*.sualoja.digital", [PAINEL])).toBe(false);
    expect(frameableFromHeaders("SAMEORIGIN", "frame-ancestors https://mobisno.store", [PAINEL])).toBe(true);
  });
});

describe("O pagamento abre no modal, nos dois ecrãs", () => {
  it("o servidor diz se a página se deixa embutir, nos dois tipos de pagamento", () => {
    const API = ler("api/payment.js");
    expect(API).toContain('import { frameable } from "./_frame.js";');
    expect(API.match(/embeddable: r\.hostedUrl \? await frameable\(r\.hostedUrl, \[origemDoPedido\(req, host\)\]\) : null,/g) ?? []).toHaveLength(2);
    // HEAD e não GET: uma visita a mais à página da cobrança não é inocente.
    expect(ler("api/_frame.js")).toContain('method: "HEAD"');
  });

  it("nenhum dos dois leva a página inteira para o fornecedor", () => {
    for (const f of ["web/views/checkout.ts", "web/lib/planCheckout.ts"]) {
      const src = ler(f);
      expect(src, f).toContain("openPayModal(");
      expect(src, `${f} voltou a sair para o fornecedor`).not.toMatch(/location\.href\s*=\s*res\.hostedUrl/);
    }
  });

  it("o modal pergunta ao servidor, e o regresso só o apressa", () => {
    const MODAL = ler("web/lib/payModal.ts");
    expect(MODAL).toContain("checkStatus({ kind: opts.kind, id: opts.id })");
    // A mensagem do regresso só é ouvida da nossa origem e deste pagamento.
    expect(MODAL).toContain("if (e.origin !== location.origin) return;");
    expect(MODAL).toContain("d.id !== opts.id");
    // Recusado pelos cabeçalhos, a página abre à parte em vez de ficar em branco.
    expect(MODAL).toContain("const embutido = opts.embeddable !== false;");
    expect(MODAL).toContain("Abrir o pagamento");
  });

  it("o regresso dentro do modal não desenha a loja numa caixa", () => {
    const MAIN = ler("web/main.ts");
    const boot = MAIN.slice(MAIN.indexOf("async function boot("));
    expect(boot.indexOf("paymentReturnInFrame()"), "não é a primeira coisa do arranque").toBeLessThan(boot.indexOf("mountCartUI()"));
  });

  it("Multicaixa Express e Referência são um só botão no checkout", () => {
    const L = ler("web/templates/checkoutLayouts.ts");
    expect(L).toContain('export type CheckoutMethodId = "digital" | "whatsapp";');
    expect(L).toContain("Multicaixa Express ou Referência");
  });

  it("a loja chega com os pagamentos digitais a partir do HTML do servidor", () => {
    // A coluna faltava nos dados embutidos: no primeiro minuto, uma loja
    // aprovada chegava sem pagamentos digitais e o checkout só tinha WhatsApp.
    expect(ler("api/prerender.js")).toMatch(/\.select\("id, name, identifier, state, owner_id, customization, store_type, template_id, subdomain, created_at, digital_payments"\)/);
  });

  it("a orientação do Plano diz que o pagamento abre por cima do painel", () => {
    expect(ler("web/lib/assistantContext.ts")).toContain("abre a página do fornecedor numa janela por cima do painel");
  });
});

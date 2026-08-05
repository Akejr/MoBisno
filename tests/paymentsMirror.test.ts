/**
 * Espelho público do estado de pagamentos — as três portas fechadas (R3.1, R3.13).
 *
 * `store_payments` é a **fonte de verdade** do estado de pagamentos de uma Loja
 * (é o que `api/payment.js` consulta antes de aceitar uma compra), mas essa
 * tabela é deliberadamente sem leitura pública (migração `0008_payments.sql`).
 * Por isso o storefront decide a partir de um **espelho** não sensível,
 * `customization.payments.onlineEnabled`, lido pela decisão única de
 * `src/services/paymentVisibility.ts` (D2).
 *
 * Um espelho que diverge da verdade produz exatamente o defeito confirmado em
 * produção: o checkout anuncia Multicaixa Express e Referência Bancária, e o
 * servidor recusa a compra com `PAYMENTS_NOT_ENABLED`. Havia três portas por onde
 * a divergência entrava:
 *
 *  1. `applyModelToStore`/`applyRawToStore` copiavam o `payments` da Loja_Modelo
 *     para a Loja do cliente — que nasce sem linha em `store_payments`;
 *  2. o manipulador de `#save-online` escrevia o espelho mesmo quando
 *     `savePaymentConfig` falhava;
 *  3. as Lojas já afetadas ficavam divergentes para sempre, sem migração.
 *
 * As asserções são sobre o **texto-fonte**: `web/supabase/models.ts` importa o
 * cliente do Supabase e `web/views/dashboard.ts` depende do DOM, e `tests/`
 * compila com `lib: ["ES2022"]`, sem DOM, pelo que nenhum dos módulos pode ser
 * importado. É o mesmo padrão `readFileSync` de `tests/seedRename.test.ts` e de
 * `tests/comingSoon.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const MODELS = ler("web/supabase/models.ts");
const DASHBOARD = ler("web/views/dashboard.ts");

/** Recorta o texto entre dois marcadores, falhando com mensagem útil. */
function trecho(texto: string, inicio: string, fim: string): string {
  const i = texto.indexOf(inicio);
  expect(i, `marcador inicial não encontrado: ${inicio}`).toBeGreaterThan(-1);
  const j = texto.indexOf(fim, i + inicio.length);
  expect(j, `marcador final não encontrado: ${fim}`).toBeGreaterThan(i);
  return texto.slice(i, j);
}

/** Recorta o corpo de uma função de topo, do nome dela até ao `}` da coluna 0. */
function corpo(texto: string, inicio: string): string {
  const i = texto.indexOf(inicio);
  expect(i, `função não encontrada: ${inicio}`).toBeGreaterThan(-1);
  const j = texto.indexOf("\n}", i + inicio.length);
  expect(j, `fim da função não encontrado: ${inicio}`).toBeGreaterThan(i);
  return texto.slice(i, j);
}

describe("Porta 1 — o espelho `payments` nunca é herdado de um modelo (R3.13)", () => {
  const APLICADORES: readonly [string, string][] = [
    ["applyModelToStore", corpo(MODELS, "export async function applyModelToStore(")],
    ["applyRawToStore", corpo(MODELS, "export async function applyRawToStore(")],
  ];

  for (const [nome, fn] of APLICADORES) {
    it(`${nome} remove \`payments\` da cópia aplicada à loja do cliente`, () => {
      // A Loja do cliente nasce sem linha em `store_payments` (ou com
      // `online_enabled` a `false`). Herdar o espelho da Loja_Modelo faria o
      // checkout anunciar métodos que `api/payment.js` recusa.
      expect(fn).toMatch(/delete applied\.payments;/);
    });

    it(`${nome} continua a remover \`__template\` e \`__demoPayments\``, () => {
      // Regressão de D2: a marca de demonstração é escrita só pelo Semeador nas
      // Loja_Modelo e nunca herdada; `__template` é a marca de Loja_Modelo.
      expect(fn).toMatch(/delete \(applied as \{ __template\?: unknown \}\)\.__template;/);
      expect(fn).toMatch(/delete applied\.__demoPayments;/);
    });

    it(`${nome} remove o espelho antes de gravar a Personalização`, () => {
      // A ordem é o que importa: apagar depois do `update` não apagaria nada.
      expect(fn.indexOf("delete applied.payments;")).toBeLessThan(fn.indexOf(".update("));
    });
  }
});

describe("Porta 2 — o espelho só é escrito depois de a verdade ter sido gravada", () => {
  const BLOCO = trecho(DASHBOARD, '$("#save-online")?.addEventListener', "\n  async function renderLogotipo");

  /** Devolução antecipada quando a fonte de verdade não foi gravada. */
  const guarda = /if \(!okSave\)\s*\{[^}]*toast\([^)]*\)[^}]*return;\s*\}/;

  it("grava primeiro `store_payments` (a fonte de verdade)", () => {
    expect(BLOCO).toContain("savePaymentConfig(store!.id, next)");
  });

  it("devolve antes de tocar na Personalização quando a gravação falha", () => {
    expect(BLOCO).toMatch(guarda);
  });

  it("a guarda vem entre a gravação da verdade e a escrita do espelho (ordem)", () => {
    const verdade = BLOCO.indexOf("savePaymentConfig(");
    const falha = BLOCO.search(guarda);
    const espelho = BLOCO.indexOf("const mirrored =");
    const gravaEspelho = BLOCO.indexOf("saveCustomization(");
    expect(verdade).toBeGreaterThan(-1);
    expect(falha).toBeGreaterThan(verdade);
    expect(espelho).toBeGreaterThan(falha);
    expect(gravaEspelho).toBeGreaterThan(espelho);
  });

  it("o espelho escreve o mesmo booleano que foi gravado em `store_payments`", () => {
    expect(BLOCO).toMatch(/payments: \{ \.\.\.\(custom\.payments \?\? \{\}\), onlineEnabled: enabled \}/);
    expect(BLOCO).toMatch(/onlineEnabled: enabled,/); // o `next` de savePaymentConfig
  });
});

describe("Porta 3 — auto-reparação do espelho divergente ao abrir «Pagamentos»", () => {
  const BLOCO = trecho(DASHBOARD, "async function renderPagamentos()", "const waPhone =");

  it("lê a verdade e o espelho antes de decidir", () => {
    expect(BLOCO).toContain("getPaymentConfig(store!.id)");
    expect(BLOCO).toContain("getCustomization(store!.id)");
  });

  it("deteta a divergência com igualdade estrita ao booleano", () => {
    // Mesma comparação estrita do resto de R3: `"true"`, `1` ou `{}` no espelho
    // contam como desativado, e por isso divergem de uma verdade ativa.
    expect(BLOCO).toContain("(custom.payments?.onlineEnabled === true) !== cfg.onlineEnabled");
  });

  it("corrige o espelho a partir da verdade, numa só escrita", () => {
    expect(BLOCO).toMatch(/payments: \{ \.\.\.\(custom\.payments \?\? \{\}\), onlineEnabled: cfg\.onlineEnabled \}/);
    expect(BLOCO).toContain("saveCustomization(ownerId, store!.id, repaired)");
    // Uma só escrita da Personalização neste trecho.
    expect(BLOCO.match(/saveCustomization\(/g)).toHaveLength(1);
  });

  it("não escreve nada quando não há divergência (idempotência)", () => {
    // A escrita vive dentro do `if` da divergência: sem divergência, o ramo não
    // corre e abrir o separador não toca na base de dados.
    const deteta = BLOCO.indexOf("!== cfg.onlineEnabled");
    const escreve = BLOCO.indexOf("saveCustomization(");
    expect(deteta).toBeGreaterThan(-1);
    expect(escreve).toBeGreaterThan(deteta);
    const dentroDoIf = trecho(BLOCO, "!== cfg.onlineEnabled", "saveCustomization(");
    // Nada fecha o `if` entre a condição e a escrita.
    expect(dentroDoIf).not.toContain("\n    }");
  });

  it("adota a correção em memória, para o ecrã desenhar o estado corrigido", () => {
    // O que importa é o `custom` ser **mutável**: sem isso a correção não pode
    // ser adotada e o ecrã desenhava o espelho velho. De onde vem o valor é
    // indiferente — hoje chega do `Promise.all` que carrega a verdade e o
    // espelho de uma vez (antes era um `await` próprio, em fila). A leitura de
    // `getCustomization` é afirmada em «lê a verdade e o espelho antes de decidir».
    expect(BLOCO).toMatch(/let custom = /);
    expect(BLOCO).toMatch(/if \(okRepair\) custom = repaired;/);
  });

  it("uma falha da correção é silenciosa para o Dono e vai para console.error", () => {
    expect(BLOCO).toContain("console.error(");
    // Não há aviso ao Dono em nenhum dos dois desfechos: a correção é invisível.
    expect(BLOCO).not.toContain("toast(");
  });
});

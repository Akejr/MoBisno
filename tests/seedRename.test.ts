/**
 * Semeador_De_Modelos tolerante a renomeações (R1.1, R1.2, assunção [A1]).
 *
 * A tarefa 7.1 renomeou o preset `vermelho-moderno` de «Vermelho Moderno» para
 * «Ekolo sports». Como o Semeador emparelha as Loja_Modelo existentes **pelo
 * nome**, a renomeação deixou de casar com a Loja_Modelo em produção e criou uma
 * segunda Loja_Modelo do mesmo modelo. A correção é declarar os nomes anteriores
 * do modelo de fábrica e renomear a Loja_Modelo existente em vez de criar.
 *
 * Por decisão do utilizador o nome apresentado passou depois a «Ekolo Sports»,
 * com S maiúsculo. É a segunda renomeação, e por isso `previousNames` tem de
 * declarar **as duas** grafias anteriores: só a mais recente não bastaria.
 *
 * As asserções são sobre o **texto-fonte**: `web/supabase/models.ts` importa o
 * cliente do Supabase e `web/views/adminPanel.ts` depende do DOM, e `tests/`
 * compila com `lib: ["ES2022"]`, sem DOM. É o mesmo padrão `readFileSync` de
 * `tests/seoInfra.test.ts`, `tests/lumiereFooter.test.ts` e
 * `tests/comingSoon.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const MODELS = ler("web/supabase/models.ts");
const ADMIN_PANEL = ler("web/views/adminPanel.ts");

/** Recorta o corpo de uma função, do nome dela até ao marcador de fim. */
function corpo(texto: string, inicio: string, fim: string): string {
  const i = texto.indexOf(inicio);
  expect(i, `marcador inicial não encontrado: ${inicio}`).toBeGreaterThan(-1);
  const j = texto.indexOf(fim, i + inicio.length);
  expect(j, `marcador final não encontrado: ${fim}`).toBeGreaterThan(i);
  return texto.slice(i, j);
}

describe("Semeador — nomes anteriores do modelo de fábrica", () => {
  it("declara `previousNames` em FactoryModel e os nomes antigos do preset", () => {
    expect(MODELS).toMatch(/previousNames\?: string\[\]/);
    expect(MODELS).toContain('previousNames: ["Ekolo sports", "Vermelho Moderno"]');
  });

  it("declara as DUAS grafias anteriores do preset, não só a última", () => {
    // O preset foi renomeado duas vezes: «Vermelho Moderno» → «Ekolo sports» →
    // «Ekolo Sports». Esquecer qualquer uma das grafias anteriores devolve o
    // defeito original: o Semeador deixa de emparelhar e cria outra loja-modelo.
    const lista = /previousNames: \[([^\]]*)\]/.exec(MODELS)?.[1] ?? "";
    expect(lista).toContain('"Ekolo sports"');
    expect(lista).toContain('"Vermelho Moderno"');
  });

  it("procura o nome atual primeiro e só depois os nomes anteriores", () => {
    const fn = corpo(MODELS, "function resolveExistingModel(", "\n/**");
    const atual = fn.indexOf("byName.get(nameKey(fm.name))");
    const anteriores = fn.indexOf("fm.previousNames");
    expect(atual).toBeGreaterThan(-1);
    expect(anteriores).toBeGreaterThan(-1);
    // A ordem é a guarda contra duas Loja_Modelo com o mesmo nome: com uma já
    // existente com o nome atual, o ramo de nome anterior não corre.
    expect(atual).toBeLessThan(anteriores);
    expect(fn).toMatch(
      /if \(current\) return \{ model: current, renameNeeded: storedNameDiffers\(current, fm\.name\) \}/,
    );
    // Percorre TODOS os nomes anteriores, não só o primeiro: com duas
    // renomeações já feitas, parar no primeiro deixaria o nome mais antigo sem
    // emparelhamento.
    expect(fn).toMatch(/for \(const previous of fm\.previousNames \?\? \[\]\)/);
  });
});

describe("Semeador — corrige a grafia da Loja_Modelo já emparelhada (R1.1)", () => {
  it("compara a grafia gravada com cadeias exatas, sem normalizar", () => {
    // `nameKey` normaliza com trim+minúsculas, logo «Ekolo sports» e «Ekolo
    // Sports» dão a MESMA chave: o emparelhamento pelo nome atual acontece, e
    // sem comparação exata a Loja_Modelo ficava com a grafia antiga no
    // Painel_Admin e na galeria sem nada falhar.
    const fn = corpo(MODELS, "function storedNameDiffers(", "\n/**");
    expect(fn).toContain("model.name !== name");
    expect(fn).toContain("model.storeName !== name");
    // Nada de `nameKey`/`toLowerCase` aqui: normalizar anularia a regra.
    expect(fn).not.toContain("nameKey");
    expect(fn).not.toContain("toLowerCase");
  });

  it("expõe o `stores.name` gravado no modelo, para a comparação ser possível", () => {
    const fn = corpo(MODELS, "function toModel(", "\n/**");
    expect(fn).toContain("storeName: s.name");
  });

  it("mantém a coerência em memória depois de renomear (idempotência)", () => {
    // Sem isto, o `storeName` em memória ficava na grafia antiga e uma segunda
    // passagem do Semeador no mesmo processo voltaria a escrever.
    const fn = corpo(MODELS, "async function renameTemplateModel(", "\n/**");
    expect(fn).toContain("model.storeName = name");
  });
});

describe("Semeador — a renomeação escreve o mínimo e não apaga nada", () => {
  it("atualiza `stores.name` e `customization.__template.name`, e mais nada", () => {
    const fn = corpo(MODELS, "async function renameTemplateModel(", "\n/**");
    expect(fn).toContain("customization.__template = { ...tpl, name }");
    expect(fn).toContain(".update({ name, customization })");
    // Nenhuma eliminação no caminho da renomeação.
    expect(fn).not.toContain(".delete(");
  });
});

describe("Painel_Admin — deteção de modelo «em falta»", () => {
  it("considera os nomes anteriores antes de chamar o Semeador", () => {
    expect(ADMIN_PANEL).toContain("factoryModelNameKeys");
    expect(ADMIN_PANEL).toMatch(
      /const missing = defaultFactoryModels\(\)\.filter\(\s*\(fm\) => !factoryModelNameKeys\(fm\)\.some\(\(key\) => haveNames\.has\(key\)\),/,
    );
  });
});

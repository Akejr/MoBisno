import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { adminSnapshotArb, lojaModeloArb, type AdminSnapshot } from "./geradores.js";
import {
  attentionLists,
  businessHealth,
  isLojaModelo,
  monthlyEvolution,
  MONTHS_IN_EVOLUTION,
  type AttentionItem,
  type AttentionLists,
  type StoreLike,
} from "../src/services/adminMetrics.js";

/**
 * Instantâneo igual ao dado, com uma Loja acrescentada na posição `posicao` do
 * array de Lojas.
 *
 * A posição é parâmetro e não «no fim» por uma razão concreta: uma exclusão
 * dependente da ordem de iteração (por exemplo, um acumulador que só olha para
 * a última Loja, ou uma ordenação que empata pela posição no array) passaria um
 * teste que só inserisse no fim. Inserir no início, no meio e no fim fecha essa
 * porta.
 */
function comLojaEm(snapshot: AdminSnapshot, loja: StoreLike, posicao: number): AdminSnapshot {
  const stores = [...snapshot.stores];
  stores.splice(posicao, 0, loja);
  return { ...snapshot, stores };
}

/** As três posições de inserção: início, meio e fim do array de Lojas. */
function posicoesDeInsercao(total: number): readonly number[] {
  return [0, Math.floor(total / 2), total];
}

/** Todos os itens das cinco listas, numa só sequência. */
function todosOsItens(listas: AttentionLists): readonly AttentionItem[] {
  return [
    ...listas.withdrawalsToApprove,
    ...listas.paymentsStuck,
    ...listas.accountsExpiring7d,
    ...listas.storesWithoutProducts,
    ...listas.storesUnpublished,
  ];
}

describe("adminMetrics — métricas e listas da Visão geral do Painel_Admin (propriedade)", () => {
  it("ignora Loja_Modelo em qualquer posição e mantém todas as métricas nos seus limites", () => {
    // Feature: melhorias-loja-e-admin, Property 5: Para qualquer conjunto de dados de admin, acrescentar uma Loja_Modelo não altera nenhuma métrica nem nenhuma lista, e todas as métricas se mantêm nos seus limites
    // **Validates: Requirements 7.2, 7.4, 7.8**

    // Guardas contra um teste que passe por trivialidade: se nenhuma amostra
    // tivesse métricas com valor ou listas com itens, a propriedade estaria a
    // comparar zeros com zeros e ninguém dava por isso.
    let viuMetricaComValor = false;
    let viuListaComItens = false;

    assertProperty(
      fc.property(adminSnapshotArb, lojaModeloArb, (snapshot, lojaModelo) => {
        // A Loja acrescentada é, de facto, uma Loja_Modelo. Sem esta guarda, um
        // gerador que deixasse de marcar `__template` tornaria a asserção 1
        // verdadeira por engano.
        expect(isLojaModelo(lojaModelo)).toBe(true);

        // `now` vem dentro do instantâneo e é passado explicitamente em todas as
        // chamadas: as três funções dependem do mês corrente, da janela de 7
        // dias e dos 6 meses da evolução, e sem momento fixo o teste passaria
        // hoje e falharia sozinho num 1 de janeiro.
        const { now } = snapshot;
        const saudeAntes = businessHealth(snapshot, now);
        const evolucaoAntes = monthlyEvolution(snapshot, MONTHS_IN_EVOLUTION, now);
        const listasAntes = attentionLists(snapshot, now);

        // ── Asserção 1 (a central) — acrescentar uma Loja_Modelo não move nada.
        for (const posicao of posicoesDeInsercao(snapshot.stores.length)) {
          const comModelo = comLojaEm(snapshot, lojaModelo, posicao);

          // Igualdade profunda nas seis métricas, na evolução mensal inteira
          // (todos os 6 pontos, com mês, receita e contas) e nas cinco listas
          // (mesmos itens, mesma ordem, mesmos `href`).
          expect(businessHealth(comModelo, now)).toEqual(saudeAntes);
          expect(monthlyEvolution(comModelo, MONTHS_IN_EVOLUTION, now)).toEqual(evolucaoAntes);
          expect(attentionLists(comModelo, now)).toEqual(listasAntes);
        }

        // ── Asserção 2 — nenhuma métrica é negativa.
        expect(saudeAntes.monthRevenue).toBeGreaterThanOrEqual(0);
        expect(saudeAntes.activeSubscriptions).toBeGreaterThanOrEqual(0);
        expect(saudeAntes.trialsExpiring).toBeGreaterThanOrEqual(0);
        expect(saudeAntes.trialConversion).toBeGreaterThanOrEqual(0);
        expect(saudeAntes.publishedStores).toBeGreaterThanOrEqual(0);
        expect(saudeAntes.suspendedStores).toBeGreaterThanOrEqual(0);
        // Receita agregada finita: `asAmount` limita `NaN` e `Infinity` a zero.
        expect(Number.isFinite(saudeAntes.monthRevenue)).toBe(true);

        // ── Asserção 3 — a conversão fica em [0, 1].
        expect(saudeAntes.trialConversion).toBeLessThanOrEqual(1);

        // ── Asserção 4 — nenhuma contagem de Lojas excede as Lojas que não são
        // Loja_Modelo. Oráculo independente do módulo: conta as Lojas do
        // instantâneo com `isLojaModelo`, sem reutilizar nenhuma agregação.
        const lojasElegiveis = snapshot.stores.filter((loja) => !isLojaModelo(loja)).length;
        expect(saudeAntes.publishedStores).toBeLessThanOrEqual(lojasElegiveis);
        expect(saudeAntes.suspendedStores).toBeLessThanOrEqual(lojasElegiveis);
        expect(listasAntes.storesWithoutProducts.length).toBeLessThanOrEqual(lojasElegiveis);
        expect(listasAntes.storesUnpublished.length).toBeLessThanOrEqual(lojasElegiveis);

        // ── Evolução mensal (R7.3) — 6 pontos, do mais antigo para o mais
        // recente, sem valores negativos.
        expect(evolucaoAntes).toHaveLength(MONTHS_IN_EVOLUTION);
        for (const [i, ponto] of evolucaoAntes.entries()) {
          expect(ponto.revenue).toBeGreaterThanOrEqual(0);
          expect(ponto.accounts).toBeGreaterThanOrEqual(0);
          // As chaves têm o formato `"AAAA-MM"`, que ordena lexicograficamente
          // pela ordem cronológica: comparar com o ponto anterior fixa a ordem.
          const anterior = evolucaoAntes[i - 1];
          if (anterior !== undefined) expect(ponto.month > anterior.month).toBe(true);
        }

        // ── Ligação por item (R7.5) — todo o item de todas as listas tem `href`
        // não vazio, senão a linha da lista não resolve ação nenhuma.
        const itens = todosOsItens(listasAntes);
        for (const item of itens) {
          expect(typeof item.href).toBe("string");
          expect(item.href.trim()).not.toBe("");
        }

        if (
          saudeAntes.monthRevenue > 0 ||
          saudeAntes.activeSubscriptions > 0 ||
          saudeAntes.trialsExpiring > 0 ||
          saudeAntes.trialConversion > 0 ||
          saudeAntes.publishedStores > 0 ||
          saudeAntes.suspendedStores > 0
        ) {
          viuMetricaComValor = true;
        }
        if (itens.length > 0) viuListaComItens = true;
      }),
      { numRuns: 100 },
    );

    expect(viuMetricaComValor).toBe(true);
    expect(viuListaComItens).toBe(true);
  });
});

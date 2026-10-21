import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import { adminSnapshotArb, lojaModeloArb, type AdminSnapshot } from "./geradores.js";
import {
  attentionLists,
  businessHealth,
  isLojaModelo,
  monthlyEvolution,
  overviewKpis,
  MONTHS_IN_EVOLUTION,
  type AdminMetricsInput,
  type AttentionItem,
  type AttentionLists,
  type StoreLike,
  type VerificationLike,
} from "../src/services/adminMetrics.js";

/** Estados de verificação, pela ordem em que são atribuídos às lojas do instantâneo. */
const ESTADOS_DE_VERIFICACAO = ["pending", "approved", "rejected", "none", "PENDING"] as const;

/**
 * Pedidos de verificação derivados das lojas do instantâneo — um por loja, com
 * o estado a rodar por {@link ESTADOS_DE_VERIFICACAO} e a data de criação da
 * loja como data de envio (ausente e inválida incluídas).
 *
 * Não é um gerador: é uma função pura do instantâneo já gerado, para a
 * propriedade exercitar também a fila de aprovações sem acrescentar geradores
 * fora de `tests/geradores.ts`.
 */
function verificacoesDe(snapshot: AdminSnapshot): VerificationLike[] {
  return snapshot.stores.map((loja, i) => ({
    storeId: loja.id,
    status: ESTADOS_DE_VERIFICACAO[i % ESTADOS_DE_VERIFICACAO.length],
    submittedAt: loja.createdAt ?? null,
    storeName: loja.name ?? null,
    ownerEmail: loja.ownerEmail ?? null,
  }));
}

/**
 * Instantâneo igual ao dado, com uma loja acrescentada na posição `posicao` do
 * array de lojas — e, para a loja-modelo, um pedido de verificação em análise e
 * um levantamento pedido próprios, que também não podem mover nada.
 *
 * A posição é parâmetro e não «no fim» por uma razão concreta: uma exclusão
 * dependente da ordem de iteração passaria um teste que só inserisse no fim.
 */
function comLojaEm(input: AdminMetricsInput & { stores: readonly StoreLike[] }, loja: StoreLike, posicao: number): AdminMetricsInput {
  const stores = [...input.stores];
  stores.splice(posicao, 0, loja);
  return {
    ...input,
    stores,
    verifications: [
      ...(input.verifications ?? []),
      { storeId: loja.id, status: "pending", submittedAt: "2024-01-01T00:00:00.000Z", storeName: loja.name ?? null },
    ],
    withdrawals: [
      ...(input.withdrawals ?? []),
      { id: `lev-${loja.id}`, storeId: loja.id, status: "requested", amount: 1_000, createdAt: "2024-01-01T00:00:00.000Z" },
    ],
  };
}

/** As três posições de inserção: início, meio e fim do array de lojas. */
function posicoesDeInsercao(total: number): readonly number[] {
  return [0, Math.floor(total / 2), total];
}

/** Todos os itens das duas listas, numa só sequência. */
function todosOsItens(listas: AttentionLists): readonly AttentionItem[] {
  return [...listas.verificationsToReview, ...listas.withdrawalsToApprove];
}

describe("adminMetrics — métricas e listas da Visão geral do Painel_Admin (propriedade)", () => {
  it("ignora lojas-modelo em qualquer posição e mantém todas as métricas nos seus limites", () => {
    // Feature: melhorias-loja-e-admin, Property 5: Para qualquer conjunto de dados de admin, acrescentar uma Loja_Modelo não altera nenhuma métrica nem nenhuma lista, e todas as métricas se mantêm nos seus limites
    // **Validates: Requirements 7.2, 7.4, 7.8**

    // Guardas contra um teste que passe por trivialidade: se nenhuma amostra
    // tivesse métricas com valor ou listas com itens, a propriedade estaria a
    // comparar zeros com zeros e ninguém dava por isso.
    let viuMetricaComValor = false;
    let viuListaComItens = false;

    assertProperty(
      fc.property(adminSnapshotArb, lojaModeloArb, (snapshot, lojaModelo) => {
        // A loja acrescentada é, de facto, uma loja-modelo.
        expect(isLojaModelo(lojaModelo)).toBe(true);

        const input = { ...snapshot, verifications: verificacoesDe(snapshot) };

        // `now` vem dentro do instantâneo e é passado explicitamente: as funções
        // dependem do mês corrente e da janela de aviso, e sem momento fixo o
        // teste passaria hoje e falharia sozinho num 1 de janeiro.
        const { now } = snapshot;
        const saudeAntes = businessHealth(input, now);
        const kpisAntes = overviewKpis(input, now);
        const evolucaoAntes = monthlyEvolution(input, MONTHS_IN_EVOLUTION, now);
        const listasAntes = attentionLists(input, now);

        // ── Asserção 1 (a central) — acrescentar uma loja-modelo, com pedido de
        // verificação e levantamento próprios, não move nada.
        for (const posicao of posicoesDeInsercao(input.stores.length)) {
          const comModelo = comLojaEm(input, lojaModelo, posicao);

          expect(businessHealth(comModelo, now)).toEqual(saudeAntes);
          expect(overviewKpis(comModelo, now)).toEqual(kpisAntes);
          expect(monthlyEvolution(comModelo, MONTHS_IN_EVOLUTION, now)).toEqual(evolucaoAntes);
          expect(attentionLists(comModelo, now)).toEqual(listasAntes);
        }

        // ── Asserção 2 — nenhuma métrica é negativa, e a receita é finita.
        for (const valor of Object.values(saudeAntes)) expect(valor).toBeGreaterThanOrEqual(0);
        for (const valor of Object.values(kpisAntes)) expect(valor).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(saudeAntes.monthRevenue)).toBe(true);

        // ── Asserção 3 — os números da Visão geral são os da saúde do negócio e
        // os comprimentos das listas (os mesmos critérios, o mesmo âmbito).
        expect(kpisAntes.publishedStores).toBe(saudeAntes.publishedStores);
        expect(kpisAntes.suspendedStores).toBe(saudeAntes.suspendedStores);
        expect(kpisAntes.activeSubscriptions).toBe(saudeAntes.activeSubscriptions);
        expect(kpisAntes.monthRevenue).toBe(saudeAntes.monthRevenue);
        expect(kpisAntes.pendingVerifications).toBe(listasAntes.verificationsToReview.length);
        expect(kpisAntes.pendingWithdrawals).toBe(listasAntes.withdrawalsToApprove.length);

        // ── Asserção 4 — limites contra um oráculo independente do módulo.
        const lojasElegiveis = input.stores.filter((loja) => !isLojaModelo(loja)).length;
        const contasDeCliente = input.accounts.filter((conta) => conta.isAdmin !== true).length;
        expect(saudeAntes.publishedStores).toBeLessThanOrEqual(lojasElegiveis);
        // Uma loja suspensa é sempre uma loja publicada.
        expect(saudeAntes.suspendedStores).toBeLessThanOrEqual(saudeAntes.publishedStores);
        expect(kpisAntes.accounts).toBe(contasDeCliente);
        expect(saudeAntes.activeSubscriptions).toBeLessThanOrEqual(contasDeCliente);
        expect(saudeAntes.subscriptionsExpiring).toBeLessThanOrEqual(saudeAntes.activeSubscriptions);
        expect(kpisAntes.pendingVerifications).toBeLessThanOrEqual(lojasElegiveis);

        // ── Evolução mensal — 6 pontos, do mais antigo para o mais recente.
        expect(evolucaoAntes).toHaveLength(MONTHS_IN_EVOLUTION);
        for (const [i, ponto] of evolucaoAntes.entries()) {
          expect(ponto.revenue).toBeGreaterThanOrEqual(0);
          expect(ponto.accounts).toBeGreaterThanOrEqual(0);
          const anterior = evolucaoAntes[i - 1];
          if (anterior !== undefined) expect(ponto.month > anterior.month).toBe(true);
        }

        // ── Ligação por item — todo o item tem `href` não vazio.
        const itens = todosOsItens(listasAntes);
        for (const item of itens) {
          expect(typeof item.href).toBe("string");
          expect(item.href.trim()).not.toBe("");
        }

        if (Object.values(saudeAntes).some((v) => v > 0) || kpisAntes.accounts > 0) viuMetricaComValor = true;
        if (itens.length > 0) viuListaComItens = true;
      }),
      { numRuns: 100 },
    );

    expect(viuMetricaComValor).toBe(true);
    expect(viuListaComItens).toBe(true);
  });
});

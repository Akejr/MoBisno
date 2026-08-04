/**
 * Pré-visualização privada da loja (`resolveForOwner`).
 *
 * ## Porque existe este caminho
 *
 * Com o preço único, criar a loja e vê-la é grátis; a subscrição serve para a
 * publicar. Mas uma loja por publicar é invisível: `resolve` devolve
 * `not_found` para tudo o que não esteja «Publicada». Sem `resolveForOwner`, o
 * Dono construía às cegas e só via a loja depois de pagar — a ordem errada.
 *
 * ## O que estes exemplos guardam
 *
 * O risco de abrir uma porta é ela servir a mais gente do que devia. O que se
 * fixa é a fronteira: a loja aparece ao seu dono em qualquer estado, e a
 * ninguém mais em estado nenhum. E que a porta nova **não afrouxou a antiga** —
 * `resolve` continua a recusar rascunhos.
 *
 * ## Porque são exemplos e não uma propriedade
 *
 * A decisão cruza dois eixos pequenos e fechados: quem pede (dono, outra
 * pessoa, ninguém) e o estado da loja (rascunho, publicada). São seis casos
 * contáveis, e é a tabela inteira que interessa ver escrita.
 */
import { describe, it, expect } from "vitest";
import { createStorefrontResolver } from "../src/services/storefrontResolver.js";
import type { Store } from "../src/models/index.js";

const DONO = "dono-1";
const OUTRO = "dono-2";

function loja(state: Store["state"]): Store {
  return {
    id: "loja-1",
    ownerId: DONO,
    name: "Juddy Cosmetics",
    storeType: "Beleza",
    templateId: "lumiere",
    identifier: "juddy",
    subdomain: "juddy.sualoja.digital",
    state,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Resolvedor sobre uma única loja, com repositórios mínimos em memória. */
function resolvedorCom(store: Store | null) {
  return createStorefrontResolver({
    storeRepository: {
      findByIdentifier: async (id: string) => (store && store.identifier === id ? store : null),
    } as never,
    assetRepository: { findLogo: async () => null } as never,
    bannerRepository: { listByStore: async () => [] } as never,
    productRepository: { listByStore: async () => [] } as never,
  });
}

describe("resolveForOwner — a loja aparece ao dono, em qualquer estado", () => {
  it("mostra a loja em rascunho ao seu dono", () => {
    // É a razão de ser da pré-visualização: ver antes de publicar.
    return resolvedorCom(loja("Rascunho")).resolveForOwner("juddy", DONO).then((r) => {
      expect(r.kind).toBe("render");
    });
  });

  it("mostra também a loja já publicada ao seu dono", async () => {
    const r = await resolvedorCom(loja("Publicada")).resolveForOwner("juddy", DONO);
    expect(r.kind).toBe("render");
  });
});

describe("resolveForOwner — não aparece a mais ninguém", () => {
  it("recusa a loja de outra pessoa, mesmo publicada", async () => {
    const r = await resolvedorCom(loja("Publicada")).resolveForOwner("juddy", OUTRO);
    expect(r.kind).toBe("not_found");
  });

  it("recusa a loja de outra pessoa em rascunho", async () => {
    const r = await resolvedorCom(loja("Rascunho")).resolveForOwner("juddy", OUTRO);
    expect(r.kind).toBe("not_found");
  });

  it("recusa sem dono identificado", async () => {
    // Visitante sem sessão. Sem esta guarda, um identificador vazio podia
    // coincidir com um `ownerId` vazio numa linha malformada.
    for (const semDono of ["", null, undefined]) {
      const r = await resolvedorCom(loja("Rascunho")).resolveForOwner("juddy", semDono as unknown as string);
      expect(r.kind, String(semDono)).toBe("not_found");
    }
  });

  it("recusa um identificador que não existe", async () => {
    const r = await resolvedorCom(loja("Rascunho")).resolveForOwner("outra-loja", DONO);
    expect(r.kind).toBe("not_found");
  });
});

describe("resolve — a porta pública não afrouxou", () => {
  it("continua a recusar uma loja em rascunho", async () => {
    // A pré-visualização não pode ter aberto a loja por publicar ao público.
    const r = await resolvedorCom(loja("Rascunho")).resolve("juddy.mobisno.store");
    expect(r.kind).toBe("not_found");
  });

  it("continua a servir uma loja publicada", async () => {
    const r = await resolvedorCom(loja("Publicada")).resolve("juddy.mobisno.store");
    expect(r.kind).toBe("render");
  });
});

/**
 * Domínios da Plataforma e identificadores das lojas
 * (`src/services/domains.ts`, `src/services/identifierService.ts`).
 *
 * Duas avarias que estes testes guardam:
 *
 *  1. **O prefixo `modelo-` não estava reservado.** Uma loja `modelo-x` de um
 *     cliente desaparecia do próprio Dashboard dele, que esconde as
 *     lojas-modelo por este prefixo — e saía das métricas do Painel_Admin. O
 *     prefixo é agora da Plataforma em três sítios que têm de concordar: o
 *     serviço de identificadores (aqui), o Painel_Admin (`isLojaModelo`) e a
 *     base de dados (gatilho `stores_guard`, `tests/migrations.test.ts`).
 *  2. **Os acentos viravam hífenes.** «Café Ndombe» dava o endereço
 *     `caf-ndombe`. A normalização tira os acentos antes de substituir o resto.
 */
import { describe, it, expect } from "vitest";
import { assertPropertyAsync, assertProperty, fc } from "./helpers/property.js";
import {
  LEGACY_STORE_APEX, MODEL_STORE_PREFIX, PLATFORM_APEX, PLATFORM_CONTACT_EMAIL, STORE_APEX,
  isModelIdentifier, storePublicUrl,
} from "../src/services/domains.js";
import {
  DEFAULT_RESERVED_IDENTIFIERS, SUBDOMAIN_SUFFIX, createIdentifierService, isValidIdentifierFormat, normalizeIdentifier,
} from "../src/services/identifierService.js";
import { isLojaModelo } from "../src/services/adminMetrics.js";

describe("Domínios", () => {
  it("a Plataforma vive em mobisno.store e as lojas em sualoja.digital", () => {
    expect(PLATFORM_APEX).toBe("mobisno.store");
    expect(STORE_APEX).toBe("sualoja.digital");
  });

  it("o subdomínio gravado continua no domínio antigo (restrição stores_subdomain_coherent)", () => {
    expect(LEGACY_STORE_APEX).toBe("mobisno.store");
    expect(SUBDOMAIN_SUFFIX).toBe(`.${LEGACY_STORE_APEX}`);
  });

  it("storePublicUrl compõe o endereço público em https, no domínio das lojas", () => {
    expect(storePublicUrl("ekolo")).toBe("https://ekolo.sualoja.digital");
    expect(storePublicUrl("lumiere-chic")).toBe(`https://lumiere-chic.${STORE_APEX}`);
    const url = new URL(storePublicUrl("cafe-ndombe"));
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(`cafe-ndombe.${STORE_APEX}`);
  });

  it("o contacto da MôBisno é um email do domínio da Plataforma", () => {
    expect(PLATFORM_CONTACT_EMAIL).toBe(`geral@${PLATFORM_APEX}`);
    expect(PLATFORM_CONTACT_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/);
    expect(PLATFORM_CONTACT_EMAIL.split("@")[1]).toBe(PLATFORM_APEX);
  });
});

describe("Prefixo das lojas-modelo", () => {
  it("é «modelo-»", () => {
    expect(MODEL_STORE_PREFIX).toBe("modelo-");
  });

  it("isModelIdentifier reconhece o prefixo, sem olhar a maiúsculas", () => {
    for (const id of ["modelo-galeria", "modelo-lumiere-chic", "MODELO-X", "Modelo-x", "modelo-"]) {
      expect(isModelIdentifier(id), id).toBe(true);
    }
  });

  it("só o prefixo conta: no meio, sem hífen ou com outra palavra não é loja-modelo", () => {
    for (const id of ["modelo", "modelos-de-roupa", "loja-modelo-x", "o-modelo-x", "", " modelo-x"]) {
      expect(isModelIdentifier(id), JSON.stringify(id)).toBe(false);
    }
  });

  it("é total: o que não é texto não é loja-modelo", () => {
    for (const lixo of [null, undefined, 1, {}, ["modelo-x"], true]) {
      expect(isModelIdentifier(lixo), String(lixo)).toBe(false);
    }
  });

  it("o Painel_Admin reconhece as lojas-modelo pelo mesmo prefixo", () => {
    expect(isLojaModelo({ id: "1", identifier: "modelo-galeria" })).toBe(true);
    expect(isLojaModelo({ id: "2", identifier: "ekolo" })).toBe(false);
  });
});

describe("Um Dono não cria lojas com o prefixo reservado", () => {
  it("um identificador começado por «modelo-» nunca está disponível", async () => {
    const service = createIdentifierService();
    for (const id of ["modelo-galeria", "modelo-x", "MODELO-x", "modelo-1"]) {
      expect(await service.isAvailable(id), id).toBe(false);
    }
  });

  it("nem quando a base de dados diz que está livre — e nem lhe chega a perguntar", async () => {
    const perguntas: string[] = [];
    const service = createIdentifierService({
      isIdentifierTaken: async (id) => {
        perguntas.push(id);
        return false;
      },
    });
    expect(await service.isAvailable("modelo-lumiere")).toBe(false);
    expect(perguntas).toEqual([]);
    // Um identificador normal continua a ser perguntado e aceite.
    expect(await service.isAvailable("ekolo")).toBe(true);
    expect(perguntas).toEqual(["ekolo"]);
  });

  it("o nome «Modelo Lumière» normaliza para um identificador reservado", async () => {
    const service = createIdentifierService();
    const id = normalizeIdentifier("Modelo Lumière");
    expect(id).toBe("modelo-lumiere");
    expect(isValidIdentifierFormat(id)).toBe(true); // o formato é válido…
    expect(await service.isAvailable(id)).toBe(false); // …mas o endereço não é do Dono.
  });

  it("palavras parecidas continuam livres", async () => {
    const service = createIdentifierService();
    for (const id of ["modelo", "modelos-de-roupa", "super-modelo", "loja-modelo-x"]) {
      expect(await service.isAvailable(id), id).toBe(true);
    }
  });

  it("qualquer identificador com o prefixo é recusado, e sem o prefixo a regra não interfere (propriedade)", async () => {
    const segmento = fc.stringMatching(/^[a-z0-9]{1,10}$/);
    const sufixoArb = fc.array(segmento, { minLength: 1, maxLength: 4 }).map((s) => s.join("-"));
    await assertPropertyAsync(
      fc.asyncProperty(sufixoArb, async (sufixo) => {
        const service = createIdentifierService();
        expect(await service.isAvailable(`${MODEL_STORE_PREFIX}${sufixo}`)).toBe(false);
        if (!sufixo.startsWith(MODEL_STORE_PREFIX) && !DEFAULT_RESERVED_IDENTIFIERS.includes(sufixo)) {
          expect(await service.isAvailable(sufixo)).toBe(true);
        }
      }),
    );
  });
});

describe("Os acentos saem antes do resto (não viram hífenes)", () => {
  it("exemplos de nomes de lojas angolanas", () => {
    const casos: [string, string][] = [
      ["Café Ndombe", "cafe-ndombe"],
      ["Lumière Chic", "lumiere-chic"],
      ["Açaí Bar", "acai-bar"],
      ["São Tomé & Príncipe", "sao-tome-principe"],
      ["Pastelaria Benguela Ü", "pastelaria-benguela-u"],
      ["ÓTICA DO ZÉ", "otica-do-ze"],
    ];
    for (const [nome, id] of casos) expect(normalizeIdentifier(nome), nome).toBe(id);
  });

  /** Letras acentuadas do português e a letra de base de cada uma (tabela independente). */
  const BASE: Readonly<Record<string, string>> = {
    á: "a", à: "a", â: "a", ã: "a", é: "e", ê: "e", í: "i", ó: "o", ô: "o", õ: "o", ú: "u", ü: "u", ç: "c",
    Á: "A", À: "A", Â: "A", Ã: "A", É: "E", Ê: "E", Í: "I", Ó: "O", Ô: "O", Õ: "O", Ú: "U", Ç: "C",
  };

  it("um nome com acentos dá o mesmo identificador que o mesmo nome sem eles (propriedade)", () => {
    const letra = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -&".split(""), ...Object.keys(BASE));
    assertProperty(
      fc.property(fc.array(letra, { minLength: 1, maxLength: 40 }), (letras) => {
        const nome = letras.join("");
        const semAcentos = letras.map((l) => BASE[l] ?? l).join("");
        expect(normalizeIdentifier(nome)).toBe(normalizeIdentifier(semAcentos));
        expect(normalizeIdentifier(nome)).toMatch(/^[a-z0-9-]*$/);
      }),
    );
  });
});

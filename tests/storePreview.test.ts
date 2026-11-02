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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createStorefrontResolver } from "../src/services/storefrontResolver.js";
import type { Store } from "../src/models/index.js";

const ROOT = join(__dirname, "..");
const ler = (p: string): string => readFileSync(join(ROOT, p), "utf8");

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

describe("resolveForAdmin — a Administração vê qualquer loja", () => {
  /**
   * O Administrador aprovava pagamentos, ativava subscrições e respondia por
   * lojas que não conseguia ver: o endereço público recusa um rascunho e o
   * editor mostra a loja com as ferramentas por cima, não o que o cliente vê.
   *
   * Esta porta é **separada** de `resolveForOwner` de propósito. Relaxar a
   * comparação de dono lá dentro abriria a loja de todos a todos; aqui não há
   * dono para comparar, e quem chama é que confirma a sessão de Administrador.
   */
  it("abre a loja de outra pessoa, em rascunho e publicada", async () => {
    for (const estado of ["Rascunho", "Publicada"] as const) {
      const r = await resolvedorCom(loja(estado)).resolveForAdmin("juddy");
      expect(r.kind, estado).toBe("render");
    }
  });

  it("recusa o que não existe, sem lançar", async () => {
    for (const id of ["outra-loja", "", null, undefined]) {
      const r = await resolvedorCom(loja("Rascunho")).resolveForAdmin(id as unknown as string);
      expect(r.kind, String(id)).toBe("not_found");
    }
  });

  it("quem a abre confirma primeiro que é Administrador", () => {
    // A porta não verifica nada: a verificação vive em quem chama, e é por isso
    // que estes dois sítios têm de a fazer.
    const VISTA = ler("web/views/storePreview.ts");
    const CACHE = ler("web/lib/storeCache.ts");
    expect(VISTA).toContain("isCurrentUserAdmin()");
    expect(CACHE).toContain("isCurrentUserAdmin()");
    // E só se pergunta quando a loja NÃO é de quem está a ver: o Dono a ver a
    // loja dele não paga a consulta.
    const i = VISTA.indexOf("let loaded = await loadStorePreview(identifier, ownerId)");
    expect(i).toBeGreaterThan(0);
    expect(VISTA.slice(i, VISTA.indexOf("isCurrentUserAdmin()", i))).toContain('loaded.result.kind !== "render"');
  });
});

describe("Pré-visualizar uma loja — um endereço só, e um botão na Administração", () => {
  const STORES = ler("web/views/admin/stores.ts");

  it("o caminho da pré-visualização é montado num sítio só", () => {
    expect(ler("web/lib/routing.ts")).toContain("export function storePreviewPath(");
    expect(ler("web/views/dashboard.ts")).toContain("storePreviewPath(store.identifier)");
    expect(STORES).toContain("storePreviewPath(s.identifier)");
    // Ninguém volta a escrevê-lo à mão: era assim em dois ficheiros.
    for (const f of ["web/views/dashboard.ts", "web/views/admin/stores.ts", "web/views/dashboard/markup.ts"]) {
      expect(ler(f), `${f} monta o caminho à mão`).not.toMatch(/["'`]\/previsualizar\//);
    }
  });

  it("cada linha de «Lojas» tem o botão, só com ícone, e abre noutro separador", () => {
    expect(STORES).toContain('iconButton({ act: "preview"');
    expect(STORES).toContain("Pré-visualizar a loja ${name}");
    expect(STORES).toContain('window.open(storePreviewPath(s.identifier), "_blank", "noopener")');
  });

  it("a faixa do topo distingue a pré-visualização de administração da do Dono", () => {
    const VISTA = ler("web/views/storePreview.ts");
    expect(VISTA).toContain("Pré-visualização de administração");
    // «Ativar subscrição» é do Dono: ao Administrador levava-o ao plano da conta errada.
    expect(VISTA).toContain('${o.publicada || o.admin ? "" : `<a href="#/painel/plano"');
    expect(VISTA).toContain("Voltar à Administração");
  });
});

describe("Dentro da pré-visualização, as ligações levam a algum lado", () => {
  /**
   * No `iframe` de uma pré-visualização as ligações estavam mortas por desenho
   * (`<base target="_blank">` e `sandbox` sem janelas novas): tocar em
   * «Produtos» não fazia nada. A página de cima passa a ler o clique e a trocar
   * o documento, como já fazia a galeria de modelos.
   */
  const SHOWCASE = ler("web/lib/storeShowcase.ts");

  it("a página de cima lê o clique e troca a página", () => {
    expect(SHOWCASE).toContain("function bindStoreNavigation(");
    expect(SHOWCASE).toContain("frame.contentDocument");
    expect(SHOWCASE).toContain('frame.addEventListener("load", () => bindStoreNavigation(frame, mostrar))');
    // Precisa de ler o documento, logo de `sameOrigin`. Que continue sem
    // scripts é guardado por `tests/previewSandbox.test.ts`, que vale para
    // todos os ficheiros de `web/` e ignora os comentários.
    expect(SHOWCASE).toContain("{ sameOrigin: true }");
  });

  it("reconhece produto, categoria, carrinho e o resto", () => {
    const fn = SHOWCASE.slice(SHOWCASE.indexOf("function bindStoreNavigation("));
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).toContain("/\\/produto\\/(.+)$/");
    expect(corpo).toContain("/\\/categoria\\/([^/?#]+)/");
    expect(corpo).toContain("/\\/(carrinho|checkout)/");
    expect(corpo).toContain('go({ type: "home" })');
    // O carrinho não abre, e diz-se em vez de não acontecer nada.
    expect(SHOWCASE).toContain("O carrinho fica para a loja a sério");
    // E há como voltar ao início da loja.
    expect(SHOWCASE).toContain("Início da loja");
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

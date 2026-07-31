/**
 * Diretório público de lojas (`mobisno.store/lojas`).
 *
 * Existe por uma razão de SEO concreta: cada loja nova vive num subdomínio
 * acabado de criar, sem uma única ligação a apontar-lhe. Um subdomínio órfão
 * não é descoberto pelo Google nem recebe autoridade, por muito bem otimizado
 * que esteja. Esta página, num domínio já indexado, dá a cada loja uma ligação
 * normal (seguida pelos rastreadores) e um ponto de entrada estável.
 *
 * O HTML equivalente é também gerado no servidor (`api/prerender.js` →
 * `renderDirectory`), para os rastreadores que não executam JavaScript.
 */
import { render, esc, fadeInImages } from "../lib/dom.js";
import { supabase } from "../supabase/client.js";
import { applySeo } from "../lib/seo.js";
import { collectionJsonLd, breadcrumbJsonLd, truncate, PLATFORM_NAME } from "../../src/services/seo.js";
import { STORE_APEX, PLATFORM_APEX } from "../lib/routing.js";

interface DirectoryStore {
  name: string;
  identifier: string;
  store_type: string | null;
}

/** Lojas publicadas e com conta ativa (a política RLS já filtra as suspensas). */
async function listPublishedStores(): Promise<DirectoryStore[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("name, identifier, store_type")
    .eq("state", "Publicada")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("stores.directory", error);
    return [];
  }
  return (data ?? []) as DirectoryStore[];
}

function storeCard(s: DirectoryStore): string {
  const url = `https://${encodeURIComponent(s.identifier)}.${STORE_APEX}/`;
  const tipo = s.store_type
    ? `<span class="text-label-sm text-on-surface-variant">${esc(s.store_type)}</span>`
    : "";
  return `
    <a href="${esc(url)}" class="group block rounded-2xl border border-outline-variant p-5 hover:border-primary transition-colors">
      <h2 class="text-title-md text-on-surface group-hover:text-primary transition-colors">${esc(s.name)}</h2>
      ${tipo}
      <p class="text-label-sm text-on-surface-variant mt-2 truncate">${esc(s.identifier)}.${STORE_APEX}</p>
    </a>`;
}

export async function renderDirectory(): Promise<void> {
  const stores = await listPublishedStores();
  const canonical = `https://${PLATFORM_APEX}/lojas`;
  const description = truncate(
    `${stores.length} lojas online angolanas criadas com a MôBisno. Compre em Kwanzas com Multicaixa Express, Referência Bancária ou WhatsApp, com entrega em Luanda e em todo o país.`,
    160,
  );

  const list = stores.length
    ? `<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${stores.map(storeCard).join("")}</div>`
    : `<p class="text-body-lg text-on-surface-variant">Ainda não há lojas publicadas.</p>`;

  const app = render(`
    <main class="max-w-6xl mx-auto px-5 py-14">
      <nav class="text-label-sm text-on-surface-variant mb-6">
        <a href="/" class="hover:text-primary">MôBisno</a> › Lojas
      </nav>
      <h1 class="text-display-sm font-black tracking-tight text-on-surface">Lojas online em Angola</h1>
      <p class="text-body-lg text-on-surface-variant mt-3 max-w-2xl">${esc(description)}</p>
      <a href="/criar" class="inline-block bg-primary text-on-primary px-6 py-3 rounded-full mt-6">Criar a minha loja</a>
      <section class="mt-12">${list}</section>
    </main>`);
  fadeInImages(app);

  applySeo({
    title: "Lojas Online em Angola — Diretório MôBisno",
    description,
    canonical,
    type: "website",
    siteName: PLATFORM_NAME,
    jsonLd: [
      collectionJsonLd({
        name: "Lojas online em Angola",
        url: canonical,
        description,
        items: stores.map((s) => ({
          name: s.name,
          url: `https://${s.identifier}.${STORE_APEX}/`,
        })),
      }),
      breadcrumbJsonLd([
        { name: PLATFORM_NAME, url: `https://${PLATFORM_APEX}/` },
        { name: "Lojas", url: canonical },
      ]),
    ],
  });
}

/**
 * Lojas-modelo (presets editáveis) — geridas pelo admin na secção "Modelos".
 *
 * Um modelo é uma LOJA REAL, propriedade do admin, publicada (para que a
 * galeria a consiga ler publicamente) e marcada com `customization.__template`.
 * O admin edita-a com o mesmo editor do site. Ao aplicar um modelo à loja de um
 * cliente, copiamos apenas a customização (não os produtos) e marcamos a loja
 * como bloqueada (`__locked`) para restringir a edição a textos/fotos/cores.
 */
import { supabase } from "./client.js";
import { storeRepository, productRepository } from "../composition.js";
import { saveCustomization } from "./customization.js";
import { SUBDOMAIN_SUFFIX, normalizeIdentifier } from "../../src/services/identifierService.js";
import { TEMPLATE_PRESETS } from "../templates/presets.js";
import type { Store } from "../../src/models/index.js";
import type { StoreCustomization } from "../templates/types.js";

/** Produto de exemplo (fictício) semeado numa loja-modelo. */
export interface DemoProductInput {
  name: string;
  price: number;
  category: string;
  featured?: boolean;
  description?: string;
  imageUrl: string;
}

/** Um modelo pronto, apoiado numa loja real do admin. */
export interface TemplateModel {
  storeId: string;
  ownerId: string;
  identifier: string;
  name: string;
  description: string;
  templateId: string;
  customization: StoreCustomization;
}

interface StoreRow {
  id: string;
  owner_id: string;
  identifier: string;
  name: string;
  template_id: string;
  customization: (StoreCustomization & { __template?: { id: string; name: string; description: string } }) | null;
}

function toModel(s: StoreRow): TemplateModel {
  const t = s.customization?.__template;
  return {
    storeId: s.id,
    ownerId: s.owner_id,
    identifier: s.identifier,
    name: t?.name ?? s.name,
    description: t?.description ?? "",
    templateId: s.template_id,
    customization: (s.customization ?? {}) as StoreCustomization,
  };
}

/**
 * Lista as lojas-modelo. O admin (RLS total) vê todas; um cliente autenticado
 * vê apenas as publicadas (que é o que a galeria precisa).
 */
export async function listTemplateModels(): Promise<TemplateModel[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, owner_id, identifier, name, template_id, customization, created_at")
    .order("created_at");
  if (error) {
    console.error("listTemplateModels", error);
    return [];
  }
  return (data as StoreRow[] | null ?? [])
    .filter((s) => s.customization?.__template)
    .map(toModel);
}

/** Base de customização para um modelo novo (parte do preset recomendado). */
function starterCustomization(): StoreCustomization {
  const base = TEMPLATE_PRESETS[0]?.customization;
  return base ? JSON.parse(JSON.stringify(base)) as StoreCustomization : {};
}

/** Cria uma loja-modelo (publicada) propriedade do admin. */
export async function createTemplateModel(
  adminId: string,
  name: string,
  description: string,
  base?: StoreCustomization,
  templateId = "galeria",
  products?: DemoProductInput[],
): Promise<TemplateModel | null> {
  const slug = (normalizeIdentifier(name) || "modelo").slice(0, 40).replace(/-+$/, "") || "modelo";
  let identifier = `modelo-${slug}`;
  let n = 1;
  while (await storeRepository.isIdentifierTaken(identifier)) {
    n += 1;
    identifier = `modelo-${slug}-${n}`;
    if (n > 50) { identifier = `modelo-${Date.now().toString(36)}`; break; }
  }

  const store: Store = {
    id: crypto.randomUUID(),
    ownerId: adminId,
    name,
    storeType: "Outro",
    templateId,
    identifier,
    subdomain: `${identifier}${SUBDOMAIN_SUFFIX}`,
    state: "Publicada",
    createdAt: new Date().toISOString(),
  };

  const created = await storeRepository.create(store);
  if (!created.ok) {
    console.error("createTemplateModel", created.error);
    return null;
  }

  const source = base ? JSON.parse(JSON.stringify(base)) as StoreCustomization : starterCustomization();
  const customization: StoreCustomization = {
    ...source,
    __template: { id: created.value.id, name, description },
  };
  const ok = await saveCustomization(adminId, created.value.id, customization);
  if (!ok) return null;

  // Semeia os produtos fictícios (para o preview do modelo ficar completo).
  if (products && products.length) {
    for (const p of products) {
      try {
        await productRepository.create(created.value.id, {
          id: crypto.randomUUID(),
          storeId: created.value.id,
          name: p.name,
          description: p.description ?? "",
          category: p.category,
          featured: p.featured === true,
          physical: true,
          price: p.price,
          imageUrl: p.imageUrl,
          available: true,
          stock: null,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("createTemplateModel:product", e);
      }
    }
  }

  return { storeId: created.value.id, ownerId: adminId, identifier, name, description, templateId, customization };
}

/** Customização base do modelo "Lumière Chic". */
function lumiereBase(): StoreCustomization {
  return {
    colors: { primary: "#1c1b1b", text: "#1c1b1b" },
    theme: { style: "editorial" },
    hero: {
      title: "A essência do luxo silencioso.",
      subtitle: "Descubra a nossa coleção botânica, formulada com extratos raros para revelar o seu brilho natural.",
      ctaLabel: "Explorar coleção",
    },
    footer: {
      about: "Elevamos o ritual da beleza através do luxo minimalista e de botânicos potentes.",
      location: "Luanda, Angola",
    },
    testimonials: [
      { quote: "A textura é uma experiência de calma no meu ritual diário. Verdadeiramente transformadora.", author: "Amélia R.", role: "Cliente verificada" },
      { quote: "A minha pele nunca esteve tão luminosa. Um ritual que espero todas as noites.", author: "Beatriz L.", role: "Cliente verificada" },
      { quote: "Elegância e eficácia num só produto. Passou a ser essencial na minha rotina.", author: "Carla M.", role: "Cliente VIP" },
    ],
  };
}

/** Modelos de fábrica que o admin pode importar como lojas-modelo editáveis. */
export interface FactoryModel { name: string; description: string; templateId: string; base: StoreCustomization; products: DemoProductInput[]; }

const LUMIERE_PRODUCTS: DemoProductInput[] = [
  { name: "Crème de la Nuit", price: 45000, category: "Cuidado", featured: true, description: "Tratamento de noite rico que renova a pele.", imageUrl: "https://images.unsplash.com/photo-1631730359585-38a4935cbec4?q=80&w=600" },
  { name: "Sérum Botânico", price: 38000, category: "Cuidado", description: "Sérum iluminador com extratos raros.", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=600" },
  { name: "Tónico de Essência", price: 22000, category: "Cuidado", description: "Hidratação e equilíbrio diários.", imageUrl: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?q=80&w=600" },
  { name: "Óleo Dourado", price: 52000, category: "Ritual", featured: true, description: "Óleo facial nutritivo e protetor.", imageUrl: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?q=80&w=600" },
  { name: "Esfoliante Radiance", price: 28000, category: "Ritual", description: "Esfoliação suave para uma pele luminosa.", imageUrl: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?q=80&w=600" },
  { name: "Máscara Hidratante", price: 31000, category: "Ritual", description: "Máscara reconfortante de uso semanal.", imageUrl: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?q=80&w=600" },
];

const VERMELHO_PRODUCTS: DemoProductInput[] = [
  { name: "Vestido Elegante", price: 12500, category: "Vestidos", featured: true, description: "Corte moderno para ocasiões especiais.", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?q=80&w=600" },
  { name: "Bolsa de Couro", price: 18900, category: "Acessórios", description: "Bolsa versátil de couro genuíno.", imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=600" },
  { name: "Ténis Casual", price: 15000, category: "Calçado", description: "Conforto para o dia a dia.", imageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=600" },
  { name: "Óculos de Sol", price: 8500, category: "Acessórios", description: "Proteção com estilo.", imageUrl: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?q=80&w=600" },
  { name: "Camisa Clássica", price: 9900, category: "Vestidos", description: "Peça essencial no guarda-roupa.", imageUrl: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=600" },
  { name: "Relógio Moderno", price: 24000, category: "Acessórios", featured: true, description: "Design minimalista e elegante.", imageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?q=80&w=600" },
];

export function defaultFactoryModels(): FactoryModel[] {
  const vermelho = TEMPLATE_PRESETS[0];
  const out: FactoryModel[] = [];
  if (vermelho) out.push({ name: vermelho.name, description: vermelho.description, templateId: "galeria", base: vermelho.customization, products: VERMELHO_PRODUCTS });
  out.push({ name: "Lumière Chic", description: "Luxo minimalista para beleza e cosmética — tipografia editorial e tons creme.", templateId: "lumiere", base: lumiereBase(), products: LUMIERE_PRODUCTS });
  return out;
}

/**
 * Semeia os modelos de fábrica como lojas-modelo editáveis (com produtos
 * fictícios), ignorando os que já existem (pelo nome). Devolve quantos criou.
 */
export async function seedDefaultModels(adminId: string): Promise<number> {
  const existing = await listTemplateModels();
  const existingNames = new Set(existing.map((m) => m.name.trim().toLowerCase()));
  let created = 0;
  for (const fm of defaultFactoryModels()) {
    if (existingNames.has(fm.name.trim().toLowerCase())) continue;
    const model = await createTemplateModel(adminId, fm.name, fm.description, fm.base, fm.templateId, fm.products);
    if (model) created += 1;
  }
  return created;
}

/** Apaga uma loja-modelo (admin). Remove em cascata produtos/banners/assets. */
export async function deleteTemplateModel(storeId: string): Promise<boolean> {
  const { error } = await supabase.from("stores").delete().eq("id", storeId);
  if (error) console.error("deleteTemplateModel", error);
  return !error;
}

/**
 * Aplica um modelo à loja de um cliente: copia SÓ a customização (sem produtos),
 * atualiza o template visual da loja, remove a marca de modelo e bloqueia a
 * edição estrutural (`__locked`).
 */
export async function applyModelToStore(
  ownerId: string,
  storeId: string,
  model: TemplateModel,
): Promise<boolean> {
  const applied: StoreCustomization = JSON.parse(JSON.stringify(model.customization));
  delete (applied as { __template?: unknown }).__template;
  applied.__basedOn = model.storeId;
  applied.__locked = true;
  const { error } = await supabase
    .from("stores")
    .update({ template_id: model.templateId, customization: applied })
    .eq("id", storeId)
    .eq("owner_id", ownerId);
  if (error) { console.error("applyModelToStore", error); return false; }
  return true;
}

/** Aplica uma customização crua + template a uma loja (usado pela reserva estática). */
export async function applyRawToStore(
  ownerId: string,
  storeId: string,
  templateId: string,
  customization: StoreCustomization,
): Promise<boolean> {
  const applied: StoreCustomization = JSON.parse(JSON.stringify(customization));
  delete (applied as { __template?: unknown }).__template;
  applied.__locked = true;
  const { error } = await supabase
    .from("stores")
    .update({ template_id: templateId, customization: applied })
    .eq("id", storeId)
    .eq("owner_id", ownerId);
  if (error) { console.error("applyRawToStore", error); return false; }
  return true;
}

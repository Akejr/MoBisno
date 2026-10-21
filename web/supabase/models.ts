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

/**
 * Versão do conteúdo de fábrica. Ao subir este número, os modelos de fábrica já
 * importados são re-sincronizados (customização) na próxima vez que o admin
 * abre a secção "Modelos" — sem precisar de apagar/reimportar à mão.
 */
const MODEL_VERSION = 3;

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
  /**
   * O `stores.name` tal como está gravado, antes de `__template.name` o
   * substituir em `name`. Guardado para o Semeador poder comparar a grafia
   * gravada com a do modelo de fábrica (R1.1): sem isto, uma loja-modelo com
   * `__template.name` já corrigido mas `stores.name` na grafia antiga passaria
   * por igual.
   */
  storeName?: string;
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
    storeName: s.name,
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
  // Uma loja-modelo não finge pagamentos digitais: como qualquer loja, mostra-os
  // só quando `digitalPaymentsVisible(store)` o diz (coluna
  // `stores.digital_payments`, `src/services/paymentVisibility.ts`).
  const customization: StoreCustomization = {
    ...source,
    __template: { id: created.value.id, name, description },
    __v: MODEL_VERSION,
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

  return { storeId: created.value.id, ownerId: adminId, identifier, name, storeName: name, description, templateId, customization };
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

/**
 * Customização base do modelo "Tech Essentials".
 *
 * Todo o texto em português de Portugal: a loja-modelo é o que o visitante vê na
 * galeria de modelos e na pré-visualização, e é a partir dela que o Dono começa
 * a escrever a sua. Um texto em inglês aqui aparecia na loja dele.
 */
function techEssentialsBase(): StoreCustomization {
  return {
    colors: { primary: "#0058be", text: "#0b1c30" },
    theme: { style: "moderno" },
    hero: {
      title: "Tecnologia que trabalha para si.",
      subtitle: "Equipamento escolhido a dedo, com garantia e entrega em toda Angola. Compre com a confiança de quem conhece o que vende.",
      ctaLabel: "Ver produtos",
    },
    footer: {
      about: "Equipamento electrónico para quem trabalha e joga a sério. Garantia, apoio e entrega em toda Angola.",
      location: "Luanda, Angola",
    },
    productPerks: [
      { icon: "verified", text: "Garantia de 12 meses em todos os equipamentos" },
      { icon: "local_shipping", text: "Entrega em Luanda em 24 a 48 horas" },
      { icon: "support_agent", text: "Apoio técnico pelo WhatsApp antes e depois da compra" },
    ],
    /*
     * As marcas da faixa **não** vêm daqui: os quatro logótipos por omissão
     * vivem no próprio modelo (`defaultTechBrands` em
     * `web/templates/techEssentials.ts`). Estavam nesta base, e por isso não
     * apareciam na galeria de modelos nem na pré-visualização, que desenham o
     * modelo com uma personalização vazia — tal como uma loja acabada de criar.
     */
  };
}

const TECH_PRODUCTS: DemoProductInput[] = [
  { name: "Portátil NexusBook 14", price: 1250000, category: "Portáteis", featured: true, description: "Ecrã de 14 polegadas, 16 GB de memória e 512 GB de armazenamento. Leve o suficiente para levar todos os dias.", imageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600" },
  { name: "Auscultadores Aura ANC", price: 285000, category: "Áudio", featured: true, description: "Cancelamento de ruído activo e 30 horas de bateria. Para trabalhar em qualquer sítio.", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600" },
  { name: "Relógio Chrono Série 5", price: 245000, category: "Vestíveis", description: "Medição de actividade e notificações no pulso, com bracelete de titânio.", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600" },
  { name: "Telefone Nexa Pro", price: 820000, category: "Telefones", featured: true, description: "Câmara tripla, ecrã de 120 Hz e bateria para o dia inteiro.", imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600" },
  { name: "Teclado Mecânico Compacto", price: 95000, category: "Acessórios", description: "Formato de 65%, retroiluminação e ligação sem fios.", imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?q=80&w=600" },
  { name: "Rato Sem Fios Precision", price: 48000, category: "Acessórios", description: "Sensor de 8000 DPI e silencioso ao clique.", imageUrl: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=600" },
  { name: "Monitor 27\" 4K", price: 690000, category: "Monitores", description: "Painel IPS de 27 polegadas com cobertura de cor para trabalho gráfico.", imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=600" },
  { name: "Coluna Portátil Sonic Mini", price: 72000, category: "Áudio", description: "Resistente à água, com 12 horas de música.", imageUrl: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?q=80&w=600" },
];

/** Modelos de fábrica que o admin pode importar como lojas-modelo editáveis. */
export interface FactoryModel {
  name: string;
  description: string;
  templateId: string;
  base: StoreCustomization;
  products: DemoProductInput[];
  /**
   * Nomes por que este modelo de fábrica já se chamou. O Semeador emparelha as
   * lojas-modelo existentes pelo nome, por isso renomear um modelo de fábrica
   * sem declarar aqui o nome antigo levaria à criação de uma segunda
   * loja-modelo do mesmo modelo. Com o nome antigo declarado, o Semeador
   * reconhece a loja-modelo já existente e renomeia-a.
   */
  previousNames?: string[];
}

/** Chave de comparação de nomes de modelo (insensível a caixa e a espaços). */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Nome atual e nomes anteriores de um modelo de fábrica, já em chave comparável.
 * Usado pelo Semeador e pela deteção de modelos «em falta» do painel de
 * administração, para os dois concordarem no que conta como já existente.
 */
export function factoryModelNameKeys(fm: FactoryModel): string[] {
  return [fm.name, ...(fm.previousNames ?? [])].map(nameKey);
}

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
  // O preset `vermelho-moderno` já se apresentou como «Vermelho Moderno» e como
  // «Ekolo sports»; apresenta-se agora como «Ekolo Sports» (R1.1). TODOS os
  // nomes anteriores ficam declarados, do mais recente para o mais antigo, para
  // o Semeador renomear a loja-modelo já existente em vez de criar outra.
  if (vermelho) out.push({ name: vermelho.name, description: vermelho.description, templateId: "galeria", base: vermelho.customization, products: VERMELHO_PRODUCTS, previousNames: ["Ekolo sports", "Vermelho Moderno"] });
  out.push({ name: "Lumière Chic", description: "Luxo minimalista para beleza e cosmética — tipografia editorial e tons creme.", templateId: "lumiere", base: lumiereBase(), products: LUMIERE_PRODUCTS });
  out.push({ name: "Tech Essentials", description: "Minimalismo moderno para electrónica e informática — muito espaço branco, cartões limpos e azul eléctrico nas acções.", templateId: "tech-essentials", base: techEssentialsBase(), products: TECH_PRODUCTS });
  // Os dois modelos que saíram do registo (o escuro e a mercearia) saíram também
  // desta lista (R1.5): o Semeador deixa de os saber criar ou recriar, e é isso
  // que torna definitiva a eliminação feita pelo administrador. Sem esta
  // remoção, a deteção de modelo «em falta» do painel voltava a semeá-los logo
  // após a eliminação.
  return out;
}

/**
 * Verdadeiro quando a loja-modelo encontrada está gravada com uma grafia
 * diferente da do modelo de fábrica. A comparação é de cadeias **exatas**, não
 * normalizada: `nameKey` ignora a caixa, logo «Ekolo sports» e «Ekolo Sports»
 * emparelham, e sem esta verificação a loja-modelo continuaria a apresentar-se
 * com a grafia antiga no painel de administração e na galeria (R1.1).
 *
 * Compara o nome apresentado (`__template.name ?? stores.name`) e também o
 * `stores.name` gravado, porque os dois chegam a ecrãs diferentes.
 */
function storedNameDiffers(model: TemplateModel, name: string): boolean {
  return model.name !== name || (model.storeName !== undefined && model.storeName !== name);
}

/**
 * Resolve a loja-modelo que corresponde a um modelo de fábrica.
 *
 * Procura primeiro pelo nome atual e SÓ depois, se não existir nenhuma com o
 * nome atual, pelos nomes anteriores. Esta ordem é a guarda que impede duas
 * lojas-modelo com o mesmo nome: quando já existe uma com o nome atual, o ramo
 * de nome anterior não corre e nada é renomeado — a loja-modelo com o nome
 * antigo fica como está e a decisão de qual manter é do administrador.
 *
 * A loja-modelo emparelhada pelo nome atual pede renomeação apenas quando a
 * grafia gravada difere: é a mesma loja-modelo a ser reescrita no lugar, sem
 * tocar na ordem de procura, logo não há como surgir uma segunda com o mesmo
 * nome. Com a grafia já corrigida devolve `false` e nada é escrito.
 */
function resolveExistingModel(
  byName: ReadonlyMap<string, TemplateModel>,
  fm: FactoryModel,
): { model: TemplateModel; renameNeeded: boolean } | null {
  const current = byName.get(nameKey(fm.name));
  if (current) return { model: current, renameNeeded: storedNameDiffers(current, fm.name) };
  for (const previous of fm.previousNames ?? []) {
    const older = byName.get(nameKey(previous));
    if (older) return { model: older, renameNeeded: true };
  }
  return null;
}

/**
 * Renomeia uma loja-modelo existente: escreve `stores.name` e o nome
 * apresentado em `customization.__template.name` — que é o nome que
 * `listTemplateModels` (via `toModel`) mostra ao administrador e à galeria.
 * Não apaga nada e não toca em mais nenhum campo da personalização.
 */
async function renameTemplateModel(adminId: string, model: TemplateModel, name: string): Promise<boolean> {
  const customization: StoreCustomization = { ...model.customization };
  const tpl = customization.__template;
  if (tpl) customization.__template = { ...tpl, name };
  const { error } = await supabase
    .from("stores")
    .update({ name, customization })
    .eq("id", model.storeId)
    .eq("owner_id", adminId);
  if (error) { console.error("renameTemplateModel", error); return false; }
  // Mantém a cópia em memória coerente: o ramo de re-sincronização que segue
  // preserva `__template` tal como está, e tem de preservar já o nome novo.
  model.name = name;
  model.storeName = name;
  model.customization = customization;
  return true;
}

/**
 * Semeia os modelos de fábrica como lojas-modelo editáveis (com produtos
 * fictícios), ignorando os que já existem. O emparelhamento é pelo nome atual
 * do modelo de fábrica e, em falta desse, pelos nomes anteriores — nesse caso a
 * loja-modelo existente é renomeada em vez de se criar uma segunda. A
 * renomeação corre também quando o emparelhamento é pelo nome atual mas a
 * grafia gravada difere (ex.: «Ekolo sports» → «Ekolo Sports»). Devolve quantas
 * criou.
 */
export async function seedDefaultModels(adminId: string): Promise<number> {
  const existing = await listTemplateModels();
  const byName = new Map(existing.map((m) => [nameKey(m.name), m]));
  let created = 0;
  for (const fm of defaultFactoryModels()) {
    const match = resolveExistingModel(byName, fm);
    if (match) {
      const found = match.model;
      if (match.renameNeeded) {
        const previousKey = nameKey(found.name);
        // Sem renomeação não há emparelhamento fiável: não se cria nada, para
        // não duplicar a loja-modelo por causa de uma escrita falhada.
        if (!(await renameTemplateModel(adminId, found, fm.name))) continue;
        byName.delete(previousKey);
        byName.set(nameKey(fm.name), found);
      }
      // Já existe: re-sincroniza a customização se estiver numa versão antiga.
      if ((found.customization.__v ?? 1) !== MODEL_VERSION) {
        const refreshed: StoreCustomization = {
          ...(JSON.parse(JSON.stringify(fm.base)) as StoreCustomization),
          __template: found.customization.__template ?? { id: found.storeId, name: fm.name, description: fm.description },
          __v: MODEL_VERSION,
        };
        await saveCustomization(adminId, found.storeId, refreshed);
      }
      continue;
    }
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
  // Os pagamentos digitais não vêm na Personalização: a loja do cliente mostra-os
  // só quando `stores.digital_payments` (dela) o permite. Nada a limpar aqui.
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

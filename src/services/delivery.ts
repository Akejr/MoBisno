/**
 * Entrega de uma encomenda — onde se entrega e a quem.
 *
 * Domínio puro (sem DOM, sem Supabase), em duas partes:
 *
 *  1. **onde**: as áreas de Luanda, a taxa de cada uma e a entrega grátis a
 *     partir de um valor — a configuração do Dono em `custom.delivery`;
 *  2. **a quem**: os dados que o comprador escreve no checkout (nome,
 *     telemóvel, email, NIF e a morada) — como se validam e como seguem para o
 *     servidor e para a mensagem de WhatsApp.
 *
 * ## Porque é que a taxa vive aqui e tem espelho
 *
 * O servidor recalcula a taxa antes de cobrar (`deliveryFeeOf` em
 * `api/_shared.js`) e recusa uma área que a Loja não serve. O checkout tem de
 * mostrar **a mesma** taxa: se os dois lados divergirem, o total que o
 * comprador viu não é o que o servidor calcula e o pagamento acaba em
 * `PRICE_CHANGED`. `api/` não pode importar de `src/`, por isso as regras estão
 * espelhadas à mão — `LUANDA_AREAS`, `deliveredAreasOf` e `deliveryFeeOf` — e
 * `tests/serverOrder.test.ts` compara os dois lados.
 *
 * `web/lib/areas.ts` reexporta este módulo: é por lá que o checkout, o editor
 * e o painel do Dono o importam, e é esse o ficheiro que o servidor cita.
 */
import { isValidAoPhone, normalizeAoPhone, type PaymentCustomer } from "./payments.js";

/* --------------------------------- Onde ---------------------------------- */

/** Província servida. É fixa nesta fase. */
export const DELIVERY_PROVINCE = "Luanda";

/** Áreas de entrega de Luanda, pela ordem canónica. Espelhada em `api/_shared.js`. */
export const LUANDA_AREAS: readonly string[] = [
  "Benfica",
  "Cacuaco",
  "Calemba 2",
  "Camama",
  "Cassequel",
  "Cidade",
  "Escongolenses",
  "Golf 2",
  "Kilamba",
  "Morro Bento",
  "Nova Vida",
  "Palanca",
  "Prenda",
  "Rocha Pinto",
  "Samba",
  "Sequel",
  "Talatona",
  "Viana",
  "Zango",
];

/** Configuração de entrega (subconjunto de `StoreCustomization.delivery`). */
export interface DeliveryConfig {
  mode?: "single" | "perArea";
  flatFee?: number;
  fees?: Record<string, number>;
  freeAbove?: number;
}

/** Uma área servida e a respetiva taxa (Kz). */
export interface DeliveryArea {
  name: string;
  fee: number;
}

/** Resultado da taxa de entrega: a taxa, ou a recusa por área em falta ou não servida. */
export type DeliveryFeeResult = { readonly ok: true; readonly fee: number } | { readonly ok: false };

/**
 * Objeto onde faça sentido ler campos, ou `null`. Arrays contam como
 * não-objeto — a mesma regra de `asVariationRecord` no servidor, que é o que
 * mantém as duas leituras iguais para qualquer valor gravado.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Áreas que a Loja serve, na ordem canónica, com a respetiva taxa.
 *
 * - `mode: "single"` (ou `flatFee` definido sem `mode`): todas as áreas, com a
 *   mesma taxa;
 * - caso contrário, por área: só as que têm taxa numérica em `fees`.
 *
 * Total: aceita qualquer valor (normalmente `custom.delivery`) e nunca lança.
 * Espelhada por `deliveredAreasOf` em `api/_shared.js`.
 */
export function deliveredAreas(delivery: unknown): DeliveryArea[] {
  const d = asRecord(delivery);
  if (!d) return [];
  const mode = d["mode"] ?? (d["flatFee"] != null ? "single" : "perArea");
  if (mode === "single") {
    const fee = Math.max(0, Number(d["flatFee"]) || 0);
    return LUANDA_AREAS.map((name) => ({ name, fee }));
  }
  const fees = asRecord(d["fees"]) ?? {};
  return LUANDA_AREAS.filter((a) => typeof fees[a] === "number").map((a) => ({ name: a, fee: Number(fees[a]) }));
}

/** Subtotal (Kz) a partir do qual a entrega é grátis; `0` = sem entrega grátis. */
export function freeDeliveryFrom(delivery: unknown): number {
  return Math.max(0, Number(asRecord(delivery)?.["freeAbove"]) || 0);
}

/**
 * Taxa de entrega de uma encomenda com produtos físicos — a regra com que o
 * servidor cobra.
 *
 * - A Loja não serve nenhuma área: taxa `0` e a área não é pedida;
 * - a área tem de ser uma das servidas, senão `{ ok: false }` (o servidor
 *   responde `INVALID_AREA`);
 * - a entrega é grátis quando o subtotal dos artigos chega a `freeAbove`.
 *
 * Espelhada por `deliveryFeeOf` em `api/_shared.js`.
 *
 * @param subtotal Soma dos artigos, **sem** entrega e sem desconto.
 */
export function deliveryFeeFor(delivery: unknown, area: string | null | undefined, subtotal: number): DeliveryFeeResult {
  const areas = deliveredAreas(delivery);
  if (!areas.length) return { ok: true, fee: 0 };
  const found = areas.find((a) => a.name === area);
  if (!found) return { ok: false };
  const freeAbove = freeDeliveryFrom(delivery);
  return { ok: true, fee: freeAbove > 0 && subtotal >= freeAbove ? 0 : found.fee };
}

/* -------------------------------- A quem --------------------------------- */

/** Campos que o comprador preenche, pela ordem em que aparecem no formulário. */
export const BUYER_FIELDS = ["name", "phone", "email", "nif", "area", "street", "number", "reference"] as const;

/** Um campo do formulário do comprador. */
export type BuyerField = (typeof BUYER_FIELDS)[number];

/** Dados do comprador tal como o checkout os recolhe (texto cru dos campos). */
export interface BuyerDetails {
  name?: string;
  phone?: string;
  email?: string;
  nif?: string;
  /** Rua, avenida ou bairro. */
  street?: string;
  /** Número da porta, prédio, casa… */
  number?: string;
  /** Ponto de referência («junto à farmácia»). */
  reference?: string;
  /** Área de entrega escolhida — uma das de `deliveredAreas`. */
  area?: string | null;
}

/** O que muda as regras do formulário. */
export interface BuyerRules {
  /** O carrinho tem pelo menos um produto físico: pede morada e área. */
  readonly physical: boolean;
  /** Áreas que a Loja serve. Vazia = a Loja não definiu áreas e a área não é pedida. */
  readonly areas: readonly string[];
}

/**
 * Tamanho máximo de cada campo. Os do servidor (`cleanCustomer` em
 * `api/_payments.js`) são `name` 120, `phone` 20, `nif` 20, `email` 160,
 * `address` 300 e `area` 60; os três da morada somados, com a pontuação de
 * `deliveryAddressLine`, ficam abaixo dos 300 de `address`.
 */
export const BUYER_LIMITS = {
  name: 120,
  phone: 20,
  email: 160,
  nif: 20,
  street: 150,
  number: 15,
  reference: 100,
  area: 60,
} as const satisfies Record<BuyerField, number>;

/** Mensagens de erro de cada campo, numa só definição. */
export const BUYER_MESSAGES = {
  nameMissing: "Indique o seu nome.",
  phoneMissing: "Indique o seu número de telemóvel.",
  phoneInvalid: "Indique um número de telemóvel angolano válido (9 algarismos, a começar por 9).",
  emailInvalid: "Indique um email válido ou deixe o campo vazio.",
  streetMissing: "Indique a rua ou o bairro da entrega.",
  areaMissing: "Escolha a área de entrega.",
} as const;

/** Email com a forma mínima `algo@dominio.tld`. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Texto aparado, com os espaços interiores reduzidos a um e cortado ao limite
 * — a mesma limpeza de `text()` em `api/_payments.js`. O `trim` final garante
 * que o corte não deixa um espaço na ponta, o que torna a limpeza do servidor
 * uma operação nula sobre o que daqui sai.
 */
function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max).trim();
}

/**
 * Erros do formulário do comprador, por campo. Objeto vazio = pode seguir.
 *
 * Obrigatórios: o **nome** e o **telemóvel** (angolano, `isValidAoPhone`). Com
 * produtos físicos, também a **rua ou bairro** e — quando a Loja serve áreas —
 * a **área**, que tem de ser uma das servidas. Email e NIF são opcionais; um
 * email escrito tem de ter forma de email.
 */
export function buyerErrors(d: BuyerDetails, rules: BuyerRules): Partial<Record<BuyerField, string>> {
  const errors: Partial<Record<BuyerField, string>> = {};
  if (!clean(d.name, BUYER_LIMITS.name)) errors.name = BUYER_MESSAGES.nameMissing;
  const phone = clean(d.phone, BUYER_LIMITS.phone);
  if (!phone) errors.phone = BUYER_MESSAGES.phoneMissing;
  else if (!isValidAoPhone(phone)) errors.phone = BUYER_MESSAGES.phoneInvalid;
  const email = clean(d.email, BUYER_LIMITS.email);
  if (email && !EMAIL.test(email)) errors.email = BUYER_MESSAGES.emailInvalid;
  if (rules.physical) {
    if (!clean(d.street, BUYER_LIMITS.street)) errors.street = BUYER_MESSAGES.streetMissing;
    const area = typeof d.area === "string" ? d.area : "";
    if (rules.areas.length > 0 && !rules.areas.includes(area)) errors.area = BUYER_MESSAGES.areaMissing;
  }
  return errors;
}

/** Primeiro campo com erro, pela ordem do formulário — é ele que recebe o foco. */
export function firstBuyerError(errors: Partial<Record<BuyerField, string>>): BuyerField | null {
  return BUYER_FIELDS.find((f) => errors[f] !== undefined) ?? null;
}

/**
 * Morada numa só linha, no formato português: «Rua Direita, 12 (ponto de
 * referência: junto à farmácia)». Partes vazias são omitidas; `""` sem rua,
 * número nem ponto de referência.
 */
export function deliveryAddressLine(d: Pick<BuyerDetails, "street" | "number" | "reference">): string {
  const street = clean(d.street, BUYER_LIMITS.street);
  const number = clean(d.number, BUYER_LIMITS.number);
  const reference = clean(d.reference, BUYER_LIMITS.reference);
  const base = [street, number].filter((p) => p !== "").join(", ");
  if (!reference) return base;
  return base ? `${base} (ponto de referência: ${reference})` : `Ponto de referência: ${reference}`;
}

/**
 * Dados do cliente final tal como `/api/payment` os espera em `customer`
 * (`cleanCustomer` em `api/_payments.js`): `name`, `phone`, `email`, `nif`,
 * `address` e `area`, só os que têm conteúdo.
 *
 * - O telemóvel válido segue normalizado (`244XXXXXXXXX`), que é o formato com
 *   que o servidor o usa para o Multicaixa Express;
 * - a morada segue numa linha (`deliveryAddressLine`) e a **área segue sempre**
 *   que foi escolhida, mesmo com a entrega grátis — é por ela que o Dono sabe
 *   para onde vai a encomenda, e é com ela que o servidor calcula a taxa;
 * - sem produtos físicos não há morada nem área.
 *
 * Cada campo já sai limpo e dentro do limite do servidor, por isso a limpeza
 * de `cleanCustomer` devolve exatamente o mesmo objeto (guardado por
 * `tests/serverOrder.test.ts`).
 */
export function buyerCustomer(d: BuyerDetails, rules: Pick<BuyerRules, "physical">): PaymentCustomer {
  const out: PaymentCustomer = {};
  const name = clean(d.name, BUYER_LIMITS.name);
  if (name) out.name = name;
  const phone = clean(d.phone, BUYER_LIMITS.phone);
  if (phone) out.phone = isValidAoPhone(phone) ? normalizeAoPhone(phone) : phone;
  const email = clean(d.email, BUYER_LIMITS.email);
  if (email) out.email = email;
  const nif = clean(d.nif, BUYER_LIMITS.nif);
  if (nif) out.nif = nif;
  if (rules.physical) {
    const address = deliveryAddressLine(d);
    if (address) out.address = address;
    const area = clean(d.area ?? "", BUYER_LIMITS.area);
    if (area) out.area = area;
  }
  return out;
}

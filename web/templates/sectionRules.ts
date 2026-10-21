/**
 * Que secções um Modelo_De_Loja oferece no «Adicionar secção», com que desenho,
 * com que cores de fundo, e como se preparam para edição.
 *
 * ## O defeito que isto corrige
 *
 * O menu do editor decidia o que oferecer com comparações de
 * `store.templateId` escritas à mão — uma variável `productsOnly` para a
 * mercearia e um `if` para esconder testemunhos no modelo escuro. Os dois
 * modelos já tinham saído do `TEMPLATE_REGISTRY`, pelo que as comparações nunca
 * disparavam. Não havia forma de dizer «este modelo já tem esta secção»: o
 * Lumière tem testemunhos e mapa próprios e o menu oferecia os dois outra vez.
 * Acrescentar dava uma secção duplicada **e com o desenho de outro modelo**,
 * porque o bloco nascia sem `variant` e caía num valor por omissão genérico.
 *
 * ## A regra
 *
 * O modelo **declara** (em `StoreTemplate.sections`) o que já tem, o que aceita,
 * com que variante desenha cada secção acrescentada, que cores de fundo oferece
 * e como materializa os seus arrays. Este módulo é a única porta por onde o
 * editor lê essa declaração. Acrescentar um modelo novo passa a ser declarar,
 * não a lembrar-se de mexer num `if` no editor.
 *
 * Ver `MODELO-GUIA.md` §9.3 e `.kiro/steering/modelos-secoes.md`.
 */
import { newBlock } from "./blocks.js";
import type { BlockType, ContentBlock, SectionBackground, StoreCustomization, StoreTemplate } from "./types.js";

/** Todas as secções acrescentáveis da Plataforma, na ordem do menu. */
export const BLOCK_TYPES: readonly BlockType[] = ["info", "text", "testimonials", "location"];

/** Rótulo, descrição e ícone de cada secção, como o Dono os vê no menu. */
export const BLOCK_MENU: Readonly<Record<BlockType, { icon: string; title: string; desc: string }>> = {
  info: { icon: "image", title: "Informação com foto", desc: "Foto ao lado de título e texto" },
  text: { icon: "title", title: "Título e texto", desc: "Texto centrado de destaque" },
  testimonials: { icon: "format_quote", title: "Testemunhos", desc: "Opiniões de clientes" },
  location: { icon: "location_on", title: "Localização", desc: "Mapa com a morada da loja" },
};

/** Nome curto de cada secção (divisórias e avisos do editor). */
export const BLOCK_LABELS: Readonly<Record<BlockType, string>> = {
  info: "Informação",
  text: "Texto",
  testimonials: "Testemunhos",
  location: "Localização",
};

/**
 * Esta secção já vem no desenho do modelo?
 *
 * Uma secção nativa **não** é oferecida no menu: já está no ecrã e edita-se
 * onde está. Foi este o pedido concreto — no Lumière, testemunhos e mapa.
 */
export function isNativeSection(template: StoreTemplate | undefined, type: BlockType): boolean {
  return (template?.sections?.native ?? []).includes(type);
}

/**
 * Secções que este modelo aceita acrescentar.
 *
 * Um modelo sem declaração aceita todas — é o comportamento de sempre, e é o
 * que mantém os modelos que ainda não declararam nada a funcionar como antes.
 * As nativas saem sempre, mesmo que estejam em `allowed`: tê-las nas duas
 * listas é uma contradição, e a leitura segura é não duplicar a secção.
 */
export function addableSections(template: StoreTemplate | undefined): BlockType[] {
  const rules = template?.sections;
  const permitidas = rules?.allowed ?? BLOCK_TYPES;
  return BLOCK_TYPES.filter((t) => permitidas.includes(t) && !isNativeSection(template, t));
}

/**
 * Variante com que este modelo desenha uma secção acrescentada.
 *
 * `undefined` quando o modelo não declara: nesse caso o bloco nasce sem
 * `variant` e o desenho segue o valor por omissão de `blocks.ts`, como sempre.
 */
export function sectionVariant(template: StoreTemplate | undefined, type: BlockType): string | undefined {
  const v = template?.sections?.variants;
  if (!v) return undefined;
  return (v as Record<string, string | undefined>)[type];
}

/**
 * Cria a secção com o desenho do modelo já gravado.
 *
 * A variante é gravada **no momento da criação**, e não resolvida a cada
 * render: assim o desenho de uma secção não muda por baixo dos pés do Dono
 * quando o valor por omissão de `blocks.ts` mudar.
 */
export function newBlockFor(template: StoreTemplate | undefined, type: BlockType): ContentBlock {
  return newBlock(type, sectionVariant(template, type));
}

/** Item do menu «Adicionar secção», já com o rótulo que o Dono lê. */
export interface SectionMenuItem {
  type: BlockType;
  icon: string;
  title: string;
  desc: string;
}

/**
 * O menu «Adicionar secção» deste modelo.
 *
 * `structural` é `false` numa Loja com `customization.__locked` (modelo pronto):
 * aí só entram as secções de conteúdo simples, porque mexer na estrutura de um
 * modelo pronto é o que `__locked` existe para travar.
 */
export function sectionMenu(template: StoreTemplate | undefined, opts: { structural: boolean }): SectionMenuItem[] {
  const estruturais: readonly BlockType[] = ["testimonials", "location"];
  return addableSections(template)
    .filter((t) => opts.structural || !estruturais.includes(t))
    .map((t) => ({ type: t, ...BLOCK_MENU[t] }));
}

/** Cor clara oferecida a um modelo que não declara as suas. */
export const DEFAULT_SECTION_BACKGROUNDS: readonly SectionBackground[] = [{ label: "Claro", value: "#f6f3f2" }];

/**
 * As cores de fundo que o seletor «Cor de fundo» oferece neste modelo.
 *
 * «Padrão» (sem fundo) e «Branco» vêm sempre primeiro; seguem-se as cores que o
 * **modelo** declara (`sections.backgrounds`) — as que ele já usa nas suas
 * próprias superfícies. Isto estava num mapa por `templateId` dentro do editor,
 * e o modelo que lá não estava (o Tech Essentials) recebia o creme de outro.
 */
export function sectionBackgrounds(template: StoreTemplate | undefined): SectionBackground[] {
  const proprias = template?.sections?.backgrounds ?? DEFAULT_SECTION_BACKGROUNDS;
  return [{ label: "Padrão", value: "" }, { label: "Branco", value: "#ffffff" }, ...proprias];
}

/**
 * Prepara a Personalização para edição neste modelo (`sections.materialize`).
 *
 * O editor chama-o **antes da baseline** `savedJson`: escreve só o que a loja já
 * mostra, por isso abrir o editor não marca alterações. Um modelo sem
 * materialização própria não toca em nada.
 */
export function materializeForEditing(template: StoreTemplate | undefined, custom: StoreCustomization): void {
  template?.sections?.materialize?.(custom);
}

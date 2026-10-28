/**
 * Rascunho do Assistente_de_Criação, guardado no navegador.
 *
 * ## Porque é que existe
 *
 * O assistente é uma conversa com nove respostas e a mala de dados (`wiz.data`)
 * vivia **só em memória**, reposta a cada entrada no ecrã. Fechar o separador,
 * recarregar a página ou ir ver uma coisa ao painel apagava tudo o que já tinha
 * sido escrito.
 *
 * O que sobrevivia sobrevivia por acaso: a conta, porque a sessão do Supabase
 * está no `localStorage`, e a loja, porque é gravada na base de dados — mas só
 * no fim. Perdia-se exatamente o meio: o nome da loja, o tipo, o texto longo do
 * «Conta-me tudo sobre a tua loja» e os textos para o Google que o Dono leu,
 * corrigiu e aprovou. É o trabalho mais demorado da conversa, e era o único sem
 * rede de segurança.
 *
 * ## O que é guardado, e o que nunca é
 *
 * Uma **lista branca** (`DRAFT_FIELDS`), e não a mala toda. Não é preguiça: a
 * mala tem `email`, `phone` e o nome do campo `password`, e um campo novo
 * acrescentado amanhã passaria a ficar gravado no disco de quem usa um
 * computador partilhado sem ninguém decidir isso. A palavra-passe nunca chega
 * aqui — também não entra em `wiz.data` —, e o email não faz falta porque o
 * rascunho só começa a ser gravado depois de a conta existir.
 *
 * ## Por dono, e com validade
 *
 * A chave é uma só, mas o rascunho traz o `ownerId` e é ignorado se não for da
 * conta que está a usar o ecrã: outra pessoa no mesmo navegador não herda a loja
 * que alguém ia criar. Passados `WIZARD_DRAFT_TTL_DAYS` dias também é ignorado —
 * nem o Dono quer retomar uma conversa de há um mês.
 *
 * ## Nunca pode parar a criação
 *
 * Em navegação privada, com o disco cheio ou com o armazenamento bloqueado,
 * `localStorage` lança. Todas as funções engolem a falha: ficar sem rascunho é
 * um incómodo, não poder criar a loja é um defeito.
 */
import { WIZARD_FIELDS, WIZARD_DRAFT_TTL_DAYS } from "../../src/ui/wizardSteps.js";

/**
 * Passo em que a conversa é retomada — a pergunta que falta responder, não a
 * última respondida.
 */
export type WizardStep = "storeName" | "type" | "about" | "seo" | "subdomain";

const PASSOS: readonly WizardStep[] = ["storeName", "type", "about", "seo", "subdomain"];

/**
 * Campos da mala do assistente que vão para o disco. Tudo o que não está aqui
 * **não** é gravado, por omissão.
 */
export const DRAFT_FIELDS: readonly string[] = [
  WIZARD_FIELDS.name,
  WIZARD_FIELDS.storeType,
  WIZARD_FIELDS.templateId,
  WIZARD_FIELDS.identifier,
  "aboutStore",
  "seoTitle",
  "seoDescription",
  "seoByAi",
];

export interface WizardDraft {
  readonly ownerId: string;
  readonly step: WizardStep;
  readonly data: Record<string, unknown>;
  /** Quando foi gravado, em milissegundos. */
  readonly at: number;
}

/** Chave única: há um rascunho de cada vez, o da loja que está a ser criada. */
export const DRAFT_KEY = "mobisno-wizard-draft";

const TTL_MS = WIZARD_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Valores que fazem sentido num rascunho de texto. O resto não é gravado. */
function simples(v: unknown): boolean {
  return typeof v === "string" || typeof v === "boolean" || typeof v === "number";
}

/** A mala reduzida ao que pode ser gravado. */
export function draftFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of DRAFT_FIELDS) {
    const v = data[campo];
    if (v !== undefined && v !== null && simples(v)) out[campo] = v;
  }
  return out;
}

/** Grava o rascunho. Sem `ownerId` não grava: um rascunho sem dono não se lê. */
export function saveWizardDraft(d: { ownerId: string; step: WizardStep; data: Record<string, unknown> }): void {
  if (!d.ownerId) return;
  const draft: WizardDraft = {
    ownerId: d.ownerId,
    step: d.step,
    data: draftFields(d.data),
    at: Date.now(),
  };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* sem armazenamento: segue-se sem rascunho */
  }
}

/**
 * Lê o rascunho desta conta, ou `null`.
 *
 * Devolve `null` a um rascunho de outra conta, caducado, corrompido, com um
 * passo que não existe, ou que não tem nada de útil gravado — oferecer
 * «continuamos de onde ficaste?» para depois não haver nada para continuar é
 * pior do que começar.
 */
export function readWizardDraft(ownerId: string, now = Date.now()): WizardDraft | null {
  if (!ownerId) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<WizardDraft> | null;
    if (!d || d.ownerId !== ownerId) return null;
    if (typeof d.step !== "string" || !PASSOS.includes(d.step as WizardStep)) return null;
    if (typeof d.at !== "number" || !Number.isFinite(d.at) || now - d.at > TTL_MS) return null;
    const data = draftFields((d.data ?? {}) as Record<string, unknown>);
    // O modelo por omissão é posto pelo próprio ecrã: não conta como resposta.
    const respostas = Object.keys(data).filter((k) => k !== WIZARD_FIELDS.templateId);
    if (respostas.length === 0) return null;
    return { ownerId, step: d.step as WizardStep, data, at: d.at };
  } catch {
    return null;
  }
}

/** Apaga o rascunho: a loja foi criada, ou o Dono escolheu começar de novo. */
export function clearWizardDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* idem */
  }
}

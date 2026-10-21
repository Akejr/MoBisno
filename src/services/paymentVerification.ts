/**
 * Verificação de empresa para os pagamentos digitais (módulo de domínio puro).
 *
 * ## A regra de negócio
 *
 * Toda a loja nasce a vender por **WhatsApp**. Para receber por **Multicaixa
 * Express e Referência Bancária** o Dono tem de ser uma **empresa registada**: no
 * separador «Pagamentos» indica o nome e o NIF da empresa, a conta bancária onde
 * recebe, e envia dois documentos — a **Matrícula** e a **Certidão**. O pedido vai
 * para o Painel de Administração da MôBisno, e só depois de aprovado é que os
 * pagamentos digitais aparecem no checkout da loja.
 *
 * ## Onde vive cada parte
 *
 * - Os dados ficam em `store_payments` (uma linha por loja), os documentos no
 *   bucket **privado** `company-documents` (migração 0023);
 * - o estado (`verification_status`) **não é do Dono**: um gatilho da base de
 *   dados impede-o de se aprovar a si próprio, e devolve o pedido a «em análise»
 *   quando ele muda dados já aprovados (um IBAN trocado tem de ser verificado de
 *   novo — é o que protege o dinheiro de quem vende);
 * - a aprovação liga `stores.digital_payments`, que é o que o checkout lê
 *   (`src/services/paymentVisibility.ts`).
 *
 * Este módulo valida o formulário antes de gastar um envio, e dá à interface os
 * rótulos e as regras. Não tem dependências de infraestrutura.
 */

/** Estado do pedido de verificação de uma loja. */
export type VerificationStatus = "none" | "pending" | "approved" | "rejected";

/** Estados pela ordem do ciclo de vida. */
export const VERIFICATION_STATUSES: readonly VerificationStatus[] = ["none", "pending", "approved", "rejected"];

/** Rótulo de cada estado, como o Dono e o Administrador o leem. */
export const VERIFICATION_STATUS_LABEL: Readonly<Record<VerificationStatus, string>> = {
  none: "Por enviar",
  pending: "Em análise",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

/** Estado a partir de um valor de origem desconhecida (coluna da base de dados). */
export function asVerificationStatus(value: unknown): VerificationStatus {
  return value === "pending" || value === "approved" || value === "rejected" ? value : "none";
}

/** Identificador de cada documento exigido. */
export type CompanyDocumentId = "matricula" | "certidao";

/** Os documentos exigidos, pela ordem em que são pedidos. */
export const COMPANY_DOCUMENTS: readonly { id: CompanyDocumentId; label: string; hint: string }[] = [
  {
    id: "matricula",
    label: "Matrícula da empresa",
    hint: "A matrícula do registo comercial, emitida pela Conservatória.",
  },
  {
    id: "certidao",
    label: "Certidão da empresa",
    hint: "A certidão comercial da empresa, atualizada.",
  },
];

/** Tamanho máximo de cada documento: 10 MB. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Formatos aceites para os documentos. */
export type DocumentFormat = "pdf" | "jpeg" | "png";

/** Tipo MIME de cada formato aceite. */
export const DOCUMENT_CONTENT_TYPE: Readonly<Record<DocumentFormat, string>> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
};

/**
 * Formato de um documento pelos primeiros bytes (*magic bytes*), ou `null`.
 *
 * Pelo conteúdo e não pela extensão: um ficheiro chamado `matricula.pdf` que é,
 * de facto, outra coisa não passa.
 */
export function detectDocumentFormat(bytes: Uint8Array): DocumentFormat | null {
  const starts = (sig: readonly number[]): boolean => sig.every((b, i) => bytes[i] === b);
  if (bytes.length >= 4 && starts([0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (bytes.length >= 3 && starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (bytes.length >= 8 && starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  return null;
}

/** Resultado da validação de um documento antes do envio. */
export type DocumentCheck =
  | { ok: true; format: DocumentFormat; contentType: string }
  | { ok: false; message: string };

/** Valida um documento (formato pelo conteúdo e tamanho). */
export function checkDocument(bytes: Uint8Array): DocumentCheck {
  if (!bytes || bytes.length === 0) return { ok: false, message: "O ficheiro está vazio." };
  if (bytes.length > DOCUMENT_MAX_BYTES) return { ok: false, message: "O ficheiro tem mais de 10 MB." };
  const format = detectDocumentFormat(bytes);
  if (!format) return { ok: false, message: "Envie o documento em PDF, JPG ou PNG." };
  return { ok: true, format, contentType: DOCUMENT_CONTENT_TYPE[format] };
}

/* --------------------------------- NIF ---------------------------------- */

/** NIF sem espaços, pontos, barras nem hífenes, em maiúsculas. */
export function normalizeNif(raw: unknown): string {
  return typeof raw === "string" ? raw.toUpperCase().replace(/[\s.\-/]/g, "") : "";
}

/**
 * NIF de empresa aceitável: 9 a 15 letras e algarismos, com pelo menos 6
 * algarismos.
 *
 * É deliberadamente largo. O NIF de uma sociedade angolana tem 10 algarismos,
 * mas um empresário em nome individual usa outro formato, e recusar aqui um NIF
 * verdadeiro deixava a pessoa sem forma de se registar — quem confirma o NIF
 * contra os documentos é o Administrador, na aprovação.
 */
export function isValidCompanyNif(nif: string): boolean {
  const n = normalizeNif(nif);
  return /^[0-9A-Z]{9,15}$/.test(n) && (n.match(/\d/g) ?? []).length >= 6;
}

/* --------------------------------- IBAN --------------------------------- */

/** IBAN sem espaços, em maiúsculas. */
export function normalizeIban(raw: unknown): string {
  return typeof raw === "string" ? raw.toUpperCase().replace(/\s+/g, "") : "";
}

/** Resto da divisão por 97 do IBAN rearranjado (ISO 13616). `1` = válido. */
function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem;
}

/**
 * IBAN angolano válido: `AO` + 23 algarismos (25 caracteres) e dígitos de
 * controlo certos (módulo 97).
 *
 * O controlo apanha o erro mais caro: um algarismo trocado ao copiar o IBAN, que
 * mandaria o dinheiro das vendas para a conta de outra pessoa.
 */
export function isValidAngolanIban(iban: string): boolean {
  const n = normalizeIban(iban);
  return /^AO\d{23}$/.test(n) && ibanMod97(n) === 1;
}

/** IBAN em grupos de 4, para leitura (`AO06 0044 0000 …`). */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

/** IBAN mascarado para listas: só os últimos 4 algarismos à vista. */
export function maskIban(iban: string): string {
  const n = normalizeIban(iban);
  return n.length > 8 ? `${n.slice(0, 4)} •••• ${n.slice(-4)}` : n;
}

/* ------------------------------ Formulário ------------------------------ */

/** Campos do pedido de verificação. */
export type VerificationField = "companyName" | "companyNif" | "bankName" | "beneficiaryName" | "iban" | CompanyDocumentId;

/** Dados do pedido tal como o formulário os recolhe. */
export interface VerificationForm {
  companyName: string;
  companyNif: string;
  bankName: string;
  beneficiaryName: string;
  iban: string;
  /** Caminho de cada documento já carregado (ou `null` se ainda não há). */
  documents: Partial<Record<CompanyDocumentId, string | null>>;
}

/** Pedido validado e normalizado, pronto a gravar. */
export interface ValidVerification {
  companyName: string;
  companyNif: string;
  bankName: string;
  beneficiaryName: string;
  iban: string;
  documents: Record<CompanyDocumentId, string>;
}

/** Erro de um campo, com a frase a mostrar junto dele. */
export interface VerificationError {
  field: VerificationField;
  message: string;
}

/** Texto aparado e com espaços internos colapsados. */
function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/**
 * Valida o pedido completo. Devolve **todos** os erros de uma vez — o Dono
 * corrige o formulário inteiro numa passagem, em vez de descobrir um erro de
 * cada vez a cada envio.
 */
export function validateVerification(
  form: VerificationForm,
): { ok: true; value: ValidVerification } | { ok: false; errors: VerificationError[] } {
  const errors: VerificationError[] = [];
  const companyName = clean(form.companyName);
  const companyNif = normalizeNif(form.companyNif);
  const bankName = clean(form.bankName);
  const beneficiaryName = clean(form.beneficiaryName);
  const iban = normalizeIban(form.iban);

  if (companyName.length < 2 || companyName.length > 120) {
    errors.push({ field: "companyName", message: "Indique o nome da empresa, tal como está na matrícula." });
  }
  if (!isValidCompanyNif(companyNif)) {
    errors.push({ field: "companyNif", message: "Indique o NIF da empresa (9 a 15 letras e algarismos)." });
  }
  if (bankName.length < 2 || bankName.length > 60) {
    errors.push({ field: "bankName", message: "Indique o banco da conta onde vai receber." });
  }
  if (beneficiaryName.length < 2 || beneficiaryName.length > 120) {
    errors.push({ field: "beneficiaryName", message: "Indique o titular da conta bancária." });
  }
  if (!isValidAngolanIban(iban)) {
    errors.push({ field: "iban", message: "O IBAN não é válido. Confirme os 25 caracteres (começa por AO06)." });
  }
  const documents: Partial<Record<CompanyDocumentId, string>> = {};
  for (const doc of COMPANY_DOCUMENTS) {
    const path = clean(form.documents?.[doc.id] ?? "");
    if (!path) errors.push({ field: doc.id, message: `Falta enviar a ${doc.label.toLowerCase()}.` });
    else documents[doc.id] = path;
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      companyName, companyNif, bankName, beneficiaryName, iban,
      documents: documents as Record<CompanyDocumentId, string>,
    },
  };
}

/**
 * Alterar estes dados obriga a nova aprovação?
 *
 * Só quando o pedido já está aprovado: aí, mudar o IBAN ou a empresa suspende os
 * pagamentos digitais até a MôBisno voltar a aprovar (o gatilho da base de dados
 * faz isto sozinho; esta função é para a interface avisar antes).
 */
export function changeRequiresReview(status: VerificationStatus): boolean {
  return status === "approved";
}

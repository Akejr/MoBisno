/**
 * Verificação de empresa para os pagamentos digitais
 * (`src/services/paymentVerification.ts`).
 *
 * Toda a loja nasce a vender por WhatsApp. Para receber por Multicaixa Express
 * e Referência Bancária, o Dono tem de ser uma empresa registada: indica o nome
 * e o NIF da empresa, a conta onde recebe, e envia a Matrícula e a Certidão. O
 * pedido vai ao Painel de Administração e só depois de aprovado é que os
 * pagamentos digitais aparecem no checkout.
 *
 * O que estes testes guardam, por ordem de quanto custa errar:
 *
 *  1. **o IBAN** — um algarismo trocado ao copiar mandava o dinheiro das vendas
 *     para a conta de outra pessoa. O controlo é o módulo 97 da ISO 13616, e os
 *     IBAN dos testes são construídos aqui com o dígito de controlo calculado à
 *     parte (com `BigInt`), para o teste não depender da implementação que testa;
 *  2. **os documentos pelo conteúdo** — um ficheiro chamado `matricula.pdf` que
 *     é outra coisa não passa;
 *  3. **todos os erros de uma vez** — o Dono corrige o formulário inteiro numa
 *     passagem, em vez de descobrir um erro a cada envio.
 */
import { describe, it, expect } from "vitest";
import { assertProperty, fc } from "./helpers/property.js";
import {
  COMPANY_DOCUMENTS,
  DOCUMENT_CONTENT_TYPE,
  DOCUMENT_MAX_BYTES,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABEL,
  asVerificationStatus,
  changeRequiresReview,
  checkDocument,
  detectDocumentFormat,
  formatIban,
  isValidAngolanIban,
  isValidCompanyNif,
  maskIban,
  normalizeIban,
  normalizeNif,
  validateVerification,
  type VerificationField,
  type VerificationForm,
} from "../src/services/paymentVerification.js";

/* ------------------------------ IBAN de teste ------------------------------ */

/**
 * IBAN angolano com os dígitos de controlo certos para um BBAN de 21
 * algarismos (ISO 13616): `98 − ((BBAN ‖ "AO" em números ‖ "00") mod 97)`,
 * com A = 10 e O = 24.
 */
function ibanAngolano(bban: string): string {
  const resto = BigInt(`${bban}1024` + "00") % 97n;
  return `AO${String(98n - resto).padStart(2, "0")}${bban}`;
}

/** O mesmo IBAN com um algarismo trocado na posição `i` (contada no IBAN). */
function comAlgarismoTrocado(iban: string, i: number): string {
  const d = Number(iban[i]);
  return `${iban.slice(0, i)}${(d + 1) % 10}${iban.slice(i + 1)}`;
}

/** O exemplo de IBAN angolano do registo SWIFT. */
const IBAN_EXEMPLO = "AO06004400006729503010102";

const bbanArb = fc.stringMatching(/^\d{21}$/);

describe("IBAN angolano", () => {
  it("o construtor dos testes produz o exemplo oficial", () => {
    expect(ibanAngolano("004400006729503010102")).toBe(IBAN_EXEMPLO);
  });

  it("aceita IBAN angolanos válidos", () => {
    for (const bban of ["004400006729503010102", "000600000100037131174", "123456789012345678901", "000000000000000000000"]) {
      const iban = ibanAngolano(bban);
      expect(isValidAngolanIban(iban), iban).toBe(true);
    }
  });

  it("um algarismo trocado torna o IBAN inválido", () => {
    expect(isValidAngolanIban(comAlgarismoTrocado(IBAN_EXEMPLO, 10))).toBe(false);
    expect(isValidAngolanIban(comAlgarismoTrocado(IBAN_EXEMPLO, IBAN_EXEMPLO.length - 1))).toBe(false);
    // Os próprios dígitos de controlo.
    expect(isValidAngolanIban("AO07004400006729503010102")).toBe(false);
  });

  it("dois algarismos vizinhos trocados também", () => {
    const i = 12;
    const troca = `${IBAN_EXEMPLO.slice(0, i)}${IBAN_EXEMPLO[i + 1]}${IBAN_EXEMPLO[i]}${IBAN_EXEMPLO.slice(i + 2)}`;
    expect(troca).not.toBe(IBAN_EXEMPLO);
    expect(isValidAngolanIban(troca)).toBe(false);
  });

  it("recusa o que não é um IBAN angolano de 25 caracteres", () => {
    for (const iban of [
      "PT50000201231234567890154", // IBAN português válido: não é angolano
      IBAN_EXEMPLO.slice(0, -1), // 24 caracteres
      `${IBAN_EXEMPLO}0`, // 26 caracteres
      "AO06004400006729503010A02", // letra no BBAN
      "",
      "AO",
    ]) {
      expect(isValidAngolanIban(iban), iban).toBe(false);
    }
  });

  it("aceita o IBAN escrito em grupos e em minúsculas, e normaliza-o", () => {
    const escrito = " ao06 0044 0000 6729 5030 1010 2 ";
    expect(normalizeIban(escrito)).toBe(IBAN_EXEMPLO);
    expect(isValidAngolanIban(escrito)).toBe(true);
    expect(normalizeIban(42)).toBe("");
    expect(normalizeIban(null)).toBe("");
  });

  it("formata em grupos de quatro e mascara para as listas", () => {
    expect(formatIban(IBAN_EXEMPLO)).toBe("AO06 0044 0000 6729 5030 1010 2");
    expect(maskIban(IBAN_EXEMPLO)).toBe("AO06 •••• 0102");
    expect(maskIban(IBAN_EXEMPLO)).not.toContain("6729");
  });

  it("qualquer BBAN com o controlo certo é válido; qualquer algarismo trocado é apanhado (propriedade)", () => {
    assertProperty(
      fc.property(bbanArb, fc.integer({ min: 2, max: 24 }), (bban, i) => {
        const iban = ibanAngolano(bban);
        expect(isValidAngolanIban(iban)).toBe(true);
        expect(isValidAngolanIban(formatIban(iban).toLowerCase())).toBe(true);
        expect(isValidAngolanIban(comAlgarismoTrocado(iban, i))).toBe(false);
      }),
    );
  });
});

/* ---------------------------------- NIF ---------------------------------- */

describe("NIF da empresa", () => {
  it("normaliza: sem espaços, pontos, hífenes nem barras, em maiúsculas", () => {
    expect(normalizeNif(" 541.723 567-0 ")).toBe("5417235670");
    expect(normalizeNif("005416347la042")).toBe("005416347LA042");
    expect(normalizeNif("54/17/235670")).toBe("5417235670");
    expect(normalizeNif(5417235670)).toBe("");
    expect(normalizeNif(undefined)).toBe("");
  });

  it("aceita o NIF de uma sociedade e o de um empresário em nome individual", () => {
    for (const nif of ["5417235670", "541 723 5670", "005416347LA042", "005416347la042"]) {
      expect(isValidCompanyNif(nif), nif).toBe(true);
    }
  });

  it("recusa NIF curtos, longos, sem algarismos suficientes ou com símbolos", () => {
    for (const nif of ["", "12345678", "1234567890123456", "ABCDEFGHIJ", "ABC123DEFGH", "54172356@0"]) {
      expect(isValidCompanyNif(nif), nif).toBe(false);
    }
    expect(isValidCompanyNif(5417235670 as unknown as string)).toBe(false);
  });
});

/* ------------------------------ Documentos ------------------------------- */

/** Bytes que começam por `assinatura` e têm `tamanho` no total. */
function ficheiro(assinatura: readonly number[], tamanho = 64): Uint8Array {
  const bytes = new Uint8Array(Math.max(tamanho, assinatura.length));
  bytes.set(assinatura);
  return bytes;
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]; // %PDF-1.7
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const texto = (s: string): number[] => [...new TextEncoder().encode(s)];

describe("Documentos — formato pelo conteúdo", () => {
  it("reconhece PDF, JPEG e PNG pelos primeiros bytes", () => {
    expect(detectDocumentFormat(ficheiro(PDF))).toBe("pdf");
    expect(detectDocumentFormat(ficheiro(JPEG))).toBe("jpeg");
    expect(detectDocumentFormat(ficheiro(PNG))).toBe("png");
  });

  it("recusa qualquer outro conteúdo, mesmo que o nome dissesse .pdf", () => {
    const outros: [string, number[]][] = [
      ["GIF", texto("GIF89a")],
      ["ZIP / DOCX", [0x50, 0x4b, 0x03, 0x04]],
      ["HTML", texto("<!doctype html>")],
      ["texto", texto("Matrícula da empresa")],
      ["quase PDF", texto("%PDX-1.7")],
      ["WebP", texto("RIFF....WEBP")],
    ];
    for (const [nome, bytes] of outros) expect(detectDocumentFormat(ficheiro(bytes)), nome).toBeNull();
  });

  it("uma assinatura cortada não conta", () => {
    expect(detectDocumentFormat(new Uint8Array(PDF.slice(0, 3)))).toBeNull();
    expect(detectDocumentFormat(new Uint8Array(JPEG.slice(0, 2)))).toBeNull();
    expect(detectDocumentFormat(new Uint8Array(PNG.slice(0, 7)))).toBeNull();
    expect(detectDocumentFormat(new Uint8Array(0))).toBeNull();
  });

  it("checkDocument devolve o formato e o tipo MIME de cada formato aceite", () => {
    expect(checkDocument(ficheiro(PDF))).toEqual({ ok: true, format: "pdf", contentType: "application/pdf" });
    expect(checkDocument(ficheiro(JPEG))).toEqual({ ok: true, format: "jpeg", contentType: "image/jpeg" });
    expect(checkDocument(ficheiro(PNG))).toEqual({ ok: true, format: "png", contentType: "image/png" });
    expect(Object.values(DOCUMENT_CONTENT_TYPE).sort()).toEqual(["application/pdf", "image/jpeg", "image/png"]);
  });

  it("recusa ficheiros vazios e formatos desconhecidos com uma frase útil", () => {
    expect(checkDocument(new Uint8Array(0))).toEqual({ ok: false, message: "O ficheiro está vazio." });
    const desconhecido = checkDocument(ficheiro(texto("GIF89a")));
    expect(desconhecido.ok).toBe(false);
    if (!desconhecido.ok) expect(desconhecido.message).toMatch(/PDF, JPG ou PNG/);
  });
});

describe("Documentos — o limite de 10 MB", () => {
  it("o limite é 10 MB", () => {
    expect(DOCUMENT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("exatamente 10 MB passa; um byte a mais não", () => {
    expect(checkDocument(ficheiro(PDF, DOCUMENT_MAX_BYTES)).ok).toBe(true);
    const grande = checkDocument(ficheiro(PDF, DOCUMENT_MAX_BYTES + 1));
    expect(grande.ok).toBe(false);
    if (!grande.ok) expect(grande.message).toMatch(/10 MB/);
  });

  it("o tamanho é verificado antes do formato: um ficheiro enorme não é lido à procura de assinatura", () => {
    const enorme = checkDocument(ficheiro(texto("GIF89a"), DOCUMENT_MAX_BYTES + 1));
    expect(enorme.ok).toBe(false);
    if (!enorme.ok) expect(enorme.message).toMatch(/10 MB/);
  });
});

/* ------------------------------ Formulário ------------------------------- */

const VALIDO: VerificationForm = {
  companyName: "Ekolo Sports, Lda",
  companyNif: "5417235670",
  bankName: "BFA",
  beneficiaryName: "Ekolo Sports, Lda",
  iban: IBAN_EXEMPLO,
  documents: { matricula: "loja-1/company/matricula-1.pdf", certidao: "loja-1/company/certidao-1.pdf" },
};

/** Campos pela ordem em que o formulário os apresenta (e os erros saem). */
const ORDEM: readonly VerificationField[] = [
  "companyName", "companyNif", "bankName", "beneficiaryName", "iban", "matricula", "certidao",
];

describe("validateVerification — todos os erros de uma vez", () => {
  it("um formulário vazio devolve os sete erros, pela ordem do formulário", () => {
    const r = validateVerification({
      companyName: "", companyNif: "", bankName: "", beneficiaryName: "", iban: "", documents: {},
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.field)).toEqual([...ORDEM]);
    for (const e of r.errors) expect(e.message.trim().length, e.field).toBeGreaterThan(0);
  });

  it("documentos em falta dizem qual falta", () => {
    const r = validateVerification({ ...VALIDO, documents: { matricula: "   ", certidao: null } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      { field: "matricula", message: "Falta enviar a matrícula da empresa." },
      { field: "certidao", message: "Falta enviar a certidão da empresa." },
    ]);
  });

  it("o IBAN errado é apontado no campo do IBAN, com a dica do AO06", () => {
    const r = validateVerification({ ...VALIDO, iban: comAlgarismoTrocado(IBAN_EXEMPLO, 9) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.field).toBe("iban");
    expect(r.errors[0]?.message).toMatch(/AO06/);
  });

  it("em sucesso devolve os valores normalizados, prontos a gravar", () => {
    const r = validateVerification({
      companyName: "  Ekolo   Sports,  Lda ",
      companyNif: " 541.723 567-0 ",
      bankName: "  BFA ",
      beneficiaryName: " Ekolo Sports,\tLda ",
      iban: " ao06 0044 0000 6729 5030 1010 2 ",
      documents: { matricula: "  loja-1/company/matricula-1.pdf ", certidao: "loja-1/company/certidao-1.pdf" },
    });
    expect(r).toEqual({
      ok: true,
      value: {
        companyName: "Ekolo Sports, Lda",
        companyNif: "5417235670",
        bankName: "BFA",
        beneficiaryName: "Ekolo Sports, Lda",
        iban: IBAN_EXEMPLO,
        documents: { matricula: "loja-1/company/matricula-1.pdf", certidao: "loja-1/company/certidao-1.pdf" },
      },
    });
  });

  it("os erros são exatamente os campos inválidos, qualquer que seja a combinação (propriedade)", () => {
    /** Um valor inválido por campo, para trocar no formulário válido. */
    const INVALIDOS: Readonly<Record<VerificationField, (f: VerificationForm) => VerificationForm>> = {
      companyName: (f) => ({ ...f, companyName: " x " }),
      companyNif: (f) => ({ ...f, companyNif: "123" }),
      bankName: (f) => ({ ...f, bankName: "" }),
      beneficiaryName: (f) => ({ ...f, beneficiaryName: "y" }),
      iban: (f) => ({ ...f, iban: "AO07004400006729503010102" }),
      matricula: (f) => ({ ...f, documents: { ...f.documents, matricula: null } }),
      certidao: (f) => ({ ...f, documents: { ...f.documents, certidao: "" } }),
    };
    assertProperty(
      fc.property(fc.subarray([...ORDEM]), (estragados) => {
        const form = estragados.reduce((f, campo) => INVALIDOS[campo](f), VALIDO);
        const r = validateVerification(form);
        if (estragados.length === 0) {
          expect(r.ok).toBe(true);
          return;
        }
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors.map((e) => e.field)).toEqual(ORDEM.filter((c) => estragados.includes(c)));
      }),
    );
  });
});

/* -------------------------------- Estados -------------------------------- */

describe("Estado do pedido", () => {
  it("só um pedido aprovado obriga a nova aprovação quando os dados mudam", () => {
    expect(changeRequiresReview("approved")).toBe(true);
    for (const s of ["none", "pending", "rejected"] as const) expect(changeRequiresReview(s), s).toBe(false);
  });

  it("um estado desconhecido vindo da base de dados lê-se como «por enviar»", () => {
    for (const s of VERIFICATION_STATUSES.filter((x) => x !== "none")) expect(asVerificationStatus(s)).toBe(s);
    for (const lixo of ["none", "APPROVED", "aprovado", "", null, undefined, 1, {}]) {
      expect(asVerificationStatus(lixo), String(lixo)).toBe("none");
    }
  });

  it("cada estado tem o rótulo que o Dono e o Administrador leem", () => {
    expect(VERIFICATION_STATUS_LABEL).toEqual({
      none: "Por enviar", pending: "Em análise", approved: "Aprovado", rejected: "Rejeitado",
    });
  });

  it("os documentos pedidos são a Matrícula e a Certidão, por esta ordem", () => {
    expect(COMPANY_DOCUMENTS.map((d) => d.id)).toEqual(["matricula", "certidao"]);
    expect(COMPANY_DOCUMENTS.map((d) => d.label)).toEqual(["Matrícula da empresa", "Certidão da empresa"]);
  });
});

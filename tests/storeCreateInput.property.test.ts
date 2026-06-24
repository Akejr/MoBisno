import { describe, it } from "vitest";
import { assertPropertyAsync, fc } from "./helpers/property.js";
import { isOk, isErr } from "../src/models/index.js";
import type { StoreOwner, StoreType } from "../src/models/index.js";
import {
  createStoreService,
  VALID_STORE_TYPES,
  type CreateStoreInput,
} from "../src/services/storeService.js";
import { createInMemoryStoreRepository } from "../src/services/storeRepository.js";
import {
  createIdentifierService,
  isValidIdentifierFormat,
} from "../src/services/identifierService.js";

/**
 * Conjunto fixo de identificadores reservados usado tanto pelo
 * IdentifierService sob teste como pelo oráculo independente. Todos têm
 * formato válido para garantir que são rejeitados por indisponibilidade
 * (e não por formato), exercitando a fronteira "válido mas indisponível".
 */
const RESERVED_IDENTIFIERS = ["app", "www", "admin", "api", "reservado"] as const;

/** Dono autenticado fixo (a posse exclusiva é coberta pela Property 7). */
const OWNER: StoreOwner = {
  id: "owner-prop8",
  email: "dono@example.com",
  passwordHash: "hash",
  name: "Dono de Teste",
  createdAt: "2024-01-01T00:00:00.000Z",
};

/**
 * Nomes que abrangem todas as fronteiras: vazio, só espaços, abaixo do
 * mínimo (1 char), dentro do intervalo (2–60 após trim), acima do máximo
 * (>60) e variantes com espaços envolventes para exercitar o trim.
 */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.string({ minLength: 1, maxLength: 1 }),
  fc.string({ minLength: 2, maxLength: 60 }),
  fc.string({ minLength: 61, maxLength: 80 }),
  fc.string({ minLength: 0, maxLength: 65 }).map((s) => `  ${s}  `),
);

/**
 * Tipos de Loja: válidos (da lista permitida) e inválidos (fora da lista).
 * Tipado como `string` para permitir valores inválidos; convertido na
 * construção do input.
 */
const storeTypeArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...VALID_STORE_TYPES),
  fc.constantFrom<string>("Inválido", "", "vestuário", "Aleatório", "Tipo"),
);

/** Identificador do Modelo: presente (não vazio) ou em falta (vazio/só espaços). */
const templateIdArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.string({ minLength: 1, maxLength: 24 }),
);

/** Bloco alfanumérico minúsculo de um identificador de formato válido. */
const blockArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 8,
  })
  .map((chars) => chars.join(""));

/** Identificadores de formato válido (2–63, [a-z0-9] com hífenes únicos). */
const validIdentifierArb: fc.Arbitrary<string> = fc
  .array(blockArb, { minLength: 1, maxLength: 4 })
  .map((blocks) => blocks.join("-"))
  .filter((id) => id.length >= 2 && id.length <= 63);

/** Caracteres que exercitam válidos e inválidos (maiúsculas, símbolos, hífen). */
const charArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")) },
  { weight: 3, arbitrary: fc.constantFrom(..."0123456789".split("")) },
  { weight: 3, arbitrary: fc.constant("-") },
  { weight: 2, arbitrary: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")) },
  { weight: 2, arbitrary: fc.constantFrom(..."_. !@#/áç".split("")) },
);

/** Identificadores potencialmente inválidos (incl. vazios e formatos inválidos). */
const arbitraryIdentifierArb: fc.Arbitrary<string> = fc
  .array(charArb, { minLength: 0, maxLength: 70 })
  .map((chars) => chars.join(""));

/** Mistura de identificadores: válidos, arbitrários e reservados (válidos mas indisponíveis). */
const identifierArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: validIdentifierArb },
  { weight: 4, arbitrary: arbitraryIdentifierArb },
  { weight: 2, arbitrary: fc.constantFrom<string>(...RESERVED_IDENTIFIERS) },
);

/** Estado completo do Assistente na confirmação final (cada campo indep.). */
const wizardStateArb = fc.record({
  name: nameArb,
  storeType: storeTypeArb,
  templateId: templateIdArb,
  identifier: identifierArb,
});

describe("StoreService — propriedades", () => {
  it("a confirmação final cria a Loja se e só se todos os campos obrigatórios forem válidos; caso contrário identifica os campos em causa e não persiste", async () => {
    // **Feature: mobisno-store-builder, Property 8: Validação de input de criação na confirmação final**
    // **Validates: Requirements 5.1, 5.6, 10.6**
    await assertPropertyAsync(
      fc.asyncProperty(wizardStateArb, async (state) => {
        // Serviço com repositório vazio: a única fonte de indisponibilidade é
        // o conjunto de identificadores reservados (sem lojas pré-existentes).
        const repository = createInMemoryStoreRepository();
        const identifierService = createIdentifierService({
          reservedIdentifiers: RESERVED_IDENTIFIERS,
        });
        const service = createStoreService({ storeRepository: repository, identifierService });

        // Oráculo independente da validade de cada campo obrigatório.
        const trimmedName = state.name.trim();
        const nameValid = trimmedName.length >= 2 && trimmedName.length <= 60;
        const typeValid = (VALID_STORE_TYPES as readonly string[]).includes(state.storeType);
        const templateValid = state.templateId.trim().length > 0;
        const idTrim = state.identifier.trim();
        const formatValid = isValidIdentifierFormat(idTrim);
        // Disponível = formato válido, não reservado e não em uso (repo vazio).
        const reserved = (RESERVED_IDENTIFIERS as readonly string[]).includes(
          idTrim.toLowerCase(),
        );
        const identifierValid = formatValid && !reserved;

        const allValid = nameValid && typeValid && templateValid && identifierValid;

        // Conjunto de campos que o oráculo considera inválidos.
        const invalidFields = new Set<string>();
        if (!nameValid) invalidFields.add("name");
        if (!typeValid) invalidFields.add("storeType");
        if (!templateValid) invalidFields.add("templateId");
        if (!identifierValid) invalidFields.add("identifier");

        const input = {
          name: state.name,
          storeType: state.storeType as StoreType,
          templateId: state.templateId,
          identifier: state.identifier,
        } satisfies CreateStoreInput;

        const result = await service.createStore(OWNER, input);
        const persisted = await repository.listByOwner(OWNER.id);

        if (allValid) {
          // Cria a Loja, associada ao Dono, e persiste exatamente uma Loja.
          return (
            isOk(result) &&
            result.value.ownerId === OWNER.id &&
            persisted.length === 1
          );
        }

        // Criação impedida: erro, campos em causa identificados e nada persistido.
        if (!isErr(result)) {
          return false;
        }
        const everyReportedFieldInvalid = result.error.fields.every((field) =>
          invalidFields.has(field),
        );
        const identifiesAtLeastOne = result.error.fields.length >= 1;
        return everyReportedFieldInvalid && identifiesAtLeastOne && persisted.length === 0;
      }),
    );
  });
});

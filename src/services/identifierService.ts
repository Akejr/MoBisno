/**
 * Normalizador de Identificadores (IdentifierService).
 *
 * Lógica pura central para o provisionamento de subdomínios no formato
 * `[identificador].mobisno.com` (ver design.md → "2. Normalizador de
 * Identificadores"). Responsável por:
 *  - normalizar um nome de Loja num Identificador_de_Loja (`normalize`);
 *  - validar o formato de um identificador (`isValidFormat`);
 *  - compor o subdomínio completo (`toSubdomain`);
 *  - verificar a disponibilidade (não usado + não reservado) (`isAvailable`).
 *
 * Requisitos: 4.1, 4.2, 4.4, 4.7, 4.8.
 */

/** Sufixo de domínio comum a todos os subdomínios de Loja. */
export const SUBDOMAIN_SUFFIX = ".mobisno.store";

/** Comprimento mínimo válido de um Identificador_de_Loja (Requisito 4.7). */
export const MIN_IDENTIFIER_LENGTH = 2;

/** Comprimento máximo válido de um Identificador_de_Loja (Requisitos 4.2, 4.7). */
export const MAX_IDENTIFIER_LENGTH = 63;

/**
 * Lista predefinida de identificadores reservados (Requisito 4.5). A lista é
 * configurável através de {@link IdentifierServiceOptions.reservedIdentifiers}.
 */
export const DEFAULT_RESERVED_IDENTIFIERS: readonly string[] = [
  "app",
  "www",
  "admin",
  "api",
  "mail",
  "static",
  "assets",
];

/**
 * Verificador de unicidade injetável: devolve `true` se o identificador já
 * estiver associado a uma Loja existente (ou seja, já está em uso).
 */
export type IdentifierUniquenessChecker = (identifier: string) => Promise<boolean>;

/** Opções de configuração do {@link IdentifierService}. */
export interface IdentifierServiceOptions {
  /**
   * Conjunto configurável de identificadores reservados. Os valores são
   * normalizados para minúsculas internamente. Por omissão usa
   * {@link DEFAULT_RESERVED_IDENTIFIERS}.
   */
  reservedIdentifiers?: Iterable<string>;
  /**
   * Verificador de unicidade injetável. Por omissão considera que nenhum
   * identificador está em uso (útil para testes de lógica pura).
   */
  isIdentifierTaken?: IdentifierUniquenessChecker;
}

/**
 * Contrato do Normalizador de Identificadores (ver design.md →
 * "Components and Interfaces" → secção 2).
 */
export interface IdentifierService {
  /** Normaliza um nome de Loja num Identificador_de_Loja (Requisitos 4.1, 4.2). */
  normalize(name: string): string;
  /** Valida se um identificador respeita as regras de formato (Requisito 4.7). */
  isValidFormat(identifier: string): boolean;
  /** Verifica disponibilidade: não usado e não reservado (Requisito 4.5). */
  isAvailable(identifier: string): Promise<boolean>;
  /** Compõe o subdomínio completo `${identifier}.mobisno.com` (Requisito 4.4). */
  toSubdomain(identifier: string): string;
}

/**
 * Normaliza um nome de Loja num Identificador_de_Loja seguindo o algoritmo
 * do design.md (Requisitos 4.1, 4.2):
 *  1. Converter para minúsculas.
 *  2. Substituir espaços e caracteres não alfanuméricos por hífen.
 *  3. Colapsar hífenes consecutivos num único hífen.
 *  4. Remover hífenes no início e no fim.
 *  5. Se o resultado exceder 63 caracteres, truncar para 63 e remover o
 *     hífen final resultante.
 *
 * Garante que o resultado contém apenas `[a-z0-9-]`.
 */
export function normalizeIdentifier(name: string): string {
  // 1. Minúsculas.
  let identifier = name.toLowerCase();
  // 2. Substituir tudo o que não seja [a-z0-9] (espaços, acentos, símbolos,
  //    caracteres não alfanuméricos) por hífen.
  identifier = identifier.replace(/[^a-z0-9]/g, "-");
  // 3. Colapsar hífenes consecutivos num único hífen.
  identifier = identifier.replace(/-+/g, "-");
  // 4. Remover hífenes no início e no fim.
  identifier = identifier.replace(/^-+/, "").replace(/-+$/, "");
  // 5. Truncar a 63 caracteres e remover hífen final resultante.
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    identifier = identifier.slice(0, MAX_IDENTIFIER_LENGTH).replace(/-+$/, "");
  }
  return identifier;
}

/**
 * Valida o formato de um Identificador_de_Loja (Requisitos 4.7, 4.8):
 * 2–63 caracteres, apenas letras minúsculas, dígitos e hífenes, sem hífen
 * no início, no fim ou consecutivos.
 */
export function isValidIdentifierFormat(identifier: string): boolean {
  if (identifier.length < MIN_IDENTIFIER_LENGTH || identifier.length > MAX_IDENTIFIER_LENGTH) {
    return false;
  }
  // Blocos de [a-z0-9] separados por hífenes únicos; sem hífen inicial/final/duplo.
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifier);
}

/** Compõe o subdomínio completo a partir de um identificador (Requisito 4.4). */
export function toSubdomain(identifier: string): string {
  return `${identifier}${SUBDOMAIN_SUFFIX}`;
}

/**
 * Cria uma instância de {@link IdentifierService} com a lista de
 * identificadores reservados e o verificador de unicidade injetáveis.
 */
export function createIdentifierService(
  options: IdentifierServiceOptions = {},
): IdentifierService {
  const reserved = new Set(
    [...(options.reservedIdentifiers ?? DEFAULT_RESERVED_IDENTIFIERS)].map((value) =>
      value.toLowerCase(),
    ),
  );
  const isIdentifierTaken: IdentifierUniquenessChecker =
    options.isIdentifierTaken ?? (async () => false);

  return {
    normalize: normalizeIdentifier,
    isValidFormat: isValidIdentifierFormat,
    toSubdomain,
    async isAvailable(identifier: string): Promise<boolean> {
      // Reservado => indisponível (Requisito 4.5).
      if (reserved.has(identifier.toLowerCase())) {
        return false;
      }
      // Já associado a outra Loja => indisponível (Requisito 4.5).
      const taken = await isIdentifierTaken(identifier);
      return !taken;
    },
  };
}

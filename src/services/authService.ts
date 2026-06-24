/**
 * Serviço de Autenticação (AuthService) — ver design.md →
 * "Components and Interfaces → 1. Serviço de Autenticação (AuthService)".
 *
 * Responsável pelo registo e autenticação do Dono_da_Loja. Valida os dados
 * de registo/autenticação; em caso de dados inválidos ou incompletos devolve
 * um erro com o motivo (em português) para que a camada de UI possa apresentar
 * a mensagem e preservar os dados já introduzidos no Assistente_de_Criação
 * (Requisitos 1.4, 1.5).
 *
 * A persistência é abstraída através de um `OwnerRepository` injetável e o
 * hashing de palavras-passe através de um `PasswordHasher` injetável, de modo
 * a manter o serviço testável e independente da infraestrutura.
 */

import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Result, StoreOwner } from "../models/index.js";
import { ok, err } from "../models/index.js";

/**
 * Sessão autenticada de um Dono_da_Loja. Devolvida por `register`/`login` e
 * usada para resolver o dono atual através de `getCurrentOwner`.
 */
export interface Session {
  /** Identificador do Dono_da_Loja associado à sessão. */
  ownerId: string;
  /** Email do Dono_da_Loja (conveniência para a UI). */
  email: string;
  /** Token opaco da sessão. */
  token: string;
  /** Momento de criação da sessão (ISO 8601). */
  createdAt: string;
}

/** Código de erro de autenticação, estável para mapeamento na UI. */
export type AuthErrorCode =
  | "EMAIL_EM_FALTA"
  | "EMAIL_INVALIDO"
  | "PALAVRA_PASSE_EM_FALTA"
  | "NOME_EM_FALTA"
  | "EMAIL_JA_REGISTADO"
  | "CREDENCIAIS_INVALIDAS";

/**
 * Erro de autenticação devolvido em caso de dados inválidos/incompletos ou
 * credenciais erradas. Inclui o motivo legível e os campos em causa para que
 * a UI possa assinalar cada campo e preservar os restantes dados (Req. 1.5).
 */
export interface AuthError {
  code: AuthErrorCode;
  /** Motivo da rejeição, em português, para apresentação ao utilizador. */
  reason: string;
  /** Campos do formulário a que o erro diz respeito (ex.: ["email"]). */
  fields: string[];
}

/** Dados de entrada para o registo de um novo Dono_da_Loja. */
export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

/** Dados de entrada para a autenticação de um Dono_da_Loja. */
export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Repositório de Donos_da_Loja. Abstração de persistência injetável que
 * permite isolar o AuthService da camada de armazenamento concreta.
 */
export interface OwnerRepository {
  findByEmail(email: string): Promise<StoreOwner | null>;
  findById(id: string): Promise<StoreOwner | null>;
  create(owner: StoreOwner): Promise<StoreOwner>;
}

/** Estratégia de hashing de palavras-passe injetável. */
export interface PasswordHasher {
  hash(password: string): string;
  verify(password: string, passwordHash: string): boolean;
}

/** Gerador de identificadores e tokens injetável (facilita testes). */
export interface IdGenerator {
  newId(): string;
  newToken(): string;
}

/** Dependências configuráveis do AuthService. */
export interface AuthServiceDeps {
  ownerRepository: OwnerRepository;
  passwordHasher?: PasswordHasher;
  idGenerator?: IdGenerator;
  /** Relógio injetável para obter o instante atual (ISO 8601). */
  now?: () => string;
}

/**
 * Contrato do Serviço de Autenticação (design.md → AuthService).
 */
export interface AuthService {
  register(input: RegisterInput): Promise<Result<Session, AuthError>>;
  login(input: LoginInput): Promise<Result<Session, AuthError>>;
  getCurrentOwner(session: Session): Promise<StoreOwner | null>;
}

/**
 * Expressão regular pragmática para validação de formato de email.
 * Exige uma parte local, um "@", um domínio e um TLD com pelo menos 2 chars,
 * sem espaços em branco.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Hasher por omissão baseado em scrypt (node:crypto). */
const defaultPasswordHasher: PasswordHasher = {
  hash(password: string): string {
    const salt = randomBytes(16);
    const derived = scryptSync(password, salt, 64);
    return `${salt.toString("hex")}:${derived.toString("hex")}`;
  },
  verify(password: string, passwordHash: string): boolean {
    const [saltHex, hashHex] = passwordHash.split(":");
    if (!saltHex || !hashHex) {
      return false;
    }
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(password, salt, expected.length);
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  },
};

/** Gerador por omissão baseado em randomUUID/randomBytes. */
const defaultIdGenerator: IdGenerator = {
  newId(): string {
    return randomUUID();
  },
  newToken(): string {
    return randomBytes(32).toString("hex");
  },
};

/** Normaliza um email: trim + minúsculas. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Cria uma instância do AuthService com as dependências fornecidas.
 *
 * @param deps Dependências do serviço (repositório obrigatório; hasher,
 *             gerador de ids e relógio opcionais com implementações por omissão).
 */
export function createAuthService(deps: AuthServiceDeps): AuthService {
  const ownerRepository = deps.ownerRepository;
  const passwordHasher = deps.passwordHasher ?? defaultPasswordHasher;
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const now = deps.now ?? (() => new Date().toISOString());

  function newSession(owner: StoreOwner): Session {
    return {
      ownerId: owner.id,
      email: owner.email,
      token: idGenerator.newToken(),
      createdAt: now(),
    };
  }

  return {
    async register(input: RegisterInput): Promise<Result<Session, AuthError>> {
      const email = typeof input?.email === "string" ? normalizeEmail(input.email) : "";
      const password = typeof input?.password === "string" ? input.password : "";
      const name = typeof input?.name === "string" ? input.name.trim() : "";

      // Validação de dados de registo (Req. 1.5).
      if (email.length === 0) {
        return err({
          code: "EMAIL_EM_FALTA",
          reason: "O email é obrigatório.",
          fields: ["email"],
        });
      }
      if (!EMAIL_REGEX.test(email)) {
        return err({
          code: "EMAIL_INVALIDO",
          reason: "O email indicado não tem um formato válido.",
          fields: ["email"],
        });
      }
      if (password.length === 0) {
        return err({
          code: "PALAVRA_PASSE_EM_FALTA",
          reason: "A palavra-passe é obrigatória.",
          fields: ["password"],
        });
      }
      if (name.length === 0) {
        return err({
          code: "NOME_EM_FALTA",
          reason: "O nome é obrigatório.",
          fields: ["name"],
        });
      }

      // Unicidade do email.
      const existing = await ownerRepository.findByEmail(email);
      if (existing !== null) {
        return err({
          code: "EMAIL_JA_REGISTADO",
          reason: "Já existe uma conta associada a este email.",
          fields: ["email"],
        });
      }

      const owner: StoreOwner = {
        id: idGenerator.newId(),
        email,
        passwordHash: passwordHasher.hash(password),
        name,
        createdAt: now(),
      };
      const created = await ownerRepository.create(owner);

      return ok(newSession(created));
    },

    async login(input: LoginInput): Promise<Result<Session, AuthError>> {
      const email = typeof input?.email === "string" ? normalizeEmail(input.email) : "";
      const password = typeof input?.password === "string" ? input.password : "";

      // Validação de dados de autenticação (Req. 1.5).
      if (email.length === 0) {
        return err({
          code: "EMAIL_EM_FALTA",
          reason: "O email é obrigatório.",
          fields: ["email"],
        });
      }
      if (!EMAIL_REGEX.test(email)) {
        return err({
          code: "EMAIL_INVALIDO",
          reason: "O email indicado não tem um formato válido.",
          fields: ["email"],
        });
      }
      if (password.length === 0) {
        return err({
          code: "PALAVRA_PASSE_EM_FALTA",
          reason: "A palavra-passe é obrigatória.",
          fields: ["password"],
        });
      }

      const owner = await ownerRepository.findByEmail(email);
      // Mensagem genérica para não revelar se o email existe.
      if (owner === null || !passwordHasher.verify(password, owner.passwordHash)) {
        return err({
          code: "CREDENCIAIS_INVALIDAS",
          reason: "O email ou a palavra-passe estão incorretos.",
          fields: ["email", "password"],
        });
      }

      return ok(newSession(owner));
    },

    async getCurrentOwner(session: Session): Promise<StoreOwner | null> {
      if (!session || typeof session.ownerId !== "string" || session.ownerId.length === 0) {
        return null;
      }
      return ownerRepository.findById(session.ownerId);
    },
  };
}

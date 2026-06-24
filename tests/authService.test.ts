import { describe, it, expect } from "vitest";
import { isErr, isOk } from "../src/models/index.js";
import {
  createAuthService,
  type IdGenerator,
  type PasswordHasher,
  type Session,
} from "../src/services/authService.js";
import { createInMemoryOwnerRepository } from "../src/services/inMemoryOwnerRepository.js";

/**
 * Testes unitários do AuthService (Requisitos 1.4, 1.5).
 *
 * Cobrem registo e login com credenciais válidas e inválidas/incompletas,
 * a unicidade de email, a resolução do dono atual e a semântica de
 * preservação de dados (os erros transportam `reason` e `fields`).
 */

// Gerador determinístico para tornar os tokens/ids previsíveis nos testes.
function makeDeterministicIdGenerator(): IdGenerator {
  let idCount = 0;
  let tokenCount = 0;
  return {
    newId: () => `owner-${++idCount}`,
    newToken: () => `token-${++tokenCount}`,
  };
}

// Hasher trivial e reversível (apenas para teste; não usa scrypt para ser rápido).
const fakeHasher: PasswordHasher = {
  hash: (password: string) => `hashed:${password}`,
  verify: (password: string, passwordHash: string) => passwordHash === `hashed:${password}`,
};

function makeService() {
  const repository = createInMemoryOwnerRepository();
  const service = createAuthService({
    ownerRepository: repository,
    passwordHasher: fakeHasher,
    idGenerator: makeDeterministicIdGenerator(),
    now: () => "2024-01-01T00:00:00.000Z",
  });
  return { service, repository };
}

const validRegister = {
  email: "dona@loja.com",
  password: "segredo123",
  name: "Dona da Loja",
};

describe("AuthService.register", () => {
  it("regista com credenciais válidas e devolve uma sessão", async () => {
    const { service } = makeService();
    const result = await service.register(validRegister);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.ownerId).toBe("owner-1");
      expect(result.value.email).toBe("dona@loja.com");
      expect(result.value.token).toBe("token-1");
      expect(result.value.createdAt).toBe("2024-01-01T00:00:00.000Z");
    }
  });

  it("normaliza o email (trim + minúsculas) antes de persistir", async () => {
    const { service, repository } = makeService();
    const result = await service.register({
      ...validRegister,
      email: "  DONA@Loja.COM  ",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.email).toBe("dona@loja.com");
    }
    // O dono fica acessível pelo email normalizado.
    expect(await repository.findByEmail("dona@loja.com")).not.toBeNull();
  });

  it("não guarda a palavra-passe em texto simples", async () => {
    const { service, repository } = makeService();
    await service.register(validRegister);
    const owner = await repository.findByEmail("dona@loja.com");
    // A palavra-passe é guardada via hasher, nunca igual ao texto simples.
    expect(owner?.passwordHash).toBe("hashed:segredo123");
    expect(owner?.passwordHash).not.toBe("segredo123");
  });

  it("rejeita email em falta com motivo e campo", async () => {
    const { service } = makeService();
    const result = await service.register({ ...validRegister, email: "   " });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("EMAIL_EM_FALTA");
      expect(result.error.fields).toEqual(["email"]);
      expect(result.error.reason.length).toBeGreaterThan(0);
    }
  });

  it("rejeita email com formato inválido", async () => {
    const { service } = makeService();
    const result = await service.register({ ...validRegister, email: "nao-e-email" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("EMAIL_INVALIDO");
      expect(result.error.fields).toEqual(["email"]);
    }
  });

  it("rejeita palavra-passe em falta", async () => {
    const { service } = makeService();
    const result = await service.register({ ...validRegister, password: "" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("PALAVRA_PASSE_EM_FALTA");
      expect(result.error.fields).toEqual(["password"]);
    }
  });

  it("rejeita nome em falta (apenas espaços)", async () => {
    const { service } = makeService();
    const result = await service.register({ ...validRegister, name: "   " });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("NOME_EM_FALTA");
      expect(result.error.fields).toEqual(["name"]);
    }
  });

  it("rejeita email já registado (unicidade), incluindo caixa diferente", async () => {
    const { service } = makeService();
    const first = await service.register(validRegister);
    expect(isOk(first)).toBe(true);

    const duplicate = await service.register({
      ...validRegister,
      email: "DONA@LOJA.COM",
      name: "Outra Dona",
    });

    expect(isErr(duplicate)).toBe(true);
    if (isErr(duplicate)) {
      expect(duplicate.error.code).toBe("EMAIL_JA_REGISTADO");
      expect(duplicate.error.fields).toEqual(["email"]);
    }
  });

  it("valida o email antes da palavra-passe e do nome (ordem de validação)", async () => {
    const { service } = makeService();
    const result = await service.register({ email: "", password: "", name: "" });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("EMAIL_EM_FALTA");
    }
  });
});

describe("AuthService.login", () => {
  async function withRegisteredOwner() {
    const ctx = makeService();
    await ctx.service.register(validRegister);
    return ctx;
  }

  it("autentica com credenciais válidas e devolve uma sessão", async () => {
    const { service } = await withRegisteredOwner();
    const result = await service.login({
      email: "dona@loja.com",
      password: "segredo123",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.ownerId).toBe("owner-1");
      expect(result.value.email).toBe("dona@loja.com");
      expect(typeof result.value.token).toBe("string");
    }
  });

  it("autentica com email em caixa diferente (normalização)", async () => {
    const { service } = await withRegisteredOwner();
    const result = await service.login({
      email: "  DONA@LOJA.COM ",
      password: "segredo123",
    });
    expect(isOk(result)).toBe(true);
  });

  it("rejeita palavra-passe errada com mensagem genérica", async () => {
    const { service } = await withRegisteredOwner();
    const result = await service.login({
      email: "dona@loja.com",
      password: "errada",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("CREDENCIAIS_INVALIDAS");
      expect(result.error.fields).toEqual(["email", "password"]);
    }
  });

  it("rejeita email inexistente com a mesma mensagem genérica", async () => {
    const { service } = await withRegisteredOwner();
    const result = await service.login({
      email: "ninguem@loja.com",
      password: "segredo123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("CREDENCIAIS_INVALIDAS");
    }
  });

  it("rejeita email em falta", async () => {
    const { service } = await withRegisteredOwner();
    const result = await service.login({ email: "  ", password: "segredo123" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("EMAIL_EM_FALTA");
      expect(result.error.fields).toEqual(["email"]);
    }
  });

  it("rejeita email com formato inválido", async () => {
    const { service } = await withRegisteredOwner();
    const result = await service.login({ email: "invalido", password: "segredo123" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("EMAIL_INVALIDO");
    }
  });

  it("rejeita palavra-passe em falta", async () => {
    const { service } = await withRegisteredOwner();
    const result = await service.login({ email: "dona@loja.com", password: "" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("PALAVRA_PASSE_EM_FALTA");
      expect(result.error.fields).toEqual(["password"]);
    }
  });
});

describe("AuthService.getCurrentOwner", () => {
  it("resolve o dono a partir de uma sessão válida", async () => {
    const { service } = makeService();
    const registered = await service.register(validRegister);
    expect(isOk(registered)).toBe(true);
    if (!isOk(registered)) return;

    const owner = await service.getCurrentOwner(registered.value);
    expect(owner).not.toBeNull();
    expect(owner?.id).toBe("owner-1");
    expect(owner?.email).toBe("dona@loja.com");
    expect(owner?.name).toBe("Dona da Loja");
  });

  it("devolve null para uma sessão com ownerId inexistente", async () => {
    const { service } = makeService();
    const session: Session = {
      ownerId: "nao-existe",
      email: "x@y.com",
      token: "t",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    expect(await service.getCurrentOwner(session)).toBeNull();
  });

  it("devolve null para uma sessão sem ownerId", async () => {
    const { service } = makeService();
    const session = {
      ownerId: "",
      email: "x@y.com",
      token: "t",
      createdAt: "2024-01-01T00:00:00.000Z",
    } as Session;
    expect(await service.getCurrentOwner(session)).toBeNull();
  });
});

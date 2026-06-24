import { describe, it, expect } from "vitest";
import { MIN_PROPERTY_RUNS, assertProperty, fc } from "./helpers/property.js";

describe("configuração do projeto", () => {
  it("o test runner executa um teste trivial", () => {
    expect(1 + 1).toBe(2);
  });

  it("o mínimo de iterações de propriedades está configurado para pelo menos 100", () => {
    expect(MIN_PROPERTY_RUNS).toBeGreaterThanOrEqual(100);
  });

  it("o utilitário de propriedades executa com fast-check", () => {
    let runs = 0;
    assertProperty(
      fc.property(fc.integer(), (n) => {
        runs += 1;
        return n === n;
      }),
    );
    expect(runs).toBeGreaterThanOrEqual(MIN_PROPERTY_RUNS);
  });
});

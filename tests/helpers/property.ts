import fc from "fast-check";

/**
 * Número mínimo de iterações exigido para cada teste baseado em propriedades.
 * O design (Testing Strategy) exige no mínimo 100 iterações por propriedade.
 */
export const MIN_PROPERTY_RUNS = 100;

/**
 * Parâmetros padrão para execução de testes de propriedades com fast-check.
 * Garante que cada propriedade executa no mínimo `MIN_PROPERTY_RUNS` iterações.
 */
export const propertyParameters: fc.Parameters<unknown> = {
  numRuns: MIN_PROPERTY_RUNS,
};

/**
 * Executa uma propriedade síncrona com o número mínimo de iterações configurado.
 *
 * @param property A propriedade fast-check a verificar.
 * @param overrides Parâmetros adicionais (numRuns nunca desce abaixo do mínimo).
 */
export function assertProperty<Ts extends [unknown, ...unknown[]]>(
  property: fc.IPropertyWithHooks<Ts>,
  overrides: Partial<fc.Parameters<Ts>> = {},
): void {
  const numRuns = Math.max(overrides.numRuns ?? MIN_PROPERTY_RUNS, MIN_PROPERTY_RUNS);
  fc.assert(property, { ...overrides, numRuns });
}

/**
 * Versão assíncrona de `assertProperty` para propriedades que devolvem Promises.
 */
export async function assertPropertyAsync<Ts extends [unknown, ...unknown[]]>(
  property: fc.IAsyncPropertyWithHooks<Ts>,
  overrides: Partial<fc.Parameters<Ts>> = {},
): Promise<void> {
  const numRuns = Math.max(overrides.numRuns ?? MIN_PROPERTY_RUNS, MIN_PROPERTY_RUNS);
  await fc.assert(property, { ...overrides, numRuns });
}

export { fc };

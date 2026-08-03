/**
 * Decisão ÚNICA de visibilidade dos métodos de pagamento online de uma Loja.
 *
 * Consumida pelo Checkout (`web/views/checkout.ts`) e pela Gaveta_Do_Carrinho
 * (`web/lib/cartDrawer.ts`). Nenhum outro sítio decide — antes a regra estava
 * escrita duas vezes, uma em cada ficheiro, e as duas cópias divergiram do que
 * o Dono configurou.
 *
 * Vive em `src/services/` — e não em `web/lib/` — porque é regra de negócio
 * pura: sem `document`, sem `window`, sem `localStorage`. É isso que a torna
 * importável e testável a partir de `tests/`, que compila sem a biblioteca DOM.
 *
 * ## Porque existe a marca `__demoPayments`
 *
 * As Loja_Modelo de demonstração da galeria têm de mostrar Multicaixa Express e
 * Referência Bancária mesmo sem pagamentos ativos, para o visitante ver o
 * checkout completo. Essa exceção é marcada por `customization.__demoPayments`,
 * escrita **apenas** pelo Semeador_De_Modelos nas Loja_Modelo e **nunca
 * herdada**: quando uma Loja de cliente aplica um Modelo_De_Loja ou um Preset, a
 * marca é omitida da Personalização dessa Loja.
 *
 * É precisamente nisso que difere de `__basedOn` (e de `__template`), que a
 * versão anterior desta regra lia: `__basedOn` **é copiado** para a Loja do
 * cliente ao aplicar um modelo pronto, pelo que servia de marca de demonstração
 * a lojas reais — e essas passavam a anunciar métodos de pagamento online que
 * não tinham ativos. Nenhuma função deste módulo lê `__basedOn` nem `__template`.
 *
 * As duas funções são **totais**: aceitam `unknown` porque a Personalização
 * chega em JSON da base de dados e pode ter qualquer forma (Lojas antigas
 * incluídas), e nunca lançam, para qualquer entrada.
 */

/**
 * Devolve o valor como registo de propriedades, ou `null` quando não é um
 * objeto onde faça sentido ler campos. Arrays contam como não-objeto: uma
 * Personalização é sempre um objeto, e `[]` não é uma delas.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * A regra: os métodos de pagamento online estão ativos nesta Loja.
 *
 * Devolve `true` se e só se `custom.payments.onlineEnabled` for exatamente o
 * booleano `true`. A comparação é estrita, sem coerção — `"true"`, `1`, `{}` e
 * `[]` devolvem `false`, tal como `null`, `undefined` e campos de tipo errado.
 *
 * @param custom Personalização da Loja, de forma desconhecida.
 * @returns `true` quando os métodos online devem aparecer por estarem ativos.
 */
export function onlinePaymentsVisible(custom: unknown): boolean {
  const payments = asRecord(asRecord(custom)?.["payments"]);
  return payments?.["onlineEnabled"] === true;
}

/**
 * A marca de demonstração de uma Loja_Modelo.
 *
 * Devolve `true` se e só se `custom.__demoPayments` for exatamente o booleano
 * `true`. Comparação estrita, pelas mesmas razões de `onlinePaymentsVisible`.
 *
 * @param custom Personalização da Loja, de forma desconhecida.
 * @returns `true` quando esta Loja é uma demonstração e mostra os métodos
 *          online mesmo sem os ter ativos.
 */
export function isPaymentsDemo(custom: unknown): boolean {
  return asRecord(custom)?.["__demoPayments"] === true;
}

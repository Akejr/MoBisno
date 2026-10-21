/**
 * Funcionalidades anunciadas mas ainda não disponíveis — «Em breve».
 *
 * Uma só lista, lida por todos os sítios que precisam de saber: o Dashboard
 * (que mostra a etiqueta e bloqueia a configuração), a loja publicada (que não
 * carrega os pixels de marketing enquanto estiverem «Em breve») e o assistente
 * (que tem de dizer a verdade sobre o que existe).
 *
 * Vivia dentro de `web/views/dashboard.ts`, e o assistente repetia a lista à mão
 * num texto — que é exatamente a forma de as duas divergirem.
 *
 * **Em breve desliga, não apaga** (decisão D6): o saldo de SMS já comprado, um
 * domínio já guardado e os IDs de pixel já gravados ficam intactos. Reverter é
 * pôr a bandeira a `false`.
 */

/** Bandeiras das funcionalidades «Em breve». `true` = bloqueada. */
export const COMING_SOON = {
  /** SMS de confirmação de compra (falta integrar um fornecedor). */
  sms: true,
  /** Domínio próprio (a ligação de DNS ainda é manual). */
  customDomain: true,
  /** Marketing e pixels (Meta Pixel e Google Analytics 4). */
  marketing: true,
} as const;

/** Uma funcionalidade que pode estar «Em breve». */
export type ComingSoonFeature = keyof typeof COMING_SOON;

/** Nome de cada funcionalidade, como o Dono a vê. */
export const COMING_SOON_LABELS: Readonly<Record<ComingSoonFeature, string>> = {
  sms: "SMS de confirmação de compra",
  customDomain: "Domínio próprio",
  marketing: "Marketing e pixels (Meta Pixel e Google Analytics)",
};

/** Esta funcionalidade está bloqueada como «Em breve»? */
export function isComingSoon(feature: ComingSoonFeature): boolean {
  return COMING_SOON[feature] === true;
}

/** Nomes das funcionalidades «Em breve», pela ordem acima. */
export function comingSoonList(): string[] {
  return (Object.keys(COMING_SOON) as ComingSoonFeature[])
    .filter(isComingSoon)
    .map((f) => COMING_SOON_LABELS[f]);
}

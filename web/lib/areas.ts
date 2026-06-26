/**
 * Áreas de entrega (Luanda). A província é fixa nesta fase; o cliente escolhe
 * a área no checkout (produtos físicos) e a taxa correspondente é somada ao
 * total. A loja define, nas Configurações, que áreas serve e o preço de cada.
 */
export const DELIVERY_PROVINCE = "Luanda";

export const LUANDA_AREAS: readonly string[] = [
  "Benfica",
  "Cacuaco",
  "Calemba 2",
  "Camama",
  "Cassequel",
  "Cidade",
  "Escongolenses",
  "Golf 2",
  "Kilamba",
  "Morro Bento",
  "Nova Vida",
  "Palanca",
  "Prenda",
  "Rocha Pinto",
  "Samba",
  "Sequel",
  "Talatona",
  "Viana",
  "Zango",
];

/** Áreas que a loja serve, na ordem canónica, com a respetiva taxa. */
export function deliveredAreas(fees: Record<string, number> | undefined): { name: string; fee: number }[] {
  if (!fees) return [];
  return LUANDA_AREAS.filter((a) => typeof fees[a] === "number").map((a) => ({ name: a, fee: Number(fees[a]) }));
}

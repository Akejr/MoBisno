/**
 * Áreas de entrega (Luanda). A província é fixa nesta fase; o cliente escolhe
 * a área no checkout (produtos físicos) e a taxa correspondente é somada ao
 * total. A loja define, nas Configurações, que áreas serve e o preço de cada.
 *
 * A implementação vive em `src/services/delivery.ts` — domínio puro, dentro do
 * programa do `tsc` e comparado com o espelho do servidor (`LUANDA_AREAS`,
 * `deliveredAreasOf` e `deliveryFeeOf` em `api/_shared.js`) por
 * `tests/serverOrder.test.ts`. Este ficheiro reexporta-a, seguindo o precedente
 * de `web/lib/whatsapp.ts`, para que nenhum ponto de chamada mude de import.
 *
 * `deliveryFeeFor` é a regra com que o servidor cobra a entrega: o checkout usa
 * a mesma, para o total que o comprador vê ser o que o servidor calcula.
 */
export {
  DELIVERY_PROVINCE,
  LUANDA_AREAS,
  deliveredAreas,
  deliveryFeeFor,
  freeDeliveryFrom,
  type DeliveryArea,
  type DeliveryConfig,
  type DeliveryFeeResult,
} from "../../src/services/delivery.js";

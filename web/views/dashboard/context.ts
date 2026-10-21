/**
 * O que cada separador do Dashboard do Dono recebe da moldura do painel.
 *
 * A moldura (`web/views/dashboard.ts`) lê a conta uma vez — lojas, loja ativa,
 * subscrição — e passa-a aqui a cada separador. O separador só lê os seus
 * próprios dados e pinta o seu conteúdo: a navegação, o seletor de loja e o
 * cabeçalho não são assunto dele.
 */
import type { Store } from "../../../src/models/index.js";
import type { BillingState } from "../../../src/services/billing.js";

export interface DashCtx {
  ownerId: string;
  /** A loja em edição (a escolhida no seletor). */
  store: Store;
  /** Todas as lojas do Dono, sem as lojas-modelo. */
  stores: readonly Store[];
  billing: BillingState;
  /** Endereço público da loja (em desenvolvimento, o caminho `/loja/…`). */
  storeUrl: string;
  /** Endereço da pré-visualização privada (a loja por publicar). */
  previewUrl: string;
  /**
   * Pinta o conteúdo do separador. A moldura à volta — e o assistente, que é
   * montado depois — mantém-se: redesenhar a lista depois de uma ação não pode
   * levar o assistente com ela.
   *
   * Devolve `false` quando este desenho já foi ultrapassado (o Dono mudou de
   * separador ou de loja enquanto os dados chegavam): nada é pintado, e o
   * separador não deve ligar eventos — ligava-os ao ecrã de outro separador.
   */
  paint(content: string): boolean;
  /** Esqueleto de carregamento no lugar do conteúdo, antes de esperar pelos dados. */
  loading(): void;
  /** Volta a desenhar o painel inteiro (depois de publicar, de pagar, de trocar de loja…). */
  reload(): Promise<void>;
}

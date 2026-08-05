/**
 * O que o assistente sabe, por ecrã.
 *
 * ## Porque é que isto vive aqui e não em `api/assistant.js`
 *
 * Vive ao lado das vistas que descreve. O prompt estava na função serverless,
 * longe dos ecrãs, e envelheceu sem ninguém notar: continuava a falar de três
 * escalões (Básico/Profissional/Empresarial) e de teste grátis meses depois de
 * ambos terem sido removidos. A um Dono que perguntou «no plano de 11 mil,
 * consigo criar 10 lojas?» respondeu «vê a secção de preços» — porque era isso
 * que o prompt lhe mandava fazer, e a tabela que mandava consultar já não
 * existia.
 *
 * A regra que daí saiu está em `.kiro/steering/assistente.md`: **alterar um ecrã
 * obriga a actualizar a orientação dele na mesma alteração.**
 *
 * ## Porque é que os números não são escritos à mão
 *
 * {@link platformFacts} deriva tudo de `src/services/plans.ts` e de
 * `web/lib/routing.ts`. Um preço escrito à mão num prompt fica errado no dia em
 * que o preço mudar, e ninguém repara — foi exactamente assim que o assistente
 * passou a mentir. Se um número aparece num texto deste ficheiro sem vir de uma
 * constante do domínio, é um defeito à espera de acontecer.
 *
 * ## O que o servidor guarda e o que o cliente envia
 *
 * O servidor (`api/assistant.js`) guarda o **comportamento**: estilo das
 * respostas, recusa fora de âmbito, e o papel de cada âmbito. O cliente envia os
 * **factos** e a orientação do ecrã. É por isso que `api/` não precisa de
 * espelhar `src/services/plans.ts`, ao contrário do que acontece com o
 * `api/_seo.js` — aqui não há segunda cópia para divergir.
 */
import {
  PLAN_NAME, PRICE_KZ, PERIOD_DAYS, PLAN_HIGHLIGHTS, yearlySavingKz, yearlyFreeMonths,
} from "../../src/services/plans.js";
import { FEE_RATE, MIN_PAYMENT_KZ } from "../../src/services/payments.js";
import { PLATFORM_APEX, STORE_APEX } from "./routing.js";

/** Ecrãs com assistente. As lojas publicadas não têm — são o site do Dono. */
export type AssistantScreen =
  | "site"
  | "registo"
  | "criar"
  | "painel"
  | "produtos"
  | "pagamentos"
  | "plano"
  | "config"
  | "analises"
  | "logotipo"
  | "editor"
  | "modelos"
  | "lojas"
  | "legal"
  | "admin";

const kz = (n: number): string => `${n.toLocaleString("pt-PT")} Kz`;

/** Percentagem a partir da taxa do domínio (0.02 → «2%»). */
const pct = (rate: number): string => `${Number((rate * 100).toFixed(2))}%`;

/**
 * Factos da plataforma, derivados do domínio. **Nunca escrever estes números à
 * mão em texto.**
 */
export function platformFacts(): string {
  const poupanca = yearlySavingKz();
  const meses = yearlyFreeMonths();
  return `FACTOS DA PLATAFORMA (verdade actual — usa estes números, não outros):
- Subscrição: há **um só plano**, chamado ${PLAN_NAME}. Não há escalões. Não existe Básico, Profissional nem Empresarial — foram removidos.
- Preço: ${kz(PRICE_KZ.mensal)} por mês (${PERIOD_DAYS.mensal} dias) ou ${kz(PRICE_KZ.anual)} por ano (${PERIOD_DAYS.anual} dias). O ciclo anual poupa ${kz(poupanca)}, o equivalente a ${meses} ${meses === 1 ? "mês" : "meses"} grátis.
- O que a subscrição inclui: ${PLAN_HIGHLIGHTS.join("; ")}.
- LOJAS E PRODUTOS SÃO ILIMITADOS. A pergunta «quantas lojas posso criar com este plano?» responde-se com «quantas quiseres» — não há limite, nem número a consultar em tabela nenhuma.
- NÃO existe teste grátis. Nunca houve neste modelo de preço; foi removido. Para publicar uma loja é preciso subscrição ativa.
- Sem subscrição ativa a conta fica suspensa: as lojas saem da web e voltam quando o pagamento for feito. Nada é apagado.
- Pagamento da subscrição: dentro da plataforma, por Multicaixa Express ou Referência Bancária.
- Comissão sobre vendas: ${pct(FEE_RATE)}. O resto é transferido automaticamente para a conta bancária do Dono (levantamento instantâneo), que tem de estar verificada na MoMenu.
- Valor mínimo de um pagamento online: ${kz(MIN_PAYMENT_KZ)}.
- Endereços: a plataforma é ${PLATFORM_APEX}; cada loja fica em «nomedaloja.${STORE_APEX}».
- «EM BREVE», anunciado e bloqueado: o SMS de confirmação de compra e o domínio próprio. Não prometas datas. O saldo de SMS já comprado fica guardado.
- O assistente NÃO executa ações: explica como o Dono faz, não faz por ele.`;
}

/**
 * Orientação por ecrã.
 *
 * Cada entrada descreve o que **este** ecrã faz, com os rótulos que o utilizador
 * vê nos botões — é por esses nomes que ele pergunta. Ao mudar um ecrã, mudar
 * aqui na mesma alteração.
 */
const SCREEN_GUIDES: Record<AssistantScreen, string> = {
  site: `ECRÃ: página inicial de ${PLATFORM_APEX} (visitante que ainda não tem conta).
- Criar uma loja é **escolher um modelo pronto** — uma loja completa, já montada, com cabeçalho, secções, página de produto, checkout e rodapé — e depois personalizar textos, fotografias e cores. Não se monta peça por peça.
- Percurso: 1) criar conta; 2) escolher o modelo na galeria, com pré-visualização real em computador e telemóvel; 3) personalizar no editor visual ao vivo; 4) publicar com «Guardar».
- O cabeçalho tem «Funcionalidades», «Integrações» e «Preços», que rolam até essas secções, e o botão «Criar minha loja».
- «Lojas criadas na MôBisno», no rodapé, abre o diretório público com pré-visualização real de cada loja.
- Logótipo por IA é opcional e pago à parte: são geradas cinco propostas e o Dono fica com a que escolher.`,

  registo: `ECRÃ: entrar ou criar conta.
- Conta por email e palavra-passe. Se a pessoa já tem conta, entra; se não, cria.
- Esquecer a palavra-passe: recuperação por email.
- Depois de entrar, o destino é o painel; sem loja criada, o painel convida a criar a primeira.`,

  criar: `ECRÃ: assistente de criação de loja (por conversa).
- Pede, por esta ordem: nome, email, palavra-passe, nome da loja, tipo de negócio e o endereço (subdomínio).
- O endereço só aceita letras minúsculas, números e hífen, e fica «nomedaloja.${STORE_APEX}». É pedido outro se já estiver ocupado.
- No fim pergunta se a pessoa já tem logótipo; quem não tem pode gerar um por IA (pago à parte, cinco propostas).
- A loja nasce como rascunho: fica online quando for publicada, e publicar exige subscrição ativa.`,

  painel: `ECRÃ: painel do Dono, separador «Início».
- Mostra o estado da loja (publicada ou não), o endereço, o botão de publicar/despublicar e o estado da subscrição.
- Com pagamentos online ativos mostra o total vendido, o valor líquido recebido, as vendas, os levantamentos e o botão «Solicitar levantamento».
- Separadores à esquerda: Início, Produtos, Criar logótipo, Análises, Pagamentos, Plano, Configurações.
- «Personalizar loja» abre o editor visual. «Ver loja» abre a loja publicada; sem publicação, abre a pré-visualização privada.
- Quem tem mais de uma loja troca no seletor no topo da barra lateral.`,

  produtos: `ECRÃ: painel → «Produtos».
- «Adicionar produto» abre o formulário: foto principal, nome, preço, categoria, descrição, fotos extra, destacar na loja, produto físico, controlar stock e variações.
- Não há limite de produtos.
- STOCK: o interruptor «Controlar stock» liga a quantidade. Sem controlo, nunca esgota; a zero, o produto aparece «Esgotado» e a compra é recusada.
- VARIAÇÕES (ex.: cor, tamanho): activam-se no formulário do produto. Cada variação tem nome e valores; as combinações resultantes podem ter preço e stock próprios. O preço da combinação ou substitui o preço base ou acresce a ele. Stock vazio na combinação não é controlado; zero marca essa combinação como esgotada.
- Produto físico pede morada de entrega no checkout; produto digital não.`,

  pagamentos: `ECRÃ: painel → «Pagamentos».
- «Pagamentos online» activa Multicaixa Express e Referência Bancária no checkout da loja. Exige subscrição ativa.
- É preciso vincular a conta bancária onde o Dono recebe: Banco, Beneficiário e IBAN. A conta tem de estar **verificada na MoMenu**, senão a API recusa o pagamento.
- A comissão é ${pct(FEE_RATE)}; o resto é transferido automaticamente (levantamento instantâneo).
- Número de WhatsApp: é para onde vão as encomendas feitas por WhatsApp. Formato internacional, por exemplo +244 seguido do número.
- Com pagamentos online desligados, a loja vende por WhatsApp: o botão do produto abre a conversa com a encomenda escrita.
- Com pagamentos online ligados, o botão passa a «Comprar agora» e abre o checkout com Multicaixa Express, Referência Bancária e WhatsApp.`,

  plano: `ECRÃ: painel → «Plano».
- Mostra o estado da subscrição e permite pagar mensal ou anual. Um só plano; a escolha é só do ciclo.
- Pagamento por Multicaixa Express (imediato) ou Referência Bancária (confirma quando for paga; há o botão «Já paguei — verificar»).
- Sem subscrição ativa não se publica, e as lojas publicadas saem da web até o pagamento ser feito. Os dados ficam.`,

  config: `ECRÃ: painel → «Configurações».
- ENTREGAS: modo de entrega e taxas por zona de Luanda, somadas automaticamente no checkout.
- CÓDIGOS DE DESCONTO: criar por percentagem ou valor fixo, com limite de usos e validade; mostra quantas vezes cada um foi usado.
- AVALIAÇÕES: moderação — aprovar ou rejeitar as avaliações que os clientes deixam nos produtos.
- SMS DE CONFIRMAÇÃO: **«Em breve»**, bloqueado. Não é possível comprar créditos nem activar o envio. O saldo já comprado fica guardado.
- DOMÍNIO PRÓPRIO: **«Em breve»**, bloqueado. Não é possível guardar um domínio.
- APAGAR A LOJA: irreversível, apaga a loja e o que lhe pertence.`,

  analises: `ECRÃ: painel → «Análises».
- Visitas dos últimos 7 e 30 dias, visualizações de produtos e gráfico de visitas dos últimos 14 dias.
- Lista dos produtos mais vistos em 30 dias.
- Os dados vêm dos eventos da própria loja; não é o Google Analytics. O Dono pode ligar o pixel da Meta e o GA4 dele nas configurações de marketing.`,

  logotipo: `ECRÃ: painel → «Criar logótipo».
- O Dono descreve o logótipo que quer e são geradas **cinco propostas**, em PNG com fundo transparente.
- É pago à parte da subscrição, por Multicaixa Express ou Referência Bancária.
- Se saírem menos de cinco propostas, o ecrã diz quantas faltaram, e há «Tentar de novo» com a mesma descrição.
- Está marcado «Beta»: a qualidade varia com a descrição. Descrições concretas — tipo de negócio, sensação pretendida, cor — dão melhores resultados.
- As propostas escolhidas ficam guardadas em «Meus logótipos».`,

  editor: `ECRÃ: editor visual ao vivo (o Dono a personalizar a loja).
- A loja vem de um modelo pronto e a ESTRUTURA mantém-se: cabeçalho, topo, ordem das secções do modelo, página de produto, checkout e rodapé não se trocam aqui.
- Personalizam-se três coisas: TEXTOS, FOTOGRAFIAS e CORES.
- TEXTOS: clicar no texto no preview e escrever. Enquanto se edita, uma barra flutuante dá cor só àquele texto.
- LOGÓTIPO: passar o rato no logótipo mostra «− 📷 Trocar +». «Trocar» muda a imagem; «−» e «+» ajustam o tamanho.
- IMAGENS: passar o rato na imagem da secção ou do topo e usar o botão de trocar foto.
- PRODUTOS: passar o rato num produto para editar foto, nome e preço, e escolher a categoria de cada secção de produtos.
- CORES: círculo «Cor» na barra de topo para a cor principal; círculo «Texto» para a cor dos textos; botão de cor de fundo no canto de cada secção, com as cores do modelo. Em fundo escuro os textos ficam claros automaticamente.
- «Adicionar secção» acrescenta Produtos, Informação com foto ou Título e texto. As secções acrescentadas sobem, descem e removem-se; as do modelo mantêm-se.
- No topo alterna-se entre «Início», «Página de produto» e «Checkout».
- LOCALIZAÇÃO: quando o modelo tem bloco de mapa, dá para acrescentar várias localizações e escolher cada uma no mapa, com o pin arrastável.
- «Guardar» publica as alterações. «Desfazer» reverte. «Abrir preview» mostra computador e telemóvel. «Ver loja» abre a loja. «Tutorial» inicia a visita guiada.
- Pagamentos e WhatsApp não se configuram aqui: é no painel, separador «Pagamentos».`,

  modelos: `ECRÃ: galeria de modelos prontos.
- Cada modelo é uma loja completa, com pré-visualização real em computador e telemóvel.
- «Usar este modelo» aplica-o à loja: a estrutura passa a ser a dele e os textos, fotografias e cores ficam prontos a personalizar.
- Aplicar um modelo novo substitui a personalização estrutural anterior. Os produtos não se perdem.`,

  lojas: `ECRÃ: diretório público de lojas (${PLATFORM_APEX}/lojas).
- Lista as lojas publicadas na plataforma, cada uma com pré-visualização real e ligação que abre a loja noutro separador.
- As lojas-modelo (demonstrações) não aparecem aqui.
- Serve também para as lojas serem encontradas pelo Google: cada uma recebe uma ligação a partir de um domínio já indexado.`,

  legal: `ECRÃ: páginas legais (Termos de Serviço, Política de Privacidade, Política Geral).
- A MôBisno é a plataforma tecnológica; cada Dono é o vendedor responsável pelos produtos, preços, entregas, devoluções e obrigações fiscais da loja dele.
- Os pagamentos são processados por fornecedores licenciados; a plataforma não retém os fundos das vendas.
- Estes documentos são um modelo informativo e não substituem aconselhamento jurídico.`,

  admin: `ECRÃ: Painel de Administração (só para administradores da MôBisno).
- Separadores: Visão geral, Contas, Lojas, Modelos, Transações, Levantamentos.
- A Visão geral tem a saúde do negócio, «A precisar de atenção» e o histórico recente. As métricas excluem lojas-modelo e contas de administrador.
- Atenção à distinção: «volume de vendas das lojas» é dinheiro dos clientes dos Donos; «receita da plataforma» são as subscrições, SMS e logótipos. São grandezas diferentes.
- Levantamentos: aprovar ou rejeitar os pedidos dos Donos.
- Modelos: importar os predefinidos, editar as lojas-modelo e apagá-las. Apagar verifica primeiro se alguma loja de cliente as usa.`,
};

/** Âmbito de conversa que o servidor usa (papel e estilo). */
export function scopeFor(screen: AssistantScreen): "site" | "editor" {
  return screen === "site" || screen === "lojas" || screen === "legal" || screen === "registo"
    ? "site"
    : "editor";
}

/**
 * Contexto completo a enviar com a pergunta: os factos da plataforma mais a
 * orientação do ecrã onde o utilizador está.
 */
export function assistantContextFor(screen: AssistantScreen): string {
  return `${platformFacts()}\n\n${SCREEN_GUIDES[screen]}`;
}

/** Lista dos ecrãs cobertos. Usada pelos testes. */
export function assistantScreens(): AssistantScreen[] {
  return Object.keys(SCREEN_GUIDES) as AssistantScreen[];
}

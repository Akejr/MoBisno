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
import { PASSWORD_MIN_LENGTH, REGISTER_FIX_LABELS } from "../../src/ui/wizardSteps.js";
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
- Preço: ${kz(PRICE_KZ.mensal)} por mês (${PERIOD_DAYS.mensal} dias) ou ${kz(PRICE_KZ.anual)} por ano (${PERIOD_DAYS.anual} dias), **por cada loja publicada**. O ciclo anual poupa ${kz(poupanca)} por loja, o equivalente a ${meses} ${meses === 1 ? "mês" : "meses"} grátis.
- O que a subscrição inclui: ${PLAN_HIGHLIGHTS.join("; ")}.
- O PREÇO É POR LOJA PUBLICADA. Criar lojas é livre e não custa nada: paga-se as que estão **online**. Duas lojas publicadas custam ${kz(PRICE_KZ.mensal * 2)} por mês; três, ${kz(PRICE_KZ.mensal * 3)}; e assim por diante. Uma loja em rascunho não é cobrada.
- «Quantas lojas posso criar?» → quantas quiseres, sem limite. O que tem preço é publicá-las, uma a uma.
- Para pagar menos, o Dono despublica lojas no Dashboard → «Plano»: a lista tem um interruptor por loja e o total muda ali mesmo, antes de pagar. Despublicar não apaga nada; a loja volta quando ele quiser (pagando o lugar).
- Publicar uma loja a mais a meio de um ciclo já pago custa **só os dias que faltam** desse ciclo, não um ciclo inteiro.
- PRODUTOS SÃO ILIMITADOS em qualquer loja.
- Contas de ADMINISTRADOR da MôBisno não pagam e não têm limite de lojas. Isto não se aplica a Donos de loja.
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

  registo: `ECRÃ: início de sessão.
- Conta por email e palavra-passe, com o botão «Entrar» e um olho para mostrar a palavra-passe escrita.
- Quem ainda não tem conta segue «Criar a minha loja», que abre o assistente de criação — é lá que a conta é criada, junto com a primeira loja.
- NÃO há recuperação de palavra-passe esquecida, nem confirmação de email por código ou por SMS: a palavra-passe não se muda depois de a conta existir. Não prometas um email de recuperação.
- Depois de entrar, o destino é o Dashboard; sem loja criada, o Dashboard convida a criar a primeira.`,

  criar: `ECRÃ: assistente de criação de loja (por conversa). Trata sempre por «tu».
- CONTA, por esta ordem: o nome; o email; a palavra-passe (mínimo ${PASSWORD_MIN_LENGTH} caracteres); e a mesma palavra-passe outra vez, para confirmar.
- Um email com formato inválido é recusado ali mesmo e é pedido de novo, sem perder o que já foi escrito.
- Se as duas palavras-passe não coincidirem, o assistente diz «As duas palavras-passe não são iguais» e pede **as duas de novo** — não só a segunda, para o Dono não ter de adivinhar qual estava errada. A palavra-passe nunca aparece no chat: fica sempre «••••••••».
- Antes de criar a conta aparece o cartão «Os teus dados», com «Nome» e «Email», e três botões: «Está tudo certo», «${REGISTER_FIX_LABELS.nome}» e «${REGISTER_FIX_LABELS.email}». Corrigir um campo pede só esse campo e volta ao mesmo cartão: os passos anteriores não se repetem.
- Se a criação da conta falhar, o assistente mostra o motivo e pergunta o que corrigir, com «${REGISTER_FIX_LABELS.email}», «${REGISTER_FIX_LABELS.nome}» e «${REGISTER_FIX_LABELS.password}». Quando o email já tem conta, aparece primeiro «${REGISTER_FIX_LABELS.entrar}», que leva ao início de sessão (${PLATFORM_APEX}/#/login) — depois de entrar, volta-se aqui para criar a loja. A escolha de para onde voltar é do Dono: o assistente não decide sozinho.
- O QUE NÃO EXISTE NESTE ECRÃ: não há recuperação de palavra-passe esquecida, não há confirmação de email por código nem por SMS, e não se muda a palavra-passe depois de a conta existir. Quem já tem conta entra em ${PLATFORM_APEX}/#/login.
- Com sessão já iniciada, os passos da conta não aparecem: o assistente começa no nome da loja.
- LOJA, a seguir à conta: nome da loja, tipo de negócio e o endereço (subdomínio).
- O endereço só aceita letras minúsculas, números e hífen, e fica «nomedaloja.${STORE_APEX}». É pedido outro se já estiver ocupado.
- No fim pergunta se a pessoa já tem logótipo; quem não tem pode gerar um por IA (pago à parte, cinco propostas).
- A loja nasce como rascunho: fica online quando for publicada, e publicar exige subscrição ativa.`,

  painel: `ECRÃ: Dashboard do Dono, separador «Início».
- Publicar exige subscrição ativa **e um lugar pago**: o preço é por loja publicada. Sem lugar livre, o botão de publicar manda o Dono ao separador «Plano».
- ESTADO DA LOJA, com ponto colorido ao lado do rótulo: «Publicada» (verde, está no ar), «Não publicada» (cinzento, só o Dono a vê pela pré-visualização) ou «Fora do ar» (vermelho, a subscrição não está ativa e a loja saiu da web; os dados ficam). Debaixo da saudação há uma frase a explicar o que esse estado significa.
- O endereço da loja é clicável: com a loja no ar abre a loja, fora do ar abre a pré-visualização privada. Ao lado há o botão «Copiar», que copia o endereço.
- Botão de publicar/despublicar e atalho ao estado da subscrição («Subscrição ativa» ou «Sem subscrição»).
- Com pagamentos online ativos, cada informação tem um cartão só seu: «Valor total vendido» (o destacado, soma das vendas pagas), «Recebido (líquido)», «Disponível para levantar», «Vendas pagas», «Produtos» e «Referências pendentes».
- «Recebido (líquido)» traz a barra «Já pedido» / «Disponível» e a frase que diz sobre que valor é a proporção («… recebidos (líquido, já sem a taxa)»). «Já pedido» é o que já foi pedido em levantamentos, não dinheiro que já esteja no banco.
- «Disponível para levantar» tem o botão «Solicitar levantamento» e a nota da conta bancária que vai receber; sem conta bancária vinculada, a nota manda vinculá-la em «Pagamentos».
- «Vendas pagas por dia» é um cartão próprio, com o total e o número de dias ao lado do título. Conta só vendas pagas e continua fixo em 14 dias; tocar ou passar o rato num dia mostra a data, o valor e o número de vendas desse dia. Sem nenhuma venda paga não há gráfico vazio: o ecrã diz que ele aparece com a primeira venda paga.
- Depois a lista «Vendas», paginada, cada linha com uma faixa colorida pelo estado (paga, pendente, expirada, falhou, cancelada) e abrindo para ver método, taxa, líquido, referência e fatura.
- APAGAR REGISTOS: nas linhas com estado «Expirada» — referência bancária cuja data-limite passou — abrir a linha mostra o botão «Apagar registo» e a frase «A referência passou a data-limite e já não pode ser paga.» A confirmação avisa que é definitivo e não recuperável. **Só as expiradas se apagam**: pagas, pendentes dentro do prazo, falhadas e canceladas não podem ser apagadas, e é a base de dados que o impede, não só o ecrã.
- Por fim, «Levantamentos», com o estado de cada pedido.
- Loja sem nenhuma venda não mostra uma lista vazia: mostra «Ainda não há vendas» com os passos que faltam (pagamentos online ativos, ter produtos, publicar a loja, partilhar o endereço).
- Sem pagamentos online, o Início mostra só «Produtos» e «Estado», e convida a ativar em «Pagamentos».
- Não há filtro de datas nem exportação: o gráfico é fixo em 14 dias e conta apenas vendas pagas.
- NAVEGAÇÃO, as mesmas sete secções nos dois tamanhos de ecrã: Início, Produtos, Criar logótipo, Análises, Pagamentos, Plano, Configurações. Em ecrã grande estão na barra lateral; em telemóvel estão numa faixa de atalhos deslizante logo abaixo do cabeçalho (a barra lateral não existe no telemóvel).
- Em telemóvel há ainda uma barra com o seletor de loja (só para quem tem mais de uma), «Nova loja», o atalho «Dashboard de Administração» (só em contas de administrador) e «Terminar sessão».
- «Personalizar loja» abre o editor visual. «Ver loja» abre a loja publicada; sem publicação, abre a pré-visualização privada.
- Quem tem mais de uma loja troca no seletor de loja: no topo da barra lateral em ecrã grande, na barra de topo em telemóvel.`,

  produtos: `ECRÃ: Dashboard → «Produtos».
- «Adicionar produto» abre o formulário: foto principal, nome, preço, categoria, descrição, fotos extra, destacar na loja, produto físico, controlar stock e variações.
- Não há limite de produtos.
- STOCK: o interruptor «Controlar stock» liga a quantidade. Sem controlo, nunca esgota; a zero, o produto aparece «Esgotado» e a compra é recusada.
- VARIAÇÕES (ex.: cor, tamanho): activam-se no formulário do produto. Cada variação tem nome e valores; as combinações resultantes podem ter preço e stock próprios. O preço da combinação ou substitui o preço base ou acresce a ele. Stock vazio na combinação não é controlado; zero marca essa combinação como esgotada.
- Produto físico pede morada de entrega no checkout; produto digital não.`,

  pagamentos: `ECRÃ: Dashboard → «Pagamentos».
- «Pagamentos online» activa Multicaixa Express e Referência Bancária no checkout da loja. Exige subscrição ativa.
- É preciso vincular a conta bancária onde o Dono recebe: Banco, Beneficiário e IBAN. A conta tem de estar **verificada na MoMenu**, senão a API recusa o pagamento.
- A comissão é ${pct(FEE_RATE)}; o resto é transferido automaticamente (levantamento instantâneo).
- Número de WhatsApp: é para onde vão as encomendas feitas por WhatsApp. Formato internacional, por exemplo +244 seguido do número.
- Com pagamentos online desligados, a loja vende por WhatsApp: o botão do produto abre a conversa com a encomenda escrita.
- Com pagamentos online ligados, o botão passa a «Comprar agora» e abre o checkout com Multicaixa Express, Referência Bancária e WhatsApp.`,

  plano: `ECRÃ: Dashboard → «Plano».
- Mostra o estado da subscrição e permite pagar mensal ou anual. Um só plano; a escolha é do ciclo e do **número de lojas publicadas**.
- Tem a lista «Lojas publicadas», com um interruptor por loja: desligar despublica e o total dos dois cartões de preço desce ali mesmo. É assim que se baixa a mensalidade antes de pagar.
- Os cartões «Mensal» e «Anual» mostram o total já multiplicado pelas lojas publicadas, e debaixo do valor está a conta («2 loja(s) × 11.000 Kz»).
- Publicar mais uma loja quando os lugares pagos estão todos ocupados é recusado, com o preço dos dias que faltam do ciclo.
- Uma conta de administrador não vê preços aqui: não paga e não tem limite de lojas.
- Pagamento por Multicaixa Express (imediato) ou Referência Bancária (confirma quando for paga; há o botão «Já paguei — verificar»).
- Sem subscrição ativa não se publica, e as lojas publicadas saem da web até o pagamento ser feito. Os dados ficam.`,

  config: `ECRÃ: Dashboard → «Configurações».
- ENTREGAS: modo de entrega e taxas por zona de Luanda, somadas automaticamente no checkout.
- CÓDIGOS DE DESCONTO: criar por percentagem ou valor fixo, com limite de usos e validade; mostra quantas vezes cada um foi usado.
- AVALIAÇÕES: moderação — aprovar ou rejeitar as avaliações que os clientes deixam nos produtos.
- SMS DE CONFIRMAÇÃO: **«Em breve»**, bloqueado. Não é possível comprar créditos nem activar o envio. O saldo já comprado fica guardado.
- DOMÍNIO PRÓPRIO: **«Em breve»**, bloqueado. Não é possível guardar um domínio.
- APAGAR A LOJA: irreversível, apaga a loja e o que lhe pertence.`,

  analises: `ECRÃ: Dashboard → «Análises».
- Quatro números no topo: «Visitas (7 dias)», «Visitas (30 dias)», «Produtos vistos (7 dias)» e «Produtos».
- Só as visitas de 7 dias têm variação (seta verde/vermelha) face aos 7 dias anteriores, porque só as visitas têm série diária. As visualizações de produtos não têm comparação entre períodos — o ecrã mostra o total de 30 dias ao lado, e mais nada.
- «Visitas (30 dias)» mostra a média por dia. «Produtos» mostra quantos estão disponíveis na loja.
- Gráfico «Visitas — últimos 14 dias»: linha com área, com os valores do eixo à esquerda e as datas em baixo. O dia de maior tráfego fica com um ponto destacado e está escrito por palavras debaixo do gráfico. Passar o rato (ou tocar) num dia mostra a data e o número de visitas desse dia.
- «Produtos mais vistos (30 dias)»: até 8 produtos, com fotografia, barra de proporção relativa ao mais visto e a contagem.
- Loja sem nenhuma visita nem visualização em 30 dias não mostra zeros: mostra «Ainda não há visitas para mostrar», com os passos que faltam (ter produtos, publicar a loja, partilhar o endereço).
- Não há filtro de datas, escolha de período nem exportação: os períodos são fixos (7, 14 e 30 dias).
- Os dados vêm dos eventos da própria loja; não é o Google Analytics. O Dono pode ligar o pixel da Meta e o GA4 dele nas configurações de marketing.`,

  logotipo: `ECRÃ: Dashboard → «Criar logótipo».
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
- Pagamentos e WhatsApp não se configuram aqui: é no Dashboard, separador «Pagamentos».`,

  modelos: `ECRÃ: galeria de modelos prontos.
- Cada modelo é uma loja completa, com pré-visualização real em computador e telemóvel.
- «Usar este modelo» aplica-o à loja: a estrutura passa a ser a dele e os textos, fotografias e cores ficam prontos a personalizar.
- Aplicar um modelo novo substitui a personalização estrutural anterior. Os produtos não se perdem.`,

  lojas: `ECRÃ: diretório público de lojas (${PLATFORM_APEX}/lojas).
- Lista as lojas publicadas na plataforma, cada uma com pré-visualização real e ligação que abre a loja noutro separador.
- A ordem é escolhida por nós (vitrina): a loja em destaque aparece primeiro e ocupa a janela grande no topo. Também aparecem lojas feitas com a MôBisno que já têm domínio próprio, como a DOT Angola (www.dotangola.com).
- As lojas-modelo (demonstrações) não aparecem aqui.
- Serve também para as lojas serem encontradas pelo Google: cada uma recebe uma ligação a partir de um domínio já indexado.`,

  legal: `ECRÃ: páginas legais (Termos de Serviço, Política de Privacidade, Política Geral).
- A MôBisno é a plataforma tecnológica; cada Dono é o vendedor responsável pelos produtos, preços, entregas, devoluções e obrigações fiscais da loja dele.
- Os pagamentos são processados por fornecedores licenciados; a plataforma não retém os fundos das vendas.
- Estes documentos são um modelo informativo e não substituem aconselhamento jurídico.`,

  admin: `ECRÃ: Dashboard de Administração (só para administradores da MôBisno).
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

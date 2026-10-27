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
 * {@link platformFacts} deriva tudo de `src/services/plans.ts`,
 * `src/services/comingSoon.ts`, `src/services/payments.ts` e
 * `src/services/domains.ts`. Um preço escrito à mão num prompt fica errado no
 * dia em que o preço mudar, e ninguém repara — foi exactamente assim que o
 * assistente passou a mentir. Se um número aparece num texto deste ficheiro sem
 * vir de uma constante do domínio, é um defeito à espera de acontecer.
 *
 * ## O que o servidor guarda e o que o cliente envia
 *
 * O servidor (`api/assistant.js`) guarda o **comportamento**: estilo das
 * respostas, recusa fora de âmbito, e o papel de cada âmbito. O cliente envia os
 * **factos** e a orientação do ecrã. É por isso que `api/` não precisa de
 * espelhar `src/services/plans.ts`, ao contrário do que acontece com o
 * `api/_seo.js` — aqui não há segunda cópia para divergir.
 */
import { PLAN_NAME, PLAN_PERIOD_DAYS, PLAN_PRICE_KZ, PLAN_HIGHLIGHTS } from "../../src/services/plans.js";
import { PAYMENTS_PROVIDER_READY } from "../../src/services/payments.js";
import { COMING_SOON_LABELS, comingSoonList } from "../../src/services/comingSoon.js";
import { PLATFORM_CONTACT_EMAIL } from "../../src/services/domains.js";
import { COMPANY_DOCUMENTS, VERIFICATION_STATUS_LABEL } from "../../src/services/paymentVerification.js";
import { ACTIVATION_MONTHS, REJECTION_REASON_MIN } from "../../src/services/adminMetrics.js";
import { DELIVERY_PROVINCE } from "../../src/services/delivery.js";
import { kzWhole, platformFeeNote } from "../../src/services/seo.js";
import { PASSWORD_MIN_LENGTH, REGISTER_FIX_LABELS } from "../../src/ui/wizardSteps.js";
import { PHONE_CODE_LENGTH, PHONE_CODE_TTL_MS, PHONE_RESEND_DELAYS_MS } from "../../src/services/phoneVerification.js";
import { PLATFORM_APEX, STORE_APEX } from "./routing.js";

/** Ecrãs com assistente. As lojas publicadas não têm — são o site do Dono. */
export type AssistantScreen =
  | "site"
  | "registo"
  | "criar"
  | "painel"
  | "produtos"
  | "entregas"
  | "descontos"
  | "avaliacoes"
  | "analises"
  | "pagamentos"
  | "plano"
  | "config"
  | "editor"
  | "modelos"
  | "lojas"
  | "legal"
  | "admin";

/** Preço da subscrição por extenso: «10.000 Kz por 30 dias (um mês)». */
const PRECO = `${kzWhole(PLAN_PRICE_KZ)} por cada ${PLAN_PERIOD_DAYS} dias`;

/** «20 e 45», as esperas dos reenvios do código, em segundos. */
const REENVIOS = PHONE_RESEND_DELAYS_MS.map((ms) => String(Math.round(ms / 1000))).join(" e ");

/** Validade do código de confirmação, em minutos. */
const CODIGO_MINUTOS = Math.round(PHONE_CODE_TTL_MS / 60_000);

/** Lista legível das funcionalidades «Em breve», entre aspas. */
function emBreveLista(): string {
  const l = comingSoonList().map((x) => `«${x}»`);
  return l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}

/** Nomes dos documentos da empresa, pela ordem em que são pedidos. */
const DOCUMENTOS = COMPANY_DOCUMENTS.map((d) => `«${d.label}»`).join(" e ");

/**
 * Como estão os pagamentos digitais **hoje**, do lado da plataforma.
 *
 * Enquanto `PAYMENTS_PROVIDER_READY` for `false` não há fornecedor de pagamentos
 * ligado: uma loja aprovada continua a vender por WhatsApp, e o assistente tem
 * de o dizer em vez de prometer um checkout que ainda não cobra nada.
 */
const ESTADO_DIGITAIS = PAYMENTS_PROVIDER_READY
  ? "Os pagamentos digitais estão a funcionar: numa loja aprovada, o checkout mostra Multicaixa Express e Referência Bancária."
  : "O serviço de pagamentos ainda NÃO está ligado na plataforma: mesmo numa loja já aprovada, o checkout continua só com WhatsApp até o serviço entrar. A aprovação fica feita para quando isso acontecer. Não prometas datas.";

/** Como se paga a subscrição hoje. */
const ESTADO_SUBSCRICAO = PAYMENTS_PROVIDER_READY
  ? "A subscrição paga-se dentro da plataforma, loja a loja: no Dashboard, com a loja escolhida no seletor de loja, separador «Plano», por Multicaixa Express ou Referência Bancária."
  : `O pagamento online da subscrição ainda não está disponível: até lá é a equipa MôBisno que ativa a subscrição. O separador «Plano» tem o botão «Pedir a ativação por email», que escreve para ${PLATFORM_CONTACT_EMAIL} já com o identificador da loja no assunto.`;

/**
 * Factos da plataforma, derivados do domínio. **Nunca escrever estes números à
 * mão em texto.**
 */
export function platformFacts(): string {
  return `FACTOS DA PLATAFORMA (verdade actual — usa estes números, não outros):
- Subscrição: há **um só plano**, chamado ${PLAN_NAME}, com tudo incluído. Não há escalões. Não existe Básico, Profissional nem Empresarial — foram removidos. Não há ciclo anual.
- Preço: ${PRECO}, **POR LOJA**. Cada loja tem a sua subscrição e o seu período: quem tem duas lojas online paga duas subscrições. Pagar uma loja não põe as outras online.
- LOJAS: criar lojas é livre. «Quantas lojas posso criar?» → quantas quiseres; criar, personalizar e pré-visualizar é grátis, e cada loja que quiseres pôr online tem a sua subscrição (${PRECO}). PRODUTOS ILIMITADOS em todas as lojas.
- O que a subscrição inclui: ${PLAN_HIGHLIGHTS.join("; ")}.
- Criar a loja, personalizá-la e pré-visualizá-la é grátis e sem prazo. A subscrição de cada loja serve para **publicar** essa loja e a manter online.
- PUBLICAR exige **duas** coisas: a subscrição desta loja em vigor **e** o telemóvel da conta confirmado por SMS. Criar, personalizar e pré-visualizar não exige nenhuma das duas.
- O telemóvel confirma-se uma vez por conta, com um código de ${PHONE_CODE_LENGTH} algarismos enviado por SMS, e serve todas as lojas dessa conta. Quem saltou o passo ao criar a conta confirma no Dashboard → «Início», no aviso «Confirme o seu telemóvel». A equipa MôBisno também pode confirmar à mão, se a SMS não chegar.
- O EMAIL não é confirmado: não há código nem link de confirmação de email, e nunca houve. O que é confirmado é o número de telemóvel.
- Renovar antes do fim não perde dias: o período novo acrescenta-se ao que ainda falta.
- ${ESTADO_SUBSCRICAO}
- NÃO existe teste grátis. Foi removido. Para publicar uma loja é preciso subscrição ativa.
- Uma loja sem subscrição ativa sai da web e volta quando o pagamento dela for feito. Nada é apagado.
- Contas de ADMINISTRADOR da MôBisno não pagam e publicam sem subscrição. Isto não se aplica a Donos de loja.
- VENDAS: **todas as lojas vendem por WhatsApp** desde o primeiro dia, sem pedir nada a ninguém. É o que está sempre ativo, e **não tem comissão nenhuma**: esse dinheiro nunca passa pela MôBisno.
- Multicaixa Express e Referência Bancária são só para **empresas registadas**: o Dono envia no Dashboard → «Pagamentos» o nome e o NIF da empresa, o banco, o titular e o IBAN da conta onde recebe, e os documentos ${DOCUMENTOS}. O pedido vai para a administração da MôBisno, e só depois de **aprovado** é que esses métodos aparecem no checkout da loja. Alterar dados já aprovados volta a pôr o pedido «${VERIFICATION_STATUS_LABEL.pending}».
- COMISSÃO: ${platformFeeNote()} É a única comissão que existe, e é sobre o valor da encomenda (produtos + entrega − desconto).
- O cliente paga numa página do fornecedor de pagamentos (a Wiza), onde escolhe entre Multicaixa Express e Referência Bancária, e volta à loja. Uma venda só conta como paga quando o servidor a confirma — nunca por o cliente ter voltado.
- FATURA: cada venda digital gera uma **Fatura-Recibo emitida pela empresa do Dono** (pelo Vero, certificada pela AGT), não pela MôBisno. O Dono liga a faturação no Dashboard → «Pagamentos», com a organização e a chave do Vero dele. Sem isso, a loja vende e recebe como sempre; só não emite fatura.
- ${ESTADO_DIGITAIS}
- Endereços: a plataforma é ${PLATFORM_APEX}; cada loja fica em «nomedaloja.${STORE_APEX}».
- «EM BREVE», anunciado e bloqueado: ${emBreveLista()}. Não prometas datas. O que já estiver guardado (saldo de SMS, domínio, ids de pixel) fica guardado.
- NÃO existe: gerador de logótipos por IA (foi removido), compra de créditos de SMS, exportação de dados, nem filtro de datas nas Análises.
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
- O cabeçalho rola até às secções da página, e tem o botão «Criar minha loja».
- A página fala a quem **já vende** por WhatsApp e por Instagram. No topo está «Crie a sua loja online em minutos», com uma frase: os clientes veem os produtos, escolhem e encomendam sozinhos, a qualquer hora, e cada pedido chega ao WhatsApp do Dono com o total já calculado. Ao lado, um acordeão de imagens («Sem código», «Editor visual ao vivo», «Endereço .${STORE_APEX}», «Pagamentos e entregas» e «Encomendas por WhatsApp») que abre ao passar o rato ou ao tocar. A loja não substitui o WhatsApp: alimenta-o.
- Por baixo, uma faixa com os meios com que a loja trabalha (WhatsApp, Multicaixa Express e Referência Bancária) e secções curtas, uma ideia cada: «Três passos. Nenhum código.» (escolher um modelo, pôr os produtos, publicar e partilhar o link), «Tudo o que o WhatsApp não faz sozinho.» (editor ao vivo, stock e variações, entregas por zona, códigos de desconto, Google, visitas), «Receba como os seus clientes já pagam.» (o WhatsApp sem comissão em todas as lojas, o Multicaixa Express e a Referência Bancária para empresas aprovadas, e um exemplo de quanto fica para levantar numa venda), «Um só plano. Tudo incluído.» e, a fechar, as «Perguntas frequentes».
- As «Perguntas frequentes» são um acordeão: cada pergunta abre a resposta ao ser clicada, e a primeira já está aberta. Ao lado está o email da MôBisno, para o que não estiver lá.
- A secção de preços tem **um só cartão**: o plano único, o preço **por loja** (cada loja tem a sua subscrição), o que inclui e, numa linha, o que está «Em breve». Responde com o preço que está nos FACTOS; nunca mandes o visitante «ver a secção de preços».
- «Lojas criadas na MôBisno», no rodapé, abre o diretório público com pré-visualização real de cada loja.
- O contacto da MôBisno é ${PLATFORM_CONTACT_EMAIL}. Não há número de telefone nem redes sociais publicadas.`,

  registo: `ECRÃ: início de sessão (${PLATFORM_APEX}/login).
- Conta por email e palavra-passe, com o botão «Entrar» e um olho para mostrar a palavra-passe escrita.
- Quem ainda não tem conta segue «Criar a minha loja», que abre o assistente de criação — é lá que a conta é criada, junto com a primeira loja.
- PALAVRA-PASSE ESQUECIDA: há a ligação «Esqueci-me da palavra-passe». Pede o email, o botão é «Enviar link», e a resposta é sempre a mesma, exista ou não conta com aquele email: «Se existir uma conta com este email, enviámos um link para redefinir a palavra-passe.» O link tem de ser aberto **no mesmo navegador** onde foi pedido.
- Ao voltar por esse link aparece «Definir nova palavra-passe»: a nova palavra-passe (mínimo ${PASSWORD_MIN_LENGTH} caracteres) escrita duas vezes, e «Guardar a nova palavra-passe». Depois de guardar, o destino é o Dashboard.
- NÃO há confirmação de email: nem código, nem link. O email nunca é verificado. O que é confirmado é o telemóvel, e isso acontece no assistente de criação da conta (ou depois, no Dashboard).
- Depois de entrar, o destino é o Dashboard; sem loja criada, o Dashboard convida a criar a primeira.`,

  criar: `ECRÃ: assistente de criação de loja (por conversa). Trata sempre por «tu».
- CONTA, por esta ordem: o nome; o email; a palavra-passe (mínimo ${PASSWORD_MIN_LENGTH} caracteres); e a mesma palavra-passe outra vez, para confirmar.
- Um email com formato inválido é recusado ali mesmo e é pedido de novo, sem perder o que já foi escrito.
- Se as duas palavras-passe não coincidirem, o assistente diz «As duas palavras-passe não são iguais» e pede **as duas de novo** — não só a segunda, para o Dono não ter de adivinhar qual estava errada. A palavra-passe nunca aparece no chat: fica sempre «••••••••».
- Antes de criar a conta aparece o cartão «Os teus dados», com «Nome» e «Email», e três botões: «Está tudo certo», «${REGISTER_FIX_LABELS.nome}» e «${REGISTER_FIX_LABELS.email}». Corrigir um campo pede só esse campo e volta ao mesmo cartão: os passos anteriores não se repetem.
- Se a criação da conta falhar, o assistente mostra o motivo e pergunta o que corrigir, com «${REGISTER_FIX_LABELS.email}», «${REGISTER_FIX_LABELS.nome}» e «${REGISTER_FIX_LABELS.password}». Quando o email já tem conta, aparece primeiro «${REGISTER_FIX_LABELS.entrar}», que leva ao início de sessão (${PLATFORM_APEX}/login) — depois de entrar, volta-se aqui para criar a loja. A escolha de para onde voltar é do Dono: o assistente não decide sozinho.
- O QUE NÃO EXISTE NESTE ECRÃ: não se recupera a palavra-passe aqui dentro, e o email não é confirmado — não há código de email nem link de confirmação de email. A SMS deste ecrã confirma o **telemóvel**, não o email. Quem se esqueceu da palavra-passe usa «Esqueci-me da palavra-passe» no ecrã de início de sessão.
- TELEMÓVEL, logo depois de a conta ser criada (e não antes: o código é pedido ao servidor com a sessão já iniciada). O assistente pede o número — nove algarismos, a começar por nove — e envia um código de ${PHONE_CODE_LENGTH} algarismos por SMS, válido ${CODIGO_MINUTOS} minutos. Escrever o código completo confirma sozinho, sem tocar em mais nada.
- No ecrã do código há «Reenviar código», que abre ao fim de ${REENVIOS} segundos (dois reenvios, por esta ordem; o botão conta o tempo sozinho), e «Trocar o número», para quem se enganou num algarismo.
- Esgotados os dois reenvios aparece «Não recebi o código». Escolhê-lo **não cancela nada**: a conta fica criada, o assistente continua para a loja, e o número confirma-se mais tarde no Dashboard. O que fica por fazer é **publicar** a loja.
- Se a SMS não puder ser enviada (serviço de SMS em baixo, sem saldo ou por configurar), o assistente di-lo e oferece «Tentar de novo», «Trocar o número» e «Continuar sem confirmar». Nunca fica ninguém preso à espera de uma SMS.
- Com sessão já iniciada, os passos da conta não aparecem: o assistente começa no telemóvel, se ainda não estiver confirmado, e depois no nome da loja.
- LOJA, a seguir à conta: nome da loja, tipo de negócio, a descrição do negócio, o título e a descrição para o Google (gerados por IA, com pré-visualização) e o endereço (subdomínio).
- O endereço só aceita letras minúsculas, números e hífen, e fica «nomedaloja.${STORE_APEX}». É pedido outro se já estiver ocupado. O prefixo «modelo-» está reservado às lojas de demonstração da MôBisno.
- A loja nasce como rascunho e o assistente leva logo à galeria de modelos prontos, que é onde se escolhe o aspeto. Publicar exige subscrição ativa.`,

  painel: `ECRÃ: Dashboard do Dono, separador «Início».
- Começa com a saudação ao Dono e o resumo da loja escolhida.
- FAIXA «Estado da loja», no topo, numa linha: a loja está «Publicada» ou em «Rascunho», com uma frase curta («A loja está no ar.», «Publicada, mas fora do ar: a subscrição desta loja não está ativa.» ou «Ainda só você a vê.»), o endereço da loja e a subscrição desta loja («Subscrição desta loja ativa até <data>.», «Esta loja não tem subscrição ativa.», «A subscrição desta loja caducou.» ou «Conta de administração: publica sem subscrição.»).
- Na mesma faixa: «Copiar», «Abrir» (loja no ar) ou «Pré-visualizar» (rascunho ou fora do ar), e o botão «Publicar a loja» ou «Despublicar». Quando falta algo para publicar, «Publicar a loja» aparece desligado e, junto ao endereço, está a razão: «Confirme o número de telemóvel para publicar.» com «Confirmar agora», ou «Ative a subscrição para publicar.» com a ligação «Ver o plano». O telemóvel vem primeiro porque é grátis e leva um minuto.
- CARTÃO «Confirme o seu telemóvel», só para quem escolheu «Não recebi o código» ao criar a conta: diz que a loja não pode ser publicada enquanto o número não estiver confirmado, e «Confirmar o número» abre uma janela que pede o número e o código de ${PHONE_CODE_LENGTH} algarismos. É o mesmo código por SMS do assistente de criação, com os mesmos reenvios (${REENVIOS} segundos). Confirmado, o botão de publicar acende.
- Por baixo, à esquerda, o que a loja recebeu. CARTÃO «Encomendas por WhatsApp»: a lista de quem tocou em «Finalizar via WhatsApp» e do que tinha no carrinho — os artigos, o total, a entrega, o desconto e o contacto —, mesmo que a mensagem nunca tenha sido enviada. Cada linha abre com o detalhe e tem «Falar no WhatsApp», «Marcar como tratada» e «Apagar». As que estão «Por tratar» aparecem contadas no topo do cartão. **É aqui que uma loja sem pagamentos digitais vê as suas vendas.**
- CARTÕES «Vendas» e «Levantamentos» (Multicaixa Express e Referência Bancária): só aparecem quando a loja já tem pagamentos digitais a funcionar, ou quando já há vendas ou levantamentos para mostrar. Trazem «Recebido (líquido)» — já sem a comissão da MôBisno —, «Disponível para levantar» com «Solicitar levantamento», «Vendas pagas» e «Referências pendentes». O levantamento vai para a conta bancária **aprovada**, e mais nenhuma.
- O «Disponível para levantar» é o que a loja recebeu menos a comissão: ${platformFeeNote()}
- Na lista de vendas, as linhas com estado «Expirada» — referência bancária cuja data-limite passou — abrem com o botão «Apagar registo». **Só as expiradas se apagam**: pagas, pendentes dentro do prazo, falhadas e canceladas ficam, e é a base de dados que o impede, não só o ecrã.
- À direita, CARTÃO «Próximos passos», compacto: quantos passos estão feitos, uma barra, e só os que faltam, cada um numa linha que leva ao sítio onde se faz: «Adicionar produtos», «Personalizar a loja», «Número de WhatsApp», «Taxa de entrega», «Ativar a subscrição e publicar» e, marcado «Opcional», «Verificar a empresa para pagamentos digitais». Os feitos saem da lista; com todos feitos aparece «A loja está pronta a vender».
- CARTÃO «Funil de compra», dos últimos 30 dias, com quatro passos pela ordem do cliente: «Visitas» → «Produtos vistos» → «Adições ao carrinho» → «Encomendas por WhatsApp». Debaixo, a percentagem de visitas que terminaram em encomenda. Sem movimento, diz «Ainda sem movimento nos últimos 30 dias».
- NAVEGAÇÃO, as mesmas nove secções nos dois tamanhos de ecrã: Início, Produtos, Taxa de entrega, Código de desconto, Avaliações, Análises, Pagamentos, Plano, Configurações. Em ecrã grande estão na barra lateral; em telemóvel estão numa faixa de atalhos deslizante logo abaixo do cabeçalho (a barra lateral não existe no telemóvel).
- SELETOR DE LOJA, no topo da barra lateral (em telemóvel, na barra de topo): mostra a loja em edição, com a inicial e o estado («No ar», «Fora do ar» ou «Rascunho»). Ao tocar, abre «As suas lojas», com o estado de cada uma, e «Nova loja», com a nota de que é grátis até publicar e que depois cada loja paga a sua subscrição (o preço está nos FACTOS). Trocar de loja muda também o «Plano» que se vê: é o da loja escolhida.
- Ainda na barra lateral (em telemóvel, na barra de topo): o atalho «Dashboard de Administração» (só em contas de administrador) e «Terminar sessão».
- No cabeçalho: «Personalizar loja», que abre o editor visual, e «Ver loja» (ou «Pré-visualizar», sem publicação).
- O separador «Pagamentos» é só configuração: o número de WhatsApp, a verificação da empresa para os pagamentos digitais e a fatura automática. As encomendas, as vendas e o saldo estão aqui, no Início. O gerador de logótipos foi removido e já não há secção para ele.`,

  produtos: `ECRÃ: Dashboard → «Produtos».
- «Adicionar produto» abre o formulário: foto principal, nome, preço, categoria, descrição, fotos extra, «Disponível na loja», destacar na loja, produto físico, controlar stock e variações.
- Há pesquisa, filtro por categoria, filtro Físicos/Digitais e a escolha entre ver em grelha ou em lista.
- Não há limite de produtos.
- Os selos de cada produto: «Destaque», «Indisponível», «Esgotado», «Físico» e «Digital». As ações são «Editar» e apagar.
- «Disponível na loja» desligado esconde o produto dos clientes sem o apagar. Editar um produto não volta a ligá-lo sozinho.
- STOCK: o interruptor «Controlar stock» liga a quantidade. Sem controlo, nunca esgota; a zero, o produto aparece «Esgotado» e a compra é recusada.
- VARIAÇÕES (ex.: cor, tamanho): activam-se no formulário do produto. Cada variação tem nome e valores; as combinações resultantes podem ter preço e stock próprios. O preço da combinação ou substitui o preço base ou acresce a ele. Stock vazio na combinação não é controlado; zero marca essa combinação como esgotada.
- Produto físico pede morada de entrega no checkout; produto digital não.`,

  entregas: `ECRÃ: Dashboard → «Taxa de entrega».
- É aqui que se define quanto a loja cobra pela entrega. Estava dentro das Configurações; agora é uma secção própria.
- A província é ${DELIVERY_PROVINCE} e é fixa nesta fase.
- «Como cobra a entrega» tem dois modos: «Valor único» (a mesma taxa em todas as áreas, no campo «Taxa de entrega (todas as áreas)») e «Por área» (marcar as áreas onde entrega e escrever a taxa de cada uma; 0 = grátis). Trocar de modo não apaga o que já estava escrito no outro.
- As áreas por marcar **não aparecem ao cliente**: ele só escolhe entre as que a loja serve.
- «Entrega grátis acima de (Kz)» é opcional: encomendas com subtotal igual ou acima desse valor não pagam entrega.
- O botão é «Guardar a taxa de entrega». Ao lado há o «Resumo», que mostra o que está gravado tal como o cliente o vai encontrar no checkout.
- Sem nenhuma área definida, a loja não cobra entrega e o checkout diz ao cliente que a entrega é combinada com a loja.`,

  descontos: `ECRÃ: Dashboard → «Código de desconto».
- Cria códigos que o cliente escreve no checkout. O cartão «Criar código» pede: «Código», «Tipo» («Percentagem» ou «Valor fixo»), «Valor», «Limite de usos» (opcional, vazio = sem limite) e «Válido até» (opcional, vazio = sem data-limite). O botão é «Criar código».
- O código só aceita letras, algarismos, hífen ou sublinhado, e é guardado em maiúsculas.
- A lista mostra, por código, o desconto, os usos («3 de 10 usos» ou «N usos · sem limite»), a validade e o estado: «Ativo», «Inativo», «Caducado» ou «Esgotado». As ações são «Ativar»/«Desativar» e apagar.
- O uso é contado quando a encomenda é paga, não quando o código é aplicado.
- Os códigos não são visíveis aos clientes: ninguém os consegue listar a partir da loja. O cliente tem de saber o código.`,

  avaliacoes: `ECRÃ: Dashboard → «Avaliações».
- As avaliações que os clientes deixam nos produtos entram **por aprovar** e só aparecem na página do produto depois de o Dono as aprovar.
- O ecrã tem dois cartões: «Por aprovar», com a contagem, e «Publicadas».
- As ações são «Aprovar», «Esconder» (tira da loja sem apagar) e «Apagar».
- Cada avaliação mostra o nome do cliente, as estrelas, o produto, a data e o comentário.
- Sem avaliações, o ecrã diz «Ainda não há avaliações».`,

  analises: `ECRÃ: Dashboard → «Análises».
- Quatro números no topo: «Visitas (7 dias)», «Visitas (30 dias)», «Produtos vistos (7 dias)» e «Encomendas por WhatsApp (7 dias)».
- As visitas e as encomendas por WhatsApp de 7 dias têm variação (seta verde/vermelha) face aos 7 dias anteriores. As visualizações de produtos não têm comparação entre períodos — o ecrã mostra o total de 30 dias ao lado, e mais nada.
- Gráfico «Visitas — últimos 14 dias»: linha com área, com os valores do eixo à esquerda e as datas em baixo. Passar o rato (ou tocar) num dia mostra a data, o número de visitas e o número de encomendas por WhatsApp desse dia.
- «Funil de compra (30 dias)»: os mesmos quatro passos do «Início» (Visitas, Produtos vistos, Adições ao carrinho, Encomendas por WhatsApp), mais a linha «Checkouts abertos (30 dias)».
- «Produtos mais vistos (30 dias)»: até 8 produtos, com fotografia, barra de proporção relativa ao mais visto e a contagem.
- Loja sem nenhuma visita nem visualização em 30 dias não mostra zeros: mostra «Ainda não há visitas para mostrar», com os passos que faltam (ter produtos, publicar a loja, partilhar o endereço).
- Não há filtro de datas, escolha de período nem exportação: os períodos são fixos (7, 14 e 30 dias).
- Os dados vêm dos eventos da própria loja; não é o Google Analytics. Uma visita conta uma vez por sessão do navegador.`,

  pagamentos: `ECRÃ: Dashboard → «Pagamentos». É **só configuração**: como os clientes pagam e para onde vai o dinheiro.
- As encomendas por WhatsApp, as vendas, o saldo e os levantamentos não estão aqui: estão no «Início». O ecrã di-lo logo no topo, com a ligação para o «Início».
- CARTÃO «WhatsApp», marcado «Sempre ativo»: é o que toda a loja tem desde o primeiro dia, sem pedir nada. Só se configura o «Número de WhatsApp», no formato internacional (+244 e o número), que é para onde chegam as encomendas.
- CARTÃO «Pagamentos digitais» («Multicaixa Express e Referência Bancária»): são para **empresas registadas** e precisam da aprovação da MôBisno. O estado aparece no cartão: «${VERIFICATION_STATUS_LABEL.none}», «${VERIFICATION_STATUS_LABEL.pending}», «${VERIFICATION_STATUS_LABEL.approved}» ou «${VERIFICATION_STATUS_LABEL.rejected}».
- O formulário tem três grupos. «Empresa»: «Nome da empresa» e «NIF da empresa». «Conta bancária onde recebe»: «Banco», «Titular da conta» e «IBAN». «Documentos da empresa»: ${DOCUMENTOS}, em PDF, JPG ou PNG até 10 MB.
- O botão é «Enviar para aprovação». Se faltar ou estiver errado algum campo, aparecem **todos os erros de uma vez**, cada um junto ao seu campo.
- Enviado, o pedido fica «${VERIFICATION_STATUS_LABEL.pending}» e é só de leitura: está nas mãos da administração da MôBisno. Rejeitado, o Dono vê o motivo escrito por quem rejeitou, corrige e envia de novo.
- Aprovado, há o botão «Alterar dados» — mas alterar dados aprovados volta a pôr o pedido «${VERIFICATION_STATUS_LABEL.pending}» até nova aprovação, e o ecrã avisa antes. É o que protege o dinheiro de quem vende: um IBAN novo tem de ser verificado.
- CARTÃO «Fatura automática (Vero)», só depois de a empresa estar aprovada: o Dono indica a «Organização (Org ID)» e a «Chave secreta (API key)» do Vero **dele**, e cada venda digital passa a gerar uma Fatura-Recibo emitida pela empresa dele e enviada ao cliente. A chave fica guardada e nunca é mostrada outra vez — um campo vazio quer dizer «não mexer». Há «Desligar a faturação». Sem credenciais, a loja vende e recebe como sempre, só não emite fatura.
- Não há interruptor para ligar os pagamentos digitais à mão: quem os liga é a aprovação. A única chave que se escreve neste ecrã é a do Vero, e serve só para a fatura — não liga nem desliga pagamento nenhum.`,

  plano: `ECRÃ: Dashboard → «Plano».
- É o plano da loja escolhida no seletor de loja: cada loja tem a sua subscrição, e o ecrã diz o nome da loja.
- O cartão «A subscrição desta loja» mostra o estado: «Ativa até <data>» com os dias que faltam, «Inativa», «Caducada» ou «Conta de administração».
- Há um cartão de preço só: o plano «${PLAN_NAME}», ${PRECO}, por loja, com a lista do que inclui. Cada loja tem a sua subscrição, com tudo incluído. Não há escalões nem ciclo anual.
- ${ESTADO_SUBSCRICAO}
- A subscrição paga-se numa página do fornecedor de pagamentos, onde se escolhe entre Multicaixa Express e Referência Bancária; depois o Dono volta ao painel e a subscrição da loja é confirmada. Pagar por referência só ativa quando o banco processar.
- A comissão de vendas não tem nada a ver com a subscrição: ${platformFeeNote()}
- Sem subscrição ativa a loja não se publica e, se estava publicada, sai da web até o pagamento ser feito. Os dados ficam, e as outras lojas da conta não mudam.
- A subscrição não é a única condição para publicar: o telemóvel da conta tem de estar confirmado por SMS. Se faltar, o aviso está no «Início» e a subscrição não resolve isso — são coisas diferentes.
- Uma conta de administrador não vê preços nem botão de pagamento aqui: não paga.`,

  config: `ECRÃ: Dashboard → «Configurações».
- Tem só três coisas, e as três estão **«Em breve»**, desligadas e sem preço: «${COMING_SOON_LABELS.customDomain}», «${COMING_SOON_LABELS.marketing}» e «${COMING_SOON_LABELS.sms}». Não é possível ativá-las nem comprar nada. Não prometas datas.
- O que já estiver guardado continua guardado e é mostrado como tal (o saldo de SMS, o domínio escrito, os ids de pixel). «Em breve» desliga, não apaga.
- ZONA DE PERIGO, em baixo: «Apagar a loja». Para confirmar, o Dono escreve o nome da loja no campo; só então o botão funciona. Apaga a loja, os produtos, as imagens e as encomendas, e é irreversível.
- O que ESTAVA aqui e mudou de sítio: as entregas são agora o separador «Taxa de entrega», os códigos de desconto são «Código de desconto» e a moderação é «Avaliações». Se alguém perguntar por entregas, descontos ou avaliações nas Configurações, diz onde estão agora.`,

  editor: `ECRÃ: editor visual ao vivo (o Dono a personalizar a loja).
- A loja vem de um modelo pronto e a ESTRUTURA mantém-se: cabeçalho, topo, ordem das secções do modelo, página de produto, checkout e rodapé não se trocam aqui.
- Personalizam-se três coisas: TEXTOS, FOTOGRAFIAS e CORES.
- TEXTOS: clicar no texto no preview e escrever. Enquanto se edita, uma barra flutuante dá cor só àquele texto.
- LOGÓTIPO: passar o rato no logótipo mostra «− 📷 Trocar +». «Trocar» muda a imagem; «−» e «+» ajustam o tamanho. O logótipo é carregado pelo Dono — não há gerador de logótipos na plataforma.
- IMAGENS: passar o rato na imagem da secção ou do topo e usar o botão de trocar foto.
- PRODUTOS: passar o rato num produto para editar foto, nome e preço, e escolher a categoria de cada secção de produtos.
- CORES: círculo «Cor» na barra de topo para a cor principal; círculo «Texto» para a cor dos textos; botão de cor de fundo no canto de cada secção, com as cores do modelo. Em fundo escuro os textos ficam claros automaticamente.
- «Adicionar secção»: **o que se pode acrescentar depende do modelo**. Há sempre «Secção de produtos»; a seguir vêm as que o modelo aceita e ainda não traz.
- AS SECÇÕES QUE O MODELO JÁ TEM NÃO APARECEM NO MENU — edita-se onde estão, na própria secção. É o caso do Lumière Chic, que já traz testemunhos e o mapa «As nossas lojas»: quem quiser mudar um testemunho clica no texto do testemunho que está no ecrã, não acrescenta uma secção nova. O menu diz isso mesmo, em baixo, no fim da lista. Se alguém perguntar «como acrescento testemunhos?» numa loja que já os tem, a resposta é onde os editar, nunca mandá-lo procurar no menu.
- Uma secção acrescentada sai sempre com o desenho do modelo — a tipografia, os cantos e as cores dele. Não há secções com aspeto de outro modelo.
- As secções acrescentadas sobem, descem e removem-se; as do modelo mantêm-se.
- Numa loja criada a partir de um modelo, as secções estruturais do modelo não se acrescentam nem se removem: o menu oferece só o que aquele modelo aceita.
- No topo alterna-se entre «Início», «Página de produto» e «Checkout».
- LOCALIZAÇÃO: quando o modelo tem bloco de mapa, dá para acrescentar várias localizações e escolher cada uma no mapa, com o pin arrastável.
- «Guardar» publica as alterações. «Desfazer» reverte. «Abrir preview» mostra computador e telemóvel. «Ver loja» abre a loja. «Tutorial» inicia a visita guiada.
- Pagamentos, WhatsApp, entregas e descontos não se configuram aqui: é no Dashboard.`,

  modelos: `ECRÃ: galeria de modelos prontos.
- Cada modelo é uma loja completa, com pré-visualização real em computador e telemóvel.
- «Usar este modelo» aplica-o à loja: a estrutura passa a ser a dele e os textos, fotografias e cores ficam prontos a personalizar.
- Aplicar um modelo novo substitui a personalização estrutural anterior. Os produtos não se perdem.`,

  lojas: `ECRÃ: diretório público de lojas (${PLATFORM_APEX}/lojas).
- Lista as lojas publicadas na plataforma, cada uma com pré-visualização real e ligação que abre a loja noutro separador.
- A ordem é escolhida por nós (vitrina): a loja em destaque aparece primeiro e ocupa a janela grande no topo. Também aparecem lojas feitas com a MôBisno que já têm domínio próprio, como a DOT Angola (www.dotangola.com).
- As lojas-modelo (demonstrações) não aparecem aqui, e não são indexadas pelo Google.
- Serve também para as lojas serem encontradas pelo Google: cada uma recebe uma ligação a partir de um domínio já indexado.`,

  legal: `ECRÃ: páginas legais (Termos de Serviço, Política de Privacidade, Política Geral).
- A MôBisno é a plataforma tecnológica; cada Dono é o vendedor responsável pelos produtos, preços, entregas, devoluções e obrigações fiscais da loja dele.
- Os Termos descrevem o plano único, pago por loja (o preço está nos FACTOS): cada Loja tem a sua subscrição. Dizem também que criar e pré-visualizar é grátis e que a subscrição serve para publicar.
- Dizem também que todas as lojas vendem por WhatsApp e que Multicaixa Express e Referência Bancária são para empresas registadas, depois de a MôBisno aprovar os documentos.
- A Política de Privacidade descreve os dados da empresa recolhidos para essa verificação (nome, NIF, IBAN, ${DOCUMENTOS}): ficam num armazenamento privado, são vistos apenas pelo Dono e pela administração da MôBisno, e servem só para verificar a empresa e pagar as vendas.
- As funcionalidades «Em breve» são nomeadas como não incluídas enquanto não existirem.
- O contacto para questões legais ou de privacidade é ${PLATFORM_CONTACT_EMAIL}.
- Estes documentos são um modelo informativo e não substituem aconselhamento jurídico.`,

  admin: `ECRÃ: Dashboard de Administração (só para administradores da MôBisno).
- Seis secções: «Visão geral», «Aprovações», «Contas», «Lojas», «Modelos» e «Pagamentos». Em ecrã grande na barra lateral; em telemóvel em atalhos debaixo do cabeçalho. A navegação mostra quantas verificações estão por aprovar e quantos levantamentos estão por tratar.
- VISÃO GERAL: «Contas», «Lojas publicadas», «Subscrições ativas», «Receita do mês» e «Verificações por aprovar»; cada número abre a sua secção. Por baixo, «A precisar de atenção»: verificações por aprovar e levantamentos pedidos, os mais antigos primeiro. As lojas-modelo e as contas de administração ficam fora dos números.
- «Receita do mês» são as subscrições pagas na plataforma nesse mês. **Não** inclui as vendas das lojas, que são dinheiro dos Donos. Já não há compras de SMS nem de logótipos.
- Se o Administrador tiver criado lojas com a **própria conta**, elas não entram nos números da Visão geral (são de teste, e contá-las dava uma leitura falsa do negócio). A Visão geral diz-lho numa nota, com ligação para «Lojas», que é onde elas aparecem. Em «Contas», a conta de administração está no filtro «Administradores», não no de entrada.
- Quando uma secção não consegue ler os dados, aparece «Não foi possível carregar esta secção» **com a causa** e um botão «Tentar de novo». Se a causa disser que falta uma coluna ou uma tabela, falta aplicar uma migração de supabase/migrations: é a diferença entre a plataforma estar vazia e a leitura ter falhado.
- APROVAÇÕES: os pedidos das empresas para receber por Multicaixa Express e Referência Bancária. Os que estão «${VERIFICATION_STATUS_LABEL.pending}» vêm primeiro, o mais antigo à frente, com o dono, a empresa, o NIF, o banco, o titular, o IBAN e a data de envio. «Ver matrícula» e «Ver certidão» abrem os documentos num separador novo, com uma ligação temporária. «Aprovar» pede confirmação e liga sozinho os pagamentos digitais da loja; «Rejeitar» exige um motivo com pelo menos ${REJECTION_REASON_MIN} caracteres, que o Dono lê no painel dele, e desliga-os. Há «Histórico», com filtros «Aprovados» e «Rejeitados».
- CONTAS: os Donos, com email, número de lojas, estado da subscrição (a conta está «com subscrição» enquanto alguma loja dela estiver) e o selo «Telefone por confirmar» quando o número não foi confirmado por SMS; filtros «Com subscrição», «A terminar», «Sem subscrição», «Telefone por confirmar» e «Administradores». Em «Detalhes» estão as lojas da conta, com o estado e a subscrição de cada uma, o telemóvel gravado, «Confirmar telefone» e «Eliminar conta».
- «Telefone por confirmar» são contas que existem mas não conseguem pôr nenhuma loja no ar: criaram a conta e escolheram «Não recebi o código». «Confirmar telefone» marca o número como confirmado à mão, e serve para quando a SMS não chega ou o Dono fala com a equipa — pede confirmação antes, porque é a nossa palavra de que o número é dele.
- LOJAS: pesquisa e filtros «Publicadas», «Fora do ar», «Rascunho», «Pagamentos digitais» e «Lojas-modelo». A subscrição é de cada loja, e cada linha mostra a dela; «Publicada · fora do ar» quer dizer loja sem subscrição. A subscrição ativa-se aqui, à mão e loja a loja: «Ativar» (ou «Prolongar», se ainda estiver ativa) com ${ACTIVATION_MONTHS.slice(0, -1).join(", ")} ou ${ACTIVATION_MONTHS[ACTIVATION_MONTHS.length - 1]} meses, somados ao fim do período em curso. «Desativar» termina já e tira essa loja do ar, sem apagar nada e sem mexer nas outras lojas do dono. Dá também para editar, publicar, despublicar e eliminar.
- MODELOS: importar os predefinidos, criar, editar no editor e apagar as lojas-modelo. Apagar verifica primeiro se alguma loja de cliente usa o modelo.
- PAGAMENTOS: «Subscrições» (pagamentos do plano), «Encomendas das lojas» (só leitura) e «Levantamentos», com «Aprovar», «Marcar como pago» e «Rejeitar».
- Não há exportação de dados nem envio de mensagens aos Donos a partir deste painel.`,
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

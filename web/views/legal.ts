/**
 * Páginas legais da plataforma (aplicam-se ao MôBisno e a todas as lojas):
 * Termos de Serviço, Política de Privacidade e Política Geral.
 *
 * Conteúdo-modelo em pt-AO, redigido para proteger a plataforma (a MôBisno é
 * um fornecedor de tecnologia; cada Loja/Dono é o vendedor responsável).
 * Recomenda-se revisão por um jurista antes do lançamento.
 *
 * **Sem factos escritos à mão.** O preço e o período vêm de
 * `src/services/plans.ts`, o que está «Em breve» de `src/services/comingSoon.ts`
 * e o contacto de `src/services/domains.ts`. Os Termos já prometeram planos que
 * tinham deixado de existir; com os números lidos do domínio, mudar o preço
 * muda também o que os Termos dizem.
 */
import { render, esc } from "../lib/dom.js";
import { applySeo } from "../lib/seo.js";
import { platformHomeUrl } from "../lib/routing.js";
import { platformNavHtml, platformFooterHtml, mountSectionNav } from "../templates/platformChrome.js";
import { mountAiAgent } from "../lib/aiAgent.js";
import { PLAN_NAME, PLAN_PERIOD_DAYS, PLAN_PRICE_KZ } from "../../src/services/plans.js";
import { comingSoonList } from "../../src/services/comingSoon.js";
import { PLATFORM_CONTACT_EMAIL } from "../../src/services/domains.js";
import { kzWhole } from "../../src/services/seo.js";

const ACCENT = "#F95901";
const UPDATED = "Outubro de 2026";

export type LegalPage = "termos" | "privacidade" | "politica";

export interface LegalSection { h: string; p: string[]; }

/** Lista legível: «a», «b» e «c». */
function listaEntreAspas(itens: readonly string[]): string {
  const q = itens.map((i) => `«${i}»`);
  return q.length <= 1 ? q.join("") : `${q.slice(0, -1).join(", ")} e ${q[q.length - 1]}`;
}

/** Funcionalidades «Em breve» de agora, para os Termos as excluírem pelo nome. */
function emBreve(): string {
  const lista = comingSoonList();
  const base = "As funcionalidades assinaladas na plataforma como «Em breve» ainda não estão disponíveis e não fazem parte do serviço contratado; passam a estar incluídas quando forem disponibilizadas.";
  return lista.length ? `${base} Neste momento estão nesta situação: ${listaEntreAspas(lista)}.` : base;
}

const PRECO = `${kzWhole(PLAN_PRICE_KZ)} por cada período de ${PLAN_PERIOD_DAYS} dias`;

const TERMOS: LegalSection[] = [
  { h: "1. Quem somos", p: [
    "A MôBisno é uma plataforma tecnológica que permite a qualquer pessoa ou empresa criar e gerir uma loja online («Loja»). A MôBisno fornece o software, o alojamento e as ferramentas de venda; não é a vendedora dos produtos anunciados nas Lojas.",
  ] },
  { h: "2. Conta e elegibilidade", p: [
    "Para criar uma Loja é necessário registar uma conta com dados verdadeiros e manter as credenciais seguras. O titular da conta («Dono da Loja») é o único responsável por toda a atividade na sua Loja.",
    "É proibido usar a plataforma para fins ilícitos, venda de produtos proibidos por lei, fraude, ou violação de direitos de terceiros.",
  ] },
  { h: "3. Responsabilidade do Dono da Loja", p: [
    "O Dono da Loja é o vendedor e o único responsável pelos produtos e serviços que oferece, pela exatidão dos preços e descrições, pelo cumprimento das encomendas, pela entrega, pelas garantias, devoluções e pelo cumprimento das obrigações fiscais e legais aplicáveis em Angola.",
    "A MôBisno não inspeciona nem garante os produtos vendidos pelas Lojas e não é parte na relação de compra e venda entre a Loja e os seus clientes.",
  ] },
  { h: "4. Subscrição", p: [
    `Há um só plano, o ${PLAN_NAME}, com tudo incluído: ${PRECO}, com lojas e produtos ilimitados. Não há escalões, preços por loja nem período experimental.`,
    "Criar, personalizar e pré-visualizar uma Loja é gratuito e sem prazo. A subscrição é necessária para publicar a Loja e a manter online, e é paga à MôBisno pelos meios indicados no Dashboard.",
    "Cada período começa no dia em que o pagamento é confirmado. Numa renovação feita antes do fim, o novo período acrescenta-se ao que ainda falta, sem perder dias. Quando a subscrição termina, as Lojas publicadas deixam de estar online até nova renovação; nada é apagado.",
  ] },
  { h: "5. Vendas e pagamentos das Lojas", p: [
    "Todas as Lojas recebem encomendas por WhatsApp: o cliente envia o pedido e combina o pagamento e a entrega diretamente com o Dono da Loja. A MôBisno não intervém nessa transação nem recebe esse dinheiro.",
    "Os pagamentos por Multicaixa Express e por Referência Bancária são exclusivos de empresas registadas. Para os pedir, o Dono da Loja envia no Dashboard os dados da empresa (nome e NIF), a conta bancária onde recebe (IBAN) e os documentos da empresa (Matrícula e Certidão). Só depois de a MôBisno verificar e aprovar esses documentos é que estes pagamentos aparecem no checkout da Loja. Alterar dados já aprovados suspende-os até nova aprovação.",
    "A disponibilidade destes pagamentos depende também do fornecedor de pagamentos; enquanto não estiverem disponíveis, as vendas fazem-se por WhatsApp. O valor das vendas pagas por estes meios, deduzida a comissão do fornecedor de pagamentos, é entregue na conta bancária verificada da empresa, a pedido do Dono da Loja e até ao saldo disponível.",
  ] },
  { h: "6. Funcionalidades «Em breve»", p: [emBreve()] },
  { h: "7. Conteúdos", p: [
    "O Dono da Loja mantém a titularidade dos conteúdos que carrega (textos, imagens, logótipos) e concede à MôBisno uma licença limitada para os alojar e apresentar com o fim de operar a Loja. O Dono garante que detém os direitos sobre esses conteúdos.",
  ] },
  { h: "8. Suspensão e cancelamento", p: [
    "A MôBisno pode suspender ou encerrar contas que violem estes Termos, a lei, ou que coloquem em risco a plataforma ou terceiros. O Dono pode encerrar a sua Loja a qualquer momento a partir do Dashboard.",
  ] },
  { h: "9. Limitação de responsabilidade", p: [
    "A plataforma é fornecida «tal como está». Na máxima medida permitida por lei, a MôBisno não se responsabiliza por lucros cessantes, perda de dados, indisponibilidades de serviços terceiros (pagamentos, alojamento, redes), nem por litígios entre Lojas e os seus clientes.",
  ] },
  { h: "10. Alterações", p: [
    "Estes Termos podem ser atualizados. A continuação do uso da plataforma após uma alteração constitui aceitação da versão em vigor.",
  ] },
  { h: "11. Contacto", p: [
    `Para qualquer questão sobre estes Termos, contacte ${PLATFORM_CONTACT_EMAIL}.`,
  ] },
];

const PRIVACIDADE: LegalSection[] = [
  { h: "1. Dados que recolhemos", p: [
    "Recolhemos os dados necessários para operar o serviço: dados de conta (nome, email), dados das Lojas e produtos, e dados das encomendas. Quando um cliente faz uma compra numa Loja, são tratados os dados necessários à encomenda (nome, contacto, morada de entrega quando aplicável).",
  ] },
  { h: "2. Dados da empresa para os pagamentos digitais", p: [
    "Quando o Dono da Loja pede os pagamentos por Multicaixa Express e Referência Bancária, recolhemos os dados da empresa para a verificar: o nome da empresa, o NIF, o banco, o titular e o IBAN da conta onde recebe, e os documentos da empresa — a Matrícula e a Certidão.",
    "Estes dados e documentos são guardados de forma privada, sem acesso público. Na plataforma, só os veem o próprio Dono da Loja e a administração da MôBisno; nunca são mostrados aos clientes da Loja.",
    "Usamo-los apenas para verificar a empresa e para lhe pagar as vendas feitas por estes meios, o que inclui indicar a conta de destino ao fornecedor de pagamentos.",
  ] },
  { h: "3. Como usamos os dados", p: [
    "Usamos os dados para fornecer e melhorar o serviço, processar pagamentos, comunicar informações essenciais e cumprir obrigações legais. Não vendemos dados pessoais a terceiros.",
  ] },
  { h: "4. Partilha com terceiros", p: [
    "Partilhamos dados apenas com fornecedores que tornam o serviço possível (alojamento, base de dados, processamento de pagamentos e envio de emails), na medida necessária e sob obrigações de confidencialidade.",
  ] },
  { h: "5. Responsabilidade da Loja", p: [
    "Cada Dono da Loja é responsável pelo tratamento dos dados dos seus próprios clientes e por adotar práticas adequadas de privacidade na sua atividade.",
  ] },
  { h: "6. Segurança", p: [
    "Aplicamos medidas técnicas e organizativas razoáveis para proteger os dados, incluindo isolamento por loja e controlo de acessos. Nenhum sistema é 100% imune; em caso de incidente relevante atuamos para mitigar o impacto.",
  ] },
  { h: "7. Os seus direitos", p: [
    `Pode aceder, corrigir ou eliminar os seus dados de conta a partir do Dashboard ou contactando-nos através de ${PLATFORM_CONTACT_EMAIL}. O encerramento da conta remove os dados associados, salvo retenção exigida por lei.`,
  ] },
  { h: "8. Cookies", p: [
    "Usamos armazenamento local e cookies estritamente necessários para autenticação e funcionamento do serviço.",
  ] },
];

const POLITICA: LegalSection[] = [
  { h: "1. Âmbito", p: [
    "Esta Política Geral aplica-se à plataforma MôBisno e a todas as Lojas criadas através dela. Complementa os Termos de Serviço e a Política de Privacidade.",
  ] },
  { h: "2. Uso aceitável", p: [
    "É proibido publicar conteúdo ilegal, enganoso, ofensivo ou que infrinja direitos de terceiros, bem como tentar comprometer a segurança ou a disponibilidade da plataforma.",
  ] },
  { h: "3. Encomendas, entregas e devoluções", p: [
    "As condições de entrega, prazos, taxas e devoluções são definidas por cada Loja. Os clientes devem consultar essas condições na Loja onde compram. A MôBisno disponibiliza as ferramentas, mas não executa nem garante as entregas.",
  ] },
  { h: "4. Pagamentos", p: [
    "Todas as Lojas aceitam encomendas por WhatsApp. Os pagamentos por Multicaixa Express e Referência Bancária só existem nas Lojas de empresas verificadas pela MôBisno e são processados por um fornecedor de pagamentos. Eventuais reembolsos são da responsabilidade da Loja vendedora, de acordo com a sua política e a lei aplicável.",
  ] },
  { h: "5. Propriedade intelectual", p: [
    "A marca, o software e o design da MôBisno são propriedade da MôBisno. Os conteúdos de cada Loja pertencem ao respetivo Dono.",
  ] },
  { h: "6. Contacto", p: [
    `Para questões legais ou de privacidade, contacte ${PLATFORM_CONTACT_EMAIL}.`,
  ] },
];

/** Conteúdo das três páginas. Exportado para os testes lerem o que o ecrã mostra. */
export const LEGAL_PAGES: Readonly<Record<LegalPage, { title: string; intro: string; sections: LegalSection[] }>> = {
  termos: { title: "Termos de Serviço", intro: "Estas condições regem o uso da plataforma MôBisno e das Lojas criadas através dela.", sections: TERMOS },
  privacidade: { title: "Política de Privacidade", intro: "Como tratamos os dados pessoais na plataforma MôBisno.", sections: PRIVACIDADE },
  politica: { title: "Política Geral", intro: "Regras gerais de utilização da plataforma e das Lojas.", sections: POLITICA },
};

export function renderLegal(page: LegalPage): void {
  const data = LEGAL_PAGES[page] ?? LEGAL_PAGES.termos;
  const home = platformHomeUrl();

  applySeo({
    title: `${data.title} — MôBisno`,
    description: data.intro,
    canonical: `${location.origin}/${page}`,
    type: "website",
    siteName: "MôBisno",
  });

  const body = data.sections.map((s) => `
    <section class="mb-7">
      <h2 class="text-lg font-black text-gray-900 mb-2">${esc(s.h)}</h2>
      ${s.p.map((p) => `<p class="text-gray-600 leading-relaxed mb-2">${esc(p)}</p>`).join("")}
    </section>`).join("");

  const links = (["termos", "privacidade", "politica"] as LegalPage[]).map((p) =>
    `<a href="/${p}" class="px-3 py-1.5 rounded-full text-sm font-semibold transition-colors"${p === page ? ' aria-current="page"' : ""} style="${p === page ? `background:rgba(249,89,1,.1);color:${ACCENT}` : "color:#6b7280"}">${esc(LEGAL_PAGES[p].title)}</a>`).join("");

  // Cabeçalho e rodapé da plataforma, os mesmos de todas as outras páginas.
  // Antes estas três páginas tinham um cabeçalho mínimo próprio e rodapé nenhum:
  // quem chegava a partir do Google aterrava num texto solto, sem saída nem
  // sinal de onde estava.
  const app = render(`
  <div class="min-h-screen flex flex-col font-sans text-gray-900" style="background:linear-gradient(180deg,#ffffff 0%,#ffffff 60%,#f7f7f8 100%)">
    ${platformNavHtml()}
    <main class="flex-grow">
      <div class="max-w-3xl mx-auto px-margin-mobile md:px-margin-desktop py-12 md:py-16">
        <a href="${esc(home)}" class="text-sm font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 mb-6"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span> Voltar ao início</a>
        <h1 class="text-3xl md:text-5xl font-black tracking-tight leading-[1.08]">${esc(data.title)}</h1>
        <p class="text-lg text-gray-600 mt-4">${esc(data.intro)}</p>
        <p class="text-xs text-gray-400 mt-2">Última atualização: ${esc(UPDATED)}</p>
        <nav aria-label="Páginas legais" class="flex flex-wrap gap-1.5 mt-6 mb-9 border-b border-gray-100 pb-5">${links}</nav>
        ${body}
        <p class="text-xs text-gray-400 mt-10 border-t border-gray-100 pt-5">Este documento é um modelo informativo e não constitui aconselhamento jurídico. Recomenda-se revisão por um profissional de direito.</p>
      </div>
    </main>
    ${platformFooterHtml()}
  </div>`);
  // As ligações de secção do cabeçalho («Preços», etc.) navegam para a home e
  // rolam lá — aqui não existe nenhuma dessas secções.
  mountSectionNav(app);
  mountAiAgent(app, { screen: "legal" });
}

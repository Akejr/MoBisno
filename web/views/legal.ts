/**
 * Páginas legais da plataforma (aplicam-se ao MôBisno e a todas as lojas):
 * Termos de Serviço, Política de Privacidade e Política Geral.
 *
 * Conteúdo-modelo em pt-AO, redigido para proteger a plataforma (a MôBisno é
 * um fornecedor de tecnologia; cada Loja/Dono é o vendedor responsável).
 * Recomenda-se revisão por um jurista antes do lançamento.
 */
import { render, esc } from "../lib/dom.js";
import { applySeo } from "../lib/seo.js";
import { platformHomeUrl } from "../lib/routing.js";

const ACCENT = "#F95901";
const UPDATED = "Junho de 2026";

type LegalPage = "termos" | "privacidade" | "politica";

interface Section { h: string; p: string[]; }

const TERMOS: Section[] = [
  { h: "1. Quem somos", p: [
    "A MôBisno é uma plataforma tecnológica que permite a qualquer pessoa ou empresa criar e gerir uma loja online (\"Loja\"). A MôBisno fornece o software, o alojamento e as integrações de pagamento; não é a vendedora dos produtos anunciados nas Lojas.",
  ] },
  { h: "2. Conta e elegibilidade", p: [
    "Para criar uma Loja é necessário registar uma conta com dados verdadeiros e manter as credenciais seguras. O titular da conta (\"Dono da Loja\") é o único responsável por toda a atividade na sua Loja.",
    "É proibido usar a plataforma para fins ilícitos, venda de produtos proibidos por lei, fraude, ou violação de direitos de terceiros.",
  ] },
  { h: "3. Responsabilidade do Dono da Loja", p: [
    "O Dono da Loja é o vendedor e o único responsável pelos produtos e serviços que oferece, pela exatidão dos preços e descrições, pelo cumprimento das encomendas, pela entrega, pelas garantias, devoluções e pelo cumprimento das obrigações fiscais e legais aplicáveis em Angola.",
    "A MôBisno não inspeciona nem garante os produtos vendidos pelas Lojas e não é parte na relação de compra e venda entre a Loja e os seus clientes.",
  ] },
  { h: "4. Planos, pagamentos e levantamentos", p: [
    "O uso de funcionalidades pagas depende de uma subscrição ativa. Os planos são cobrados por períodos de 30 dias; quando um plano expira, as funcionalidades pagas deixam de estar disponíveis até nova renovação.",
    "Os pagamentos das Lojas são processados por fornecedores terceiros (ex.: MoMenu / Multicaixa Express). O valor recebido, deduzida a taxa aplicável, é transferido para a conta bancária indicada pelo Dono da Loja. A MôBisno não retém os fundos das vendas.",
  ] },
  { h: "5. Conteúdos", p: [
    "O Dono da Loja mantém a titularidade dos conteúdos que carrega (textos, imagens, logótipos) e concede à MôBisno uma licença limitada para os alojar e apresentar com o fim de operar a Loja. O Dono garante que detém os direitos sobre esses conteúdos.",
  ] },
  { h: "6. Suspensão e cancelamento", p: [
    "A MôBisno pode suspender ou encerrar contas que violem estes Termos, a lei, ou que coloquem em risco a plataforma ou terceiros. O Dono pode encerrar a sua Loja a qualquer momento a partir do painel.",
  ] },
  { h: "7. Limitação de responsabilidade", p: [
    "A plataforma é fornecida \"tal como está\". Na máxima medida permitida por lei, a MôBisno não se responsabiliza por lucros cessantes, perda de dados, indisponibilidades de serviços terceiros (pagamentos, alojamento, redes), nem por litígios entre Lojas e os seus clientes.",
  ] },
  { h: "8. Alterações", p: [
    "Estes Termos podem ser atualizados. A continuação do uso da plataforma após uma alteração constitui aceitação da versão em vigor.",
  ] },
];

const PRIVACIDADE: Section[] = [
  { h: "1. Dados que recolhemos", p: [
    "Recolhemos os dados necessários para operar o serviço: dados de conta (nome, email), dados das Lojas e produtos, e dados de transações. Quando um cliente faz uma compra numa Loja, são tratados os dados necessários à encomenda (nome, contacto, morada de entrega quando aplicável).",
  ] },
  { h: "2. Como usamos os dados", p: [
    "Usamos os dados para fornecer e melhorar o serviço, processar pagamentos, comunicar informações essenciais e cumprir obrigações legais. Não vendemos dados pessoais a terceiros.",
  ] },
  { h: "3. Partilha com terceiros", p: [
    "Partilhamos dados apenas com fornecedores que tornam o serviço possível (alojamento, base de dados, processamento de pagamentos e envio de mensagens), na medida necessária e sob obrigações de confidencialidade.",
  ] },
  { h: "4. Responsabilidade da Loja", p: [
    "Cada Dono da Loja é responsável pelo tratamento dos dados dos seus próprios clientes e por adotar práticas adequadas de privacidade na sua atividade.",
  ] },
  { h: "5. Segurança", p: [
    "Aplicamos medidas técnicas e organizativas razoáveis para proteger os dados, incluindo isolamento por loja e controlo de acessos. Nenhum sistema é 100% imune; em caso de incidente relevante atuamos para mitigar o impacto.",
  ] },
  { h: "6. Os seus direitos", p: [
    "Pode aceder, corrigir ou eliminar os seus dados de conta a partir do painel ou contactando-nos. O encerramento da conta remove os dados associados, salvo retenção exigida por lei.",
  ] },
  { h: "7. Cookies", p: [
    "Usamos armazenamento local e cookies estritamente necessários para autenticação e funcionamento do serviço.",
  ] },
];

const POLITICA: Section[] = [
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
    "Os pagamentos são processados por fornecedores licenciados. Eventuais reembolsos são da responsabilidade da Loja vendedora, de acordo com a sua política e a lei aplicável.",
  ] },
  { h: "5. Propriedade intelectual", p: [
    "A marca, o software e o design da MôBisno são propriedade da MôBisno. Os conteúdos de cada Loja pertencem ao respetivo Dono.",
  ] },
  { h: "6. Contacto", p: [
    "Para questões legais ou de privacidade, contacte geral@mobisno.store.",
  ] },
];

const PAGES: Record<LegalPage, { title: string; intro: string; sections: Section[] }> = {
  termos: { title: "Termos de Serviço", intro: "Estas condições regem o uso da plataforma MôBisno e das Lojas criadas através dela.", sections: TERMOS },
  privacidade: { title: "Política de Privacidade", intro: "Como tratamos os dados pessoais na plataforma MôBisno.", sections: PRIVACIDADE },
  politica: { title: "Política Geral", intro: "Regras gerais de utilização da plataforma e das Lojas.", sections: POLITICA },
};

export function renderLegal(page: LegalPage): void {
  const data = PAGES[page] ?? PAGES.termos;
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
    `<a href="#/${p}" class="px-3 py-1.5 rounded-full text-sm font-semibold transition-colors" style="${p === page ? `background:rgba(249,89,1,.1);color:${ACCENT}` : "color:#6b7280"}">${esc(PAGES[p].title)}</a>`).join("");

  render(`
  <div class="min-h-screen bg-gray-50 font-sans text-gray-900">
    <header class="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div class="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
        <a href="${esc(home)}" class="flex items-center gap-2"><img src="/logo-header.png" alt="MôBisno" style="height:24px" class="w-auto object-contain" /></a>
        <a href="${esc(home)}" class="text-sm font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">arrow_back</span> Voltar</a>
      </div>
    </header>
    <main class="max-w-3xl mx-auto px-5 py-10">
      <h1 class="text-3xl md:text-4xl font-black tracking-tight">${esc(data.title)}</h1>
      <p class="text-gray-500 mt-2">${esc(data.intro)}</p>
      <p class="text-xs text-gray-400 mt-1">Última atualização: ${esc(UPDATED)}</p>
      <div class="flex flex-wrap gap-1.5 mt-5 mb-8 border-b border-gray-100 pb-5">${links}</div>
      ${body}
      <p class="text-xs text-gray-400 mt-10 border-t border-gray-100 pt-5">Este documento é um modelo informativo e não constitui aconselhamento jurídico. Recomenda-se revisão por um profissional de direito.</p>
    </main>
  </div>`);
}

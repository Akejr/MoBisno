/**
 * Diagnóstico de configuração (sem expor segredos).
 *
 * `GET /api/health` →
 * `{ ok, supabaseUrl, serviceRole, paymentProvider, paymentWebhook, email }`
 *
 * Use para confirmar que as variáveis de ambiente chegam às funções serverless.
 * Cada campo é apenas `true`/`false` ou o nome do fornecedor — **nunca um
 * segredo**, nem o seu tamanho, nem um prefixo dele.
 *
 * `ok` cobre só o que a plataforma precisa para funcionar: a base de dados. Não
 * depende dos pagamentos nem do email, porque sem eles as lojas continuam a
 * vender por WhatsApp; são esses os campos que se leem um a um ao ligar a
 * cobrança (`DEPLOY.md`, secção dos pagamentos).
 */
import { configStatus, send } from "./_shared.js";
import { getPaymentProvider } from "./_provider.js";
import { resendConfigured } from "./_resend.js";
import { nsanguConfigured } from "./_nsangu.js";
import { aiConfigured, aiModel } from "./_openrouter.js";

export default async function handler(_req, res) {
  const s = configStatus();
  send(res, 200, {
    ok: s.supabaseUrl && s.serviceRole,
    supabaseUrl: s.supabaseUrl,
    serviceRole: s.serviceRole,
    // `null` enquanto as credenciais da Wiza não estiverem configuradas: é o
    // que faz `/api/payment` responder 503 em vez de tentar cobrar.
    paymentProvider: getPaymentProvider()?.name ?? null,
    // O segredo do callback é uma variável à parte das credenciais: sem ele, a
    // cobrança é criada mas o callback da Wiza é recusado, e uma Referência
    // paga horas depois nunca chega a ser confirmada.
    paymentWebhook: !!process.env.WIPAY_WEBHOOK_SECRET,
    email: resendConfigured(),
    // Confirmação do telemóvel por SMS (Nsangu). Sem isto, quem cria conta não
    // recebe o código e fica com a loja por publicar até confirmar o número.
    //
    // Só o booleano: o saldo de SMS é informação do negócio, e este endpoint é
    // público. Lê-lo aqui também punha qualquer visita a gastar um pedido à API
    // da Nsangu.
    sms: nsanguConfigured(),
    // Toda a IA passa pelo OpenRouter: as respostas do assistente e os textos
    // de SEO que o assistente de criação gera. O nome do modelo não é segredo —
    // e é o que distingue «sem chave» de «modelo que não existe», o erro que
    // deixou a geração de texto a falhar em silêncio.
    ai: aiConfigured(),
    aiModel: aiModel(),
  });
}

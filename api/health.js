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
  });
}

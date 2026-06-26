/**
 * Diagnóstico de configuração dos pagamentos (sem expor segredos).
 * GET /api/health → { ok, supabaseUrl, serviceRole, platformApiKey }
 *
 * Use para confirmar que as variáveis de ambiente chegam às funções serverless.
 * Cada campo é apenas true/false (o valor nunca é devolvido).
 */
import { configStatus, send } from "./_shared.js";

export default async function handler(req, res) {
  const s = configStatus();
  send(res, 200, {
    ok: s.supabaseUrl && s.serviceRole && s.platformApiKey,
    supabaseUrl: s.supabaseUrl,
    serviceRole: s.serviceRole,
    platformApiKey: s.platformApiKey,
  });
}

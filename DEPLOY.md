# Deploy — MôBisno (Vercel + domínio mobisno.store)

A app é uma SPA estática (Vite, routing por hash) com backend no Supabase.
As lojas dos clientes ficam em **subdomínios reais**: `nomedaloja.mobisno.store`.

## 1. Repositório

```bash
git remote add origin https://github.com/Akejr/MoBisno.git
git add .
git commit -m "MôBisno: domínio mobisno.store + deploy Vercel"
git branch -M main
git push -u origin main
```

> A `anon key` do Supabase é pública por design (o isolamento é por RLS), mas as
> variáveis ficam fora do git (ver `.gitignore`) e são definidas na Vercel.

## 2. Projeto na Vercel

1. **Add New → Project** → importar `Akejr/MoBisno`.
2. A Vercel lê o `vercel.json` (build `npm run web:build`, output `web/dist`).
3. **Environment Variables** (Production + Preview):
   - `VITE_SUPABASE_URL` = URL do projeto Supabase
   - `VITE_SUPABASE_ANON_KEY` = chave anon (pública)
4. Deploy.

## 3. Domínios na Vercel + wildcards

A plataforma usa **dois domínios**:
- `mobisno.store` → **painel/marca** (landing, login, painel, criar).
- `sualoja.digital` → **lojas dos clientes** em `nomedaloja.sualoja.digital`.
  O apex `sualoja.digital` redireciona automaticamente para `mobisno.store`
  (feito no arranque da app — `web/main.ts`).

No painel do projeto → **Settings → Domains**, adicionar **todos**:
- `mobisno.store` (apex) e `www.mobisno.store`
- `*.mobisno.store`  ← wildcard (retrocompatibilidade de lojas antigas)
- `sualoja.digital` (apex) e `www.sualoja.digital`
- `*.sualoja.digital`  ← wildcard, **essencial** para `nomedaloja.sualoja.digital`

DNS em cada registrar (a Vercel mostra os valores exatos; tipicamente):
- Apex (`mobisno.store`, `sualoja.digital`) → registo **A** `76.76.21.21`
  (ou ALIAS/ANAME para `cname.vercel-dns.com`)
- `www` → **CNAME** `cname.vercel-dns.com`
- `*` (wildcard) → **CNAME** `cname.vercel-dns.com`

A Vercel emite SSL automático, incluindo para os wildcards. O domínio das
lojas é configurável numa só constante: `STORE_APEX` em `web/lib/routing.ts`.

> Nota: o apex `sualoja.digital` redireciona para `mobisno.store` no cliente.
> Em alternativa (opcional), podes configurar esse redirect também na Vercel
> (Settings → Domains → Redirect) para ser instantâneo, sem carregar a app.

## 4. Supabase

1. Aplicar as migrações por ordem no **SQL Editor**: `0001` … `0014_discount_codes.sql`
   (a `0007` muda o subdomínio para `.mobisno.store`; a `0008` cria pagamentos;
   a `0009` o produto físico; a `0010` os pedidos de levantamento; a `0011`
   adiciona `profiles.is_admin` e as políticas RLS de administração; a `0012`
   a faturação de planos (expiração/carry-over); a `0013` os créditos de SMS;
   a `0014` os códigos de desconto).
2. **Tornar uma conta administrador** (acesso ao painel `/adminPainel`):
   no SQL Editor, correr
   `update public.profiles set is_admin = true where email = 'o-seu-email@exemplo.com';`
3. **Authentication → URL Configuration**:
   - **Site URL**: `https://mobisno.store`
   - **Redirect URLs**: `https://mobisno.store/**`, `https://www.mobisno.store/**`
4. (Testes) Em **Authentication → Providers → Email**, desativar a confirmação de
   email para criar contas sem caixa de entrada.

## 5. Como funciona o roteamento

- `mobisno.store` / `www.mobisno.store` → app principal (landing, login, painel, criar).
- `nomedaloja.sualoja.digital` → `main.ts` deteta o subdomínio e renderiza a loja
  publicada desse identificador. As sub-páginas (produto/categoria/carrinho)
  continuam a funcionar por hash (`#/loja/...`).
- `nomedaloja.mobisno.store` continua a resolver (lojas antigas), mas as URLs
  públicas novas usam `sualoja.digital` (`STORE_APEX`).
- `sualoja.digital` (apex/www) → redireciona para `mobisno.store`.
- Em `localhost` ou `*.vercel.app` (sem subdomínio) cai-se no modo hash
  (`/#/loja/<identificador>`), por isso o preview da Vercel funciona à mesma.

## 6. Notas

- GitHub Pages **não** serve para o produto final por não suportar wildcard de
  subdomínios; a Vercel suporta. Por isso o deploy é na Vercel.
- O `web/dist` é gerado no build e está no `.gitignore` (via `dist/`).

## Assistente de IA (olhinho do editor)

O chat do assistente usa uma função serverless em `api/assistant.js` que guarda a
chave da OpenAI **apenas no servidor**. Configura no Vercel (Project → Settings →
Environment Variables):

- `OPENAI_API_KEY` — a chave secreta da OpenAI (obrigatória).
- `OPENAI_MODEL` — opcional; por omissão `gpt-5.4-mini`.

Nunca coloques a chave no frontend nem a faças commit. Em desenvolvimento local,
o chat só funciona com `vercel dev` (a função `/api/assistant` não corre com o
`vite` puro).

## Pagamentos (MoMenu — Multicaixa Express + Referência Bancária)

O checkout online e os pagamentos de planos usam a API MoMenu através de funções
serverless (`api/payment.js`, `api/payment-status.js`, `api/webhook.js`). A chave
MoMenu de cada loja **vive só no servidor** (tabela `store_payments`, lida pela
service role); nunca chega ao frontend.

### Variáveis de ambiente (Vercel → Settings → Environment Variables)

- `SUPABASE_URL` — URL do projeto Supabase (igual ao `VITE_SUPABASE_URL`).
- `SUPABASE_SERVICE_ROLE_KEY` — **service role** do Supabase (secreta; ignora RLS
  para ler chaves de loja e gravar/atualizar encomendas). Nunca no frontend.
- `MOMENU_PLATFORM_API_KEY` — chave MoMenu **da plataforma**, usada para receber
  os pagamentos de planos (a receita dos planos é tua, não aparece em nenhum
  dashboard de comerciante).
- `MOMENU_BASE_URL` — opcional; por omissão `https://api.momenu.online`.

### Migração

Aplicar `supabase/migrations/0008_payments.sql` no SQL Editor.

### Por comerciante (no painel MôBisno → Pagamentos)

1. Ativar "Pagamentos online" (não é preciso chave — a plataforma usa a sua
   `MOMENU_PLATFORM_API_KEY` única do Vercel).
2. Vincular a **conta bancária** (Banco, Beneficiário, IBAN) onde o comerciante
   recebe. É obrigatória uma conta **verificada na MoMenu** para receber (senão a
   API recusa com `BANK_ACCOUNT_NOT_VERIFIED`). Com `instantWithdraw` (sempre
   ativo), o valor menos 2% é transferido automaticamente para essa conta.

### Webhook (Referência Bancária)

Cada comerciante (e a conta da plataforma para os planos) deve configurar, na sua
conta MoMenu (Definições → Desenvolvedores → Webhook), o URL:

```
https://mobisno.store/api/webhook
```

O webhook é mapeado por `merchantTransactionId`. Como fallback (entrega
fire-and-forget, sem retentativas), o checkout tem o botão "Já paguei — verificar"
que chama `/api/payment-status`.

### Domínios autorizados na MoMenu

A API valida a origem (`DOMAIN_NOT_ALLOWED`). Como as chamadas partem das funções
serverless (servidor) e não do browser, registar/autorizar o domínio da app na
conta MoMenu conforme exigido.

### Testes (QA)

Abrir o checkout ou o painel com `?qa=1` no URL ativa o modo de testes
(`x-env-qa: true`); nenhum valor real é cobrado (MCX simula `success`).

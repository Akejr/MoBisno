# Deploy — MôBisno (Vercel + domínio mobisno.store)

A app é uma SPA estática (Vite) com backend no Supabase e funções serverless em
`api/`. O routing é por **caminhos reais** (History API); o formato antigo `#/x`
continua a ser aceite à entrada e normalizado por `cleanPath`, e é o esquema
usado nas ligações da app **privada** (`#/painel`, `#/adminPainel/...`). Ver
`SEO.md` §5.1.

As lojas dos clientes ficam em **subdomínios reais** de `sualoja.digital`:
`nomedaloja.sualoja.digital` (`STORE_APEX` em `web/lib/routing.ts`).
`nomedaloja.mobisno.store` continua a resolver, por retrocompatibilidade.

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
2. A Vercel lê o `vercel.json` (build `npm run web:build`, output `web/dist`,
   `framework: null`).
3. **Environment Variables** (Production + Preview):
   - `VITE_SUPABASE_URL` = URL do projeto Supabase
   - `VITE_SUPABASE_ANON_KEY` = chave anon (pública)

   As variáveis usadas pelas funções serverless (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, MoMenu, OpenAI) estão nas secções próprias, mais
   abaixo. O resumo de todas está no fim deste documento.
4. Deploy.

> **Não alterar o `buildCommand`.** O `web:build` corre
> `scripts/rename-shell.mjs`, que renomeia `web/dist/index.html` para
> `app.html`. Sem isso a Vercel serve um ficheiro estático em `/` e o
> `api/prerender.js` deixa de correr na página inicial de **todas** as lojas —
> sem nada falhar. É a invariante §5.3 do `SEO.md`.

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

1. Aplicar as migrações por ordem no **SQL Editor**: `0001` … `0018`
   (a `0001` cria também o bucket público `store-assets` e as políticas de
   Storage; a `0007` muda o subdomínio para `.mobisno.store`; a `0008` cria
   pagamentos; a `0009` o produto físico; a `0010` os pedidos de levantamento; a
   `0011` adiciona `profiles.is_admin` e as políticas RLS de administração; a
   `0012` a faturação de planos (expiração/carry-over); a `0013` os créditos de
   SMS; a `0014` os códigos de desconto; a `0015` o stock de produtos; a `0016`
   as avaliações de produtos; a `0017` os eventos de loja (analytics)).

   **Há duas migrações com o número 0018** — aplicar **as duas**:
   `0018_trial.sql` (superada pela 0019; aplique-a na mesma, a ordem conta) e
   `0019_single_plan.sql` (preço único, sem teste grátis, publicar exige subscrição)
   e `0018_logo_purchases.sql` (tabela `logo_purchases`, sem a qual a compra de
   logótipo por IA falha no servidor).
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
  publicada desse identificador. As sub-páginas usam **caminhos reais**:
  `/produto/<categoria>/<slug>`, `/categoria/<slug>`, `/carrinho`, `/checkout`.
- `nomedaloja.mobisno.store` continua a resolver (lojas antigas), mas as URLs
  públicas novas usam `sualoja.digital` (`STORE_APEX`).
- `sualoja.digital` (apex/www) → redireciona para `mobisno.store`.
- Em `localhost` ou `*.vercel.app` (sem subdomínio) a loja abre em
  `/loja/<identificador>` (e as sub-páginas em `/loja/<id>/produto/...`), por
  isso o preview da Vercel funciona à mesma.
- Os rewrites do `vercel.json`, por ordem: `/robots.txt` → `api/robots`,
  `/sitemap.xml` → `api/sitemap`, `/` → `api/prerender` e qualquer caminho sem
  extensão e fora de `/api/` → `api/prerender`.

## 6. Notas

- GitHub Pages **não** serve para o produto final por não suportar wildcard de
  subdomínios; a Vercel suporta. Por isso o deploy é na Vercel.
- O `web/dist` é gerado no build e está no `.gitignore` (via `dist/`).

## SEO (cliente + pré-renderização para crawlers)

O SEO tem duas camadas:

1. **Cliente** (`web/lib/seo.ts` + `src/services/seo.ts`): em cada navegação
   define `<title>`, descrição, canónico, Open Graph, Twitter Card e JSON-LD
   (Product/OnlineStore/Organization). Cobre o Google (que executa JS) e a
   experiência no navegador. Lojas aparecem como `Nome da Loja | Compras em
   Angola`; produtos como `Produto — Nome da Loja`.

2. **Servidor** (`api/prerender.js`): os crawlers sociais (WhatsApp, Facebook)
   e a primeira passagem do Google **não executam JS**, por isso esta função faz
   **SSR a sério** — injeta as meta tags (incluindo a **imagem do produto** e o
   **og:site_name da loja**) *e* o conteúdo real dentro de `#app`, escondido do
   visitante por recorte. Responde também com os códigos certos: **404** para
   loja inexistente ou não publicada, **410** para conta suspensa, `noindex` no
   carrinho/checkout e nos caminhos privados. É defensiva: perante erro devolve o
   shell estático inalterado. O detalhe está no `SEO.md` §3.

`api/robots.js` e `api/sitemap.js` geram `robots.txt` e `sitemap.xml` por host
(o sitemap da loja lista produtos e categorias; o da plataforma é um índice das
lojas publicadas). O diretório público de lojas é `/lojas`.

> Requer as env vars do Supabase no servidor (`SUPABASE_URL` +
> `SUPABASE_SERVICE_ROLE_KEY`), já usadas pelos pagamentos. `SUPABASE_URL` cai
> para `VITE_SUPABASE_URL` quando não está definida.

**Passo manual, no Search Console:** submeter
`https://www.sualoja.digital/sitemap.xml` (o apex devolve **308** para `www`) e
criar uma propriedade de **Domínio** para `sualoja.digital`, verificada por DNS —
sem ela não se pode pedir indexação dos subdomínios das lojas. Enquanto os apex
redirecionarem para `www`, todos os `canonical` apontam para URLs que
redirecionam; ver `SEO.md` §7.1 para o alinhamento pendente em Domains.

## Assistente de IA (olhinho do editor) e gerador de logótipos

O chat do assistente (`api/assistant.js`) e o gerador de logótipos
(`api/logo.js`) guardam a chave da OpenAI **apenas no servidor**. Configura no
Vercel (Project → Settings → Environment Variables):

- `OPENAI_API_KEY` — a chave secreta da OpenAI (**obrigatória para os dois**).
- `OPENAI_MODEL` — opcional; por omissão `gpt-5.4-mini` (texto/assistente).
- `OPENAI_IMAGE_MODEL` — opcional; por omissão `gpt-image-1` (logótipos).
- `OPENAI_IMAGE_QUALITY` — opcional; por omissão `medium` (logótipos).

Sem `OPENAI_API_KEY` as duas funções respondem **500** com mensagem explícita —
o assistente e a criação de logótipos ficam indisponíveis, o resto da app
funciona.

`api/assistant.js` aceita cinco *scopes* no corpo do pedido (`editor`, `site`,
`seo`, `seotitle`, `logo`); `api/logo.js` pede cinco propostas em paralelo e
devolve PNG com fundo transparente. Nem o scope nem o caminho do endpoint são
verificados pelo `tsc` — são chamadas HTTP em execução (ver `SEO.md` §7.3).

Nunca coloques a chave no frontend nem a faças commit. Em desenvolvimento local,
estas funções só correm com `vercel dev` (não com o `vite` puro).

### Compra de logótipo (5.000 Kz)

Requer a migração `0018_logo_purchases.sql` e a `MOMENU_PLATFORM_API_KEY` (a
compra é receita da plataforma). O ficheiro é carregado para o Storage **antes**
do pagamento; ao confirmar, `fulfillLogo` acrescenta o URL a
`stores.customization.logos`.

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

## Resumo das variáveis de ambiente

Todas na Vercel → Settings → Environment Variables (Production + Preview). Esta
é a lista completa do que o código lê hoje — nada mais é consultado.

| Variável | Onde é lida | Obrigatória | Por omissão |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `web/supabase/client.ts` (build) | sim | — |
| `VITE_SUPABASE_ANON_KEY` | `web/supabase/client.ts` (build) | sim | — |
| `SUPABASE_URL` | `api/_shared.js` | sim | cai para `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/_shared.js` | sim (secreta) | — |
| `MOMENU_PLATFORM_API_KEY` | `api/_shared.js` | para planos, SMS e logótipos | `""` |
| `MOMENU_BASE_URL` | `api/_shared.js` | não | `https://api.momenu.online` |
| `OPENAI_API_KEY` | `api/assistant.js`, `api/logo.js` | para assistente e logótipos | — |
| `OPENAI_MODEL` | `api/assistant.js` | não | `gpt-5.4-mini` |
| `OPENAI_IMAGE_MODEL` | `api/logo.js` | não | `gpt-image-1` |
| `OPENAI_IMAGE_QUALITY` | `api/logo.js` | não | `medium` |

## Checklist de lançamento

- [ ] Migrações `0001` … `0017` + **`0018_trial.sql`, `0018_logo_purchases.sql` e `0019_single_plan.sql`**.
- [ ] Bucket `store-assets` público (criado pela `0001`).
- [ ] Variáveis de ambiente da tabela acima.
- [ ] Domínios e wildcards (`*.sualoja.digital` é essencial) com SSL emitido.
- [ ] Uma conta com `is_admin = true`.
- [ ] Authentication → Site URL e Redirect URLs.
- [ ] Webhook MoMenu para `https://mobisno.store/api/webhook`.
- [ ] `curl` à raiz de uma loja: o `<title>` traz o nome da loja (prerender a
      correr) e há `href="/produto/..."` no HTML — ver `SEO.md` §6.
- [ ] Sitemap `https://www.sualoja.digital/sitemap.xml` submetido no Search
      Console, com propriedade de Domínio verificada por DNS.

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
   `SUPABASE_SERVICE_ROLE_KEY`, OpenAI) estão nas secções próprias, mais
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
1. Aplicar as migrações por ordem no **SQL Editor**, da `0001` à `0027`.
   Nenhuma é opcional, e a ordem conta.

   | Migração | O que faz |
   |---|---|
   | `0001_init.sql` | Tabelas base, RLS, bucket público `store-assets` |
   | `0002`–`0006` | Personalização, produtos, banners, assets |
   | `0007_subdomain.sql` | Subdomínio das lojas |
   | `0008_payments.sql` | `store_payments`, `orders`, `plan_payments` |
   | `0009`–`0010` | Produto físico; pedidos de levantamento |
   | `0011_admin.sql` | `profiles.is_admin` + políticas RLS de administração |
   | `0012`–`0017` | Faturação, créditos de SMS, códigos de desconto, stock, avaliações, eventos de loja |
   | `0018_trial.sql` e `0018_logo_purchases.sql` | **Duas com o número 0018** — aplicar as duas (histórico; a 0019 supera a primeira) |
   | `0019_single_plan.sql` | Plano único, sem teste grátis |
   | `0020_stores_per_plan.sql` | Preço por loja publicada (superada pela 0023) |
   | `0021_orders_owner_delete.sql` | O Dono apaga referências expiradas |
   | **`0022_security.sql`** | **Correções de segurança.** O utilizador deixa de poder tornar-se administrador ou dar-se subscrição; o Storage passa a ter isolamento por loja; o prefixo `modelo-` fica reservado; as avaliações entram por aprovar; os códigos de desconto deixam de ser listáveis e ganham validade e limite de usos; um levantamento não pode exceder o saldo |
   | **`0023_single_plan_and_company_verification.sql`** | **Plano único de 10.000 Kz/30 dias** (saem as colunas de lugares pagos) e **verificação de empresa** para os pagamentos digitais: dados e documentos em `store_payments`, bucket privado `company-documents`, e o gatilho que liga `stores.digital_payments` quando o Administrador aprova |
   | **`0024_wizapay_vero_and_whatsapp_orders.sql`** | **Pagamentos a sério.** O serviço e o código de estado que a Wiza devolveu (`orders`, `plan_payments`); a factura da empresa do Dono (`orders.invoice_*`, `store_payments.vero_org_id`/`vero_api_key` e as colunas derivadas `vero_key_set`/`vero_key_test`, que são as únicas que o navegador lê); `orders.notified_at`, que impede o mesmo aviso de venda duas vezes; a restrição `orders_net_within_amount` (o líquido nunca excede o montante nem é negativo); e a tabela **`whatsapp_orders`**, com inserção pública, onde cai quem toca em «Finalizar via WhatsApp» |
   | **`0025_plan_per_store.sql`** | **A subscrição passa a ser de cada loja** (10.000 Kz por 30 dias, por loja): `stores.plan_expires_at`, preenchida na transição com o período em curso da conta; o gatilho `stores_plan_guard` (só a plataforma mexe na data); publicar e a leitura pública passam a olhar para a subscrição da loja; e `plan_payments.store_id` |
   | **`0026_phone_verification.sql`** | **Confirmação do telemóvel por SMS.** `profiles.phone` e `profiles.phone_verified_at` (as contas que já existiam ficam confirmadas, uma vez só, no momento em que a coluna nasce); `profiles_guard` passa a proteger as duas colunas (o Dono não se confirma a si próprio); a tabela `phone_verifications`, com RLS ligada e **sem políticas** (só a service role lhe toca, e guarda o SHA-256 do código, nunca o código); e publicar passa a exigir **telemóvel confirmado e** subscrição em vigor |
   | **`0027_phone_verifications_fk.sql`** | Corrige a chave estrangeira de `phone_verifications.owner_id`: passa a referenciar `auth.users (id)`, como todas as outras tabelas da plataforma. A linha de `profiles` é gravada pelo navegador **depois** do registo, e o pedido do código chegava antes dela — o envio falhava com um 500 na primeira conta criada |

   > Numa instalação feita antes desta versão faltam a 0022, a 0023, a 0024, a
   > 0025, a 0026 e a 0027.
   > Sem a 0022, qualquer utilizador autenticado se promove a administrador
   > (`update profiles set is_admin = true`). Sem a 0023, o painel de
   > «Pagamentos» falha ao gravar a verificação de empresa. Sem a 0024, uma
   > venda digital não grava a factura e o «Início» falha a ler as encomendas
   > por WhatsApp. Sem a 0025, todas as lojas aparecem sem subscrição e o
   > pagamento do plano é recusado. Sem a 0026, a confirmação do telemóvel falha
   > ao gravar e ninguém consegue publicar. Sem a 0027, o envio do código responde
   > 500 à primeira conta criada.

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

## Assistente de IA (o olhinho)

`api/assistant.js` guarda a chave da OpenAI **apenas no servidor**. Variáveis
na Vercel → Settings → Environment Variables:

- `OPENAI_API_KEY` — a chave secreta da OpenAI (**obrigatória**).
- `OPENAI_MODEL` — opcional; por omissão `gpt-5.4-mini`.

Sem `OPENAI_API_KEY` o endpoint responde **500** com mensagem explícita — não
falha em silêncio.

O endpoint não exige sessão (o visitante da página inicial também pergunta),
por isso tem duas guardas: **origem** (só `mobisno.store`, `localhost` e os URL
de pré-visualização deste projeto, lidos de `VERCEL_URL` /
`VERCEL_BRANCH_URL`) e **limite de pedidos** (30 por IP em 10 minutos, por
instância). O detalhe de um erro da OpenAI fica no registo do servidor e não na
resposta.

**Os factos que o assistente usa não estão no servidor.** Vêm no pedido, em
`context`, montados por `web/lib/assistantContext.ts` a partir dos módulos de
domínio (`src/services/plans.ts`, `comingSoon.ts`, `paymentVerification.ts`…).
É o que impede o prompt de envelhecer: ver `.kiro/steering/assistente.md`.

**O gerador de logótipos por IA foi removido** do produto. `api/logo.js`,
`web/lib/logoApi.ts`, `logoCompose.ts` e `logoPurchase.ts` já não existem, e
não há `OPENAI_IMAGE_MODEL` nem `OPENAI_IMAGE_QUALITY`. A tabela
`logo_purchases` fica como histórico das compras feitas enquanto existiu.

## Pagamentos (Multicaixa Express + Referência Bancária)

### Quem faz o quê

| Peça | Papel |
|---|---|
| **Wiza** (WizaPay) | Cobra o cliente. É ela que mostra ao comprador a escolha entre Multicaixa Express e Referência Bancária, no **checkout alojado** dela |
| **Vero** | Emite a Fatura-Recibo, certificada pela AGT. As credenciais são **da empresa do Dono**, não da MôBisno: quem vende é ele |
| **Resend** | Avisa o Dono de cada venda e envia o recibo ao comprador |

`api/_provider.js` é o único ficheiro que o resto do código conhece;
`api/_wizapay.js`, `api/_vero.js` e `api/_resend.js` são os clientes. Sem as
variáveis de ambiente, `/api/payment`, `/api/payment-status` e
`/api/payment-webhook` respondem **503 `PAYMENTS_UNAVAILABLE`** sem tocar na
base de dados — e **todas as lojas continuam a vender por WhatsApp**, que não
depende de fornecedor nenhum.

### O fluxo de uma venda

1. O checkout envia os artigos. **O servidor calcula o preço** a partir da base
   de dados (`api/_payments.js`): stock verificado, código de desconto validado
   por RPC, taxa de entrega recalculada, e 409 `PRICE_CHANGED` se não bater com
   o total que o comprador viu. A encomenda é gravada **antes** de se cobrar.
2. `POST /v1/hosts/payments` cria a cobrança. A Wiza responde **303 sem corpo**:
   o `id` vem no cabeçalho `Location`, por isso o redireccionamento **não pode
   ser seguido** (sem `id` não há forma de confirmar o pagamento).
3. O comprador é levado ao checkout alojado da Wiza, paga, e volta a
   `/checkout?mb_pay=…`. **A volta dele não confirma nada.**
4. `GET /v1/hosts/payments/{id}` é a **única fonte de verdade**. Responde durante
   cerca de **cinco minutos**; depois devolve 404, pago ou não. O Express
   resolve-se dentro da janela; uma Referência paga horas depois cai fora dela,
   e aí a única pista é o callback.
5. Confirmada a venda, `api/_payments.js` grava `fee` e `net` (comissão de
   `src/services/fees.ts`, **calculada do nosso lado**, nunca a partir do que o
   fornecedor diga) e `api/_fulfil.js` emite a factura e envia os emails.
   **Uma falha do Vero ou do Resend nunca cancela uma venda**: fica em
   `orders.invoice_status` e é retentada na verificação de estado seguinte.

### A comissão de 5 %

Vive em `src/services/fees.ts`, espelhada em `api/_shared.js`
(`tests/fees.test.ts` compara as duas) e escrita em lado nenhum à mão. O Dono
recebe o montante menos a comissão; é esse o «Disponível para levantar». As
vendas por **WhatsApp não têm comissão**: esse dinheiro nunca passa pela
Plataforma.

### Configurar

1. Variáveis `WIPAY_*` na Vercel (tabela abaixo). `WIPAY_WEBHOOK_SECRET` é um
   segredo inventado por si — 32 caracteres aleatórios servem.
2. No painel da Wiza, o URL de notificação:
   `https://<domínio>/api/payment-webhook?k=<WIPAY_WEBHOOK_SECRET>`
3. `RESEND_API_KEY` e o domínio do remetente verificado no Resend (DNS).
4. Cada Dono liga a **factura dele** no Dashboard → «Pagamentos» → «Fatura
   automática (Vero)», com o Org ID e a chave `vero_live_sk_…` da empresa dele.
   Sem isso, a loja vende e recebe como sempre; só não emite factura
   (`invoice_status = 'skipped'`).

> **O webhook exige três provas** (`api/payment-webhook.js`): o `?k=` igual ao
> segredo (comparado com `timingSafeEqual`), o `id` do pagamento, e o montante
> igual ao da encomenda. A assinatura HMAC documentada pela Wiza não é
> reproduzível e **não** é usada. O endpoint responde sempre 200, para a Wiza
> não reentrar em ciclo; 500 fica reservado a falhas internas retentáveis.

> `api/webhook.js` foi **apagado**. Aceitava qualquer `POST` com um
> `merchantTransactionId` e marcava a encomenda como paga: bastava conhecer o id
> que o próprio comprador recebia. Se existir um webhook a apontar para
> `/api/webhook` no painel de algum fornecedor, remova-o.

### Quem pode receber pagamentos digitais

Não há interruptor. A coluna `stores.digital_payments` é ligada **apenas** pelo
gatilho da migração 0023, quando o Administrador aprova a verificação de empresa
em `/adminPainel/aprovacoes`. O Dono envia, no Dashboard → «Pagamentos», o nome
e o NIF da empresa, o banco, o titular e o IBAN, e dois documentos (Matrícula e
Certidão) para o bucket **privado** `company-documents`. O Administrador abre-os
por URL assinado (5 minutos) e aprova ou rejeita com motivo.

Uma loja **sem** pagamentos digitais não vê saldo nem levantamentos: vê, no
«Início», as **«Encomendas por WhatsApp»** — quem tocou em «Finalizar via
WhatsApp» e o que tinha no carrinho (tabela `whatsapp_orders`, migração 0024).

### Confirmação do telemóvel

Publicar uma loja exige **duas** coisas: a subscrição dela em vigor e o
telemóvel da conta confirmado por SMS. As duas são impostas pelo gatilho
`stores_publish_requires_plan` (migração 0026), que lança
`PHONE_REQUIRED_TO_PUBLISH` ou `PLAN_REQUIRED_TO_PUBLISH` — o painel traduz cada
uma na frase que diz onde se resolve.

O código tem 6 algarismos, vale 10 minutos e é enviado pela **Nsangu**
(`api/_nsangu.js`, categoria `OTP`, com `Idempotency-Key` por mensagem). Nunca é
gravado: fica o SHA-256 de `<id do desafio>:<código>` em `phone_verifications`.
Há dois reenvios, aos 20 s e aos 45 s; depois disso o Dono escolhe «Não recebi o
código», a conta fica criada e o número confirma-se mais tarde no Dashboard →
«Início».

Tetos, porque cada SMS é paga e o registo é público: 3 envios por desafio, 6 por
conta por hora, e 120 na plataforma por hora. Batido o teto global, o registo
continua a funcionar — só não envia SMS.

Quem ficou sem confirmar aparece no Painel de Administração → «Contas», no filtro
**«Telefone por confirmar»**, e o botão «Confirmar telefone» marca o número à
mão (para quando a SMS não chega).

### Subscrição do plano

Cada loja tem a sua subscrição (migração 0025). Paga-se pelo mesmo caminho
(`api/payment.js` com `kind: "plan"` e o `storeId` da loja), e o Dono volta ao
separador «Plano», que confirma o pagamento. A equipa MôBisno também pode ativar
à mão, loja a loja, em `/adminPainel/lojas` → «Ativar», escolhendo 1, 3, 6 ou 12
meses (cada mês são 30 dias, somados ao fim do período em curso). A confirmação
é idempotente: um pagamento de plano soma 30 dias uma vez só, graças a
`plan_payments.activated_at`.

## Resumo das variáveis de ambiente

Todas na Vercel → Settings → Environment Variables (Production + Preview). Esta
é a lista completa do que o código lê hoje — nada mais é consultado.

| Variável | Onde é lida | Obrigatória | Por omissão |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `web/supabase/client.ts` (build) | sim | — |
| `VITE_SUPABASE_ANON_KEY` | `web/supabase/client.ts` (build) | sim | — |
| `SUPABASE_URL` | `api/_shared.js` | sim | cai para `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/_shared.js` | sim (secreta) | — |
| `WIPAY_CLIENT_ID` | `api/_wizapay.js` | para cobrar | — |
| `WIPAY_CLIENT_SECRET` | `api/_wizapay.js` | para cobrar (secreta) | — |
| `WIPAY_WEBHOOK_SECRET` | `api/payment-webhook.js` | para cobrar (secreta) | — |
| `WIPAY_BASE_URL` | `api/_wizapay.js` | não | `https://api.wipay.ao` |
| `NSANGU_API_KEY` | `api/_nsangu.js` | para a SMS de confirmação (secreta) | — |
| `NSANGU_BASE_URL` | `api/_nsangu.js` | não | `https://api.nsangu.com` |
| `RESEND_API_KEY` | `api/_resend.js` | para avisar por email (secreta) | — |
| `RESEND_FROM` | `api/_resend.js` | não | `MôBisno <vendas@mobisno.store>` |
| `VERO_BASE_URL` | `api/_vero.js` | não | a API pública do Vero |
| `OPENROUTER_API_KEY` | `api/_openrouter.js` | para a IA (secreta) | — |
| `OPENROUTER_MODEL` | `api/_openrouter.js` | não | `openai/gpt-4o-mini` |
| `GOOGLE_SITE_VERIFICATION` | `api/_seo.js` (`siteVerificationTags`) | não | `""` — só se verificar o Search Console por prefixo de URL em vez de DNS |

`VERCEL_URL`, `VERCEL_BRANCH_URL` e `VERCEL_PROJECT_PRODUCTION_URL` são postas
pela própria Vercel e usadas por `api/assistant.js` para reconhecer as
pré-visualizações deste projeto. Não as configure à mão.

As credenciais do **Vero** não estão aqui de propósito: são de cada empresa,
não da Plataforma, e o Dono escreve-as no painel dele. Ficam em
`store_payments`, que não tem leitura pública — e o navegador só lê as colunas
derivadas `vero_key_set`/`vero_key_test`, nunca a chave.

## IA: um fornecedor só, o OpenRouter

Tudo o que usa um modelo passa por `/api/assistant`, e a chamada vive num
ficheiro só (`api/_openrouter.js`): as respostas do assistente nos ecrãs e os
textos de SEO que o assistente de criação gera (o título e a descrição para o
Google).

O modelo escolhe-se com `OPENROUTER_MODEL`, no formato `fornecedor/modelo` do
catálogo em <https://openrouter.ai/models>. Por omissão, `openai/gpt-4o-mini`.

> **O erro que isto corrigiu.** O modelo por omissão era `gpt-5.4-mini`, que não
> existe. Cada pedido falhava, o endpoint respondia 502, e quem criava a loja
> recebia em silêncio um resumo do próprio texto, apresentado como «a melhor
> descrição para o Google». Agora: o código do erro vai na resposta
> (`AI_MODEL_NOT_FOUND`, `AI_UNAUTHORIZED`, `AI_NOT_CONFIGURED`), o detalhe do
> fornecedor fica nos registos, `/api/health` diz qual é o modelo em uso, e o
> assistente de criação **avisa** quando o texto não veio da IA.

## Checklist de lançamento
- [ ] Migrações `0001` … `0027` (as duas `0018` incluídas). **A 0022, a 0023, a
      0024, a 0025, a 0026 e a 0027 são obrigatórias**: sem a 0022, qualquer utilizador
      se promove a administrador; sem a 0024, uma venda digital não grava a
      factura; sem a 0025, nenhuma loja tem subscrição; sem a 0026, ninguém
      consegue publicar.
- [ ] `NSANGU_API_KEY` configurada **antes** de abrir o registo ao público:
      sem ela, quem cria conta não recebe o código e fica com a loja por
      publicar. `/api/health` responde `"sms": true` quando está no lugar.
- [ ] Bucket `store-assets` público (criado pela `0001`) e `company-documents`
      **privado** (criado pela `0023`).
- [ ] `OPENROUTER_API_KEY` configurada. `/api/health` responde `"ai": true` e
      diz o modelo em `"aiModel"`. Sem ela, o assistente não responde e os
      textos de SEO saem do que o Dono escreveu.
- [ ] Variáveis de ambiente da tabela acima, incluindo as `WIPAY_*` e as
      `RESEND_*`.
- [ ] URL de notificação na Wiza:
      `https://<domínio>/api/payment-webhook?k=<WIPAY_WEBHOOK_SECRET>`.
- [ ] Domínio do remetente verificado no Resend (registos DNS).
- [ ] Domínios e wildcards (`*.sualoja.digital` é essencial) com SSL emitido, e
      o **domínio principal escolhido** na Vercel (apex ou `www.`) de forma
      coerente — ver `SEO.md` §7.1.
- [ ] Uma conta com `is_admin = true`. A palavra-passe é escolhida na criação,
      em Authentication → Users; `supabase/scripts/create_admin.sql` tem
      marcadores, não credenciais.
- [ ] Authentication → URL Configuration: **Site URL** e **Redirect URLs** com
      `/login` incluído (`https://www.mobisno.store/login`,
      `https://mobisno.store/login`, `http://localhost:5173/login`). Sem isto,
      o link de «Esqueci-me da palavra-passe» não pede a palavra-passe nova.
- [ ] Nenhum webhook de fornecedor a apontar para `/api/webhook` (o endpoint
      foi apagado).
- [ ] `npm run build`, `npm run web:build` e `npx vitest run` verdes. O
      `web:build` corre o `ssr:build`, que regenera `api/_ssr/render.mjs` — o
      pacote com que o servidor desenha a loja.
- [ ] `curl` à raiz de uma loja: o `<title>` traz o nome da loja, há
      `href="/produto/..."` no HTML e o `<div id="app">` traz `data-ssr="…"`
      (é o que faz a SPA adotar a página em vez de a redesenhar).
- [ ] Search Console: propriedade de **Domínio** para `sualoja.digital` e para
      `mobisno.store`, verificadas por **DNS (TXT)**, e os sitemaps submetidos
      — ver `SEO.md` §8.4.

## Depois do lançamento, antes de abrir pagamentos digitais
- [ ] Uma compra de ponta a ponta numa loja aprovada: Multicaixa Express (paga
      dentro da janela de 5 minutos) **e** Referência Bancária (confirmada só
      pelo callback, horas depois).
- [ ] A factura chegou ao comprador e o aviso de venda ao Dono. Confirmar que
      a factura sai em nome da **empresa dele**, não da MôBisno.
- [ ] `orders.fee` e `orders.net` com a comissão certa, e um levantamento.
- [ ] A primeira factura emitida com chave `vero_live_sk_…` (uma
      `vero_test_sk_…` não chega à AGT — o painel avisa, mas vale confirmar).


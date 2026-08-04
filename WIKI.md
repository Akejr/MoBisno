# MôBisno — Wiki Completa do Projeto

> **Leia este documento antes de tocar em qualquer ficheiro.** É a fonte única de verdade sobre arquitetura, regras de negócio, infraestrutura, convenções de código e decisões técnicas do projeto.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Estrutura de Pastas](#3-estrutura-de-pastas)
4. [Domínios e Roteamento](#4-domínios-e-roteamento)
5. [Base de Dados — Supabase](#5-base-de-dados--supabase)
6. [Modelos de Domínio](#6-modelos-de-domínio)
7. [Subscrição e Faturação](#7-subscrição-e-faturação)
8. [Pagamentos — MoMenu](#8-pagamentos--momenu)
9. [Autenticação e Segurança](#9-autenticação-e-segurança)
10. [Frontend — Web SPA](#10-frontend--web-spa)
11. [Templates de Loja](#11-templates-de-loja)
12. [Funções Serverless — API](#12-funções-serverless--api)
13. [SEO e Pré-renderização](#13-seo-e-pré-renderização)
14. [Sistema de SMS](#14-sistema-de-sms)
15. [Códigos de Desconto](#15-códigos-de-desconto)
16. [Stock de Produtos](#16-stock-de-produtos)
17. [Avaliações de Produtos](#17-avaliações-de-produtos)
18. [Analytics](#18-analytics)
19. [Painel de Administração](#19-painel-de-administração)
20. [Pré-visualização e Suspensão](#20-pré-visualização-e-suspensão)
21. [Assistente de IA](#21-assistente-de-ia)
22. [Testes](#22-testes)
23. [Build e Deploy](#23-build-e-deploy)
24. [Variáveis de Ambiente](#24-variáveis-de-ambiente)
25. [Migrações SQL — Ordem e Conteúdo](#25-migrações-sql--ordem-e-conteúdo)
26. [Comandos de Desenvolvimento](#26-comandos-de-desenvolvimento)
27. [Design System e Marca](#27-design-system-e-marca)
28. [Convenções de Código](#28-convenções-de-código)
29. [Decisões Técnicas e Limitações Conhecidas](#29-decisões-técnicas-e-limitações-conhecidas)
30. [Roadmap / Funcionalidades Não Implementadas](#30-roadmap--funcionalidades-não-implementadas)

---

## 1. Visão Geral

**MôBisno** é uma plataforma SaaS multi-inquilino angolana que permite a qualquer empreendedor criar a sua loja online em minutos, sem conhecimentos técnicos. Cada loja fica num subdomínio próprio (`nomedaloja.sualoja.digital`), com pagamentos locais integrados (Multicaixa Express + referência bancária), SEO otimizado, código de desconto, variações de produto (cor, tamanho…) com preço e stock próprios, avaliações de produtos e analytics. O SMS de confirmação de compra e o domínio próprio estão anunciados como **«Em breve»** e bloqueados na interface (§29).

- **Público-alvo:** empreendedores angolanos.
- **Moeda:** Kwanzas (Kz).
- **Idioma:** Português de Angola / Portugal (pt-AO). Evitar pt-BR.
- **Repositório:** `https://github.com/Akejr/MoBisno.git` (branch `main`).
- **Produção:** `https://mobisno.store` (Vercel + Supabase).
- **Cor da plataforma:** `#F95901` (laranja). As lojas usam `var(--brand)` (cor escolhida pelo dono).

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | TypeScript + Vite 5 (SPA vanilla, sem framework) |
| Estilos | Tailwind CSS 3 (compilado no build — NÃO CDN) |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Serverless | Vercel Edge Functions (Node.js ESM, `export default`) |
| Pagamentos | MoMenu API (Multicaixa Express + ref. bancária) |
| IA (chat) | OpenAI API (apenas server-side) |
| Testes | Vitest 2 + fast-check (property-based testing) |
| Build | Vite (`web:build`), tsc (`build`) |
| Deploy | Vercel (CI/CD automático pelo GitHub) |

**Dependências de produção** (apenas `@supabase/supabase-js`). Todas as outras são `devDependencies`.

---

## 3. Estrutura de Pastas

```
/
├── api/                    # Funções serverless (Vercel) — ESM, export default
│   ├── _shared.js          # Utilitários: cliente Supabase, activatePlan, checkStock, etc.
│   ├── _seo.js             # SEO partilhado (espelho de src/services/seo, slug, locations, variations)
│   ├── assistant.js        # Chat IA (OpenAI) — chave só no servidor
│   ├── health.js           # Health check
│   ├── logo.js             # Criação de logótipo por IA (propostas)
│   ├── payment.js          # Inicia pagamento MoMenu
│   ├── payment-status.js   # Verifica estado de pagamento (polling)
│   ├── prerender.js        # Pré-renderização SSR-like para crawlers
│   ├── robots.js           # robots.txt dinâmico por host
│   ├── sitemap.js          # sitemap.xml dinâmico por host
│   └── webhook.js          # Webhook MoMenu (confirmação de pagamento)
│
├── src/                    # Domínio puro (TypeScript, sem DOM, testável)
│   ├── models/             # Tipos de domínio (domain.ts, index.ts, result.ts)
│   ├── services/           # Lógica de negócio pura
│   │   ├── billing.ts      # Acesso: admin ou plan_expires_at futuro
│   │   ├── plans.ts        # Catálogo de planos, limites, funcionalidades
│   │   ├── seo.ts          # Geração de títulos/descrições/JSON-LD (puro)
│   │   ├── storeService.ts # Criação/validação de lojas
│   │   ├── productService.ts
│   │   ├── identifierService.ts # Normalização e validação de identificadores
│   │   ├── fileService.ts  # Políticas de upload (tamanho, formato)
│   │   ├── payments.ts     # Lógica de pagamento (puro)
│   │   ├── paymentVisibility.ts # Que métodos de pagamento mostrar
│   │   ├── variations.ts   # Variação/Combinação: eixos, preço efetivo, stock
│   │   ├── cartLine.ts     # cartLineKey: identidade de uma linha de carrinho
│   │   ├── cartMessage.ts  # Mensagem de encomenda por WhatsApp
│   │   ├── locations.ts    # Localizações do bloco de mapa
│   │   ├── storeCustom.ts  # Leitura defensiva de campos legados
│   │   ├── adminMetrics.ts # Métricas e listas da Visão geral do admin
│   │   └── ...
│   ├── storefront/         # Renderer da loja (storeRenderer.ts)
│   └── ui/                 # Componentes UI legacy (substituídos pelo web/)
│
├── web/                    # SPA (Vite, TypeScript, Tailwind)
│   ├── main.ts             # Entry point: boot(), router, lazy loading
│   ├── composition.ts      # Fábrica de serviços (injeção de dependências)
│   ├── styles.css          # Tailwind entry (@tailwind base/components/utilities)
│   ├── index.html          # Shell HTML com meta tags da plataforma
│   ├── lib/                # Utilitários de frontend
│   │   ├── routing.ts      # PLATFORM_APEX, STORE_APEX, navigate(), cleanPath()
│   │   ├── dom.ts          # render(), $(), toast(), formatKz(), fadeInImages()
│   │   ├── seo.ts          # applySeo() — aplica meta tags no browser
│   │   ├── pixels.ts       # Meta Pixel + GA4 por loja
│   │   ├── cart.ts         # Carrinho (localStorage por loja), chaveado por LINHA
│   │   │                   #   (Produto + Combinação): setQuantity/removeFromCart
│   │   │                   #   recebem uma lineKey de cartLineKey(), não um productId
│   │   ├── cartDrawer.ts   # Drawer do carrinho
│   │   ├── imageCompress.ts # Compressão WebP (max 1600px)
│   │   ├── slug.ts         # productSlugPath()
│   │   ├── brand.ts        # brandOf() — cor da loja
│   │   ├── ink.ts          # applyInk() — cor do texto
│   │   ├── theme.ts        # applyTheme() — estilo global (moderno/clássico/minimal)
│   │   ├── search.ts       # Pesquisa dentro da loja
│   │   ├── paymentsApi.ts  # Chamadas ao /api/payment*
│   │   ├── planCheckout.ts # Fluxo de pagamento de plano
│   │   ├── smsCheckout.ts  # Fluxo de compra de pacotes SMS
│   │   ├── aiAgent.ts      # Montagem do chat IA no editor
│   │   ├── areas.ts        # Áreas de entrega
│   │   ├── mapPicker.ts    # Seletor de mapa (localização da loja)
│   │   ├── particlesHero.ts # Animação de partículas no hero
│   │   ├── productForm.ts  # Formulário de produto (modal)
│   │   ├── whatsappForm.ts # Formulário de WhatsApp
│   │   ├── sections.ts     # Gestão de secções no editor
│   │   └── templatePreview.ts
│   ├── supabase/           # Clientes Supabase para o browser
│   │   ├── client.ts       # createClient (localStorage, pkce, storageKey="mobisno-auth")
│   │   ├── auth.ts         # signIn, signUp, signOut, getSession
│   │   ├── repositories.ts # CRUD de lojas, produtos, banners, assets
│   │   ├── customization.ts # getCustomization, saveCustomization
│   │   ├── payments.ts     # getPaymentConfig, savePaymentConfig
│   │   ├── withdrawals.ts  # listWithdrawals, committedWithdrawals, requestWithdrawal
│   │   ├── admin.ts        # listAccounts, listStores, adminOverview, etc.
│   │   ├── analytics.ts    # trackStoreEvent, getStoreAnalytics
│   │   ├── discounts.ts    # listDiscountCodes, createDiscount, bumpDiscountUse
│   │   ├── reviews.ts      # listProductReviews, submitReview, summarize
│   │   ├── sms.ts          # getSmsBalance, buySmsPackage
│   │   └── storage.ts      # upload de imagens para Supabase Storage
│   ├── templates/          # Templates de loja (visual)
│   │   ├── registry.ts     # Registo de todos os templates
│   │   ├── types.ts        # StoreCustomization, ContentBlock, etc.
│   │   ├── blocks.ts       # Blocos de conteúdo (info, texto, testemunhos, localização)
│   │   ├── heroes.ts       # Variantes de hero
│   │   ├── headers.ts      # Variantes de cabeçalho
│   │   ├── footers.ts      # Variantes de rodapé
│   │   ├── productGrid.ts  # Grelha de produtos
│   │   ├── productPage.ts  # Variantes de página de produto
│   │   ├── checkoutLayouts.ts # Layouts de checkout
│   │   ├── shared.ts       # HTML partilhado entre templates
│   │   ├── perks.ts        # Garantias do produto
│   │   ├── sectionsModel.ts
│   │   ├── presets.ts      # Personalizações de fábrica (preset "Ekolo Sports")
│   │   ├── variationPicker.ts # Seletores de Variação na página de produto
│   │   ├── notFound.ts     # "Loja não encontrada"
│   │   ├── galeria.ts      # Modelo "Galeria"
│   │   ├── beauty.ts       # Modelo "Beauty"
│   │   ├── desportivo.ts   # Modelo "Desportivo"
│   │   ├── lumiere.ts      # Modelo "Lumière Chic"
│   │   └── foodmart.ts     # FORA do registo; só exporta foodmartDefaultFeatures
│   └── views/              # Vistas (páginas) da SPA
│       ├── landing.ts      # Landing page (mobisno.store)
│       ├── login.ts        # Login / registo
│       ├── wizard.ts       # Criação de loja (passo a passo)
│       ├── dashboard.ts    # Painel do dono da loja
│       ├── editor.ts       # Editor visual ao vivo
│       ├── storefront.ts   # Renderização da loja pública
│       ├── product.ts      # Página de produto (+ avaliações)
│       ├── category.ts     # Página de categoria
│       ├── cart.ts         # Carrinho
│       ├── checkout.ts     # Checkout (3 métodos: WhatsApp, MCX, Ref. Bancária)
│       ├── preview.ts      # Preview de modelo
│       ├── directory.ts    # Diretório público de lojas (/lojas)
│       ├── presetGallery.ts # Galeria de presets / lojas-modelo
│       ├── adminPanel.ts   # Painel de administração
│       └── legal.ts        # Termos / Privacidade / Política
│
├── supabase/
│   ├── migrations/         # SQL: 0001_init.sql … 0019_single_plan.sql
│   └── scripts/
│       ├── create_admin.sql      # Cria admin dotangola@gmail.com
│       └── reset_test_data.sql
│
├── tests/                  # Testes Vitest (unitários + property-based)
│   └── helpers/property.ts # Utilitários fast-check
│
├── marketing/              # Ficheiros de marketing (HTML → PDF)
│   ├── MoBisno-Beneficios.html
│   └── MoBisno-DesignSystem.html
│
├── package.json
├── tsconfig.json
├── vite.config.web.ts      # Config Vite: code splitting, Tailwind, PostCSS
├── tailwind.config.js
├── vitest.config.ts
├── vercel.json             # Build, output, rewrites
├── DEPLOY.md               # Guia de deploy detalhado
└── WIKI.md                 # Este ficheiro
```

---

## 4. Domínios e Roteamento

### Domínios

| Domínio | Função |
|---|---|
| `mobisno.store` | Plataforma: landing, login, painel, criar, `/adminPainel` |
| `www.mobisno.store` | Redireciona para `mobisno.store` |
| `*.mobisno.store` | Retrocompatibilidade: lojas antigas |
| `sualoja.digital` | Apex das lojas; redireciona para `mobisno.store` |
| `*.sualoja.digital` | Lojas dos clientes: `nomedaloja.sualoja.digital` |

A constante `STORE_APEX = "sualoja.digital"` em `web/lib/routing.ts` controla o domínio das lojas. Mudar esta constante propaga por todo o sistema.

### Roteamento no Browser

A app usa **History API** (sem hash). `main.ts` ouve `popstate` + evento `mb:route` e chama o router.

```
/                    → landing (se host = mobisno.store)
/login               → login / registo
/criar               → wizard de criação de loja
/painel              → dashboard do dono
/editor              → editor visual
/adminpainel         → painel de administração (insensível a maiúsculas)
/lojas               → diretório público de lojas (descoberta pelo Google — §13)
/loja/<id>           → storefront (em mobisno.store ou localhost)
/loja/<id>/produto/* → página de produto
/loja/<id>/checkout  → checkout
/termos              → termos de utilização
/privacidade         → política de privacidade
/politica            → política geral
```

Quando o host é um **subdomínio de loja** (`nomedaloja.sualoja.digital`), o prefixo `/loja/<id>` é removido e as rotas ficam:

```
/                    → storefront
/produto/<slug>      → página de produto
/categoria/<nome>    → categoria
/carrinho            → carrinho
/checkout            → checkout
```

### Lazy Loading (Code Splitting)

`web/main.ts` carrega as vistas de dono/admin apenas quando necessário:

```typescript
const lazy = {
  wizard: () => import("./views/wizard.js").then(m => m.renderWizard),
  dashboard: () => import("./views/dashboard.js").then(m => m.renderDashboard),
  editor: () => import("./views/editor.js").then(m => m.renderEditor),
  adminPanel: () => import("./views/adminPanel.js").then(m => m.renderAdminPanel),
  // ...
};
```

O bundle inicial é ~250 KB app + 212 KB vendor. Editor e dashboard são chunks separados.

### Redirecionamento do apex `sualoja.digital`

Em `main.ts` / `boot()`:

```typescript
if (isStoreApexRoot()) {
  location.replace(`https://${PLATFORM_APEX}${location.pathname}${location.search}`);
  return;
}
```

---

## 5. Base de Dados — Supabase

### Tabelas Principais

| Tabela | Descrição |
|---|---|
| `profiles` | Extensão de `auth.users`; campos: `plan` (sempre `pro`), `plan_expires_at`, `is_admin`. `next_plan` e `trial_ends_at` foram removidas na `0019` |
| `stores` | Lojas: `owner_id`, `name`, `identifier`, `template_id`, `state`, `subdomain` |
| `products` | Produtos: `store_id`, `name`, `price`, `stock`, `available`, `featured`, `physical`, etc. |
| `assets` | Imagens (logo, produto, banner) associadas a lojas |
| `banners` | Banners de uma loja (máx. 10, posição ordenada) |
| `store_customizations` | JSON da personalização visual (`StoreCustomization`) |
| `store_payments` | Configuração de pagamentos por loja: `online_enabled` (a regra de ativação) e dados bancários. A coluna `momenu_api_key` existe mas **já não é lida** — há uma única chave, a da plataforma |
| `orders` | Encomendas criadas pelo checkout. `products` guarda as linhas vendidas, incluindo `variantKey` |
| `plan_payments` | Pagamentos de plano |
| `sms_purchases` / `logo_purchases` | Compras de pacotes de SMS e de logótipo |
| `withdrawals` | Pedidos de levantamento de saldo |
| `discount_codes` | Códigos de desconto por loja |
| `product_reviews` | Avaliações de produtos (autor, rating, comentário, aprovado) |
| `store_events` | Eventos de analytics (page_view, product_view, add_to_cart, etc.) |

### RLS — Row Level Security

**Princípio:** o isolamento entre inquilinos é feito 100% por RLS, não por middleware. Nunca desativar RLS em tabelas de dados de utilizadores.

Regras críticas:
- `stores`: SELECT só pelo `owner_id` (ou admin). UPDATE/DELETE idem.
- `stores` (leitura pública): `state = 'Publicada' AND public.account_active(owner_id)` — administrador ou subscrição válida.
- `products`, `assets`, `banners`: SELECT público por `store_id` se a loja for publicada; escrita só pelo dono.
- `profiles`: cada utilizador lê/atualiza o seu próprio perfil; admins leem todos.

### Função `public.account_active(uid uuid)`

Criada na migração `0018`. Determina se uma conta tem acesso ativo (loja pode ficar online):

```sql
CREATE OR REPLACE FUNCTION public.account_active(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(is_admin, false) = true
    OR (plan_expires_at IS NOT NULL AND plan_expires_at > now())
  FROM public.profiles WHERE id = uid;
$$;
```

Esta função é usada na política `stores_public_read`. Quando a conta está suspensa, **a loja desaparece da web sem qualquer cron job**.

### Supabase Auth

- Persistência: `localStorage`, flow `pkce`, `storageKey = "mobisno-auth"`.
- `isCurrentUserAdmin()` usa `getSession()` para manter o admin sempre logado.
- **Redirect URLs** no painel Supabase: `https://mobisno.store/**`, `https://www.mobisno.store/**`.
- **Site URL**: `https://mobisno.store`.

### Supabase Storage

Buckets: `logos`, `products`, `banners`. Políticas de acesso:
- Upload: apenas autenticado (owner do store).
- Download: público (sem RLS em Storage — URLs são opacas).

As imagens são comprimidas para WebP (máx. 1600px) antes do upload via `web/lib/imageCompress.ts`.

---

## 6. Modelos de Domínio

Definidos em `src/models/domain.ts`. São interfaces TypeScript puras (sem lógica).

### `Store`
```typescript
{ id, ownerId, name, storeType, templateId, identifier, subdomain, state, createdAt }
```
- `identifier`: 2–63 chars, `[a-z0-9-]`, sem hífen inicial/final/duplo. Usado como subdomínio.
- `state`: `"Rascunho"` | `"Publicada"`.
- `storeType`: `"Vestuário" | "Alimentação" | "Eletrónica" | "Beleza" | "Serviços" | "Outro"`.

### `Product`
```typescript
{ id, storeId, name, description, category?, featured?, physical?, price, imageUrl?, available, stock?, createdAt }
```
- `stock`: `null`/`undefined` = não controlado; `0` = esgotado. Validado e abatido no servidor, **sem atomicidade** — ver §16, que descreve também o stock por Combinação.
- `physical`: `true` por omissão (precisa morada de entrega). Produtos digitais: `false`.
- `featured`: aparece na secção "Destaques" do storefront.

### `Banner`
- Limite de 10 por loja. `position` é estritamente crescente por loja.

### `StoreCustomization` (em `web/templates/types.ts`)
JSON guardado em `store_customizations`. Campos principais:
- `colors.primary`: cor da marca (CSS hex, ex.: `#DC2626`). Aplicada como `--brand`.
- `colors.text`: cor do texto (`--mb-ink`).
- `theme.style`: `"moderno" | "classico" | "minimal"`.
- `logoScale`: altura do logo em px.
- `blocks`: array de `ContentBlock` (secções do editor).
- `heroImages`: URLs do hero em arco.
- `payments.*`: configuração de pagamentos/WhatsApp/entregas/SMS/pixels.
- `featureEnabled`, `productPerks`: galeria e garantias.
- `productImages`: fotos extra por ID de Produto.
- `productVariations`: Variação por ID de Produto (eixos, modo de preço, e as Combinação com preço e **stock** próprios — §16). Guardadas aqui, como as fotos extra, para não exigir migração à BD.

---

## 7. Subscrição e Faturação

### Preço único

| | Preço | Duração |
|---|---|---|
| Mensal | 11.000 Kz | 30 dias |
| Anual | 120.000 Kz | 365 dias (poupa 12.000 Kz, ~1 mês) |

**Não há escalões.** Quem subscreve tem tudo: lojas e produtos ilimitados,
Multicaixa Express, referência bancária, WhatsApp, domínio próprio, editor,
modelos, descontos, stock, variações e avaliações. Catálogo em
`src/services/plans.ts`.

**Não há teste grátis.** Criar a loja, personalizá-la e **pré-visualizá-la** é
grátis e sem prazo; a subscrição serve para **publicar**. É uma porta melhor do
que um relógio de 7 dias: chega quando o dono já investiu esforço e quer pôr a
loja no ar, e não há nada a expirar.

### A regra de acesso (`src/services/billing.ts`)

`resolveBilling({ planExpiresAt, isAdmin }, now)` é uma **função pura**. A regra
inteira é: **ativo se for administrador, ou se `plan_expires_at` for futuro.**

Devolve `accessActive`, `expiresAt`, `daysRemaining`, `expired` (já pagou e
caducou — distinto de nunca ter pago), `byAdmin` e `suspended`.

> **Porque é tão pouco.** A versão anterior tinha cinco ramos a interagir —
> pago, plano agendado (carry-over), teste grátis, atribuição permanente e
> expirado. Um deles era um acidente: plano gravado **sem** data de expiração
> contava como permanente, e o assistente gravava exactamente isso ao registar o
> plano escolhido e não pago. Resultado: plano vitalício grátis. Pior, o espelho
> em `api/_shared.js` não tinha esse ramo e lia «básico» — o painel dizia ao dono
> que tinha plano ativo e o checkout recusava cobrar aos clientes dele
> (`PLAN_NOT_COVERED`). Guardado por `tests/planParity.test.ts`.

### Renovação

`planActivationPatch(current, period, now)` acrescenta o ciclo **ao fim do
período atual** quando ainda há tempo, para quem paga adiantado não perder dias;
sem período em curso, conta a partir de agora. Espelhado em
`api/_shared.js:activatePlan` — e agora o espelho é fiel, porque é uma data.

### Administrador

Acesso sempre ativo, sem pagar (`is_admin` em `profiles`, verificado tanto por
`resolveBilling` como por `public.account_active`). No painel de administração,
o admin liga/desliga a subscrição de uma conta (`adminSetSubscription`), que
grava uma validade longa ou `null`.

### Publicar exige subscrição

Imposto pela **base de dados**, não pelo botão: o gatilho
`stores_publish_requires_plan` (migração `0019`) recusa a transição para
`Publicada` sem conta ativa. O painel apanha o caso antes para dar uma frase
útil em vez de um erro do Postgres.

## 8. Pagamentos — MoMenu

### Variáveis de Ambiente (Vercel — apenas servidor)

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase (mesmo que `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (ignora RLS). **Nunca no frontend.** |
| `MOMENU_PLATFORM_API_KEY` | Chave MoMenu da plataforma (para receber pagamentos de planos) |
| `MOMENU_BASE_URL` | Opcional; default `https://api.momenu.online` |

### Fluxo de Pagamento de Produto (nas lojas)

1. **Checkout** (`web/views/checkout.ts`) → utilizador escolhe método (MCX / Ref. Bancária / WhatsApp).
2. Se online: `web/lib/paymentsApi.ts` chama `POST /api/payment` com `kind: "store"`, `storeId`, `method`, `products` e `customer` (ver §12 para o contrato completo).
3. `api/payment.js` confirma que a loja tem pagamentos online ativados e plano que os cubra, valida o stock (`checkStock`), cria a transação MoMenu com a chave da plataforma (service role) e grava a encomenda em `orders`.
4. MCX é imediato (`status: "paid"`) e o stock é abatido logo. Na Referência Bancária a encomenda fica `open` e o abate acontece no webhook (`/api/webhook`), na transição para pago.
5. Fallback: botão "Já paguei — verificar" chama `GET /api/payment-status?id=<transactionId>`.

### Fluxo de Pagamento de Plano

1. `web/lib/planCheckout.ts` chama `POST /api/payment` com `kind: "plan"`, `ownerId`, `plan`, sem `storeId`.
2. A transação fica em `plan_payments`.
3. Confirmação (MCX imediato, ou webhook/polling na referência) → `activatePlan(db, ownerId, plan)`.

### Fluxo de Pagamento de SMS

1. `web/lib/smsCheckout.ts` chama `POST /api/payment` com `kind: "sms"`, `storeId`, `ownerId`, `smsQuantity`.
2. A compra fica em `sms_purchases`; a confirmação credita `stores.sms_credits` (`creditSms`) e marca `credited: true`, o que impede duplo crédito.
3. A compra de créditos está **bloqueada na interface** enquanto o SMS estiver «Em breve» (ver §14).

### Fluxo de Compra de Logótipo

1. `kind: "logo"` com `storeId`, `ownerId` e `logoUrl`; a compra fica em `logo_purchases`.
2. Confirmação → `fulfillLogo` acrescenta o URL a `stores.customization.logos` e marca `fulfilled: true`.

### Modo QA (Testes sem cobranças reais)

Adicionar `?qa=1` ao URL do checkout ou do painel ativa o modo QA:
- O cabeçalho `x-env-qa: true` é enviado para o servidor.
- MoMenu simula `success` sem cobrar.

### Configuração por Comerciante

No painel → Pagamentos, o dono regista:
- **Conta bancária** (Banco, Beneficiário, IBAN) — deve estar verificada na MoMenu.
- `instantWithdraw: true` → valor (menos 2%) transferido automaticamente.
- **WhatsApp**: número no formato internacional (ex.: `+244912345678`).

### Webhook

URL: `https://mobisno.store/api/webhook`  
O comerciante (e a conta da plataforma) deve configurar este URL na MoMenu → Definições → Desenvolvedores.

---

## 9. Autenticação e Segurança

- **Auth**: Supabase Auth (email + password). JWT armazenado em `localStorage` com `storageKey = "mobisno-auth"`.
- **PKCE flow**: ativo para maior segurança em SPAs.
- **`is_admin`**: coluna `boolean` em `profiles`. Apenas um SQL direto pode tornar uma conta admin (ver script `supabase/scripts/create_admin.sql`).
- **RLS**: todo o isolamento de dados é feito por Row Level Security. Nunca usar service role no browser.
- **Chaves secretas**: `SUPABASE_SERVICE_ROLE_KEY`, `MOMENU_PLATFORM_API_KEY`, `OPENAI_API_KEY` — **apenas em variáveis de ambiente do servidor Vercel**. Nunca no código frontend nem em commits.
- **`anon key` do Supabase**: é pública por design. O isolamento é garantido por RLS, não pela chave.
- **Templates renderizados com `innerHTML`**: `<script>` dentro do HTML de template **não corre** (sem eval). `<style>` corre. Inputs de utilizador passam por `esc()` antes de ir para innerHTML.
- **Inputs de checkout**: `font-size: 16px` para evitar zoom automático em iOS.

---

## 10. Frontend — Web SPA

### Entry Point (`web/main.ts`)

`boot()` é a função principal:
1. Deteta se o apex `sualoja.digital` → redireciona para `mobisno.store`.
2. Deteta subdomínio de loja → renderiza storefront diretamente.
3. Senão: inicializa o router da plataforma (landing, login, painel, etc.).

### Composição (`web/composition.ts`)

Único ponto de criação de repositórios e serviços. Injeta o cliente Supabase em todos os repositórios. Exporta: `storeRepository`, `productRepository`, `assetRepository`, `bannerRepository`, `getOwnerBilling`, `publicStoreUrl`, etc.

### `publicStoreUrl(identifier)`

Devolve a URL pública da loja:
- Em produção: `https://${identifier}.${STORE_APEX}`
- Em localhost/preview: `/#/loja/${identifier}`

### DOM Utilities (`web/lib/dom.ts`)

- `render(html)`: substitui `#app` (ou `body`) pelo HTML e devolve o elemento.
- `$(selector)`: alias de `document.querySelector`.
- `esc(str)`: escapa HTML (previne XSS).
- `toast(msg, type)`: notificação temporária.
- `formatKz(amount)`: formata em Kwanzas (ex.: `15.000 Kz`).
- `fadeInImages(root)`: aplica transição de opacidade nas imagens.
- `withBusy(el, fn)`: desativa botão durante operação assíncrona.
- `fileToUint8Array(file)`: lê ficheiro para upload.

### Tailwind CSS

Compilado no build (não CDN). Config em `tailwind.config.js`. PostCSS em `vite.config.web.ts`. Importado em `web/styles.css` → `web/main.ts`.

**Atenção:** `<style>` dentro de innerHTML de templates SIM funciona (o browser processa). Classes Tailwind dentro de innerHTML **não** funcionam se não tiverem sido processadas no build — usar sempre CSS inline ou classes que já existam no bundle.

### Colar Texto no Editor

Em `web/views/editor.ts`, o handler `paste` dentro de `bind(preview)` intercepta o colar em qualquer campo `contenteditable`, remove a formatação e insere apenas texto puro via `document.execCommand("insertText")`.

### Compressão de Imagens

`web/lib/imageCompress.ts`: converte para WebP, redimensiona para máx. 1600px, qualidade 0.85. Aplicado em `productForm.ts` e nos uploads do editor.

---

## 11. Templates de Loja

### Registo (`web/templates/registry.ts`)

Cada template implementa a interface:
```typescript
interface StoreTemplate {
  id: string;                   // igual ao templateId guardado na loja
  name: string;
  previewUrl: string;
  ready?: boolean;              // só os `ready` aparecem na criação da loja
  defaultBrand?: string;        // cor padrão do modelo
  render(view, custom?): string; // HTML da home
  renderProduct?(view, product, custom?): string;
  renderCategory?(view, category, custom?): string;
  renderCheckout?(view, innerHtml, custom?): string; // cromo em volta do checkout
}
```

Modelos no `TEMPLATE_REGISTRY`: `desportivo`, `beauty`, `galeria`, `lumiere`
(desenhados) e `boutique-elegante`, `tech-dinamico`, `sabor-artesanal` (render
genérico). `templateOptions()` filtra por `ready`, por isso a criação de loja só
oferece os que estão prontos.

Os modelos **«Neon Lab»** (`neonlab`) e **«FoodMart»** (`foodmart`) **saíram do
registo**: nenhuma loja nova os pode escolher. `web/templates/neonlab.ts` foi
apagado; `foodmart.ts` fica no repositório porque exporta
`foodmartDefaultFeatures`, ainda usado pelo editor para materializar as garantias
de personalizações antigas — mas não é importado pelo registo, logo não entra no
pacote. Uma loja gravada com `template_id` `neonlab` ou `foodmart` é servida com o
primeiro modelo do registo (`desportivo`), pelo fallback de `getTemplate`.

### Presets de Personalização (`web/templates/presets.ts`)

`TEMPLATE_PRESETS` são personalizações de fábrica (cores, cabeçalho, blocos) que
o dono pode aplicar. O primeiro chama-se **«Ekolo Sports»** e mantém o `id`
`vermelho-moderno` de propósito: `getPreset(id)` e a marca `customization.__basedOn`
das lojas já criadas em produção dependem dele. Nomes anteriores («Vermelho
Moderno», «Ekolo sports») ficam declarados em `web/supabase/models.ts` para o
semeador **renomear** a loja-modelo existente em vez de criar uma segunda.

### Personalização Visual

O editor (`web/views/editor.ts`) permite editar:
- Cor de destaque (`--brand`) e cor do texto (`--mb-ink`).
- Estilo global: Moderno (border-radius 1rem, Inter), Clássico (0.35rem, Noto Serif), Minimal (0px, Inter).
- Logótipo: trocar imagem, aumentar/diminuir escala.
- Hero: trocar imagem de fundo; hero em arco: adicionar/trocar/remover fotos.
- Textos: clique direto para editar inline (contenteditable).
- Blocos de conteúdo: reordenar, remover, adicionar (info/texto/testemunhos/localização).
- Garantias do produto, menus, rodapé.
- Galeria (secção editorial): ativar/desativar, trocar imagem.

O editor tem "Desfazer" (histórico em memória, máx. 50 estados) e "Guardar" (persiste em `store_customizations`).

### Temas (`web/lib/theme.ts`)

| Estilo | Border-radius | Fonte dos títulos |
|---|---|---|
| `moderno` | `1rem` | Inter |
| `classico` | `0.35rem` | Noto Serif |
| `minimal` | `0px` | Inter |

Aplicado via `applyTheme(root, custom)` que define CSS custom properties `--mb-radius` e `--mb-head-font`.

---

## 12. Funções Serverless — API

Todas as funções em `api/` são **ESM** com `export default handler(req, res)`. Formato Vercel (Node.js runtime).

### `api/_shared.js`

Utilitários partilhados por todas as funções:
- `admin()`: cliente com `SUPABASE_SERVICE_ROLE_KEY` (ignora RLS), ou `null` se faltarem variáveis de ambiente.
- `accountActive(profile, now?)`: a conta tem subscrição ativa (administrador, ou `plan_expires_at` futuro). Espelha `resolveBilling`.
- `activatePlan(db, ownerId, newPlan)`: renova/agenda/ativa o plano após pagamento confirmado.
- `checkStock(db, products, storeId)`: recusa a encomenda quando falta stock. Devolve o nome do primeiro Produto sem stock, ou `null`.
- `decrementStock(db, products, storeId)`: abate o stock vendido.
- `creditSms(db, storeId, quantity)`, `fulfillLogo(db, purchaseId)`, `bumpDiscountUse(db, discountCodeId)`.
- `cleanProducts`, `isValidProduct`, `momenuProducts`, `productsTotal`, `computeFee`, `computeNet`: sanitização e cálculo das linhas da encomenda.
- `combinationStockOf`, `asVariantKey`, `variantKeyOfValues`: espelho mínimo de `src/services/variations.ts` para o stock por Combinação (§16).

### `api/payment.js`

`POST /api/payment` — inicia um pagamento (encomenda de loja, plano, SMS ou logótipo).

Parâmetros (body JSON):
- `kind`: `"store"` | `"plan"` | `"sms"` | `"logo"` (por omissão `"store"`).
- `method`: `"mcx"` | `"reference"` — **obrigatório**.
- `products`: `[{ productName, productPrice, productQuantity, id?, iva?, variantKey? }]` — **obrigatório em todos os `kind`**; é daqui que sai o montante.
- `storeId`: obrigatório em `"store"`, `"sms"` e `"logo"`.
- `ownerId` + `plan`: para `"plan"`. `smsQuantity`: para `"sms"`. `logoUrl`: para `"logo"`.
- `amount`: opcional; se vier, tem de coincidir com a soma dos produtos (`AMOUNT_MISMATCH`).
- `phoneNumber`: obrigatório com `method: "mcx"`.
- `customer`: `{ name?, nif?, phone? }`.
- `discountCodeId`: opcional, só em `"store"` (é o **id** do código, não o texto).
- `qa`, `simulateResult`: só ambiente de testes.

**`variantKey`** identifica a Combinação vendida (a versão do Produto: cor,
tamanho…). É o campo que permite a `checkStock` e a `decrementStock` validar e
abater o stock por Combinação. É **opcional e nunca invalida uma linha**: ausente,
vazia, ou de tipo errado, a linha vale exatamente o que valia antes das Variação
de Produto e só o `products.stock` do Produto é validado e abatido. Tem de ser
assim: há carrinhos gravados em `localStorage` nos telemóveis dos clientes e
encomendas já gravadas em `orders` sem este campo, e nenhuma delas pode passar a
ser recusada. A chave é gravada em `orders.products` (é de lá que o webhook a lê),
mas **sai** do corpo enviado à MoMenu — é interna à plataforma e não pertence ao
contrato dela.

Resposta: `{ success, orderId, kind, method, status, transactionId, operationId, invoiceUrl, entity, referenceNumber, dueDate, amount, fee, net }`.
`status` é `"paid"` no MCX (imediato) e `"open"` na Referência Bancária.
Erros: `{ success: false, error, code }` com `code` em `INVALID_METHOD`,
`MISSING_PRODUCTS`, `INVALID_PRODUCT`, `AMOUNT_MISMATCH`, `BELOW_MINIMUM`,
`MISSING_PHONE`, `MISSING_STORE`, `PAYMENTS_NOT_ENABLED`, `PLAN_NOT_COVERED`,
`OUT_OF_STOCK`, `GATEWAY_ERROR`, `PAYMENT_FAILED`, `SERVER_NOT_CONFIGURED`.

### `api/payment-status.js`

`GET /api/payment-status?id=<transactionId>` — verifica estado de um pagamento (polling).

### `api/webhook.js`

`POST /api/webhook` — recebe notificação MoMenu. Responde sempre 200 (entrega fire-and-forget). Processa por `merchantTransactionId`:
- Encomenda (`orders`): atualiza o estado e, **só na transição para pago** (`status === "paid" && order.status !== "paid"`), chama `decrementStock` com `order.products` e `order.store_id`.
- Plano (`plan_payments`): chama `activatePlan`.
- SMS (`sms_purchases`): credita `stores.sms_credits` uma única vez (bandeira `credited`).
- Logótipo (`logo_purchases`): entrega uma única vez (bandeira `fulfilled`).

### `api/prerender.js`

`GET /*` em hosts de loja → injecta meta tags SEO no HTML estático servido para crawlers (WhatsApp, Facebook, Google). Lê dados da loja e produto do Supabase e insere `<title>`, `<meta>`, Open Graph, Twitter Card e JSON-LD no `<head>`.

Se o `account_active(owner_id)` for falso, devolve o shell sem conteúdo (loja suspensa).

### `api/robots.js`

`GET /robots.txt` — gera `robots.txt` adaptado ao host:
- Host de loja: permite tudo, aponta para `https://<loja>/sitemap.xml`.
- Host da plataforma: regras padrão.

### `api/sitemap.js`

`GET /sitemap.xml` — gera sitemap dinâmico:
- Host de loja: lista todas as páginas de produto e categoria.
- Host da plataforma: lista todas as lojas publicadas.

### `api/assistant.js`

`POST /api/assistant` — proxy para OpenAI Chat Completions. A chave `OPENAI_API_KEY` fica só no servidor. Recebe `{ messages }`, devolve a resposta da IA. Não correr com `vite dev` puro — usar `vercel dev`.

### `api/health.js`

`GET /api/health` — devolve `{ ok: true }`. Para monitorização.

---

## 13. SEO e Pré-renderização

> **Documento dedicado: [SEO.md](SEO.md).** Descreve a arquitetura completa, as
> invariantes que não se podem partir (e os testes que as guardam), como
> verificar em produção e o que está pendente. Leia-o antes de mexer em
> `api/prerender.js`, `api/_seo.js`, `src/services/seo.ts`, `web/lib/seo.ts` ou
> nas ligações dos modelos de loja.

Resumo da arquitetura:

### Camada 1 — Servidor (`api/prerender.js` + `api/_seo.js`)

Serve HTML **com conteúdo real** (`<h1>`, preços, descrições, grelha de
produtos) e não apenas meta tags. É isto que torna as lojas indexáveis: o Google
só executa JavaScript numa segunda passagem, e o Bing e os crawlers sociais não
o executam de todo.

Cobre lojas em subdomínio, `mobisno.store` (landing, `/lojas`, legais) e
`mobisno.store/loja/<id>`. Devolve **404** para loja inexistente, produto ou
categoria inexistentes e caminho desconhecido da plataforma; **410** para conta
suspensa (antes devolvia 200 com o canónico da plataforma, o que criava centenas
de duplicados); e **503 `no-store`** quando o shell não está disponível, para a
CDN não guardar o erro em cache. Tabela completa em [SEO.md §3.5](SEO.md).

`api/_seo.js` tem de **concordar** com `src/services/` — a lógica está duplicada
porque as funções serverless correm JavaScript sem compilação. Ao mexer em slugs,
títulos, descrições, formatação de preços, localizações (`src/services/locations.ts`)
ou no texto das Variação (`src/services/variations.ts`), alterar nos dois sítios;
há testes de paridade em `tests/seoInfra.test.ts`. Ver [SEO.md §5.2](SEO.md).

O conteúdo pré-renderizado é **visível**, com folha de estilo própria: é a
página que o visitante vê até a SPA arrancar. Esconder este bloco (por recorte
ou por qualquer outra técnica) faz o Google ler uma página vazia e deixar de
indexar as lojas — já aconteceu. Ver [SEO.md §3.3](SEO.md).

### Camada 2 — Cliente (`web/lib/seo.ts` + `src/services/seo.ts`)

`applySeo(opts)` define no browser título, descrição, canónico, robots, Open
Graph, Twitter Card e JSON-LD (`Product` + `Offer`, `OnlineStore`, `WebSite`,
`CollectionPage` + `ItemList`, `BreadcrumbList`, `Organization`, `FAQPage`). Que
tipos entram em cada página está em [SEO.md §3.6](SEO.md), com a regra que não se
negoceia: portes, devoluções e avaliações só são emitidos quando existem dados
reais.

Formatos dos títulos:
- Loja: `custom.seo.title` do dono, ou `Nome da Loja | Compras em Angola`
- Produto: `Nome do Produto — Nome da Loja`
- Categoria: `Categoria — Nome da Loja | Comprar em Angola`
- Plataforma: `MôBisno — Criar Loja Online em Angola | Sites e Lojas Virtuais`

### `vercel.json` — Rewrites

```json
{ "source": "/robots.txt", "destination": "/api/robots" }
{ "source": "/sitemap.xml", "destination": "/api/sitemap" }
{ "source": "/", "destination": "/api/prerender" }
{ "source": "/((?!api/)(?!.*\\.).*)", "destination": "/api/prerender" }
```

**Nota crítica 1**: a Vercel avalia os rewrites **depois** de procurar um
ficheiro estático. Enquanto existiu um `index.html` na raiz do output, a regra
de `/` nunca disparou e a página inicial de cada loja era a única que não era
pré-renderizada. Por isso o shell passou a chamar-se `app.html`
(`scripts/rename-shell.mjs`, no fim de `web:build`). **Não repor o
`index.html`.**

**Nota crítica 2**: a Vercel usa RE2 (Go) para os rewrites. Negative lookaheads
`(?!...)` **funcionam** nesta versão (`vercel.json` v2 com rewrites). Não usar
regex de `routes` (legado); usar apenas `rewrites`.

### Ligações internas

Nenhuma ligação interna pode usar `#` — o Google descarta o fragmento e a página
de destino nunca é seguida. Usar `storeBasePath()` / `storeHomePath()` de
`web/lib/routing.ts`. Há testes a guardar isto (`tests/seoInfra.test.ts`).

### Descoberta de lojas novas

Automática por três vias: o diretório `/lojas`, o índice
`www.sualoja.digital/sitemap.xml` e o `robots.txt` de cada loja. A **indexação**
nunca é automática — conte 1 a 4 semanas para um subdomínio novo. Ver
[SEO.md §3.4](SEO.md).

### Cache de Crawlers Sociais

WhatsApp e Facebook fazem cache das meta tags. Usar:
- WhatsApp: partilhar link com `?v=<timestamp>` para forçar novo fetch.
- Facebook: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) → "Scrape Again".

---

## 14. Sistema de SMS

**Estado: «Em breve».** A infra de créditos existe, mas o envio real **não está
implementado** (falta integrar um provedor angolano) e, por isso, a bandeira
`COMING_SOON.sms` em `web/views/dashboard.ts` mantém a funcionalidade **bloqueada
na interface**: a secção mostra a etiqueta «Em breve», os botões de pacote e o
"Guardar" ficam desativados, e os manipuladores devolvem antes de escrever
qualquer coisa. O saldo já comprado fica intacto. Reverter é pôr a bandeira a
`false`.

### BD (migração `0013_sms.sql`)

- `stores.sms_credits integer not null default 0` — o **saldo**, por loja (não por dono).
- `sms_purchases` — uma linha por compra: `store_id`, `owner_id`, `quantity`, `amount`, `method`, `status`, `credited`, `merchant_transaction_id`, `operation_id`, `paid_at`. A bandeira `credited` é o que impede creditar duas vezes o mesmo pagamento.

### Pacotes disponíveis

`SMS_PACKAGES = [15, 50, 100, 200]` e `SMS_UNIT_PRICE = 300` Kz/mensagem, em
`web/supabase/sms.ts`. O preço de um pacote é sempre `quantidade × 300` — não há
desconto por volume, nem preços fixos por pacote: 4.500, 15.000, 30.000 e 60.000 Kz.

### Frontend

- `web/supabase/sms.ts`: `getSmsCredits(storeId)` — o saldo é por **loja**.
- `web/lib/smsCheckout.ts`: inicia pagamento de pacote via `/api/payment` com `kind: "sms"`.
- No dashboard (Configurações → SMS): saldo visível; compra de pacote e ativação **bloqueadas** enquanto a funcionalidade está «Em breve».

### Para implementar envio

Integrar um provedor (ex.: Infobip, Africa's Talking, provedor local angolano) em `api/webhook.js` ou numa nova função `api/sms.js`. O stock de créditos já existe na BD.

---

## 15. Códigos de Desconto

### BD: `discount_codes` (migração `0014_discount_codes.sql`)

| Coluna | Tipo | Descrição |
|---|---|---|
| `store_id` | uuid | Loja |
| `code` | text | Código (ex.: `VERAO10`) |
| `type` | text | `"percent"` ou `"fixed"` |
| `value` | numeric | Percentagem (0–100) ou valor fixo em Kz |
| `uses` | integer | Nº de vezes usado |
| `max_uses` | integer? | Limite de usos (null = ilimitado) |
| `expires_at` | timestamptz? | Expiração (null = sem expiração) |
| `active` | boolean | Ativo/inativo |

### Frontend

- `web/supabase/discounts.ts`: `listDiscountCodes`, `createDiscount`, `deleteDiscount`, `bumpDiscountUse`.
- Dashboard → Configurações → "Código de desconto": criar, listar (com contador de usos), apagar.
- Checkout: campo para inserir código → valida via Supabase → aplica desconto ao total.
- Servidor (`api/_shared.js` → `bumpDiscountUse`): incrementa `uses` após pagamento confirmado.

---

## 16. Stock de Produtos

Há **dois** stocks, com a mesma leitura de valores: o do Produto, na coluna
`products.stock`, e o de cada Combinação (versão do Produto — cor, tamanho…), em
`stores.customization.productVariations[<productId>].combinations[].stock`.

As três leituras, iguais nos dois casos:
- **ausente / `null`** → stock não controlado; passa sempre.
- **`0`** → esgotado; recusa.
- **positivo** → disponível até essa quantidade.

Uma Combinação que o dono **não gravou** conta como disponível: um campo em falta
nunca bloqueia uma venda.

### BD (migração `0015_product_stock.sql`)

Coluna `stock integer` adicionada a `products`. O stock por Combinação não tem
coluna própria — vive no JSON da personalização, ao lado das fotos extra.

### Lógica no servidor (`api/_shared.js`)

- `checkStock(db, products, storeId)`, antes de criar a encomenda. Compara a
  quantidade **agregada** — por `id` de Produto contra `products.stock`, e por
  `(id, variantKey)` contra o `stock` da Combinação. Agregar é obrigatório: duas
  Combinação do mesmo Produto são duas linhas do carrinho, e comparar linha a
  linha deixava passar duas linhas de 3 unidades contra um stock de 3. Sem stock
  suficiente, a encomenda é recusada com `OUT_OF_STOCK`.
- `decrementStock(db, products, storeId)`, após confirmação. O `products.stock`
  é abatido com leitura fresca por linha; o stock por Combinação é uma
  leitura-modificação-escrita da coluna JSON `customization`, com os abates de
  todas as linhas juntados numa **única escrita por encomenda** (uma escrita por
  linha releria a coluna e perderia os abates anteriores).
- Quando corre: no MCX, dentro de `api/payment.js` (pagamento imediato); na
  Referência Bancária, em `api/webhook.js`, só na transição para pago — é isso, e
  não um parâmetro de idempotência, que evita o duplo abate.
- Uma linha sem `variantKey`, um Produto sem Variação ativas, ou uma falha a ler
  a personalização → só o `products.stock` é validado e abatido.

**Limitação conhecida:** o abate **não é atómico**. Entre `checkStock` e
`decrementStock` há uma janela em que duas compras simultâneas do mesmo Produto
(ou da mesma Combinação) validam ambas contra o mesmo stock antes de qualquer uma
abater, e vende-se uma unidade a mais. Fechá-la exige abate na base de dados
(função SQL, ou `update … where stock >= qty`).

### Frontend

- Formulário de produto: toggle "Controlar stock" + campo de quantidade. O stock
  por Combinação é definido na grelha de Combinação do mesmo formulário.
- Página de produto: exibe "Esgotado" se `stock === 0`, desativa botões.

---

## 17. Avaliações de Produtos

### BD: `product_reviews` (migração `0016_reviews.sql`)

| Coluna | Tipo |
|---|---|
| `product_id` | uuid |
| `store_id` | uuid |
| `author` | text |
| `rating` | integer (1–5) |
| `comment` | text? |
| `approved` | boolean (default false) |
| `created_at` | timestamptz |

### Frontend

- `web/supabase/reviews.ts`: `listProductReviews(productId)`, `submitReview(storeId, productId, data)`, `summarize(reviews)`.
- Página de produto (`web/views/product.ts`): secção de avaliações em grelha de 2 colunas (lg:3 colunas):
  - Lista de avaliações aprovadas (`lg:col-span-2`).
  - Formulário "Deixe a sua avaliação" (`lg:col-span-1`, sticky no desktop).
- Estrelas em âmbar (`#F59E0B`).
- Moderação: no dashboard → Configurações → Avaliações, o dono aprova/rejeita.
- JSON-LD `aggregateRating` no produto (para Google).

---

## 18. Analytics

### BD: `store_events` (migração `0017_store_events.sql`)

| Coluna | Tipo | Descrição |
|---|---|---|
| `store_id` | uuid | Loja |
| `event_type` | text | `page_view`, `product_view`, `add_to_cart`, `checkout_start`, `order_paid` |
| `entity_id` | text? | ID do produto/categoria (opcional) |
| `created_at` | timestamptz | |

### Frontend

- `web/supabase/analytics.ts`: `trackStoreEvent(storeId, eventType, entityId?)`, `getStoreAnalytics(storeId, days)`.
- Eventos registados automaticamente em: storefront (page_view), página de produto (product_view), add to cart, checkout, pagamento confirmado.
- Dashboard → aba "Análises": gráfico de eventos por dia, totais por tipo.

### Pixels de Marketing por Loja (`web/lib/pixels.ts`)

Cada loja pode configurar (no dashboard → Marketing):
- **Meta Pixel ID**: dispara `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`.
- **Google Analytics 4 (GA4) Measurement ID**: dispara os mesmos eventos via `gtag`.

Os pixels são carregados dinamicamente apenas nas lojas que os configuraram. A plataforma (`mobisno.store`) tem os seus próprios pixels (definidos em `web/index.html`).

---

## 19. Painel de Administração

### Acesso

URL: `https://mobisno.store/adminpainel` (insensível a maiúsculas).  
Requer `is_admin = true` no perfil. Botão "Painel de Administração" visível no dashboard do dono se for admin.

### Funcionalidades

**Visão Geral:**
- Total de contas, lojas publicadas, receita estimada do mês, transações recentes.

**Contas:**
- Tabela de todos os utilizadores com filtro de subscrição (com/sem).
- Expandir conta → ver lojas, plano, datas.
- Ações: mudar plano, suspender, ativar.

**Lojas:**
- Tabela de todas as lojas com filtros (estado, template).
- Chips de funcionalidades ativas por loja (SMS, MCX Express, WhatsApp, Entregas).
- Editar loja de qualquer dono (admin entra no editor com `appState.editOwnerId`).

**Transações:**
- Lista de pagamentos (plano, SMS, encomendas) com estado (concluída/falhada/pendente).
- Filtros por tipo, estado, data.

**Levantamentos:**
- Pedidos de levantamento de saldo dos donos de loja.

**Planos a expirar:**
- Lista de contas com `plan_expires_at` nos próximos 7 dias.

### `web/supabase/admin.ts`

Funções admin (requerem `is_admin` validado por RLS):
- `listAccounts()`, `listStores()`, `listAllWithdrawals()`, `listServiceTransactions()`, `adminStoreProductCounts()` — **só leitura**, sem agregação.
- `adminOverview()` — os cinco totais globais. Lê as tabelas e delega a contagem em `overviewCounts()` de `src/services/adminMetrics.ts`, para a exclusão de Loja_Modelo e de contas de Administrador ser a mesma das restantes agregações (e ser testável).
- `adminSetAccountPlan(ownerId, plan)`, `adminDeleteAccount(ownerId)`, `adminSetStoreState(storeId, state)`, `adminDeleteStore(storeId)`, `adminProcessWithdrawal(id, status)`, `adminDeleteServiceTransaction(id, service)`.
- `adminStoresUsingTemplate(ids)` — verificação antes de eliminar lojas-modelo.

### Métricas da Visão geral (`src/services/adminMetrics.ts`)

Domínio puro, sem DOM e sem consultas: recebe o que o painel já leu. Quatro
funções — `businessHealth` (6 métricas), `monthlyEvolution` (2 séries),
`attentionLists` (5 listas) e `overviewCounts` (5 totais globais) — e **dezoito**
agregações no total. A exclusão de Loja_Modelo (`customization.__template`) e de
contas de Administrador é aplicada **num único sítio** (`buildScope`); nenhuma
agregação toca nos arrays crus.

**Armadilha de nomes:** `adminOverview().salesTotal` é o **volume de vendas das
lojas** (dinheiro dos clientes dos donos, tabela `orders`); a **receita da
plataforma** é `businessHealth().monthRevenue` e vem das transações de serviço
(planos, SMS, logótipos). Grandezas diferentes, rótulos diferentes.

### Persistência de Sessão do Admin

`web/supabase/client.ts`: `storageKey = "mobisno-auth"`, `persistSession: true`. A sessão é renovada automaticamente. `isCurrentUserAdmin()` usa `getSession()` (não `getUser()`, que faz pedido ao servidor e pode deslogar em certas condições).

---

## 20. Pré-visualização e Suspensão

### Criar é grátis; publicar exige subscrição

Uma loja nasce em **Rascunho**. O dono personaliza-a e vê-a em
`/previsualizar/<identificador>` — a loja tal como ficará publicada, com uma
barra por cima a dizer que só ele a vê.

`storefrontResolver.resolveForOwner(identifier, ownerId)` é o caminho que o
permite: devolve a loja **em qualquer estado**, mas só ao seu dono. A porta
pública (`resolve`) continua a recusar rascunhos — guardado por
`tests/storePreview.test.ts`. O carrinho e o checkout não são montados na
pré-visualização: é uma vista da loja, não uma loja a funcionar.

### Suspensão

**Nenhum cron job.** Quando `plan_expires_at` fica no passado:

- `public.account_active(uid)` passa a falso;
- a política `stores_public_read` deixa de servir a loja: sai da web;
- `api/prerender.js` devolve **410**;
- `api/payment.js` recusa novos pagamentos (`PLAN_NOT_COVERED`).

A loja **não é despublicada**: o estado fica `Publicada` e ela volta sozinha ao
ar mal a subscrição seja renovada.

No painel, `planStatusCard` distingue quem **nunca pagou** («A sua loja ainda
não está online») de quem **deixou caducar** («A sua subscrição terminou»).

## 21. Assistente de IA

O editor visual tem um chat de assistente IA no canto inferior direito.

- **Frontend**: `web/lib/aiAgent.ts` — monta o widget de chat, envia mensagens para `/api/assistant`.
- **Backend**: `api/assistant.js` — proxy para OpenAI `POST /v1/chat/completions`.
- **Chave**: `OPENAI_API_KEY` só no Vercel (variável de ambiente servidor). Nunca no bundle.
- **Modelo por defeito**: `gpt-4o-mini` (configurável via `OPENAI_MODEL` env var).
- **Desenvolvimento local**: só funciona com `vercel dev` (a função `/api/assistant` não está disponível com `npm run dev`/Vite puro).

---

## 22. Testes

### Executar

```bash
npx vitest run       # todos os testes (modo CI, single-run)
npm run test         # mesmo que acima
npm run test:watch   # modo watch (desenvolvimento)
npm run build        # tsc --noEmit (verifica tipos em src/ + tests/)
```

**A suite tem de passar inteira** antes de qualquer commit (55 ficheiros `*.test.ts` em `tests/`, unitários e de propriedade). Não fixamos aqui o número de casos: cresce a cada funcionalidade e um número desatualizado só serve para confundir. O portão é `npm run build` + `npm run web:build` + `npx vitest run`.

### Tipologia de Testes

| Ficheiro | Tipo | O que testa |
|---|---|---|
| `billing.test.ts` | Unitário | `resolveBilling`, `planActivationPatch` |
| `plans.test.ts` | Unitário | Catálogo, limites, funcionalidades |
| `seo.test.ts` | Unitário | `productTitle`, `productDescription`, JSON-LD |
| `payments.test.ts` | Unitário | Fluxos de pagamento |
| `repositories.test.ts` | Unitário (in-memory) | CRUD de lojas, produtos, banners |
| `storeRenderer.test.ts` | Unitário | Renderização de storefront |
| `integration.test.ts` | Integração | Fluxo completo criação→publicação |
| `*.property.test.ts` | Property-based (fast-check) | Invariantes: isolamento, validações, limites |

### Property-Based Testing

Usado extensivamente para garantir invariantes de domínio. Ex.:
- `storeOwnership`: dois donos nunca acedem às lojas um do outro.
- `productValidation`: produtos com campos inválidos são rejeitados.
- `identifier.*`: identificadores normalizados obedecem às regras.
- `billing.*`: (implícito em `billing.test.ts`) funções puras com quaisquer inputs.

`tests/helpers/property.ts`: geradores (`fc.Arbitrary`) reutilizáveis.

---

## 23. Build e Deploy

### Build Local

```bash
npm install              # instalar dependências
npm run build            # tsc --noEmit (verifica tipos)
npm run web:build        # Vite: gera web/dist/
npx vitest run           # correr testes
```

### Deploy (Vercel)

1. Push para `main` → Vercel deteta e faz build automaticamente.
2. **Build command**: `npm run web:build`
3. **Output directory**: `web/dist`
4. **Framework**: `null` (não é Next.js nem outro framework Vercel)

### Git Push — Nota Importante

O PowerShell mostra o stderr do git como "error" mesmo quando o push tem sucesso. **Confirmar sempre pela linha `main -> main`** no output, não pela ausência de texto vermelho.

### Vercel — Configuração de Domínios

Em Settings → Domains:
- `mobisno.store`, `www.mobisno.store`
- `*.mobisno.store` (wildcard — lojas legadas)
- `sualoja.digital`, `www.sualoja.digital`
- `*.sualoja.digital` ← **essencial para as lojas funcionarem**

DNS: apex → A `76.76.21.21` (ou ALIAS para `cname.vercel-dns.com`). Wildcards e www → CNAME `cname.vercel-dns.com`.

### Supabase — Pós-Deploy

1. Aplicar migrações `0001` a `0018` em ordem no SQL Editor.
2. Tornar a conta admin: `UPDATE public.profiles SET is_admin = true WHERE email = '...'`
3. Auth → URL Configuration: Site URL = `https://mobisno.store`, Redirect URLs incluir `https://mobisno.store/**`.

---

## 24. Variáveis de Ambiente

### Frontend (Vite — `web/.env` ou Vercel → Environment Variables)

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon (pública, segura com RLS) |

### Servidor (Vercel — apenas servidor, nunca no bundle)

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | Mesmo URL (usado pelas funções serverless) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — ignora RLS. **Secreta.** |
| `MOMENU_PLATFORM_API_KEY` | Chave MoMenu da plataforma |
| `MOMENU_BASE_URL` | Opcional; default `https://api.momenu.online` |
| `OPENAI_API_KEY` | Chave OpenAI para o assistente IA |
| `OPENAI_MODEL` | Opcional; default `gpt-4o-mini` |

O ficheiro `web/.env` está no `.gitignore`. **Nunca fazer commit de chaves.**

---

## 25. Migrações SQL — Ordem e Conteúdo

Aplicar **por ordem** no SQL Editor do Supabase. Nunca pular uma migração.

| # | Ficheiro | O que cria/altera |
|---|---|---|
| 0001 | `0001_init.sql` | Tabelas base: `profiles`, `stores`, `products`, `assets`, `banners` |
| 0002 | `0002_customization.sql` | Tabela `store_customizations` (JSON de personalização) |
| 0003 | `0003_webp_format.sql` | Adiciona `"webp"` ao enum `image_format` |
| 0004 | `0004_product_category.sql` | Coluna `category` em `products` |
| 0005 | `0005_product_featured.sql` | Coluna `featured` em `products` |
| 0006 | `0006_account_plan.sql` | Colunas `plan`, `plan_expires_at`, `next_plan` em `profiles` |
| 0007 | `0007_domain_store.sql` | Muda subdomínio de `.mobisno.com` para `.mobisno.store` |
| 0008 | `0008_payments.sql` | Tabela `store_payments`, tabela `orders` |
| 0009 | `0009_product_physical.sql` | Coluna `physical` em `products` |
| 0010 | `0010_withdrawals.sql` | Tabela `withdrawals` |
| 0011 | `0011_admin.sql` | Coluna `is_admin` em `profiles`; políticas RLS admin |
| 0012 | `0012_billing.sql` | Faturação: expiração 30d, `next_plan` carry-over; políticas |
| 0013 | `0013_sms.sql` | Coluna `sms_credits` em `stores`; tabela `sms_purchases` |
| 0014 | `0014_discount_codes.sql` | Tabela `discount_codes` |
| 0015 | `0015_product_stock.sql` | Coluna `stock` em `products` |
| 0016 | `0016_reviews.sql` | Tabela `product_reviews` |
| 0017 | `0017_store_events.sql` | Tabela `store_events` (analytics) |
| 0018 | `0018_trial.sql` | Coluna `trial_ends_at`; função `account_active`. **Superada pela 0019** |
| 0018 | `0018_logo_purchases.sql` | Tabela `logo_purchases` (criação de logótipo por IA, compra avulsa). Partilha o número `0018` com `0018_trial.sql`; são independentes e a ordem entre as duas não importa |
| 0019 | `0019_single_plan.sql` | Plano único `pro`; larga `trial_ends_at` e `next_plan`; `account_active` sem teste; coluna `period` em `plan_payments`; gatilho que exige subscrição para publicar |

### Scripts Utilitários

- `supabase/scripts/create_admin.sql`: cria a conta admin `dotangola@gmail.com` / `aeiou123`.
- `supabase/scripts/reset_test_data.sql`: limpa dados de teste.

---

## 26. Comandos de Desenvolvimento

```bash
# Instalar
npm install

# Desenvolvimento frontend (Vite HMR)
npm run dev                  # http://localhost:5173

# Verificar tipos TypeScript (src/ + tests/)
npm run build                # tsc --noEmit

# Build de produção
npm run web:build            # gera web/dist/

# Testes (modo CI)
npx vitest run
npm run test

# Testes (modo watch)
npm run test:watch

# Funções serverless locais (requer Vercel CLI)
vercel dev                   # http://localhost:3000 (inclui /api/*)

# Deploy manual para preview
vercel

# Deploy para produção
vercel --prod
```

### Desenvolvimento Local de Lojas

Para testar uma loja em localhost, usar a rota hash:
```
http://localhost:5173/#/loja/<identifier>
```
Ou configurar um host local com subdomínio e apontar para `localhost:5173`.

---

## 27. Design System e Marca

### Cores

| Token | Hex | Uso |
|---|---|---|
| `--accent` (plataforma) | `#F95901` | Botões, etiquetas, destaques |
| `--accent-600` | `#D94B00` | Hover |
| `--tint` | `#FFF3EC` | Fundos suaves |
| `--ink` | `#1C1410` | Texto principal |
| `--muted` | `#6B5B52` | Texto secundário |
| `--line` | `#F0E7E2` | Separadores, bordas |
| `var(--brand)` | definido pelo dono | Cor de destaque da loja |

### Tipografia

- **Fonte principal**: Inter (Google Fonts)
- **Fonte alternativa** (estilo Clássico): Noto Serif
- Títulos: peso 800–900, letter-spacing negativo
- Corpo: peso 400, 15px
- Secundário: peso 500, 12px, cor `--muted`

### Idioma

Português de Angola / Portugal (pt-AO). **Nunca usar:**
- "você" → "o utilizador" / "o dono"
- "tela" → "ecrã" / "página"
- "cadastro" → "registo"
- "celular" → "telemóvel"
- "crie sua loja" → "crie a sua loja"

### Ficheiros de Marketing

- `marketing/MoBisno-Beneficios.html`: folheto A4 com benefícios (para PDF).
- `marketing/MoBisno-DesignSystem.html`: design system completo (para PDF, para o designer).
- `marketing/logo.png`: wordmark MôBisno (para uso nos ficheiros de marketing).

---

## 28. Convenções de Código

### TypeScript

- `strict: true` em `tsconfig.json`.
- Módulos ESM (`"type": "module"` em `package.json`).
- Imports com extensão `.js` (mesmo sendo ficheiros `.ts`) — obrigatório para ESM Node.
- Funções de domínio puras (sem I/O) em `src/`. Infraestrutura em `web/` e `api/`.
- Tipos exportados de `src/models/index.ts` (re-exporta tudo).

### Ficheiros de API (`api/*.js`)

- Sempre ESM: `export default async function handler(req, res) { ... }`
- `Content-Type: application/json` em todas as respostas.
- Erros: `res.status(4xx|5xx).json({ error: "..." })`.
- Nunca expor detalhes internos (stack traces) em produção.

### Frontend (`web/`)

- `render(html)` para substituir o conteúdo do ecrã. Não manipular o DOM diretamente fora de `render`.
- `esc(str)` **sempre** antes de inserir strings do utilizador em innerHTML.
- `toast(msg, type)` para feedback ao utilizador.
- Botões com operações assíncronas: usar `withBusy(el, fn)` ou `withButton(btn, fn)`.
- Navegação interna: `navigate("/rota")` (nunca `location.href`).

### Supabase Client

- Browser: `web/supabase/client.ts` (`createClient` com `localStorage`, `pkce`, `storageKey = "mobisno-auth"`).
- Servidor: `api/_shared.js` `admin()` (com `SERVICE_ROLE_KEY`).
- **Nunca usar service role no browser.**

### Git

- Branch principal: `main`.
- Commits após cada fase/funcionalidade completa.
- Push confirmar pela linha `main -> main` (ignorar mensagens de "error" em stderr no PowerShell).
- Nunca commitar `.env`, `web/dist/`, `node_modules/`, ou ficheiros com chaves.

---

## 29. Decisões Técnicas e Limitações Conhecidas

### SPA vs SSR

A plataforma é uma **SPA** (Single Page Application). O Google indexa bem (executa JS). Crawlers sociais (WhatsApp, Facebook) não executam JS — coberto pelo `api/prerender.js`.

**Limitação**: sem SSR completo, o tempo de First Contentful Paint (FCP) é ligeiramente maior que num SSR. Mitigado pelo code splitting e lazy loading.

### Hash Routing → History API

O routing das **páginas públicas de loja** migrou de hash (`#/...`) para History API: o `vercel.json` encaminha essas rotas para `api/prerender`, que lê o shell de `/app.html` (nunca `index.html` — ver §13) e devolve HTML com conteúdo real. Retrocompatibilidade com links antigos via `cleanPath()`, que aceita o formato `#/x`. Dentro da aplicação **privada** (painel, editor, admin, login) o `#` continua a ser o esquema de rotas legítimo, porque essas páginas não são indexadas.

### `innerHTML` + Templates

Os templates de loja renderizam HTML via `innerHTML`. Isto significa:
- `<script>` dentro de templates **não corre** (browser bloqueia por segurança).
- `<style>` dentro de templates **corre** (o browser processa estilos injetados).
- Classes Tailwind em innerHTML **não funcionam** se não forem processadas no build (o Tailwind analisa os ficheiros `.ts` mas não o HTML gerado em runtime). Usar CSS inline ou classes que existam na stylesheet compilada.

### Funções Serverless — Node.js Runtime (não Edge)

As funções em `api/` usam o runtime Node.js (não Edge Runtime) porque importam módulos CommonJS e o SDK do Supabase. O Edge Runtime seria mais rápido mas teria limitações de compatibilidade.

### Supabase Storage URLs

As URLs de imagens em Storage são públicas por design (sem autenticação). O isolamento é garantido por nomes de path únicos (ex.: `logos/<store_id>/<timestamp>.webp`). Não armazenar dados sensíveis em Storage.

### SMS de Confirmação — «Em breve», bloqueado na interface

A infraestrutura de créditos existe (saldo em `stores.sms_credits`, compras em
`sms_purchases`), mas o envio real **não está implementado** — falta escolher e
integrar um provedor angolano. Anunciar uma funcionalidade que não envia nada é
pior do que não a anunciar, por isso a bandeira `COMING_SOON.sms` em
`web/views/dashboard.ts` mostra a etiqueta «Em breve» e **bloqueia** a compra de
créditos e a ativação do envio: os botões ficam desativados e os manipuladores
devolvem antes de escrever. Reverter é pôr a bandeira a `false`.

### Domínio Próprio — «Em breve», bloqueado na interface

Continua incluído na subscrição, mas a configuração
técnica (CNAME para a Vercel) é manual e não há automação de DNS na plataforma.
Enquanto isso, `COMING_SOON.customDomain` mostra «Em breve» e **bloqueia guardar**
um domínio: o campo aparece, o "Guardar" está desativado e o manipulador recusa
com um aviso. Nada é escrito em `customization.customDomain`.

---

## 30. Roadmap / Funcionalidades Não Implementadas

| Funcionalidade | Estado | Notas |
|---|---|---|
| Envio de SMS de confirmação | ⏳ «Em breve» | Infra de créditos pronta; falta provedor. Compra e ativação **bloqueadas** na interface (§29) |
| Domínio próprio automático | ⏳ «Em breve» | Feature paga; configuração manual. Guardar domínio **bloqueado** na interface (§29) |
| Email transacional (confirmação, welcome) | ❌ Não implementado | Supabase Auth envia email de confirmação; resto manual |
| Verificação de email com template da marca | ❌ Não implementado | Requer SMTP próprio + template HTML com logo |
| App móvel | ❌ Não planeado | SPA responsiva; PWA possível |
| Cron de expiração de planos | ✅ Não necessário | RLS com `account_active()` trata tudo |
| Pesquisa dentro da loja | ✅ Implementado | `web/lib/search.ts` — busca por nome/categoria |
| Retentativas de webhook | ❌ Não implementado | Fire-and-forget; fallback manual "Já paguei" |

---

*Wiki gerada em 01/07/2026. Atualizar sempre que uma funcionalidade for adicionada, alterada ou removida.*

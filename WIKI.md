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
7. [Planos e Faturação](#7-planos-e-faturação)
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
20. [Teste Grátis e Suspensão](#20-teste-grátis-e-suspensão)
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

**MôBisno** é uma plataforma SaaS multi-inquilino angolana que permite a qualquer empreendedor criar a sua loja online em minutos, sem conhecimentos técnicos. Cada loja fica num subdomínio próprio (`nomedaloja.sualoja.digital`), com pagamentos locais integrados (Multicaixa Express + referência bancária), SEO otimizado, código de desconto, SMS de confirmação de compra, avaliações de produtos e analytics.

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
│   ├── assistant.js        # Chat IA (OpenAI) — chave só no servidor
│   ├── health.js           # Health check
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
│   │   ├── billing.ts      # Resolução de plano/faturação/trial
│   │   ├── plans.ts        # Catálogo de planos, limites, funcionalidades
│   │   ├── seo.ts          # Geração de títulos/descrições/JSON-LD (puro)
│   │   ├── storeService.ts # Criação/validação de lojas
│   │   ├── productService.ts
│   │   ├── identifierService.ts # Normalização e validação de identificadores
│   │   ├── fileService.ts  # Políticas de upload (tamanho, formato)
│   │   ├── payments.ts     # Lógica de pagamento (puro)
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
│   │   ├── cart.ts         # Carrinho (localStorage por loja)
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
│   │   ├── withdrawals.ts  # listWithdrawals, createWithdrawalRequest
│   │   ├── admin.ts        # adminListAccounts, adminSetAccountPlan, etc.
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
│   │   ├── galeria.ts      # Template "Galeria"
│   │   ├── beauty.ts       # Template "Beauty"
│   │   └── desportivo.ts   # Template "Desportivo"
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
│       ├── preview.ts      # Preview de template
│       ├── adminPanel.ts   # Painel de administração
│       ├── legal.ts        # Termos / Privacidade / Política
│       └── login.ts
│
├── supabase/
│   ├── migrations/         # SQL: 0001_init.sql … 0018_trial.sql
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
  location.replace(`https://${PLATFORM_APEX}`);
  return;
}
```

---

## 5. Base de Dados — Supabase

### Tabelas Principais

| Tabela | Descrição |
|---|---|
| `profiles` | Extensão de `auth.users`; campos: `plan`, `plan_expires_at`, `next_plan`, `trial_ends_at`, `is_admin` |
| `stores` | Lojas: `owner_id`, `name`, `identifier`, `template_id`, `state`, `subdomain` |
| `products` | Produtos: `store_id`, `name`, `price`, `stock`, `available`, `featured`, `physical`, etc. |
| `assets` | Imagens (logo, produto, banner) associadas a lojas |
| `banners` | Banners de uma loja (máx. 10, posição ordenada) |
| `store_customizations` | JSON da personalização visual (`StoreCustomization`) |
| `store_payments` | Configuração de pagamentos por loja (chave MoMenu, IBAN, WhatsApp, etc.) |
| `orders` | Encomendas criadas pelo checkout |
| `withdrawal_requests` | Pedidos de levantamento de saldo |
| `sms_credits` | Saldo de SMS por loja |
| `discount_codes` | Códigos de desconto por loja |
| `product_reviews` | Avaliações de produtos (autor, rating, comentário, aprovado) |
| `store_events` | Eventos de analytics (page_view, product_view, add_to_cart, etc.) |

### RLS — Row Level Security

**Princípio:** o isolamento entre inquilinos é feito 100% por RLS, não por middleware. Nunca desativar RLS em tabelas de dados de utilizadores.

Regras críticas:
- `stores`: SELECT só pelo `owner_id` (ou admin). UPDATE/DELETE idem.
- `stores` (leitura pública): `state = 'Publicada' AND public.account_active(owner_id)` — inclui verificação de trial/plano/admin.
- `products`, `assets`, `banners`: SELECT público por `store_id` se a loja for publicada; escrita só pelo dono.
- `profiles`: cada utilizador lê/atualiza o seu próprio perfil; admins leem todos.

### Função `public.account_active(uid uuid)`

Criada na migração `0018`. Determina se uma conta tem acesso ativo (loja pode ficar online):

```sql
CREATE OR REPLACE FUNCTION public.account_active(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(is_admin, false) = true
    OR (trial_ends_at IS NOT NULL AND trial_ends_at > now())
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
- `stock`: `null`/`undefined` = ilimitado; `0` = esgotado. Decrementado atomicamente no servidor.
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

---

## 7. Planos e Faturação

### Catálogo de Planos (`src/services/plans.ts`)

| Plano | Preço/mês | Lojas publicadas | Produtos | Checkout MCX | Domínio próprio |
|---|---|---|---|---|---|
| Básico | 5.000 Kz | 1 | 100 | ✗ | ✗ |
| Profissional | 11.000 Kz | 3 | Ilimitado | ✓ | ✓ |
| Empresarial | 25.000 Kz | Ilimitado | Ilimitado | ✓ | ✓ + gestor dedicado |

Todos os planos incluem checkout via WhatsApp.

### Lógica de Faturação (`src/services/billing.ts`)

`resolveBilling(input, now)` é uma **função pura** (sem I/O) que recebe:
- `plan`, `planExpiresAt`, `nextPlan`, `trialEndsAt`, `isAdmin`

E devolve `BillingState`:
- `effectivePlan`: plano cujas funcionalidades estão ativas agora.
- `inTrial`: está no período de teste (7 dias).
- `accessActive`: loja pode ficar online?
- `suspended`: acesso terminado (precisa de pagar).
- `daysRemaining`: dias até renovação.
- `transition`: alteração a persistir no perfil (carry-over).

### Carry-Over (mudança de plano com tempo restante)

Se o utilizador pagar um plano diferente enquanto o atual ainda tem tempo:
- `nextPlan` fica agendado na BD.
- Quando o período atual termina, `billing.ts` ativa o `nextPlan` por mais 30 dias.
- A lógica está em `resolveBilling` + `planActivationPatch`.

### Ativação de Plano pelo Servidor

`api/_shared.js` → `activatePlan(userId, planId)` + `planActivationPatch` (importado do módulo billing).  
`api/payment.js` chama `activatePlan` após confirmação de pagamento de plano.

### Admin tem acesso eterno

`adminSetAccountPlan` (em `web/supabase/admin.ts`) define `plan_expires_at` a 100 anos. `account_active` verifica `is_admin = true` para bypass total.

---

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
2. Se online: `web/lib/paymentsApi.ts` chama `POST /api/payment` com `storeId`, `items`, `delivery`, `customerInfo`.
3. `api/payment.js` lê a chave MoMenu da loja em `store_payments` (service role), cria a transação MoMenu e devolve `{ reference?, qrCode?, amount, transactionId }`.
4. Browser mostra instruções. Webhook (`/api/webhook`) confirma o pagamento, abate stock, e atualiza a encomenda.
5. Fallback: botão "Já paguei — verificar" chama `GET /api/payment-status?id=<transactionId>`.

### Fluxo de Pagamento de Plano

1. `web/lib/planCheckout.ts` chama `POST /api/payment` com `type: "plan"`, `planId`, sem `storeId`.
2. Servidor usa `MOMENU_PLATFORM_API_KEY` (receita da plataforma).
3. Confirmação via webhook ou polling → `activatePlan(userId, planId)`.

### Fluxo de Pagamento de SMS

1. `web/lib/smsCheckout.ts` chama `POST /api/payment` com `type: "sms"`, `packageSize`.
2. Confirmação → incrementa `sms_credits.credits` do dono.

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
interface TemplateDefinition {
  id: string;
  name: string;
  defaultBrand: string;         // cor padrão da loja
  render(view, custom): string; // HTML da home
  renderProduct?(view, product, custom): string; // HTML do produto
  renderCategory?(view, category, custom): string;
  renderCheckout?(view, items, custom): string;
}
```

Templates disponíveis: `galeria`, `beauty`, `desportivo` (e possivelmente outros). O `templateId` é guardado na loja.

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
- `createSupabase()`: cliente com `SUPABASE_SERVICE_ROLE_KEY` (ignora RLS).
- `effectivePlanId(userId)`: lê o plano efetivo considerando trial.
- `activatePlan(userId, planId)`: ativa plano (chama `planActivationPatch`).
- `planActivationPatch(current, newPlan)`: calcula patch (importado de `billing.ts`).
- `checkStock(supabase, items)`: verifica se há stock suficiente antes de criar encomenda.
- `decrementStock(supabase, items, orderId)`: abate stock atomicamente (idempotente por `orderId`).
- `bumpDiscountUse(supabase, code, storeId)`: incrementa o contador de usos de um código.

### `api/payment.js`

`POST /api/payment` — inicia um pagamento (produto, plano ou SMS).

Parâmetros (body JSON):
- `type`: `"order"` | `"plan"` | `"sms"` (default `"order"`).
- `storeId`: obrigatório para `"order"`.
- `items`: `[{ productId, quantity, price }]`.
- `delivery`: objeto com morada/custo.
- `customerInfo`: `{ name, phone, email? }`.
- `planId`: para `"plan"`.
- `packageSize`: para `"sms"` (15|50|100|200).
- `discountCode`: opcional.

Resposta: `{ transactionId, reference?, qrCode?, amount, expiresAt? }`.

### `api/payment-status.js`

`GET /api/payment-status?id=<transactionId>` — verifica estado de um pagamento (polling).

### `api/webhook.js`

`POST /api/webhook` — recebe notificação MoMenu de pagamento confirmado. Processa por `merchantTransactionId`:
- Encomenda: abate stock, marca como paga.
- Plano: chama `activatePlan`.
- SMS: incrementa `sms_credits`.

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

### Camada 1 — Cliente (`web/lib/seo.ts` + `src/services/seo.ts`)

`applySeo(opts)` define no browser:
- `<title>` + `<meta name="description">`
- `<link rel="canonical">`
- Open Graph (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`)
- Twitter Card (`summary_large_image`)
- JSON-LD (`Product`, `OnlineStore`, `Organization`)

Formatos dos títulos:
- Loja: `Nome da Loja | Compras em Angola`
- Produto: `Nome do Produto — Nome da Loja`
- Plataforma: `MôBisno — Crie a sua loja online em Angola`

### Camada 2 — Servidor (`api/prerender.js`)

Os crawlers sociais (WhatsApp, Facebook, LinkedIn) **não executam JavaScript**. O `prerender.js` serve HTML com meta tags corretas para estes bots.

**Deteção de crawler**: qualquer pedido ao `/` ou a caminhos de loja (`/(...)`) é enviado para `api/prerender` pelo `vercel.json`. A função decide se serve o shell estático ou injecta meta tags com base no `User-Agent` e host.

### `vercel.json` — Rewrites

```json
{ "source": "/robots.txt", "destination": "/api/robots" }
{ "source": "/sitemap.xml", "destination": "/api/sitemap" }
{ "source": "/", "destination": "/api/prerender" }
{ "source": "/((?!api/)(?!.*\\.).*)", "destination": "/api/prerender" }
```

**Nota crítica**: a Vercel usa RE2 (Go) para os rewrites. Negative lookaheads `(?!...)` **funcionam** nesta versão (`vercel.json` v2 com rewrites). Não usar regex de `routes` (legado); usar apenas `rewrites`.

### Cache de Crawlers Sociais

WhatsApp e Facebook fazem cache das meta tags. Usar:
- WhatsApp: partilhar link com `?v=<timestamp>` para forçar novo fetch.
- Facebook: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) → "Scrape Again".

---

## 14. Sistema de SMS

**Estado:** infra completa; envio real **NÃO implementado** (falta integrar provedor de SMS angolano).

### BD: `sms_credits` (migração `0013_sms.sql`)

| Coluna | Tipo | Descrição |
|---|---|---|
| `owner_id` | uuid | FK para `profiles` |
| `credits` | integer | Saldo de mensagens |

### Pacotes disponíveis

| Pacote | Mensagens | Preço |
|---|---|---|
| Small | 15 | 4.500 Kz |
| Medium | 50 | 14.000 Kz |
| Large | 100 | 25.000 Kz |
| XLarge | 200 | 45.000 Kz |

Custo unitário: **300 Kz/mensagem**.

### Frontend

- `web/supabase/sms.ts`: `getSmsBalance(ownerId)`, `buySmsPackage(ownerId, size)`.
- `web/lib/smsCheckout.ts`: inicia pagamento de pacote via `/api/payment` com `type: "sms"`.
- No dashboard (secção Configurações → SMS): saldo visível, botões de compra de pacote.

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

### BD (migração `0015_product_stock.sql`)

Coluna `stock integer` adicionada a `products`. `null` = ilimitado.

### Lógica

- `stock = 0` → produto "Esgotado". Botão de compra desativado no frontend.
- Antes de criar encomenda: `checkStock(supabase, items)` em `api/_shared.js` verifica se `stock >= quantity` para cada produto.
- Após confirmação de pagamento: `decrementStock(supabase, items, orderId)` abate atomicamente. **Idempotente**: usa `orderId` para evitar duplo abate.
- Se o stock chegar a zero durante o pagamento, a encomenda falha com `OUT_OF_STOCK`.

### Frontend

- Formulário de produto: toggle "Controlar stock" + campo de quantidade.
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
- Tabela de todos os utilizadores com filtros (ativo/suspenso/trial).
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
- `adminListAccounts()`, `adminGetAccount(userId)`
- `adminSetAccountPlan(userId, planId)`, `adminSuspendAccount(userId)`
- `adminListStores()`, `adminGetStoreDetails(storeId)`
- `adminListTransactions()`, `adminListWithdrawals()`
- `adminGetOverview()` — métricas agregadas

### Persistência de Sessão do Admin

`web/supabase/client.ts`: `storageKey = "mobisno-auth"`, `persistSession: true`. A sessão é renovada automaticamente. `isCurrentUserAdmin()` usa `getSession()` (não `getUser()`, que faz pedido ao servidor e pode deslogar em certas condições).

---

## 20. Teste Grátis e Suspensão

### Regra

Toda conta criada recebe **7 dias de teste grátis**. Após o período:
- Se não pagou: loja fica offline (invisível na web, bloqueada por RLS).
- Aviso no dashboard: banner vermelho "Loja offline — Ative o seu plano para voltar a aparecer online".

### Implementação

**BD** (`0018_trial.sql`):
- `profiles.trial_ends_at = now() + interval '7 days'` (default na criação).
- `public.account_active(uid)` (SECURITY DEFINER): `is_admin OR trial_ends_at > now() OR plan_expires_at > now()`.
- Política `stores_public_read`: `state = 'Publicada' AND public.account_active(owner_id)`.

**Nenhum cron job necessário.** A suspensão é automática via RLS.

**`src/services/billing.ts`**:
- `BillingInput.trialEndsAt`, `BillingState.inTrial`, `trialDaysRemaining`, `accessActive`, `suspended`.

**`web/views/dashboard.ts`** — `planStatusCard`:
- `suspended`: banner vermelho com CTA de pagamento.
- `inTrial`: banner laranja "Teste grátis — N dias restantes".
- Plano pago: banner verde com data de renovação.

**Landing page** (`web/views/landing.ts`): botões de plano mostram "Testar 1 semana grátis".

---

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

**167 testes devem passar.** Qualquer alteração que quebre testes deve ser corrigida antes de fazer commit.

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
| 0010 | `0010_withdrawals.sql` | Tabela `withdrawal_requests` |
| 0011 | `0011_admin.sql` | Coluna `is_admin` em `profiles`; políticas RLS admin |
| 0012 | `0012_billing.sql` | Faturação: expiração 30d, `next_plan` carry-over; políticas |
| 0013 | `0013_sms.sql` | Tabela `sms_credits` |
| 0014 | `0014_discount_codes.sql` | Tabela `discount_codes` |
| 0015 | `0015_product_stock.sql` | Coluna `stock` em `products` |
| 0016 | `0016_reviews.sql` | Tabela `product_reviews` |
| 0017 | `0017_store_events.sql` | Tabela `store_events` (analytics) |
| 0018 | `0018_trial.sql` | Coluna `trial_ends_at` em `profiles`; função `account_active`; política `stores_public_read` atualizada |

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
- Servidor: `api/_shared.js` `createSupabase()` (com `SERVICE_ROLE_KEY`).
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

O routing migrou de hash (`#/...`) para History API. O `vercel.json` encaminha todas as rotas para `api/prerender` que devolve o `index.html` correto. Retrocompatibilidade com links antigos via `cleanPath()` que aceita o formato `#/x`.

### `innerHTML` + Templates

Os templates de loja renderizam HTML via `innerHTML`. Isto significa:
- `<script>` dentro de templates **não corre** (browser bloqueia por segurança).
- `<style>` dentro de templates **corre** (o browser processa estilos injetados).
- Classes Tailwind em innerHTML **não funcionam** se não forem processadas no build (o Tailwind analisa os ficheiros `.ts` mas não o HTML gerado em runtime). Usar CSS inline ou classes que existam na stylesheet compilada.

### Funções Serverless — Node.js Runtime (não Edge)

As funções em `api/` usam o runtime Node.js (não Edge Runtime) porque importam módulos CommonJS e o SDK do Supabase. O Edge Runtime seria mais rápido mas teria limitações de compatibilidade.

### Supabase Storage URLs

As URLs de imagens em Storage são públicas por design (sem autenticação). O isolamento é garantido por nomes de path únicos (ex.: `logos/<store_id>/<timestamp>.webp`). Não armazenar dados sensíveis em Storage.

### SMS — Envio Não Implementado

A infraestrutura de créditos SMS está completa (compra, saldo, BD). O envio real de SMS (para confirmar compras) **não está implementado** — falta escolher e integrar um provedor de SMS angolano.

### Domínio Próprio (Plano Profissional+)

A funcionalidade de "domínio próprio" está listada como feature do plano, mas a configuração técnica (DNS CNAME apontando para a Vercel) é manual e requer suporte ao cliente. Não há automação de DNS na plataforma.

---

## 30. Roadmap / Funcionalidades Não Implementadas

| Funcionalidade | Estado | Notas |
|---|---|---|
| Envio de SMS de confirmação | ❌ Não implementado | Infra pronta; falta provedor |
| Domínio próprio automático | ❌ Não implementado | Feature paga; configuração manual |
| Email transacional (confirmação, welcome) | ❌ Não implementado | Supabase Auth envia email de confirmação; resto manual |
| Verificação de email com template da marca | ❌ Não implementado | Requer SMTP próprio + template HTML com logo |
| App móvel | ❌ Não planeado | SPA responsiva; PWA possível |
| Integrações à medida (Empresarial) | ❌ Não implementado | Feature declarada no plano |
| Gestor dedicado (Empresarial) | ❌ Operacional, não técnico | |
| Cron de expiração de planos | ✅ Não necessário | RLS com `account_active()` trata tudo |
| Pesquisa dentro da loja | ✅ Implementado | `web/lib/search.ts` — busca por nome/categoria |
| Retentativas de webhook | ❌ Não implementado | Fire-and-forget; fallback manual "Já paguei" |

---

*Wiki gerada em 01/07/2026. Atualizar sempre que uma funcionalidade for adicionada, alterada ou removida.*

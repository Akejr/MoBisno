# SEO — Como funciona na MôBisno

> **Leia antes de mexer em `api/prerender.js`, `api/_seo.js`, `src/services/seo.ts`,
> `src/services/locations.ts`, `src/services/variations.ts`, `web/lib/seo.ts`, nos
> modelos de loja (`web/templates/`) ou no `vercel.json`.**
> Há aqui invariantes que, quando se quebram, tornam o site invisível no Google
> **sem que nenhum teste, build ou página falhe**. São descritas na secção 5.

Documento escrito em 2026-07-31, referente aos commits `1d4b436`, `6110cc6` e
`151f120`. Complementa a [WIKI.md](WIKI.md) §13, que descrevia o estado anterior.

---

## Índice

1. [Resumo](#1-resumo)
2. [O que estava mal](#2-o-que-estava-mal)
3. [Como funciona agora](#3-como-funciona-agora)
4. [Mapa de ficheiros](#4-mapa-de-ficheiros)
5. [Invariantes — o que não se pode partir](#5-invariantes--o-que-não-se-pode-partir)
6. [Verificar em produção](#6-verificar-em-produção)
7. [Pendente](#7-pendente)

---

## 1. Resumo

A plataforma e as lojas estavam praticamente invisíveis nos motores de busca.
Não era um problema de afinação — eram falhas estruturais que impediam o Google
de sequer ler o conteúdo ou descobrir as páginas.

Foram corrigidas cinco falhas de fundo (§2), acrescentado um diretório público
de lojas, completados os dados estruturados, os sitemaps e o `robots.txt`, e
reduzido o custo de renderização das fontes.

Estado: `tsc --noEmit` limpo, **197 testes verdes**, build de produção a passar,
tudo verificado em produção com pedidos reais.

---

## 2. O que estava mal

### 2.1 O HTML servido não tinha conteúdo nenhum

`api/prerender.js` injetava apenas meta tags no `<head>`. O `<body>` era
`<div id="app"></div>` — vazio.

O Google só executa o JavaScript de uma página numa **segunda passagem**, que
pode demorar dias e não é garantida para domínios sem autoridade. O Bing e os
crawlers sociais (WhatsApp, Facebook) **não executam JavaScript de todo**.

Sem texto no HTML, não há nada para indexar.

### 2.2 Todas as ligações internas eram fragmentos (`#/`)

Os nove modelos de loja geravam `href="#/loja/<id>/produto/<slug>"`.

O Google **descarta o fragmento** de uma URL — `#/loja/x/produto/y` e
`#/loja/x/categoria/z` são, para ele, a mesma página. Cada loja tinha portanto
**uma única página** aos olhos do rastreador, e nenhum produto ou categoria
tinha uma única ligação a apontar-lhe.

### 2.3 Soft-404 em massa

Loja inexistente, não publicada ou com a conta suspensa devolvia **HTTP 200**
com o `<title>` e o `<link rel="canonical">` do MôBisno. Resultado: centenas de
URLs distintas, todas a declarar `canonical` para `mobisno.store`.

Além disso, o próprio `mobisno.store` **não passava pelo prerender**: `/termos`,
`/privacidade` e `/politica` serviam o mesmo `<title>` e o mesmo `canonical` da
página inicial — eram duplicados dela no índice.

### 2.4 A raiz `/` nunca era pré-renderizada

Descoberto ao testar em produção, depois de já ter corrigido 2.1–2.3.

Na Vercel, os `rewrites` do `vercel.json` só são avaliados **depois** de
procurar um ficheiro estático. Como o build produzia `web/dist/index.html`, o
pedido a `/` era servido por esse ficheiro e a regra

```json
{ "source": "/", "destination": "/api/prerender" }
```

**nunca disparava**. As restantes rotas não correspondiam a ficheiro nenhum,
falhavam no sistema de ficheiros, e aí o rewrite aplicava-se.

Ou seja: a página inicial de cada loja — a mais importante — era a **única** que
nunca era pré-renderizada. Medido na mesma loja e no mesmo deployment:

| URL | Tamanho | Título |
|---|---|---|
| `/produto/masculino/camisa-real-madrid` | 9 175 b | `Camisa Real Madrid — Ekolo Sports` ✅ |
| `/categoria/masculino` | 11 546 b | `Masculino — Ekolo Sports \| Comprar em Angola` ✅ |
| `/` | 4 140 b | `MôBisno — Criar Loja Online em Angola` ❌ |

### 2.5 O conteúdo de SEO era mostrado ao visitante

Consequência da correção de 2.1: o bloco pré-renderizado era pintado no ecrã até
a SPA carregar o JavaScript (~138 KB comprimidos), consultar o Supabase e
substituir `#app`. Durante esses segundos, o visitante via uma página de texto
simples — parecia outro site a abrir antes da loja.

### 2.6 Outros problemas encontrados

| Problema | Consequência |
|---|---|
| `Product` sem `sku`, `itemCondition`, `priceValidUntil`, `seller`, portes | O Google não mostra preço nem disponibilidade no resultado |
| Sem `BreadcrumbList`, `ItemList`, `LocalBusiness` | Sem trilho no resultado; sem elegibilidade a resultados locais |
| Todas as categorias com a descrição da loja | Conteúdo duplicado entre categorias |
| URLs de categoria com `encodeURIComponent` | `/categoria/T%C3%A9nis%20de%20Corrida` |
| Sitemaps sem categorias nem imagens | Categorias nunca descobertas; produtos fora do separador Imagens |
| Cada loja num subdomínio novo, sem backlinks | Página órfã: não é descoberta nem recebe autoridade |
| 6 folhas de estilo de fontes bloqueantes, sem `preconnect` | LCP penalizado — é fator de posicionamento |

### 2.7 Dois defeitos reais apanhados pelo caminho

- **A montra ignorava `custom.seo.title` e `custom.seo.description`.** O servidor
  aplicava corretamente o título gerado por IA e o cliente sobrescrevia-o com o
  genérico. A funcionalidade estava a ser anulada em produção.
- **`formatKz` divergia entre servidor e browser.** O servidor usava
  `toLocaleString("pt-PT")`, cujo separador de milhares depende dos dados ICU do
  runtime: dava `45 000 Kz` no Node e `45.000,00 Kz` no browser.

---

## 3. Como funciona agora

### 3.1 Fluxo de um pedido

```
Pedido a https://<loja>.sualoja.digital/produto/<cat>/<slug>
   │
   ├─ Vercel: existe ficheiro estático? ──── sim ──▶ serve o ficheiro
   │                                                 (só /assets/*, /app.html…)
   └─ não → rewrite do vercel.json ──▶ api/prerender.js
                                          │
                                          ├─ resolve a loja (host ou /loja/<id>)
                                          ├─ lê loja, produtos, logótipo (Supabase)
                                          ├─ verifica se a conta está ativa
                                          ├─ monta <head>: title, canonical,
                                          │   Open Graph, Twitter, JSON-LD
                                          ├─ monta o conteúdo dentro de #app
                                          └─ devolve HTML completo
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        │                                                 │
                 Rastreador sem JS                                   Visitante
                 (Bing, WhatsApp,                                        │
                  1.ª passagem Google)                          vê o ecrã de
                        │                                        carregamento
                 lê o texto no HTML                                      │
                 (o CSS não é aplicado)                    JS carrega → Supabase
                                                            → SPA substitui #app
                                                            → loja real
```

### 3.2 O shell chama-se `app.html`, não `index.html`

`scripts/rename-shell.mjs` corre no fim de `npm run web:build` e renomeia
`web/dist/index.html` para `web/dist/app.html`.

Sem ficheiro em `/`, o pedido falha no sistema de ficheiros e o rewrite
aplica-se (ver §2.4). O `prerender.js` lê o shell de `/app.html`, e o
`robots.txt` bloqueia esse caminho para o shell vazio não ser indexado.

### 3.3 Conteúdo visível, com estilo próprio

O bloco `.mb-ssr` **é a página** que o visitante vê até a SPA arrancar. Tem
folha de estilo própria (cabeçalho com logótipo, grelha de produtos com fotos e
preços, rodapé), inlined pelo `ssrStyle()` de `api/_seo.js`.

**Isto esteve ao contrário e custou a indexação de todas as lojas.** Entre 31 de
julho e 4 de agosto de 2026, o `.mb-ssr` era recortado para 1×1 píxel
(`clip-path`) e no lugar dele aparecia um ecrã de carregamento (`.mb-boot`, 78vh
de logótipo e barra de progresso). O registo desta secção justificava-o com duas
premissas, **ambas falsas**:

1. *«os rastreadores leem o HTML em bruto, onde o CSS nem sequer é aplicado»* —
   o Googlebot **aplica CSS** e faz layout. Isso vale para rastreadores
   primitivos, não para quem decide a indexação.
2. *«usa-se recorte e não `display:none` porque `display:none` é
   desvalorizado»* — a distinção não existe do lado do Google. Recorte, 1×1
   píxel com `overflow:hidden`, `visibility:hidden` e `display:none` são todos
   **texto escondido** e levam o mesmo desconto.

O efeito era o pior possível: na primeira passagem o Google via uma página de
carregamento sem conteúdo, classificava o URL como sem valor e não o indexava —
em **todas** as lojas, porque o bloco é o mesmo. O sintoma em produção era
«o URL entra na fila e nunca indexa». Depender da segunda passagem (a que
executa JavaScript) é exatamente aquilo que a pré-renderização existe para
evitar.

O custo que o esconderijo evitava era real — por instantes vê-se uma versão mais
simples da loja antes da SPA assumir. A resposta certa é a folha de estilo, não
o esconderijo. **Nunca voltar a esconder este bloco**, por nenhuma técnica;
`tests/seoInfra.test.ts` guarda-o.

### 3.4 Descoberta de lojas novas

Uma loja publicada é descoberta automaticamente por três vias, todas geradas a
partir da base de dados a cada pedido (não há lista fixa para atualizar):

| Via | Latência |
|---|---|
| Diretório `mobisno.store/lojas` — ligação real que o Google segue | ~10 min (cache) |
| Índice `www.sualoja.digital/sitemap.xml` → sitemap de cada loja | ~1 h (cache) |
| `robots.txt` da loja → sitemap dela | imediato |

O diretório é o mecanismo mais forte: dá a cada loja uma **ligação seguida** a
partir de um domínio já indexado, resolvendo o problema do subdomínio órfão.

**Descoberta é automática; indexação nunca é.** O Google decide se inclui a
página. Para um subdomínio novo, sem autoridade, conte com 1 a 4 semanas. Pode
acelerar com *Inspeção de URL → Pedir indexação* no Search Console, o que exige
uma propriedade de **Domínio** para `sualoja.digital` (verificação por DNS) —
uma propriedade de prefixo de URL não cobre os subdomínios.

### 3.5 Códigos HTTP

| Situação | Código | Indexação |
|---|---|---|
| Loja publicada e ativa | 200 | `index, follow, max-image-preview:large` |
| Loja inexistente ou não publicada | **404** | `noindex` |
| Conta suspensa (teste terminou, sem plano) | **410** | `noindex` |
| Carrinho e checkout | 200 | `noindex` |
| Caminho privado da plataforma (`/painel`, `/login`…) | 200 | `noindex`, canónico próprio |
| Shell indisponível (falha interna) | **503** `no-store` | — |

### 3.6 Dados estruturados por página

| Página | JSON-LD |
|---|---|
| Início da loja | `OnlineStore` (+ `PostalAddress`/`GeoCoordinates` se o dono definiu morada), `WebSite`, `CollectionPage` + `ItemList` |
| Produto | `Product` + `Offer` (sku, itemCondition, priceValidUntil, seller, portes, avaliações), `BreadcrumbList` |
| Categoria | `CollectionPage` + `ItemList`, `BreadcrumbList` |
| `mobisno.store/` | `Organization`, `WebSite`, `FAQPage` |
| `/lojas` | `CollectionPage` + `ItemList`, `BreadcrumbList` |

**Regra que não se negoceia:** portes, política de devolução e avaliações só são
emitidos quando existem **dados reais**. Declarar ao Google o que a loja não
oferece é motivo de penalização. Os portes vêm de `customization.delivery`
(configurado pelo dono); as avaliações de `product_reviews`.

---

## 4. Mapa de ficheiros

### Criados

| Ficheiro | Papel |
|---|---|
| `api/_seo.js` | SEO partilhado pelas funções serverless: títulos, descrições, JSON-LD, meta tags e o **HTML do conteúdo**. Espelha `src/services/seo.ts` e `src/services/slug.ts` |
| `src/services/slug.ts` | Slugs de URL (domínio puro). Fonte de verdade |
| `src/services/format.ts` | `formatKz` (domínio puro). Era `web/lib/dom.ts`, que depende do DOM e não podia ser partilhado |
| `web/views/directory.ts` | Diretório público de lojas (`/lojas`) |
| `scripts/rename-shell.mjs` | Renomeia `index.html` → `app.html` no fim do build (ver §3.2) |
| `tests/seoInfra.test.ts` | Guardas das invariantes da §5 |

### Reescritos

| Ficheiro | O que mudou |
|---|---|
| `api/prerender.js` | SSR real; plataforma e `/loja/<id>`; códigos HTTP corretos; diretório; cache do shell por instância com validação da resposta |
| `api/sitemap.js` | Categorias, `/categoria/produtos`, `lastmod`, `changefreq`, `priority` e extensão de imagem |
| `api/robots.js` | Regras por host, `/app.html`, parâmetros de ordenação, `crawl-delay` para bots agressivos |
| `src/services/seo.ts` | `categoryTitle`, `categoryDescription`, `breadcrumbJsonLd`, `collectionJsonLd`, `storeWebsiteJsonLd`, `faqJsonLd`; `productJsonLd` e `storeJsonLd` completos |

### Alterados

- **`web/lib/routing.ts`** — `storeBasePath()` e `storeHomePath()`: caminhos
  reais em vez de fragmentos.
- **11 modelos e componentes** (`beauty`, `desportivo`, `foodmart`, `galeria`,
  `lumiere`, `neonlab`, `headers`, `footers`, `productPage`, `registry`,
  `sectionsModel`) — todas as ligações passaram a caminhos reais. (`foodmart` e
  `neonlab` saíram depois do `TEMPLATE_REGISTRY`: os ficheiros continuam no
  repositório, mas nenhuma loja nova os pode escolher.)
- **`web/lib/`** — `cartDrawer.ts`, `search.ts`, `foodmartCarousel.ts` (os
  parsers de href dependiam do formato `#/loja/...`); `seo.ts`
  (`shippingFromCustom`, `addressFromCustom`, `og:image:alt`); `slug.ts`,
  `dom.ts` (passam a reexportar de `src/`).
- **`web/views/`** — `storefront.ts`, `product.ts`, `category.ts`, `cart.ts`,
  `checkout.ts`, `landing.ts`, `legal.ts`.
- **`web/index.html`** — seis folhas de fontes bloqueantes passaram a **um**
  pedido não bloqueante, com `preconnect`.
- **`package.json`** — `web:build` passa a correr `scripts/rename-shell.mjs`.

---

## 5. Invariantes — o que não se pode partir

Estas cinco regras não produzem erro nenhum quando são violadas: o build passa,
os tipos passam, a página abre. Só o tráfego desaparece. Por isso há testes a
guardá-las em `tests/seoInfra.test.ts` (5.1 a 5.4) e em `tests/seo.test.ts`
(5.5).

### 5.1 Nenhuma ligação interna de página pública pode usar `#`

O Google descarta o fragmento. Uma ligação `#/loja/x/produto/y` não é seguida
nem indexada — o produto fica sem uma única ligação a apontar-lhe.

Use sempre `storeBasePath(identifier)` (vazio em subdomínio, `/loja/<id>` no
domínio principal) e `storeHomePath(identifier)`.

O alcance da regra são as **páginas públicas**: `web/templates/` (todos os
modelos e componentes) e as cinco vistas públicas de loja — `storefront.ts`,
`product.ts`, `category.ts`, `cart.ts`, `checkout.ts`. Fora delas o `#` continua
a ser o esquema de rotas legítimo da aplicação **privada** (`dashboard.ts`,
`adminPanel.ts`, `login.ts`, `landing.ts`, `wizard.ts`, `presetGallery.ts`,
`editor.ts`), que não é indexada: `href="#/painel"` e
`#/adminPainel/levantamentos` (ver `ADMIN_HREFS` em
`src/services/adminMetrics.ts`) estão corretos. A lista das vistas públicas está
em `PUBLIC_STORE_VIEWS`, no teste — uma vista pública nova de loja tem de ser
acrescentada lá, senão fica sem guarda.

> Guardado por: *"nenhum modelo de loja gera ligações com fragmento"* e *"as
> vistas públicas também não geram ligações com fragmento"*.

### 5.2 `api/_seo.js` tem de concordar com `src/services/`

As funções serverless correm em JavaScript puro, sem passo de compilação, por
isso a lógica está **duplicada**. Se divergirem, o HTML servido ao Google e a
página que o utilizador vê passam a mostrar URLs ou preços diferentes — e o
Google vê duas páginas onde só existe uma.

Ao alterar slugs, títulos, descrições ou formatação de preços, **alterar nos
dois sítios**.

Além dessas, há **duas paridades obrigatórias** acrescentadas depois, ambas com
conteúdo visível no HTML servido:

| Paridade | Domínio | Espelho em `api/_seo.js` |
|---|---|---|
| **Localizações** — cascata de `resolveLocations` (lista `places[]` → localização única legada → morada do rodapé) e URL de `mapEmbedSrc` | `src/services/locations.ts` | `resolveLocations`, `mapEmbedSrc`, `locationsHtml` |
| **Texto das Variação** — uma linha por eixo, `nome: valor, valor`, unidas por `\n` | `src/services/variations.ts` (`variationsPlainText`, `normalizeVariations`) | `variationsPlainText`, `productVariationsOf` |

Se a cascata das localizações divergir, o mapa do HTML pré-renderizado aponta
para um sítio diferente do que a SPA mostra; se o texto das Variação divergir, o
rastreador deixa de ver que o Produto existe em várias versões (é a única forma
de o ver — os seletores são montados pela SPA).

> Guardado por: testes de paridade de `slugify`, `productSlugPath`, `formatKz`,
> títulos e descrições, mais *"paridade das localizações entre api/_seo.js e
> src/services/locations.ts"* e *"paridade das Variação entre api/_seo.js e
> src/services/variations.ts"*, todos em `tests/seoInfra.test.ts`.

### 5.3 Não pode existir `index.html` na raiz do output

Se voltar a existir, a Vercel serve-o em `/` e o prerender deixa de correr na
página inicial de todas as lojas (§2.4). O `scripts/rename-shell.mjs` garante
isto — não o remova do `web:build`.

### 5.4 O bloco `.mb-ssr` tem de continuar no HTML, e VISÍVEL

Se for removido, os rastreadores sem JavaScript deixam de ver conteúdo. Se for
escondido — por recorte, 1×1 píxel, `display:none`, `visibility` ou opacidade —
o Google trata-o como texto escondido, vê uma página vazia e não indexa. Foi o
que aconteceu (§3.3).

> Guardado por: *"o texto que posiciona a loja continua no HTML servido"*, *"o
> conteudo pre-renderizado esta VISIVEL para quem visita"*, *"nao ha ecra de
> carregamento a tapar o conteudo"* e *"o conteudo vem com estilo proprio"*.

### 5.5 Só declarar em JSON-LD o que existe de facto

Portes, devoluções e avaliações inventados são motivo de penalização. Os campos
opcionais só são emitidos quando há dados reais.

> Guardado por: *"portes só entram no schema quando a loja os configurou"* e
> *"avaliações só entram quando há avaliações reais"*, em `tests/seo.test.ts`.

---

## 6. Verificar em produção

O teste decisivo é ver o conteúdo **sem executar JavaScript** — é assim que o
rastreador vê a página.

```bash
curl -s https://SUALOJA.sualoja.digital/ | grep -o "<title>[^<]*</title>"
```

Se o título trouxer o nome da loja (e não "MôBisno — Criar Loja Online"), o
prerender está a funcionar.

```bash
curl -s https://SUALOJA.sualoja.digital/ | grep -o 'href="/produto/[^"]*"' | sort -u
```

Deve listar as ligações dos produtos. Se vier vazio, a §5.1 foi violada.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://naoexiste-xyz.sualoja.digital/
```

Deve devolver `404`. Se devolver `200`, os soft-404 voltaram.

Ferramentas: [Teste de Resultados Enriquecidos](https://search.google.com/test/rich-results)
para o JSON-LD e [PageSpeed Insights](https://pagespeed.web.dev/) para o LCP.
No Search Console, *Inspeção de URL → Ver página rastreada → HTML* mostra
exatamente o que o Google recebeu.

---

## 7. Pendente

### 7.1 `mobisno.store` e `sualoja.digital` redirecionam para `www`

Ambos os apex devolvem **308** para a variante `www`, mas o código (e a
[WIKI.md](WIKI.md)) assume o apex: `PLATFORM_APEX = "mobisno.store"`,
`STORE_APEX = "sualoja.digital"`. Todos os `canonical` apontam para URLs que
redirecionam. O Google segue, mas é sinal diluído.

**Ação:** no painel da Vercel → Domains, tornar o apex primário (com `www` a
redirecionar para ele). Alinha tudo com o que o código já diz.

Enquanto não estiver feito, o sitemap a submeter no Search Console é
`https://www.sualoja.digital/sitemap.xml` — o apex devolve um redirecionamento.

### 7.2 As lojas-modelo estão a ser indexadas

Das lojas publicadas, várias são demos de modelos (`modelo-lumi-re-chic`, do
modelo `lumiere`, e `modelo-ekolo-sports` — ou `modelo-vermelho-moderno` nas
lojas-modelo semeadas antes da renomeação para «Ekolo Sports»; o identificador
não muda quando o nome muda). Aparecem no diretório e no índice de sitemaps como
se fossem lojas reais.

É mau por dois motivos: são conteúdo fino e quase duplicado entre si, e diluem o
diretório que existe precisamente para dar autoridade às lojas dos clientes.

O código já sabe distingui-las — a marca `customization.__template` é usada em
`web/views/checkout.ts`. Falta excluí-las de `/lojas`, do índice de sitemaps e
da indexação, mantendo-as acessíveis a quem quer ver o modelo.

### 7.3 O scope `seotitle` e o `/api/logo` estão de pé

Esta secção descrevia os dois como avariados. Não estão, e o registo fica aqui
corrigido para não induzir em erro quem o seguir.

`web/lib/seoGen.ts` envia `scope: "seotitle"` a `/api/assistant`, e esse scope
existe no `api/assistant.js`: `SYSTEM_SEOTITLE` está definido e `seotitle` é uma
das cinco entradas do mapa `PROMPTS`, ao lado de `editor`, `site`, `seo` e
`logo`. O pedido cai no prompt certo e o título SEO da loja gerado por IA sai
com as regras desse scope (3 a 6 palavras, até 45 caracteres, sem o nome da
loja).

O mesmo vale para `/api/logo`: o `api/logo.js` existe e pede cinco propostas em
paralelo, uma por direção de arte, devolvendo em PNG com fundo transparente as
que conseguiu gerar. É esse o endpoint que `web/lib/logoApi.ts` chama a partir
do wizard e do dashboard.

Fica a cautela que deu origem à secção: nem o scope enviado no corpo do pedido
nem o caminho do endpoint são apanhados pelo `tsc` — são chamadas HTTP em tempo
de execução. Uma divergência entre o cliente e a função serverless só se
descobre a ler a fonte dos dois lados.

---

## Histórico

| Commit | Conteúdo |
|---|---|
| `1d4b436` | SSR real, ligações indexáveis, dados estruturados, diretório, sitemaps, fontes (37 ficheiros) |
| `6110cc6` | A raiz `/` passa a ser pré-renderizada (`index.html` tapava o rewrite) |
| `151f120` | Bloco pré-renderizado escondido do visitante; ecrã de carregamento com a marca. **Revertido** — foi o que impediu a indexação de todas as lojas (§3.3) |

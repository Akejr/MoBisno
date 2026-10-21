# Guia de Reprodução de Modelos — MôBisno

> **LÊ ESTE FICHEIRO SEMPRE que o utilizador enviar um modelo novo** (uma pasta
> com `code.html` + `screen.png` de cada ecrã, ou um design de referência).
> O objetivo é reproduzir o modelo a **100%** e mantê-lo **totalmente editável**
> e **consistente** em todo o site, integrado no sistema existente — sem inventar
> componentes novos nem quebrar o que já funciona.

---

## 0. Regras de ouro (não negociáveis)

1. **Fidelidade 100% ao design enviado.** Tipografia (famílias, pesos, tracking),
   estilo das bordas (quadrado vs. arredondado), cores, superfícies/fundos,
   sombras, espaçamentos e **estrutura de cada ecrã**. Se o modelo tem mapa real,
   testemunhos, avaliações na página de produto — replica tudo.
2. **Consistência de UI em TODO o site.** O mesmo tipo de letra, bordas e cores
   propagam-se a **header, hero, produtos, página de produto, categoria, carrinho,
   checkout e rodapé**. Nada pode "mudar de cara" ao navegar (ex.: botão redondo
   no carrinho quando o resto é reto = ERRADO).
3. **Nunca criar componentes novos "à parte" sem pedir.** Adapta **sempre** o
   sistema funcional existente à UI do modelo (ex.: avaliações reais dentro do
   visual do modelo; pesquisa que abre no header; carrinho; checkout).
4. **Liga aos dados reais e mantém os hooks** (`data-edit-*`, `data-cart-link`,
   `data-add-cart`, `data-search-btn`, etc.) — senão o editor e o carrinho param.
5. **Idioma pt-PT / pt-AO** em todo o texto visível e comentários. Nunca pt-BR.
6. **Cores:** a plataforma usa `#F95901` (`ACCENT`, só na UI do editor/admin). As
   **lojas** usam sempre `var(--brand)` (cor de marca editável) e
   `var(--brand-ink)` (tinta legível calculada por contraste).
7. **Editabilidade TOTAL (não negociável).** Em qualquer secção do modelo, **TUDO
   o que é conteúdo tem de ser editável pelo dono**: textos, **cores** (de cartões,
   etiquetas/badges e ícones), **ícones**, e **botões** (texto, ícone e destino).
   Nenhum texto/cor/ícone/botão pode ficar "chumbado" no código. Ver §6.1.
8. **Não fazer commit/push** até o utilizador mandar.
9. **Validar sempre** no fim: `npm run build`, `npm run web:build`, `npx vitest run`.

---

## 1. Comandos e validação

| Comando | O que faz |
|---|---|
| `npm run web:build` | Compila a SPA (`web/`) com Vite. Valida o HTML/TS dos modelos. |
| `npm run build` | `tsc --noEmit` — valida tipos em `src/` + `web/` + `tests/`. |
| `npx vitest run` | Corre a suite de testes (deve manter-se 100% verde). |
| `get_diagnostics` | Verifica erros/lint de ficheiros específicos após editar. |

Fluxo recomendado: editar → `get_diagnostics` nos ficheiros tocados →
`npm run build` → `npm run web:build` → `npx vitest run`.

---

## 2. Arquitetura (onde vive cada coisa)

- **SPA** em `web/` (TypeScript vanilla + Vite). Domínio/serviços/testes em `src/`.
- **Supabase** (browser + RLS + Auth). Funções serverless em `api/` (Vercel).
- **Modelos de loja:** `web/templates/`
  - `types.ts` — **contrato** `StoreTemplate` + **`StoreCustomization`** (todas as
    opções editáveis, guardadas em JSON na coluna `customization`).
  - `registry.ts` — lista `TEMPLATE_REGISTRY` + `getTemplate` + `templateOptions`.
  - `<modelo>.ts` — um ficheiro por modelo, que exporta um `StoreTemplate`. Os
    modelos prontos registados são cinco:

    | Ficheiro | `id` | Modelo |
    |---|---|---|
    | `desportivo.ts` | `desportivo` | Desportivo (o primeiro: serve qualquer id desconhecido) |
    | `beauty.ts` | `beauty` | Beauty |
    | `galeria.ts` | `galeria` | Galeria |
    | `lumiere.ts` | `lumiere` | Lumière Chic |
    | `techEssentials.ts` | `tech-essentials` | Tech Essentials |

    O registo tem ainda três entradas genéricas não prontas (`boutique-elegante`,
    `tech-dinamico`, `sabor-artesanal`), desenhadas por `renderDefault`.
  - Partilhados: `headers.ts`, `heroes.ts`, `footers.ts`, `blocks.ts`,
    `sectionRules.ts`, `productPage.ts`, `productGrid.ts`, `checkoutLayouts.ts`,
    `sectionsModel.ts`, `categoryFilter.ts`, `gallery.ts`, `variationPicker.ts`,
    `perks.ts`, `shared.ts`.
  - Um modelo que sai do registo sai também do repositório (desenho e
    comportamento). Uma loja gravada com um `template_id` que já não está
    registado é servida pelo primeiro modelo (`desportivo`), pelo fallback de
    `getTemplate`; `tests/registry.test.ts` guarda que nenhum módulo de desenho
    fica no disco sem estar registado.
- **Comportamento (JS na loja publicada):** `web/lib/`
  - `cartDrawer.ts` (carrinho), `search.ts` (pesquisa no header),
    `sections.ts` ("ver mais"), `testimonialsCarousel.ts`, `particlesHero.ts`,
    `mapPicker.ts` (Leaflet), `cart.ts` (estado do carrinho, chaveado por linha
    — ver §9.1), `productForm.ts` (formulário de produto),
    `theme.ts` (tema global), `iconColor.ts`, `fieldColors.ts`, `brand.ts`
    (`readableInk`, `brandOf`), `ink.ts`, `imageCompress.ts`, `slug.ts`, `dom.ts`.
- **Editor visual:** `web/views/editor.ts` (edição no preview, ligações `data-*`).
- **Modelos prontos (admin):** `web/supabase/models.ts`, secção "Modelos" em
  `web/views/adminPanel.ts`. Personalização: `web/supabase/customization.ts`.
- **Renderer de dados:** `src/storefront/storeRenderer.ts` → `StoreRenderView`
  (com `products: StoreProductView[]`, cada um com `id`, `name`, `price`,
  `imageUrl`, `category`, `description`, `featured`).

### Contrato de um modelo (`StoreTemplate`)
```ts
{
  id, name, previewUrl, ready?, defaultBrand?,
  sections?,                            // o que o editor precisa de saber das secções — §9.3
  render(view, custom),                 // home
  renderProduct?(view, product, custom),// página de produto
  renderCategory?(view, category, custom),
  renderCheckout?(view, innerHtml, custom), // cromo à volta do checkout
}
```

---

## 3. Loja publicada vs. pré-renderização (MUITO IMPORTANTE)

- Na **SPA** (utilizador real), o **JavaScript corre**: carrinho, pesquisa,
  "ver mais", carrosséis, etc. funcionam via `mount*` em `web/main.ts`.
- No **HTML pré-renderizado** (`api/prerender.js`, para SEO/crawlers) **não corre
  JS** — só CSS. Por isso, tudo o que tem de funcionar sem JS usa **padrões
  só-CSS**:
  - **Menu mobile:** `mobileMenuParts` (checkbox + `:checked` + CSS).
  - **Galeria de produto:** `gallery.ts` (radios + labels + regras CSS por índice).
  - **Dropdown de categorias:** `group-hover` (CSS).

> Regra prática: se um comportamento precisa de existir também sem JS, faz por
> CSS (como os exemplos acima). Se é enriquecimento (ex.: filtrar pesquisa), pode
> ser JS montado na SPA.

---

## 4. Sistema de consistência (tema, marca, ícones, cores por-campo)

- **Tema global** (`web/lib/theme.ts`): estilos `moderno` | `classico` | `minimal`
  | `editorial`. Define `--mb-radius`, `--mb-head-font`, `--mb-body-font` via
  `[data-theme]`. Arredonda `.rounded*` (exceto `.rounded-full`). O `editorial`
  = Playfair Display (títulos) + Montserrat (corpo) + cantos 0.125rem.
- **Marca:** `var(--brand)` (cor editável) e `var(--brand-ink)` (tinta legível,
  `readableInk` por luminância WCAG). **Botões de marca** usam sempre
  `style="background:var(--brand);color:var(--brand-ink,#fff)"`.
- **Cor dos ícones:** `web/lib/iconColor.ts` (`applyIconColor`) — `colors.icon`.
- **Cor de texto por-campo** (isolada): `web/lib/fieldColors.ts` — `fieldColors`
  keyed pelo `data-edit` (ex.: `{"hero.title":"#DF0B26"}`), aplicada com
  `!important` inclusive no preview.
- Protege os ícones do modelo: `.material-symbols-outlined{font-family:'Material
  Symbols Outlined' !important}` (evita que uma regra de fonte global os quebre —
  bug já visto no Lumière).

---

## 5. Cabeçalho FIXO (igual em todos os modelos)

A navegação do header é **fixa e não editável** em todos os modelos:
**Início** (`homeHref`), **Produtos** (`allProductsHref(view)` — a página de
listagem com todos os produtos, num caminho real; ver §6) e **Categorias**
(dropdown das categorias existentes, só aparece se houver categorias).

`#produtos` não é a ligação «Produtos»: é o `id` do `<main>` da home e o destino
por omissão do botão principal do hero (`hero.ctaTarget` vazio), que só faz
scroll até aos produtos.

- Partilhado em `headers.ts` (`menuLinks`, `mobileMenuParts`, `renderHeader`).
- Cada modelo com header próprio replica esta navegação fixa (ver `lumiere.ts`
  `headerHtml`). **Não** pôr `data-edit-menu`/`data-edit-menu-item` (o menu deixou
  de ser editável).
- Ícones do header: `data-search-btn` (pesquisa) + `data-cart-link` com
  `data-cart-count`.

---

## 6. Hooks obrigatórios por ecrã (para editor + carrinho + pesquisa)

**Textos editáveis inline:** qualquer elemento com `data-edit="caminho.no.custom"`
fica contenteditable no editor e escreve em `custom` por esse caminho (ver
`setPath`). Ex.: `data-edit="hero.title"`, `data-edit="footer.about"`.

**Cabeçalho**
- `data-edit-logo` no link do logótipo (trocar imagem + tamanho).
- `data-search-btn` no botão de pesquisa. **A pesquisa abre um campo DENTRO do
  header** (`web/lib/search.ts`) e mostra resultados num painel abaixo — mantém a
  UI do modelo. Não criar overlays "à parte".
- `data-cart-link` + `data-cart-count` no ícone do carrinho.
- `data-categories-menu` no dropdown de categorias (CSS `group-hover`).

**Hero**
- `data-edit="hero.title"`, `hero.subtitle`, `hero.ctaLabel`.
- `data-edit-hero` no contentor da imagem (trocar imagem).
- `data-hero-cta` no botão principal do hero — o editor liga um seletor de
  **destino** (categoria ou secção de produtos → `custom.hero.ctaTarget`).

**Produtos (home)**
- `data-edit-sections` (contentor) › `data-edit-section="i"` (secção) ›
  `data-edit-section-head` (cabeçalho) › `data-edit-products` (grelha) com
  `data-edit-product="<id>"` em cada cartão. Secções vêm de `resolveSections`
  (`sectionsModel.ts`); tokens `__all__` / `__featured__`.
- "Ver mais": `data-load-more data-step="N"` (ligado por `sections.ts`).

**Menu "Produtos" → página de todos os produtos**
- O link **"Produtos"** do cabeçalho/rodapé usa sempre **`allProductsHref(view)`**
  (`sectionsModel.ts`), que abre a página de listagem com **todos** os produtos
  num **caminho real** (`/categoria/produtos` em subdomínio de loja,
  `/loja/<id>/categoria/produtos` no domínio principal) — nunca `#/`, ver
  `SEO.md` §5.1. Não usar `#produtos` (isso só faz scroll na home).
  `filterForCategoryPage` trata `"Produtos"`/`"Todos"` como todos.
- A página de categoria/listagem tem uma **barra de filtros por categoria** que
  filtra **na mesma página** — ver §9.2. A **ordenação** continua a ser injetada
  por `category.ts` (`mountListingSort`) e funciona em qualquer modelo desde que
  os cartões tenham **`data-edit-product`** e estejam numa grelha comum.

**Página de produto**
- Imagem/galeria: usar **`productGalleryHtml`** de `gallery.ts` (ver §9).
- `data-qty` / `data-qty-dec` / `data-qty-inc` (quantidade).
- `data-add-cart="<id>"` (adicionar ao carrinho).
- `data-edit-whatsapp` (botão WhatsApp).
- `data-edit-perks` › itens `data-edit-perk-item` com ícone + `data-perk-text`
  (garantias; ícones pré-definidos escolhíveis no editor).

**Blocos de conteúdo adicionais** (partilhados, `blocks.ts`)
- `data-edit-blocks` › `data-edit-block="i"` com `data-block-type` e
  `data-block-variant` (a variante que a secção **de facto** desenhou — é daí
  que o editor a lê). Tipos: `info`, `text`, `testimonials`, `location`.
  `info` e `text` suportam **cor de fundo** (`bg`) escolhida entre as cores que o
  modelo declara (`sections.backgrounds`, §9.3).

**Checkout**
- `renderCheckout(view, innerHtml, custom)` envolve o conteúdo do checkout com o
  cromo do modelo (header/rodapé/tema). No editor, a troca de modelo do checkout
  está **desativada** (gated por `structuralEditing`).

**Rodapé**
- `data-edit-footer-logo`, `data-edit="footer.about|location|phone|email"`.

---

## 6.1 Editabilidade TOTAL — obrigatória em TODAS as secções

> Regra de ouro nº7. Ao criar/rever um modelo, **percorre cada secção** (hero,
> banners, cartões de anúncio, categorias, produtos, faixas promo, garantias/
> benefícios, blocos, rodapé) e garante que **cada elemento visível é editável**.
> Se um elemento não é editável, **não está pronto**.

**O que TEM de ser editável em cada elemento:**

| Elemento | Como o tornar editável |
|---|---|
| **Texto** (títulos, subtítulos, etiquetas, rótulos de botão, telefone de apoio, etc.) | `data-edit="hero.ctaLabel"`, `data-edit="techEssentials.brands.0.name"` — fica contenteditable e escreve em `custom` via `setPath`. Fica também colorível por campo (`fieldColors`). **Inclui o telefone/apoio do header.** |
| **Imagem** (logótipo, hero, foto de bloco, logótipo de marca) | Um gancho `data-edit-*` no contentor (ex.: `data-edit-hero`, `data-edit-block-image="i"`, `data-tx-brand="i"`) + overlay «Trocar» no editor que abre o `input` de ficheiro. |
| **Cor de fundo de uma secção** | `blocks[i].bg`, escolhida entre as cores que o **modelo declara** (`sections.backgrounds`, §9.3). |
| **Cor de texto/ícones** | As cores globais (`colors.primary`, `colors.text`, `colors.icon`) e a cor por campo (`fieldColors`). Toda a cor do Dono passa por `safeCssColor` antes de entrar em CSS. |
| **Ícone** | Campo próprio + **picker de ícones** com uma lista fechada (ex.: `PERK_ICON_CHOICES` nas garantias). |
| **Botão (CTA)** | Texto (`data-edit …ctaLabel`) **+** destino (categoria ou «Secção de produtos», ex.: `hero.ctaTarget` pelo gancho `data-hero-cta`). |

**Padrão de implementação no editor** (`web/views/editor.ts`) — **declara no
modelo, nunca `if (templateId === …)` no editor**:
- Marca cada zona editável no template com um `data-*` âncora próprio do modelo
  (ex.: `data-tx-slot="brands"` e `data-tx-brand="i"` no Tech Essentials,
  `data-lumiere-slot` no Lumière). O editor liga os controlos **porque encontra a
  âncora no HTML** (`mountTechEssentialsSections`, `mountLumiereSections`), não
  porque compara o identificador do modelo.
- Tudo o que muda de modelo para modelo e não é uma âncora — que secções se
  acrescentam, com que variante e desenho, que cores de fundo, o que se
  materializa — é declarado em `StoreTemplate.sections` e lido por
  `sectionRules.ts` (§9.3). Uma comparação com `store.templateId` no editor deixa
  de disparar em silêncio no dia em que o modelo muda de nome ou sai do registo;
  `tests/sectionDesign.test.ts` falha se aparecer uma.
- Secções removíveis usam os mesmos dois botões (`addRemoveBtn` /
  `addSlotAddBtn`), partilhados por todos os modelos (§7).
- Os textos usam sempre `data-edit` (ficam editáveis e coloríveis por `fieldColors`).

**Materialização de defaults:** se uma secção usa um **array com fallback** (ex.:
as quatro marcas do Tech Essentials), o array tem de existir em `custom` **no
arranque do editor** (antes da baseline `savedJson`) — senão, editar um item via
`setPath` cria um objeto `{0:…}` sem `.length` e o template volta aos defaults,
perdendo a edição. O modelo declara-o em `sections.materialize` (ex.:
`materializeBrands` em `techEssentials.ts`, que escreve o resultado da mesma
função que desenha a faixa) e o editor chama-o por `materializeForEditing`. Os
blocos de localização têm a sua, partilhada (`materializeBlockPlaces`). A regra:
escreve-se **exactamente o que a loja já mostra** — abrir o editor não pode
mudar o aspeto nem marcar alterações.

**Destino de botões:** todo o botão/CTA leva para uma **categoria** ou para a
**secção de produtos** (`#produtos`), e o editor oferece um seletor com as
categorias + «Secção de produtos».

---

## 7. Secções removíveis (exceto produtos)

O dono pode **apagar qualquer secção exceto a de produtos**. Para secções
próprias do modelo (ex.: testemunhos, mapa/lojas no Lumière), envolve cada uma
num **slot** que fica vazio quando removida:

```html
<div data-lumiere-slot="testimonials">${hide ? "" : testimonialSection(custom)}</div>
```

No editor (`web/views/editor.ts`), o slot ganha o botão «Remover secção»
(`addRemoveBtn`); quando vazio, mostra um botão «Adicionar …» no lugar onde a
secção estava (`addSlotAddBtn`) — «Adicionar secção de testemunhos» e
«Adicionar secção de lojas (mapa)» no Lumière (`mountLumiereSections`),
«Adicionar faixa de marcas» no Tech Essentials (`mountTechEssentialsSections`).
A flag vive em `custom.<modelo>.hide<Seccao>`. **A secção de produtos nunca é
removível.**

### Menu «Adicionar secção»
O que o menu oferece sai **da declaração do modelo** (`sections.native` /
`sections.allowed`, §9.3), por `sectionMenu` — nunca de um `if` por
`templateId` no editor.

- **«Secção de produtos»** aparece sempre.
- Depois, as secções que o modelo aceita, **menos as que já traz** (`native`):
  «Informação com foto», «Título e texto», «Testemunhos», «Localização».
- **Modelo pronto (`__locked`):** ficam só as de conteúdo simples — «Informação
  com foto» e «Título e texto». «Testemunhos» e «Localização» não aparecem.
- Quando o modelo traz secções nativas, o menu termina com uma nota a dizê-lo
  (ex.: no Lumière, «Testemunhos e Localização já fazem parte deste modelo —
  edite-os na própria secção.»).

### Cor de fundo das secções
Nas secções de conteúdo `info`/`text` há um seletor «Cor de fundo»: «Padrão»
(sem fundo), «Branco» e as cores que o **modelo declara**
(`sections.backgrounds`, lidas por `sectionBackgrounds`) — as que ele já usa. Um
modelo que não declare recebe uma cor clara genérica, nunca a de outro modelo.
Guardado em `blocks[i].bg` e aplicado em `blocks.ts` (`bgStyle`, depois de
`safeCssColor`).

---

## 8. Mapa com pins das lojas

**Uma só função de mapa em toda a plataforma: `mapEmbedSrc`**, em
`src/services/locations.ts` (era `boutiqueMapSrc`, privada do `lumiere.ts`).
Por coordenadas usa OpenStreetMap embed (caixa de enquadramento de ±0,008° em
torno do ponto + `marker=lat,lng`); só com morada usa Google embed pela pesquisa
da morada (`z=15`). Sem morada nem coordenadas cai em `"Luanda, Angola"`.
Funciona sem API key.

É partilhada por dois consumidores, com a **mesma forma de dados** —
`{ name?, address?, lat?, lng? }` — precisamente para não haver duas lógicas de
mapa:

| Consumidor | Onde vivem os dados |
|---|---|
| Bloco de conteúdo `location` (genérico, `blocks.ts`) | `custom.blocks[i].places: { name?, address?, lat?, lng? }[]` |
| Boutiques do Lumière (`lumiere.ts`) | `custom.lumiere.boutiques: { name?, address?, lat?, lng? }[]` |

### Bloco `location` — várias localizações

A variante `location` de `ContentBlock` (`types.ts`) ganhou `places[]`, e mantém
`address`/`lat`/`lng` no próprio bloco como **formato legado de localização
única** — é assim que todas as lojas em produção estão gravadas. Quem desenha
não escolhe entre os dois: chama `resolveLocations(block, footerLocation)` de
`src/services/locations.ts`, que resolve a cascata

1. `places[]` com pelo menos uma entrada aproveitável;
2. `address`/`lat`/`lng` do próprio bloco (legado);
3. morada do rodapé (`footer.location`);

e devolve **sempre pelo menos uma entrada**, para se poder iterar sem casos
especiais. Cada localização leva o seu `iframe` (`mapEmbedSrc`), o seu nome e a
sua morada. Os `iframe` estão no HTML pré-renderizado — os mapas não dependem de
JavaScript.

Nas três variantes (`classico`, `cartao`, `estilizado`), **uma** localização
mantém a disposição de antes (título centrado + um mapa grande) e **duas ou
mais** passam a grelha de cartões (uma coluna, duas a partir de `md`).

Ganchos de edição (§6.1): `data-edit="blocks.<i>.places.<j>.name"` e
`data-edit="blocks.<i>.places.<j>.address"`; a grelha é `data-edit-places="<i>"`
e cada cartão `data-edit-place="<j>"`. Como `places` é um **array com fallback**,
o editor materializa-o no arranque (`materializeBlockPlaces`, antes da baseline
`savedJson`) com o resultado da cascata — sem isso, `setPath` criaria um objeto
`{0:…}` sem `.length` e a edição perdia-se.

No editor: por localização, botão "Escolher no mapa" (`openMapPicker`, Leaflet,
pin arrastável) e "Remover"; na grelha, "Adicionar localização". **A última
localização não é removível** — com a lista vazia a cascata voltava a mostrar o
mapa legado ou o do rodapé, e o dono via o mapa continuar lá depois de o apagar.

---

## 9. Várias fotos por produto (`gallery.ts`)

- As fotos extra guardam-se em **`custom.productImages[<productId>]`** (sem
  migração à BD).
- Renderização: usar sempre **`productGalleryHtml(product, custom, opts)`** de
  `web/templates/gallery.ts` no lugar da `<img>` principal. Com **1 foto** mostra
  só uma imagem; com **2+** cria uma galeria **só-CSS** (radios + labels +
  miniaturas) que troca a imagem principal sem JS.
  ```ts
  ${productGalleryHtml(product, custom, {
    stageClass: "aspect-[4/5] overflow-hidden",
    stageStyle: "background:#f6f3f2;border-radius:2px",
    imgClass: "w-full h-full object-cover",
    brand: "var(--brand,#1c1b1b)",
  })}
  ```
- Gestão no **formulário de produto** (`web/lib/productForm.ts`): secção "Mais
  fotos" (upload múltiplo + remover). Persistência:
  - **No editor:** passa `customization: custom` + `onImagesChange: rebuild` — as
    fotos escrevem na personalização **em memória** e são gravadas com o "Guardar"
    do editor (evita conflitos/clobber).
  - **Fora do editor** (dashboard/admin): o formulário faz ler-modificar-gravar
    da personalização diretamente na BD.

## 9.1 Variação de produto (`variationPicker.ts`)

Pelo mesmo precedente das fotos extra (§9), as Variação **não vivem no tipo
`Product`**: guardam-se em **`custom.productVariations[<productId>]`** — sem
migração à BD, sem coluna nova. A lógica de domínio está em
`src/services/variations.ts`.

**Forma gravada** (`ProductVariations`, `src/models/domain.ts`):

```ts
{
  enabled: true,                      // !== true ⇒ é como não ter Variação
  priceMode: "substitui" | "acresce", // qualquer outro valor vale "substitui"
  axes: { name: string; values: string[] }[],
  combinations: { values: string[]; price?: number; stock?: number }[],
}
```

- **A invariante central é posicional:** `combinations[k].values` tem
  **exactamente um valor por eixo, na ordem de `axes`** — `values[i]` é um dos
  valores de `axes[i]`. A combinação não guarda o nome do eixo; a ligação é a
  posição. Uma combinação com outro comprimento é descartada.
- **Preço:** combinação sem `price` (ou não gravada) → preço base do produto;
  `"substitui"` → o preço da combinação; `"acresce"` → base + o da combinação. O
  resultado de `effectivePrice` é sempre finito e ≥ 0.
- **Os três estados de `stock` não são equivalentes:** **ausente** = stock não
  controlado, sempre disponível; **`0`** = esgotado (a adição ao carrinho é
  rejeitada); **positivo** = disponível.
- **`variantKeyOf(values)`** produz a chave estável de uma combinação: os valores
  por ordem de eixo unidos por **U+001F** (o *unit separator* do ASCII). O
  separador é invisível e não escrevível de propósito — com `"|"` ou `"-"`, os
  valores `["A","B"]` e o valor único `["A|B"]` dariam a mesma chave e duas
  combinações colidiam numa linha de carrinho.
- `syncCombinations` realinha a lista com os eixos atuais: remover um valor de um
  eixo apaga as combinações que o usavam e **as restantes mantêm preço e stock**;
  acrescentar ou remover um eixo inteiro muda o comprimento de todas as chaves,
  logo nenhum dado antigo é reaproveitável.

**Num modelo de loja**, os seletores vêm de **`variationPickerHtml(product,
custom, style)`** de `web/templates/variationPicker.ts` — nunca escritos à mão. A
estrutura e os ganchos vivem no módulo partilhado; **o desenho chega por
parâmetro** (`VariationPickerStyle`: `labelClass`, `labelStyle`, `valueClass`,
`valueStyle`, `selectedStyle`, `noteClass`, `rootClass`), tal como em
`productGalleryHtml` e `perksItemsHtml`. Passa as mesmas classes que o modelo já
usa no bloco "Quantidade" ao lado — os cantos vivem em `valueClass` e o valor
escolhido usa sempre `var(--brand)`/`var(--brand-ink)`, nunca `#F95901` (§0.6).

O marcador raiz é **`[data-variations]`** (`data-variations="<productId>"`); o
comportamento é montado por `web/views/product.ts`. Restantes ganchos:
`data-variation-axis="<i>"`, `data-variation-pick="<i>"`,
`data-variation-value="<valor>"`, `data-pick-base`, `data-pick-style`,
`data-sold-out-badge`, `data-variation-note`.

**Produto sem Variação corre exactamente o código de antes.**
`normalizeVariations` devolve `null` (produto fora do mapa, `enabled !== true`,
sem eixos utilizáveis, JSON malformado) e `variationPickerHtml` devolve **cadeia
vazia**: nem um nó a mais no HTML do modelo, preço igual a `product.price`, e a
linha de carrinho sai como sempre saiu.

**Sem JavaScript** os botões não reagem, mas os nomes das Variação e os
respectivos valores ficam legíveis no HTML. O texto corrido do HTML
pré-renderizado é `variationsPlainText`, espelhado em `api/_seo.js` — é uma das
paridades obrigatórias do `SEO.md` §5.2.

**Gestão** no formulário de produto (`web/lib/productForm.ts`): interruptor,
eixos, valores e a tabela de combinações (preço e stock por combinação). A
gravação acontece **depois** do `register`/`edit` (o produto novo só tem `id`
nessa altura), como já acontecia com as fotos extra; com o interruptor desligado
a entrada é apagada, e sem nenhum produto com Variação nem o mapa vazio fica na
personalização.

### Identidade de linha de carrinho

Com Variação, o carrinho passa a ser chaveado **por linha**, não por produto:

```ts
cartLineKey({ productId, variantKey }) === `${productId}|${variantKey ?? ""}`
```

`src/services/cartLine.ts` é o único autor desta chave. São **dois separadores em
dois níveis**: U+001F junta os *valores* dentro de uma `variantKey`; `"|"` separa
o produto da combinação.

Consequência para quem chama `web/lib/cart.ts`: **`setQuantity(storeId, lineKey,
qty)` e `removeFromCart(storeId, lineKey)` recebem uma chave de linha, não um
`productId`.** Use `lineKeyOf(item)` (ou `cartLineKey`) para a produzir; um
`productId` cru deixa de encontrar a linha, porque a chave de um item sem
combinação é `"<productId>|"` — com o separador. Remover "o produto todo" é
remover cada uma das suas linhas. `findCartLine(storeId, lineKey)` devolve a
linha; nada compara por `productId`.

A forma `"<productId>|"` é deliberada e não pode mudar: é ela que faz os
carrinhos já gravados em `localStorage` (itens sem `variantKey`) continuarem a
ser encontrados, somados e removíveis depois do deploy, sem migração.

Na apresentação, `CartItem.price` é o preço **efetivo** da linha (já resolvido
por `effectivePrice`) e `variantLabel` é a etiqueta legível («Cor: Azul ·
Tamanho: M», de `variantLabelOf`) mostrada na linha do carrinho e na mensagem de
WhatsApp. A etiqueta **nunca** identifica a linha.

---

## 9.2 Barra de filtros da listagem (`categoryFilter.ts`)

O cliente trocava de categoria pelo menu «Categorias» do cabeçalho, que **navega**
para outra vista: o ecrã é substituído e salta para o topo («somem todos os
botões»). A barra de filtros da página de listagem filtra **na própria página**.

Pelo mesmo precedente da §9.1, a estrutura e os ganchos vivem no módulo
partilhado **`web/templates/categoryFilter.ts`** e o **desenho chega por
parâmetro** (`CategoryFilterStyle`: `chipClass` — onde vivem os cantos —,
`chipStyle`, `activeStyle`, `rootClass`). `categoryFilterHtml(labels, active,
style)` devolve **cadeia vazia** com menos de dois rótulos.

- **Rótulos:** `categoryFilterLabels(view, active)` (`sectionsModel.ts`) —
  `ALL_LABEL` seguido das categorias **com produtos**. Devolve lista vazia na
  listagem «Destaques» (não é uma categoria) e quando não há cartões no ecrã.
- **Cartões:** a grelha da listagem leva **todos** os produtos
  (`listingProducts(view, category)`) e cada cartão declara
  `data-product-category="<categoria>"` no elemento de topo. É isso que permite
  filtrar sem voltar ao servidor: filtrar é esconder e mostrar.
- **Ganchos:** contentor `data-cat-filter-bar` + `data-cat-active-style`; chips
  `data-cat-filter="<rótulo>"` + `data-cat-base`; título `data-cat-title` e
  contagem `data-cat-count` (actualizados a cada filtro).
- **Comportamento:** `mountCategoryFilter` em `web/views/category.ts`. O endereço
  acompanha a escolha com **`history.replaceState`** — `navigate()` dispara o
  router e recarrega a vista, que é o defeito a evitar.
- Os chips são **`<button type="button">`**: `web/main.ts` interceta o clique em
  qualquer `<a href="/...">` e navegava.

Guarda: `tests/categoryFilter.test.ts`.

---

## 9.3 Secções acrescentáveis (`sectionRules.ts`)

**Uma secção acrescentada no editor sai com o desenho do modelo onde foi
acrescentada.** Tipografia, cantos, paleta e espaçamento são os do modelo. E o
corolário: **o que o modelo já traz, o modelo não volta a oferecer** — edita-se
onde está.

O defeito que originou a regra: no **Lumière**, que já tem testemunhos (carrossel
editorial) e mapa («As nossas lojas»), o menu «Adicionar secção» oferecia os dois
outra vez, e a secção acrescentada aparecia duplicada **em cartões brancos de
cantos arredondados e tipografia preta** — no meio de um modelo serifado, creme e
de cantos retos. Duas causas: o menu decidia comparando `store.templateId` com
identificadores escritos à mão (de dois modelos que já tinham saído do registo,
pelo que as comparações nunca disparavam), e `newBlock` criava o bloco **sem
`variant`**, caindo num valor por omissão genérico dentro do `blocks.ts`.

O mesmo vício estava em mais três sítios do editor, e saiu com a mesma regra: a
variante por omissão dos testemunhos (`=== "galeria"`), a materialização das
marcas do Tech Essentials (`=== "tech-essentials"`) e as cores de fundo das
secções (um mapa por `templateId` onde o Tech Essentials não estava, e que lhe
dava o creme de outro modelo).

### O que o modelo declara

Em `StoreTemplate.sections` (`web/templates/types.ts`, `TemplateSections`), ao
lado do `render`. O editor lê-o **só** por `web/templates/sectionRules.ts`
(`sectionMenu`, `newBlockFor`, `sectionBackgrounds`, `materializeForEditing`) e
**nunca** compara `store.templateId`:

```ts
// lumiere.ts
sections: {
  native: ["testimonials", "location"],   // já vêm desenhadas no modelo
  allowed: ["info", "text"],              // ausente = todas menos as nativas
  variants: { info: "lado", text: "linha" },
  style: BLOCK_STYLE,                     // o mesmo que passa a blocksHtml
  backgrounds: [{ label: "Creme", value: "#fcf9f8" }, { label: "Areia", value: "#f6f3f2" }],
}

// techEssentials.ts — além das variantes, cores e desenho:
  materialize: materializeBrands,         // as quatro marcas, antes da baseline
```

- **`native`** sai do menu «Adicionar secção». Tem de estar **mesmo** desenhado
  no modelo: declarar como nativo o que não existe esconde a secção sem o Dono a
  ter em lado nenhum. `tests/sectionDesign.test.ts` compara a declaração com o
  HTML que o modelo produz.
- **`allowed`** substitui os `if` por `templateId` que viviam no editor.
- **`variants`** é gravada no bloco no **momento da criação** (`newBlockFor`), e
  não resolvida a cada render: assim o aspeto de uma secção já criada não muda
  quando o valor por omissão mudar.
- **`style`** é o desenho do modelo (abaixo) — o **mesmo objeto** que o modelo
  passa a `blocksHtml`. Está na declaração para o editor desenhar as miniaturas
  do seletor de variantes com ele.
- **`backgrounds`** são as cores de fundo que o seletor «Cor de fundo» oferece,
  depois de «Padrão» e «Branco». Têm de ser cores que o modelo já usa. Ausente =
  uma cor clara genérica (`DEFAULT_SECTION_BACKGROUNDS`).
- **`materialize(custom)`** prepara os arrays com fallback do modelo para edição
  (§6.1). Corre antes da baseline do editor, escreve só o que a loja já mostra,
  é idempotente e não toca no que já está na forma certa.

O editor não deduz qual variante um bloco está a desenhar: cada `<section>` de
bloco leva `data-block-variant` com a variante que `blocks.ts` escolheu, e é daí
que o seletor «Modelo: …» a lê.

### O desenho vem por parâmetro

`blocksHtml` recebe `style: BlockStyle` no seu `BlockCtx` — mesmo padrão de
`variationPickerHtml` (§9.1) e de `categoryFilterHtml` (§9.2): a **estrutura** é
partilhada, o **desenho** é do modelo. `BlockStyle` vive em `types.ts` (e é
reexportado por `blocks.ts`). Os campos de classe são **sem o tamanho**, que é da
variante; os `…Style` são CSS inline do próprio modelo:

| Campo | Para quê | Se faltar |
|---|---|---|
| `heading` / `headingStyle` | títulos | omissão genérica |
| `body` / `bodyStyle` | texto corrido | omissão genérica |
| `name` / `nameStyle` | nomes curtos (autor de um testemunho, loja no mapa) | os do título |
| `quote` / `quoteStyle` | citação dos testemunhos «Editorial» | os do título |
| `muted` / `mutedStyle` | texto secundário (cargo de quem dá o testemunho) | os do corpo |
| `surface` / `surfaceStyle` | cartões (fundo, moldura, sombra) | omissão genérica |
| `radius` | cantos de cartões, imagens e mapas (`""` = retos) | `rounded-2xl` |
| `band` / `bandStyle` | faixa tonal das secções sobre banda | omissão genérica |

Reutiliza as classes que o modelo já usa nas suas próprias secções, em vez de
escolher cores novas:

```ts
// lumiere.ts
const BLOCK_STYLE: BlockStyle = {
  heading: "lx-serif", headingStyle: "color:#1c1b1b",
  body: "lx-body font-light leading-relaxed", bodyStyle: "color:#464742",
  muted: "lx-body", mutedStyle: "color:#777871",
  surface: "border border-black/5", surfaceStyle: "background:#fcf9f8",
  radius: "",                      // no Lumière nem os chips levam `rounded`
  band: "", bandStyle: "background:#f6f3f2",
};
```

`radius: ""` é cantos retos, não «sem valor»: é o que o Lumière exige. Os cinco
modelos prontos declaram o seu `style`; o do Galeria é, de propósito, o
vocabulário mais próximo do desenho genérico (é o modelo claro e neutro de onde
esse desenho saiu), com a citação «Editorial» no peso médio que sempre teve.

O desenho do modelo aplica-se a **todos** os seus blocos, os acrescentados agora
e os já gravados, e às três variantes de testemunhos — também ao «Carrossel»,
que mantém o seu CSS próprio de `@keyframes`.

### Compatibilidade

- Um modelo que **não** passe `style` desenha os blocos **byte a byte** como
  sempre: cada elemento leva em `blocks.ts` a sua classe genérica escrita por
  extenso (o desenho genérico nunca foi uniforme — `rounded-3xl` num sítio,
  `rounded-2xl` noutro —, e uniformizá-lo mudaria lojas no ar).
  `tests/blocksDefault.test.ts` compara-o com `tests/fixtures/blocksDefault.json`,
  o HTML que o `blocks.ts` de antes produzia para um conjunto fixo de entradas.
  A única diferença admitida é o `data-block-variant` nas secções de testemunhos,
  que antes não o tinham (um atributo de dados, sem efeito no aspeto). O fixture
  **não se regenera** a partir do código actual.
- Os blocos gravados **sem `variant`** continuam a usar a variante por omissão de
  `blocks.ts` (nos testemunhos, `BlockCtx.variant: "galeria"` dá «Editorial» —
  o Galeria e o Lumière passam-no).
- Um modelo que **não** declare `sections` aceita todas as secções, usa o desenho
  genérico e uma cor de fundo clara genérica — é o que permite declarar modelo a
  modelo sem parar nada.

Guardas: `tests/sectionDesign.test.ts` desenha as secções acrescentadas **de
verdade** em cada modelo e verifica as propriedades — a secção do Lumière não sai
igual à do Desportivo; o `style` declarado é exactamente o que o modelo desenha;
nenhum modelo oferece o que já tem; as cores de fundo e a materialização vêm da
declaração (e materializar não muda o ecrã); cada secção diz a variante que
desenhou; e o editor não compara identificadores de modelo. Percorre também o
`TEMPLATE_REGISTRY`: um modelo **pronto** que não declare `sections`, que ofereça
uma secção sem variante, ou que não tenha aqui uma asserção de desenho, falha.
`tests/blocksDefault.test.ts` guarda o desenho genérico.

> A regra em forma curta, para quem mexe em modelos, está em
> `.kiro/steering/modelos-secoes.md`.

---

## 10. Modelos prontos (fluxo completo)

- Uma **loja-modelo** = loja real do admin, publicada, marcada com
  `customization.__template = { id, name, description }`. Não aparece nas
  listagens/métricas normais.
- Auto-import de fábrica: `seedDefaultModels` (`web/supabase/models.ts`),
  `defaultFactoryModels()` (com produtos/testemunhos demo). Ignora por nome se já
  existir. Se um modelo antigo estiver desatualizado, **eliminar e reimportar**.
- Admin edita os modelos na secção **"Modelos"** (`adminPanel.ts` → `renderModelos`)
  com o editor normal (afinar textos/fotos/preview).
- **Cliente que aplica um modelo:** `customization.__basedOn = <id>` +
  `__locked = true`. Edição estrutural bloqueada — só textos, fotos e cores
  (sem trocar header/hero/rodapé/checkout/disposição/tema). `MODEL_EDITING=false`
  desativa a troca estrutural, mas o código fica pronto para reativar.

---

## 11. Passo-a-passo ao receber um modelo

1. **Ler os ficheiros do modelo** (`code.html` + `screen.png` de cada ecrã) e
   identificar: fontes, cantos, cores/superfícies, header, hero, grelha de
   produtos, secções (testemunhos/mapa/etc.), página de produto, checkout.
2. **Criar `web/templates/<modelo>.ts`** exportando um `StoreTemplate` completo:
   `render`, `renderProduct`, `renderCategory`, `renderCheckout`. Reutilizar os
   partilhados quando fizer sentido (`headers`, `blocks`, `productPage`,
   `gallery`, `mobileMenuParts`, `resolveSections`, `perksItemsHtml`).
3. **Injetar o estilo próprio** (fontes `@import` + utilitários) uma vez por
   render; proteger os ícones (Material Symbols). Adicionar as fontes também em
   `web/index.html` se necessário.
4. **Cabeçalho fixo** (Início/Produtos/Categorias) + ícones `data-search-btn` e
   `data-cart-link`/`data-cart-count`.
5. **Pôr todos os hooks** (§6) e **usar `productGalleryHtml`** para as imagens de
   produto.
6. **Consistência:** aplicar `var(--brand)`/`--brand-ink`, respeitar o tema, e
   garantir que carrinho e checkout partilham a mesma UI.
7. **Registar** o modelo em `registry.ts` (`ready: true`, `defaultBrand`) e
   **declarar as suas secções** em `sections` (§9.3: nativas, aceites,
   variantes, `style`, cores de fundo e, se tiver arrays com fallback,
   `materialize`). Acrescentar o modelo às asserções de
   `tests/sectionDesign.test.ts` — o teste falha enquanto não estiver lá.
8. **Recriar como loja-modelo** e importar no admin (`models.ts`), com dados demo.
9. **Validar:** `get_diagnostics` → `npm run build` → `npm run web:build` →
   `npx vitest run` (manter 100% verde).
10. **Não commitar** — esperar indicação do utilizador.

---

## 12. Checklist de aceitação (antes de dizer "pronto")

- [ ] Fontes, cantos, cores e estrutura **iguais** ao design, em todos os ecrãs.
- [ ] Header fixo (Início/Produtos/Categorias) e pesquisa a abrir **no header**.
- [ ] Hero com CTA e destino configurável; imagem editável.
- [ ] Produtos, página de produto (com **galeria multi-foto** e seletores de
      Variação via `variationPickerHtml`, com o desenho do modelo — §9.1),
      categoria.
- [ ] Testemunhos/mapa/avaliações do modelo **reproduzidos e funcionais**.
- [ ] Carrinho e checkout com a **mesma UI** (bordas, fontes, cores).
- [ ] Secções removíveis (exceto produtos) + cor de fundo entre as do modelo.
- [ ] `sections` declarado (§9.3): as secções acrescentadas saem no desenho do
      modelo e o menu não oferece o que ele já traz. Nenhum `if (templateId === …)`
      no editor.
- [ ] **Editabilidade total (§6.1):** em TODAS as secções — textos, **cores**
      (cartões, etiquetas, ícones), **ícones** e **botões** (texto+ícone+destino)
      editáveis. Nada chumbado. Telefone de apoio do header editável.
- [ ] Todos os `data-*` presentes; carrinho/pesquisa/editor a funcionar.
- [ ] pt-PT/pt-AO em todo o texto. `var(--brand)`/`--brand-ink` nos botões.
- [ ] `npm run build` + `npm run web:build` + `npx vitest run` verdes.
- [ ] Sem commit/push (a menos que pedido).

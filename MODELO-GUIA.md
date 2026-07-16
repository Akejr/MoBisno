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
  - `<modelo>.ts` — um ficheiro por modelo (ex.: `lumiere.ts`, `galeria.ts`,
    `beauty.ts`, `desportivo.ts`). Exporta um `StoreTemplate`.
  - Partilhados: `headers.ts`, `heroes.ts`, `footers.ts`, `blocks.ts`,
    `productPage.ts`, `productGrid.ts`, `checkoutLayouts.ts`, `sectionsModel.ts`,
    `gallery.ts`, `perks.ts`, `shared.ts`.
- **Comportamento (JS na loja publicada):** `web/lib/`
  - `cartDrawer.ts` (carrinho), `search.ts` (pesquisa no header),
    `sections.ts` ("ver mais"), `testimonialsCarousel.ts`, `particlesHero.ts`,
    `mapPicker.ts` (Leaflet), `productForm.ts` (formulário de produto),
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
**Início** (`homeHref`), **Produtos** (`homeHref + "#produtos"`) e **Categorias**
(dropdown das categorias existentes, só aparece se houver categorias).

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
  (`#/loja/<id>/categoria/Produtos`). Não usar `#produtos` (isso só faz scroll na
  home). `filterForCategoryPage` trata `"Produtos"`/`"Todos"` como todos.
- A página de categoria/listagem ganha automaticamente uma **barra de filtros**
  (chips de categoria + ordenação) injetada por `category.ts` (`mountListingToolbar`).
  Funciona em qualquer modelo desde que os cartões tenham **`data-edit-product`**
  (hook padrão) e estejam numa grelha comum. Não é preciso código por modelo.

**Página de produto**
- Imagem/galeria: usar **`productGalleryHtml`** de `gallery.ts` (ver §9).
- `data-qty` / `data-qty-dec` / `data-qty-inc` (quantidade).
- `data-add-cart="<id>"` (adicionar ao carrinho).
- `data-edit-whatsapp` (botão WhatsApp).
- `data-edit-perks` › itens `data-edit-perk-item` com ícone + `data-perk-text`
  (garantias; ícones pré-definidos escolhíveis no editor).

**Blocos de conteúdo adicionais** (partilhados, `blocks.ts`)
- `data-edit-blocks` › `data-edit-block="i"` com `data-block-type` e, quando
  aplicável, `data-block-variant`. Tipos: `info`, `text`, `testimonials`,
  `location`. Suportam **cor de fundo** (`bg`) escolhida entre as cores do modelo.

**Checkout**
- `renderCheckout(view, innerHtml, custom)` envolve o conteúdo do checkout com o
  cromo do modelo (header/rodapé/tema). No editor, a troca de modelo do checkout
  está **desativada** (gated por `structuralEditing`).

**Rodapé**
- `data-edit-footer-logo`, `data-edit="footer.about|location|phone|email"`.

---

## 6.0.1 Compra de logótipo por IA (5.000 Kz)

O wizard oferece criar um logótipo por IA no fim da criação da loja (pergunta se
já tem logo → oferece gerar 5 propostas → escolhe → paga MCX/Referência). O
cumprimento é no servidor:
- Tabela `logo_purchases` (migração `0018_logo_purchases.sql` — aplicar no Supabase).
- `api/payment.js` aceita `kind:"logo"` (5.000 Kz) e guarda `logo_url` (já carregado
  para o storage no cliente antes do pagamento).
- Quando o pagamento confirma (inline no MCX, ou via `webhook.js`/`payment-status.js`
  na Referência), `fulfillLogo` (em `_shared.js`) acrescenta o `logo_url` a
  `stores.customization.logos` → aparece em "Criar logótipo → Meus logótipos".
- As compras entram nas **Transações** do admin (`listServiceTransactions`, serviço
  `logo`) e podem ser apagadas pelo botão de lixo (`adminDeleteServiceTransaction`).

## 6.1 Editabilidade TOTAL — obrigatória em TODAS as secções

> Regra de ouro nº7. Ao criar/rever um modelo, **percorre cada secção** (hero,
> banners, cartões de anúncio, categorias, produtos, faixas promo, garantias/
> benefícios, blocos, rodapé) e garante que **cada elemento visível é editável**.
> Se um elemento não é editável, **não está pronto**.

**O que TEM de ser editável em cada elemento:**

| Elemento | Como o tornar editável |
|---|---|
| **Texto** (títulos, subtítulos, etiquetas, rótulos de botão, telefone de apoio, etc.) | `data-edit="foodmart.ads.0.ctaLabel"` — fica contenteditable e escreve em `custom` via `setPath`. **Inclui o telefone/apoio do header.** |
| **Cor de um cartão / superfície** | Guardar em `custom` (ex.: `ads[i].bg`) e ligar um **seletor de cor** no editor (popover de swatches). |
| **Cor de etiqueta/badge** | Campo próprio (ex.: `ads[i].tagBg`) + seletor de cor. Aplicar inline com override do CSS fixo. |
| **Cor de ícones** | Campo (ex.: `featuresIconColor`) + seletor de cor. |
| **Ícone** | Campo (ex.: `ads[i].ctaIcon`, `features[i].icon`) + **picker de ícones** (`FM_CATEGORY_ICONS` ou lista própria). |
| **Botão (CTA)** | Texto (`data-edit …ctaLabel`) **+** ícone (`…ctaIcon`, picker) **+** destino (`…ctaTarget`, `selectRow` com categorias / "Secção de produtos" via `targetHref`). |

**Padrão de implementação no editor** (`web/views/editor.ts`), dentro do bloco
`if (store!.templateId === "<modelo>")`:
- Marca cada zona editável no template com um `data-*` âncora (ex.: `data-fm-ad="i"`,
  `data-fm-promo`, `data-fm-features`, `data-fm-feature="i"`).
- Usa um **popover "tune"** por zona com: `swatchRow` (cores), `iconRow` (ícones)
  e `selectRow` (destino do botão). Ver o bloco FoodMart como referência.
- Os textos usam sempre `data-edit` (ficam editáveis e coloríveis por `fieldColors`).

**Materialização de defaults:** se uma secção usa um **array com fallback** (ex.:
`features`, `ads`), materializa o array em `custom` **no arranque do editor**
(antes da baseline `savedJson`) — senão, editar um item via `setPath` cria um
objeto `{0:…}` sem `.length` e o template volta aos defaults, perdendo a edição.
Ver `foodmartDefaultFeatures()` + a materialização no topo de `renderEditor`.

**Destino de botões:** todo o botão/CTA leva para uma **categoria** ou para a
**secção de produtos**. Usa sempre o helper `targetHref(view, target)` no template
e um `selectRow` (categorias + "Secção de produtos") no editor.

---

## 7. Secções removíveis (exceto produtos)

O dono pode **apagar qualquer secção exceto a de produtos**. Para secções
próprias do modelo (ex.: testemunhos, mapa/lojas no Lumière), envolve cada uma
num **slot** que fica vazio quando removida:

```html
<div data-lumiere-slot="testimonials">${hide ? "" : testimonialSection(custom)}</div>
```

No editor (`web/views/editor.ts`, `mountLumiereSections`), o slot ganha um botão
"Remover secção"; quando vazio, mostra "Adicionar secção". A flag vive em
`custom.<modelo>.hide<Seccao>`. **A secção de produtos nunca é removível.**

### Menu "Adicionar secção"
- **Loja normal (construtor):** Produtos, Informação com foto, Título e texto,
  Testemunhos, Localização.
- **Modelo pronto (`__locked`):** só **Produtos**, **Informação com foto** e
  **Título e texto**.
- **Override por modelo:** um modelo pode restringir ainda mais. Ex.: **FoodMart**
  só permite adicionar **Secção de produtos** (as outras não fazem sentido na
  mercearia). Ver `productsOnly` em `editor.ts`.

### Cor de fundo das secções
Ao adicionar/editar uma secção de conteúdo (`info`/`text`), há um seletor de cor
de fundo com as **cores já existentes no modelo** (ver `sectionBgChoices` no
editor). Guardado em `blocks[i].bg` e aplicado em `blocks.ts` (`bgStyle`).

---

## 8. Mapa com pins das lojas (ex.: Lumière)

- Dados: `custom.<modelo>.boutiques: { name?, address?, lat?, lng? }[]`.
- Cada loja gera o seu próprio mapa **com pin** (`boutiqueMapSrc`): por
  coordenadas usa OpenStreetMap embed (`marker=lat,lng`); sem coordenadas, usa
  Google embed pela morada. Se a lista estiver vazia, mostra **um** mapa da
  morada do rodapé.
- No editor: botão "Escolher no mapa" por loja abre `openMapPicker` (Leaflet,
  pin arrastável) e "Adicionar loja". Funciona sem API key.

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
7. **Registar** o modelo em `registry.ts` (`ready: true`, `defaultBrand`).
8. **Recriar como loja-modelo** e importar no admin (`models.ts`), com dados demo.
9. **Validar:** `get_diagnostics` → `npm run build` → `npm run web:build` →
   `npx vitest run` (manter 100% verde).
10. **Não commitar** — esperar indicação do utilizador.

---

## 12. Checklist de aceitação (antes de dizer "pronto")

- [ ] Fontes, cantos, cores e estrutura **iguais** ao design, em todos os ecrãs.
- [ ] Header fixo (Início/Produtos/Categorias) e pesquisa a abrir **no header**.
- [ ] Hero com CTA e destino configurável; imagem editável.
- [ ] Produtos, página de produto (com **galeria multi-foto**), categoria.
- [ ] Testemunhos/mapa/avaliações do modelo **reproduzidos e funcionais**.
- [ ] Carrinho e checkout com a **mesma UI** (bordas, fontes, cores).
- [ ] Secções removíveis (exceto produtos) + cor de fundo entre as do modelo.
- [ ] **Editabilidade total (§6.1):** em TODAS as secções — textos, **cores**
      (cartões, etiquetas, ícones), **ícones** e **botões** (texto+ícone+destino)
      editáveis. Nada chumbado. Telefone de apoio do header editável.
- [ ] Todos os `data-*` presentes; carrinho/pesquisa/editor a funcionar.
- [ ] pt-PT/pt-AO em todo o texto. `var(--brand)`/`--brand-ink` nos botões.
- [ ] `npm run build` + `npm run web:build` + `npx vitest run` verdes.
- [ ] Sem commit/push (a menos que pedido).

# Uma secção acrescentada é 100% do modelo onde entra

## A regra

**Uma secção acrescentada no editor tem de sair com o desenho do modelo onde foi
acrescentada.** A tipografia, os cantos, a paleta e o espaçamento são os do
modelo — não os de um desenho genérico partilhado por todos.

E o corolário: **o que o modelo já tem, o modelo não volta a oferecer.** Uma
secção que já vem desenhada no modelo edita-se onde está; oferecê-la no
«Adicionar secção» é convidar o Dono a duplicar o que já tinha.

Cada modelo declara isto em `StoreTemplate.sections`
(`web/templates/types.ts`) — as secções que já traz, as que aceita, a variante
com que desenha cada uma, o seu desenho (`style`), as cores de fundo que
oferece e como materializa os seus arrays para o editor — e passa o mesmo
`style` no `BlockCtx` de `blocksHtml`. Vive ao lado do modelo, de propósito: era
no editor que a decisão estava, longe dos modelos, e foi assim que envelheceu.
O editor lê a declaração só por `web/templates/sectionRules.ts`.

## Porque é que esta regra existe

O Dono estava no **Lumière**, que já traz uma secção de testemunhos (o carrossel
editorial) e uma secção de mapa («As nossas lojas»). Clicou em «Adicionar
secção» e o menu ofereceu-lhe **testemunhos**. Acrescentou. Apareceu uma segunda
secção de testemunhos, **com outro desenho**: cartões brancos de cantos
arredondados e tipografia preta, no meio de um modelo serifado, creme e de
cantos retos.

Duas causas, e nenhuma era descuido de estilo.

O menu decidia o que oferecer comparando `store.templateId` com identificadores
escritos à mão — a mercearia e o modelo escuro. **Os dois já tinham saído do
`TEMPLATE_REGISTRY`**, pelo que as comparações nunca disparavam: eram condições
mortas a fingir que havia uma regra. E não havia forma nenhuma de dizer «este
modelo já tem esta secção».

A segunda é mais funda: `newBlock` criava o bloco **sem `variant`**, e o desenho
caía num valor por omissão dentro do `blocks.ts` — uma comparação de cadeia
(`ctx.variant === "galeria" ? "editorial" : "cards"`) que decidia o aspeto de
uma secção a partir do nome de um modelo. O modelo não tinha como dizer como as
secções acrescentadas se desenham nele.

O mesmo vício estava em mais três sítios do editor: a variante por omissão dos
testemunhos (`=== "galeria"`), a materialização das marcas do Tech Essentials
(`=== "tech-essentials"`) e as cores de fundo das secções, num mapa por
`templateId` onde o Tech Essentials não estava — e que lhe dava o creme de
outro modelo.

Uma loja com duas secções da mesma coisa, em dois desenhos diferentes, deixa de
parecer um site feito por alguém.

## Como cumprir

1. **Declara, não compares.** Nada no editor olha para `store.templateId` para
   decidir o que quer que seja — nem com `===`, nem com um mapa indexado por
   ele. Se precisas de um comportamento por modelo, acrescenta-o a
   `TemplateSections`, declara-o no modelo e lê-o por `sectionRules.ts`. Um `if`
   no editor é um defeito que ninguém encontra quando o modelo mudar de nome ou
   sair.
2. **O que o modelo desenha nativamente vai em `native`.** E tem de estar
   mesmo lá: declarar como nativo o que não está desenhado esconde a secção do
   menu sem o Dono a ter em lado nenhum. Há um teste que compara a declaração
   com o HTML.
3. **Toda a secção acrescentável tem variante declarada.** É gravada no bloco no
   momento da criação (`newBlockFor`), não resolvida a cada render — assim o
   aspeto de uma secção já criada não muda quando o valor por omissão mudar.
4. **Passa o `style` do modelo a `blocksHtml`, e declara o mesmo em
   `sections.style`.** É o mesmo padrão de `variationPickerHtml` e de
   `categoryFilterHtml`: a estrutura é partilhada, o desenho vem por parâmetro.
   Reutiliza as classes que o modelo já usa nas suas próprias secções, em vez de
   escolher cores novas. O `style` aplica-se a **todos** os blocos do modelo, os
   novos e os já gravados.
5. **O editor lê a variante do HTML, não a deduz.** Cada `<section>` de bloco
   leva `data-block-variant` com a variante que desenhou.
6. **As cores de fundo são do modelo** (`sections.backgrounds`) e a
   materialização também (`sections.materialize`, antes da baseline do editor,
   escrevendo só o que a loja já mostra).
7. **Não mudes o desenho genérico.** Um modelo sem `style` desenha os blocos
   **byte a byte** como sempre — `tests/blocksDefault.test.ts` compara-o com o
   HTML de antes. Os blocos gravados sem `variant` continuam a ser desenhados com
   a variante por omissão de `blocks.ts`.
8. **Um modelo que não declara nada continua a funcionar.** Aceita todas as
   secções, usa o desenho genérico e uma cor de fundo clara genérica. É o que
   permite acrescentar a declaração modelo a modelo sem parar nada.

## Guarda automática

`tests/sectionDesign.test.ts` desenha as secções acrescentadas **de verdade**, em
cada modelo registado, e verifica que o desenho é o do modelo, que o `style`
declarado é o que o modelo usa, que nenhum modelo oferece o que já tem, que as
cores de fundo e a materialização vêm da declaração, e que o editor não compara
identificadores. `tests/blocksDefault.test.ts` guarda o desenho genérico byte a
byte. Quando acrescentares um modelo ou uma secção, acrescenta lá a asserção —
as asserções são sobre a propriedade (a secção do Lumière não sai igual à do
Desportivo), não sobre classes CSS, porque uma asserção sobre uma classe volta a
quebrar na primeira vez que o desenho mudar sem o comportamento mudar.

O `MODELO-GUIA.md` §9.3 tem a versão longa, com a forma de `TemplateSections`.

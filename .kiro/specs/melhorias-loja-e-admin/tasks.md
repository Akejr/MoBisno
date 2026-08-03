# Implementation Plan: melhorias-loja-e-admin

## Overview

Doze requisitos, quatro fases, na ordem imposta pelo `design.md` (§ Faseamento):
**A** (1×) → **B** (1,5×) → **C** (1,5×) → **D** (3×). Dentro de cada fase a ordem
é sempre a mesma, por decisão **D8**: **módulo puro primeiro, pontos de chamada
depois, testes a seguir**. Escrever a vista antes da regra obrigaria a refazer a
vista.

Linguagem: **TypeScript**. Testes em `vitest` com `fast-check ^3.23.0` (ambos já
no `package.json`). Linha de base `22cee78`: `npm run build` a zero, **197 testes
verdes em 34 ficheiros**.

Convenções deste plano:

- **⚠ RISCO** — tarefa de maior risco: altera a forma dos dados de um Produto, ou
  altera uma assinatura pública com pontos de chamada a atualizar, ou toca em
  dados de produção.
- **🖐 MANUAL** — exige ação humana; não é executável por um agente de código.
- `web/` **não é verificado por tipos** (o `tsconfig.json` compila `src/**` e
  `tests/**`). A validação de tudo o que está em `web/` é `npm run web:build`
  mais os testes — não o `tsc`. `get_diagnostics` num ficheiro de `web/` não
  substitui o `vite build`.

## Tasks

### Fase A — o que o utilizador sente de imediato (custo 1×)

R3, R11, R9, R10, R6. Nenhuma migração à base de dados; a única escrita de dados
é a marca `__demoPayments` nas Loja_Modelo do Administrador (tarefa 1.5, decisão
D2). Entrega as Propriedades 1, 3 e 4, mais `tests/geradores.ts`.

- [x] 1. Decisão única de pagamento (regra + marca de demonstração) e mensagem de WhatsApp (R3)
  - [x] 1.1 Criar `src/services/paymentVisibility.ts` com `onlinePaymentsVisible` e `isPaymentsDemo`
    - `onlinePaymentsVisible(custom: unknown): boolean` — `true` se e só se `custom?.payments?.onlineEnabled === true`
    - `isPaymentsDemo(custom: unknown): boolean` — `true` se e só se `custom?.__demoPayments === true`
    - Comparação estrita em ambas, sem coerção (`"true"`, `1`, `{}`, `[]` → `false`); funções totais, nunca lançam
    - Nenhuma delas lê `__basedOn` nem `__template` — é o que corrige a avaria dos itens 2 e 3, porque `__basedOn` **é** copiado para a Loja do cliente
    - **Implementa D2 tal como decidido:** a marca de demonstração é `__demoPayments`, escrita só pelo Semeador nas Loja_Modelo (tarefa 1.5) e nunca herdada; as vistas usam `onlinePaymentsVisible(custom) || isPaymentsDemo(custom)`
    - _Requisitos: 3.1, 3.2, 3.3, 3.13, 3.16_ · _Decisão D2 `[A2]`_

  - [x] 1.2 Criar `src/services/cartMessage.ts` com `OrderLine`, `OrderExtras` e `buildCartWhatsAppMessage(lines, formatMoney, extras?)`
    - Uma linha por item com nome, quantidade e valor da linha via `formatMoney` injetado (`formatKz` de `src/services/format.ts`); total no fim; `delivery` e `discount` quando presentes em `extras`
    - `variantLabel` é acrescentado à linha quando existe. **Nesta fase o campo é opcional e nunca vem preenchido** — só a Fase D (R4) o preenche. Não falta implementar nada aqui: a Propriedade 4 cobre os dois casos
    - _Requisitos: 3.9, 3.10, 3.11, 3.12_ · _Propriedade 4_

  - [x] 1.3 Alterar `web/views/checkout.ts` para consumir os módulos puros novos
    - Substituir `const online = …` + `const isModel = …` + `const showOnline = online || isModel` por `const showOnline = onlinePaymentsVisible(custom) || isPaymentsDemo(custom)`
    - Substituir a composição manual da mensagem por `buildCartWhatsAppMessage(...)` com `extras` de área de entrega e desconto, preservando o texto atual
    - Validação: `npm run web:build` (este ficheiro não é verificado por tipos)
    - _Requisitos: 3.2, 3.4, 3.7, 3.12, 3.13, 3.16_

  - [x] 1.4 Alterar `web/lib/cartDrawer.ts` para consumir os módulos puros novos
    - `const showCheckout = onlinePaymentsVisible(custom) || isPaymentsDemo(custom)`; remover a leitura de `__basedOn`/`__template`
    - Com pagamentos inativos: botão único com o rótulo literal «Comprar pelo WhatsApp», que abre `waLink(resolveWaPhone(custom), buildCartWhatsAppMessage(...))`; com pagamentos ativos: «Comprar agora» com ligação ao Checkout
    - _Requisitos: 3.3, 3.5, 3.6, 3.8, 3.9, 3.10_

  - [x] 1.5 Escrever a marca de demonstração no Semeador_De_Modelos (`web/supabase/models.ts`)
    - `createTemplateModel` passa a gravar `__demoPayments: true` na Personalização da Loja_Modelo que cria, ao lado de `__template` e `__v`; a re-sincronização por `__v` de `seedDefaultModels` escreve a mesma marca nas Loja_Modelo já existentes
    - **Só Loja_Modelo.** `applyModelToStore` e `applyRawToStore` removem `__demoPayments` da cópia aplicada a uma Loja de cliente, exactamente como já removem `__template` — a marca nunca é herdada, e é essa a diferença face a `__basedOn`
    - Validação: `npm run web:build` (este ficheiro não é verificado por tipos)
    - _Requisitos: 3.14, 3.15, 3.16_ · _Decisão D2_

  - [x] 1.6 Criar `tests/geradores.ts` com os arbitrários partilhados
    - **Ficheiro novo nesta linha de base.** É o único sítio onde vivem geradores partilhados; nenhum ficheiro de teste define os seus
    - Mínimo desta fase: `customizationArb` (Personalização arbitrária, incluindo `__basedOn`, `__template`, `__demoPayments` presente, ausente e de tipo errado, `payments` ausente, `payments.onlineEnabled` de tipo errado, `footer.phone`/`whatsapp.phone` de tipo errado e `productPerks` malformado) e `orderLineArb`
    - Estendido depois por 12.4 (`adminSnapshotArb`) e 14.4 (`variationsArb`, `combinationArb`)
    - _Requisitos: 11.6, 12.3_

  - [x]* 1.7 Escrever o teste da Propriedade 1 em `tests/paymentVisibility.property.test.ts`
    - `// Feature: melhorias-loja-e-admin, Property 1: Para qualquer Personalização, a visibilidade dos métodos de pagamento online é igual a payments.onlineEnabled === true || __demoPayments === true, é insensível a __basedOn e __template, e só depende de __demoPayments quando payments.onlineEnabled não é true`
    - Um único teste de propriedade, com `customizationArb` de `tests/geradores.ts` e `{ numRuns: 100 }` no mínimo: não lança, `onlinePaymentsVisible(custom) || isPaymentsDemo(custom)` é igual a `custom?.payments?.onlineEnabled === true || custom?.__demoPayments === true`, o resultado não muda ao acrescentar ou remover `__basedOn`/`__template` à mesma Personalização, e acrescentar ou remover `__demoPayments` só altera o resultado quando `payments.onlineEnabled` não é `true`
    - _Requisitos: 3.1, 3.2, 3.3, 3.13, 3.16_ · _Propriedade 1_

  - [x]* 1.8 Escrever o teste da Propriedade 4 em `tests/cartMessage.property.test.ts`
    - `// Feature: melhorias-loja-e-admin, Property 4: Para qualquer Carrinho não vazio, a mensagem de WhatsApp contém o nome, a quantidade e o valor de cada item, a Combinação quando existe, e o total`
    - Um único teste de propriedade, com `orderLineArb` e `{ numRuns: 100 }` no mínimo; cobre linhas com e sem `variantLabel`
    - _Requisitos: 3.9, 3.10, 3.11_ · _Propriedade 4_

- [x] 2. Leitura defensiva da Personalização legada (R11)
  - [x] 2.1 Criar `src/services/storeCustom.ts` com `asText`, `resolveWaPhone`, `WA_DEFAULT_PHONE`, `DEFAULT_PERKS` e `normalizePerks`
    - `asText` devolve `undefined` para tudo o que não seja string usável; `resolveWaPhone` desce `whatsapp.phone → footer.phone → WA_DEFAULT_PHONE` aplicando `asText` em cada passo; `normalizePerks` omite itens sem `icon`/`text` do tipo string e devolve `DEFAULT_PERKS` quando não sobra nenhum
    - Todas as funções são totais sobre `unknown` e nunca lançam — é a causa raiz da Pagina_De_Produto em branco (`.replace` num objeto, `.trim` num número)
    - _Requisitos: 11.1, 11.2, 11.3, 11.4, 11.5_ · _Propriedade 3_

  - [x] 2.2 Alterar `web/lib/whatsapp.ts` para reexportar `resolveWaPhone` e `WA_DEFAULT_PHONE` de `src/services/storeCustom.ts`
    - Manter intacta a superfície pública (`resolveWaPhone`, `WA_DEFAULT_PHONE`, `waLink`, `buildProductMessage`, `ensureTokens`, `WA_TOKENS`): nenhum dos ~15 pontos de chamada muda de import
    - Segue o precedente de `web/lib/slug.ts` e `web/lib/dom.ts` (D8)
    - _Requisitos: 11.2, 11.3_

  - [x] 2.3 Alterar `web/templates/perks.ts` para `perksList` delegar em `normalizePerks`
    - `perksItemsHtml` fica onde está, porque importa `esc` de `web/lib/dom.ts` e essa dependência do DOM não sobe para `src/`
    - _Requisitos: 11.1, 11.4, 11.5_

  - [x] 2.4 Escrever o teste da Propriedade 3 em `tests/storeCustom.property.test.ts`
    - `// Feature: melhorias-loja-e-admin, Property 3: Para qualquer entrada, resolveWaPhone e normalizePerks nunca lançam e devolvem sempre valores do tipo declarado`
    - Um único teste de propriedade, com `customizationArb` mais valores crus (`null`, `undefined`, número, string, array) e `{ numRuns: 100 }` no mínimo: `resolveWaPhone` devolve sempre string não vazia, `normalizePerks` devolve sempre ≥ 1 item com `icon` e `text` string, e `waLink(resolveWaPhone(x), "…")` produz URL válido
    - **Não é opcional:** o critério 11.6 exige cobertura automatizada dos casos 11.2, 11.3 e 11.4
    - _Requisitos: 11.2, 11.3, 11.4, 11.5, 11.6_ · _Propriedade 3_

- [x] 3. Rodapé do Lumière adequado a uma loja e editável (R9)
  - [x] 3.1 Acrescentar `footer.extraTitle?` e `footer.extraText?` a `StoreCustomization` em `web/templates/types.ts`
    - Só os dois campos novos; nenhum campo existente é tocado
    - _Requisitos: 9.2_

  - [x] 3.2 Alterar o 4.º bloco do rodapé em `web/templates/lumiere.ts`
    - Substituir o título e o texto chumbados («O Atelier» / «Junte-se ao círculo…») por leitura de `footer.extraTitle` e `footer.extraText`, com omissões «Compras seguras» e «Entrega em toda Angola, pagamento por Multicaixa ou na entrega, e apoio pelo WhatsApp.»
    - Marcar ambos com `data-edit="footer.extraTitle"` e `data-edit="footer.extraText"` (`MODELO-GUIA.md` §6.1)
    - Não tocar nos três primeiros blocos do rodapé
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 12.5, 12.6_

  - [x] 3.3 Incrementar `__v` do modelo «Lumière Chic» no Semeador_De_Modelos (`web/supabase/models.ts`)
    - Incrementar em `defaultFactoryModels()` para que `seedDefaultModels()` re-sincronize a Personalização de fábrica na próxima verificação de `__v`
    - _Requisitos: 9.5_

  - [x]* 3.4 Escrever `tests/lumiereFooter.test.ts` com asserções sobre a fonte
    - Padrão `readFileSync` de `tests/seoInfra.test.ts`: o texto-fonte de `web/templates/lumiere.ts` contém `data-edit="footer.extraTitle"` e `data-edit="footer.extraText"` e já não contém «O Atelier»
    - _Requisitos: 9.1, 9.3_

- [x] 4. Página de loja não encontrada com convite a criar loja (R10)
  - [x] 4.1 Criar a Pagina_Loja_Nao_Encontrada partilhada e aplicá-la às cinco vistas públicas
    - Título de loja não encontrada, endereço pedido pelo visitante, ação principal para o percurso de criação de Loja (`/criar`) e ação secundária para `/lojas`; todas as ligações com caminhos reais, sem fragmento `#` (`SEO.md` §5.1)
    - Aplicar em `web/views/storefront.ts`, `web/views/product.ts`, `web/views/category.ts`, `web/views/cart.ts` e `web/views/checkout.ts`, para as cinco mostrarem o mesmo ecrã
    - Texto em português de Portugal
    - _Requisitos: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.10, 12.6_

  - [x] 4.2 Alinhar `notFoundHtml` de `api/prerender.js` com a versão da SPA
    - Mesma mensagem e mesmo convite a criar Loja, sem `#` nas ligações; manter HTTP **404** com `noindex` para Loja inexistente ou não publicada e HTTP **410** com `noindex` para conta sem acesso ativo (`SEO.md` §3.5)
    - _Requisitos: 10.7, 10.8, 10.9, 12.4_

  - [x]* 4.3 Escrever `tests/notFoundPage.test.ts` com asserções sobre a fonte
    - `readFileSync` das cinco vistas e de `api/prerender.js`: mesma mensagem e mesmo convite nos dois lados, ausência de `href="#`, presença de `404` e `410` com `noindex`
    - _Requisitos: 10.6, 10.7, 10.8, 10.9_

- [x] 5. SMS de confirmação e domínio próprio «Em breve» (R6)
  - [x] 5.1 Introduzir `COMING_SOON = { sms: true, customDomain: true }` e as guardas em `web/views/dashboard.ts`
    - Etiqueta «Em breve» na funcionalidade «SMS de confirmação» e na secção de domínio próprio
    - Devolução antecipada nos três manipuladores: comprar créditos de SMS (`openSmsCheckout` não abre), ativar SMS, guardar domínio
    - Continuar a **ler** `stores.sms_credits` para apresentar o saldo com a indicação de que a funcionalidade fica disponível em breve; nunca escrever nessa coluna
    - Não tocar no chip de SMS do Painel_Admin, que deriva de `customization.sms.enabled`
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9_ · _Decisão D6_

  - [x]* 5.2 Escrever `tests/comingSoon.test.ts`
    - Asserções sobre a fonte: as duas etiquetas «Em breve» existem, as três devoluções antecipadas existem, e nenhum caminho do Checkout envia SMS (R6.6 já é verdade na linha de base; o teste é a guarda de que continua)
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 6. Validação da Fase A
  - `get_diagnostics` nos ficheiros tocados de `src/` e `tests/` → `npm run build` → `npm run web:build` → `npx vitest run`
  - Critério de saída: **nenhum dos 197 testes da linha de base muda de resultado**; os testes novos desta fase passam; zero erros de tipos e de build
  - Verificar as cinco invariantes do `SEO.md` §5 e a editabilidade total do `MODELO-GUIA.md` §6.1 nas secções tocadas (rodapé do Lumière, Pagina_Loja_Nao_Encontrada)
  - _Requisitos: 12.1, 12.2, 12.3, 12.4, 12.5_

### Fase B — limpeza, conteúdo e localizações (custo 1,5×)

R1, R8, R2, R5. Contém o único passo destrutivo em produção desta spec. A
sequência de **D7 não é comutativa**: verificação entregue e corrida **antes** de
existir botão que apague; remoção do registo **em último**.

- [x] 7. Preset «Ekolo Sports» e remoção dos modelos FoodMart e Neon Lab (R1, sequência D7)
  - [x] 7.1 Renomear o nome apresentado do Preset em `web/templates/presets.ts` (passo 1 de D7)
    - `TEMPLATE_PRESETS[0].name = "Ekolo Sports"`; **o identificador `vermelho-moderno` não é tocado** — `getPreset(id)` e a marca `__basedOn` das Lojas em produção dependem dele
    - `getRecommendedPreset()` continua a devolver este Preset, com assinatura não anulável inalterada
    - ⚠ **Defeito em produção revelado pela renomeação, já corrigido nesta tarefa:** `seedDefaultModels` em `web/supabase/models.ts` emparelhava as Loja_Modelo existentes **pelo nome**, e a renomeação levou o Semeador a criar uma **segunda Loja_Modelo duplicada**
    - `FactoryModel` ganhou `previousNames?: string[]`; o modelo de fábrica deste Preset declara `previousNames: ["Ekolo sports", "Vermelho Moderno"]` — **todas** as grafias anteriores, porque o Preset foi renomeado duas vezes
    - `resolveExistingModel` procura pelo nome atual e **só depois** pelos nomes anteriores, percorrendo todos; ao encontrar por um nome anterior, `renameTemplateModel` renomeia a Loja_Modelo existente (`stores.name` + `customization.__template.name`) em vez de criar uma segunda
    - A ordem «nome atual primeiro» é a **guarda** que impede duas Loja_Modelo com o mesmo nome
    - A deteção de modelo «em falta» em `renderModelos()` de `web/views/adminPanel.ts` passou a usar `factoryModelNameKeys`, porque era ela que disparava o Semeador automaticamente só por o Administrador abrir o separador «Modelos»
    - `tests/seedRename.test.ts` (novo) guarda estas regras com asserções sobre o texto-fonte
    - 🖐 **Limpeza manual pendente do lado do Administrador:** existem duas Loja_Modelo em produção; apagar a duplicada e correr «Importar predefinidos» uma vez renomeia a que fica. Isto **não** é executável por um agente
    - _Requisitos: 1.1, 1.2, 1.3_ · _Assunção `[A1]`_

  - [x]* 7.2 Escrever `tests/presets.test.ts`
    - Nome «Ekolo Sports» presente, id `vermelho-moderno` intacto, `getRecommendedPreset()` não anulável
    - _Requisitos: 1.1, 1.2, 1.3_

  - [x] 7.3 ⚠ RISCO Implementar `adminStoresUsingTemplate(ids: string[])` em `web/supabase/admin.ts` (passo 2 de D7)
    - Consulta que devolve **todas** as Lojas — Loja_Modelo incluídas, ao contrário de `listStores()`, que as filtra — com `template_id` em `ids` **ou** `customization.__basedOn` em `ids`, partidas em dois grupos: Loja_Modelo e Lojas de cliente
    - **Esta tarefa é entregue antes de existir qualquer botão que apague.** É a rede de segurança da assunção `[A4]`; não é opcional, é guarda de dados de produção
    - _Requisitos: 1.7, 1.8_ · _Decisão D7_

  - [x] 7.4 ⚠ RISCO Ligar a verificação ao diálogo de confirmação da secção «Modelos» do Painel_Admin (`web/views/adminPanel.ts`)
    - Antes de apagar, apresentar a contagem devolvida por `adminStoresUsingTemplate(["neonlab", "foodmart"])`
    - **Se o grupo de Lojas de cliente não estiver vazio, a eliminação não avança:** apresentar a lista de Lojas afetadas e manter o Modelo_De_Loja registado (R1.8)
    - Com o grupo vazio, a confirmação apaga a Loja_Modelo e os respetivos Produtos, banners e assets de demonstração (cascata)
    - _Requisitos: 1.6, 1.7, 1.8, 1.9_ · _Decisão D7_

  - [ ]* 7.5 🖐 MANUAL Correr `adminStoresUsingTemplate(["neonlab", "foodmart"])` em produção e ler o resultado (passo 3 de D7)
    - Ação humana, não executável por um agente de código: abrir a secção «Modelos» do Painel_Admin em produção, correr a verificação e **ler a lista antes de confirmar qualquer eliminação**
    - Grupo de Lojas de cliente vazio → a eliminação pode avançar. Grupo não vazio → a eliminação **não avança** e o Modelo_De_Loja mantém-se registado
    - A eliminação apaga Lojas publicadas reais e **é irreversível**: as Loja_Modelo apagadas não voltam, porque o Semeador deixa de as saber recriar (passo 5)
    - Está marcada como opcional e colocada na última onda do grafo apenas para não bloquear a automação. **A regra de negócio não muda: tem de correr antes de apagar as Loja_Modelo**
    - _Requisitos: 1.7, 1.8_ · _Decisão D7, assunção `[A4]`_

  - [x] 7.6 Remover `neonlab` e `foodmart` do registo e do Semeador (passo 5 de D7 — **o último**)
    - `web/templates/registry.ts`: excluir as entradas `neonlab` e `foodmart` de `TEMPLATE_REGISTRY`; `getTemplate` de um id desconhecido continua a devolver o primeiro Modelo_De_Loja registado
    - `web/supabase/models.ts`: excluir «Neon Lab» e «FoodMart» da lista de modelos de fábrica
    - `web/lib/cartDrawer.ts`: remover os ramos de tema desses modelos (`ensureCartDarkStyle`, `ensureCartFmStyle`), que ficam sem uso
    - **Ordem obrigatória:** só depois de 7.5 e da eliminação das Loja_Modelo. Se o registo for removido primeiro, as demos publicadas e indexadas passam a ser servidas com o Modelo_De_Loja errado e o Painel_Admin deixa de as apresentar para as poder apagar
    - _Requisitos: 1.4, 1.5, 1.10_ · _Decisão D7_

  - [x]* 7.7 Escrever `tests/registry.test.ts`
    - `neonlab` e `foodmart` fora de `TEMPLATE_REGISTRY`; `getTemplate` com id desconhecido devolve o primeiro registado
    - _Requisitos: 1.4, 1.10_

- [x] 8. Ajudas por IA alinhadas com modelos prontos de site (R8)
  - [x] 8.1 Reescrever os âmbitos `site`, `editor` e `logo` em `api/assistant.js`
    - `site`: descrever a criação de uma Loja como escolha de um Modelo_De_Loja pronto seguida de personalização de textos, fotografias e cores; percurso pela ordem criar conta → escolher modelo → personalizar → publicar
    - `editor`: numa Loja com `customization.__locked` as ações são editar textos, trocar fotografias e mudar cores, mantendo-se a estrutura do Modelo_De_Loja aplicado
    - `logo`: indicar cinco propostas
    - Manter intactos o âmbito `seo` (uma frase, até 160 caracteres, pt-PT), o âmbito `seotitle` (que **existe** e continua aceite), a recusa numa frase fora de âmbito e a resposta em português de Portugal
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 8.8, 8.9, 8.10_

  - [x] 8.2 Atualizar o texto de ajuda da página inicial em `web/lib/aiAgent.ts`
    - A saudação do âmbito `site` (usada por `mountAiAgent(..., { scope: "site" })` em `web/views/landing.ts`) passa a falar de modelos prontos de site que se personalizam
    - _Requisitos: 8.5, 12.6_

  - [x] 8.3 Corrigir a §7.3 do `SEO.md`
    - A §7.3 afirma que `api/logo.js` foi apagado e que o âmbito `seotitle` saiu de `api/assistant.js`. Leitura do código a `22cee78` confirma que **ambos existem e funcionam**: corrigir o texto para descrever o estado real
    - Tarefa de documentação, deliberada: o `SEO.md` é a fonte das invariantes que o R12.4 obriga a cumprir, e uma fonte desatualizada é uma armadilha para quem a seguir
    - _Requisitos: 8.8, 12.4_

  - [x]* 8.4 Escrever `tests/assistantScopes.test.ts` com asserções sobre a fonte
    - `readFileSync` de `api/assistant.js`: os cinco âmbitos (`site`, `editor`, `seo`, `seotitle`, `logo`) estão presentes, o texto novo de `site` e `editor` está lá, e o âmbito `seo` mantém a regra dos 160 caracteres
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 8.8_

- [x] 9. Gerador de logótipos com contrato de erro e selo Beta (R2)
  - [x] 9.1 ⚠ RISCO Alterar `web/lib/logoApi.ts`: `generateLogos` passa de `Promise<string[]>` a `Promise<LogoResult>`
    - Exportar `LOGO_PROPOSALS = 5` e o tipo discriminado `LogoResult` com `ok` (`images`, `requested`, `missing`), `server-error` (`status`, `error`, `detail?`) e `network-error` (`message`)
    - `missing = requested - images.length`; o `error`/`detail` são os que `api/logo.js` devolve, sem texto inventado pelo cliente; o `catch` do `fetch` passa a `network-error` em vez de `return []`
    - `improveLogoDescription` fica intocada
    - Mudança de assinatura com dois pontos de chamada a atualizar (9.2 e 9.3) — daí o risco
    - _Requisitos: 2.1, 2.3, 2.4, 2.5, 2.6, 2.11_ · _Decisão D3_

  - [x] 9.2 Atualizar o ponto de chamada em `web/views/wizard.ts`
    - Tratar as três variantes de `LogoResult`; apresentar todas as propostas recebidas como PNG com fundo transparente e, quando `missing > 0`, dizer quantas faltaram
    - Estado de progresso com submissões adicionais rejeitadas enquanto espera; ação «Tentar de novo» que repete com a mesma descrição; selo «Beta» no cabeçalho da secção
    - Guardar a proposta escolhida em `customization.logos`
    - _Requisitos: 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 2.9, 2.10_

  - [x] 9.3 Atualizar o ponto de chamada em `web/views/dashboard.ts` (separador `#/painel/logotipo`)
    - Mesmo tratamento das três variantes, mesmo estado de progresso, mesma ação «Tentar de novo» e mesmo selo «Beta»
    - _Requisitos: 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 2.9, 2.10_

  - [x]* 9.4 Escrever `tests/logoApi.test.ts` com exemplos
    - Contorno já em uso no repositório: `await import()` com o especificador numa constante mais stub de `globalThis.fetch`; três exemplos — cinco propostas, menos de cinco (`missing > 0`), `!res.ok` (`server-error` com `error`/`detail`) e `fetch` rejeitado (`network-error`)
    - Sem teste de propriedade: o valor de R2 está no contrato de erro, não em variação de entrada
    - _Requisitos: 2.1, 2.3, 2.4, 2.5, 2.6_

- [x] 10. Várias localizações no bloco de mapa (R5)
  - [x] 10.1 Criar `src/services/locations.ts` com `StorePlace`, `resolveLocations` e `mapEmbedSrc`
    - `resolveLocations(block, footerLocation?)`: `block.places` com ≥ 1 entrada → formato novo; senão `block.address`/`lat`/`lng` → localização única legada; senão morada do rodapé. Devolve sempre ≥ 1 entrada, é total e nunca lança
    - `mapEmbedSrc(place, fallbackAddress?)`: generalização de `boutiqueMapSrc` do Lumière — com coordenadas usa OpenStreetMap (`marker=lat,lng`), só com morada usa o embed da Google, sem chave de API
    - _Requisitos: 5.3, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 10.2 Acrescentar `places?: { name?, address?, lat?, lng? }[]` à variante `location` de `ContentBlock` em `web/templates/types.ts`
    - Forma **idêntica** a `lumiere.boutiques[]` (`MODELO-GUIA.md` §8), para partilhar `mapEmbedSrc`
    - `address`/`lat`/`lng` do bloco **não são removidos**: continuam a ser lidos quando `places` está vazio
    - _Requisitos: 5.9_ · _Decisão D4_

  - [x] 10.3 Alterar `locationBlock` e `locationByVariant` em `web/templates/blocks.ts`
    - Iterar `resolveLocations(...)` e emitir um mapa por localização, com nome e morada marcados com `data-edit="blocks.<i>.places.<j>.name"` e `data-edit="blocks.<i>.places.<j>.address"`
    - O HTML pré-renderizado passa a conter todos os mapas e as respetivas moradas, sem JavaScript
    - _Requisitos: 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 12.5_

  - [x] 10.4 Alterar `web/templates/lumiere.ts` para usar `mapEmbedSrc` em `lumiere.boutiques[]`
    - Elimina a duplicação de `boutiqueMapSrc`; comportamento visível inalterado
    - _Requisitos: 5.6, 5.7_

  - [x] 10.5 Acrescentar a gestão de localizações ao popover do bloco `location` em `web/views/editor.ts`
    - «Adicionar localização», «Remover» e «Escolher no mapa» por localização, ligando `openMapPicker` de `web/lib/mapPicker.ts` (Leaflet, pin arrastável, sem chave de API)
    - Nome, morada e coordenadas editáveis por localização
    - **Materializar `blocks[i].places` no arranque do editor, antes da baseline `savedJson`**, como manda o `MODELO-GUIA.md` §6.1 para arrays com fallback — senão o editor marca alterações que o Dono não fez
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.11, 12.5_

  - [x] 10.6 Espelhar as localizações em `api/_seo.js` e acrescentar a guarda de paridade a `tests/seoInfra.test.ts`
    - Paridade obrigatória do `SEO.md` §5.2, porque o HTML pré-renderizado tem de coincidir com o que a SPA mostra (R5.10)
    - **Só as localizações.** Nenhum dos outros cinco módulos puros é espelhado: a decisão de pagamento, a mensagem de WhatsApp, a identidade de linha de Carrinho e as métricas de admin não aparecem no HTML pré-renderizado
    - Acrescentar a guarda; não alterar nenhum teste existente do ficheiro
    - _Requisitos: 5.10, 12.4_ · _Decisão D9_

  - [x]* 10.7 Escrever `tests/locations.test.ts` com exemplos
    - Três exemplos, um por caso da cascata: lista de `places`, localização única legada (`address`/`lat`/`lng`), lista vazia → morada do rodapé; mais `mapEmbedSrc` com e sem coordenadas
    - Sem teste de propriedade: a regra é uma cascata de três casos enumeráveis
    - _Requisitos: 5.5, 5.6, 5.7, 5.8, 5.9_

- [x] 11. Validação da Fase B
  - `get_diagnostics` nos ficheiros tocados de `src/` e `tests/` → `npm run build` → `npm run web:build` → `npx vitest run`
  - Critério de saída: **nenhum dos 197 testes da linha de base muda de resultado**; os testes novos passam
  - Verificar a §5 do `SEO.md` (com a guarda de paridade nova) e a §6.1 do `MODELO-GUIA.md` no bloco `location`
  - _Requisitos: 12.1, 12.2, 12.3, 12.4, 12.5_

### Fase C — dashboard de admin (custo 1,5×)

R7 sozinho. Duas alterações de acesso a dados, ambas de leitura, ambas declaradas
em **D5**. Entrega a Propriedade 5.

- [x] 12. Visão geral profissional no Painel_Admin (R7)
  - [x] 12.1 Criar `src/services/adminMetrics.ts` com `businessHealth`, `monthlyEvolution` e `attentionLists`
    - `businessHealth`: receita do mês corrente (transações de serviço `paid` com `paidAt` no mês), assinaturas ativas, contas em teste a expirar, conversão de teste para pago (0..1), Lojas publicadas, Lojas suspensas (via `resolveBilling` de `src/services/billing.ts` aplicado à conta dona)
    - `monthlyEvolution`: 6 meses mais recentes, do mais antigo para o mais recente, com receita e número de contas
    - `attentionLists`: as cinco listas (levantamentos por aprovar, pagamentos `open`/`failed`/`expired`, contas a expirar em 7 dias, Lojas sem Produtos, Lojas não publicadas), cada item com `href` para o ecrã do Painel_Admin que resolve a ação
    - **Todas as funções excluem Loja_Modelo (`customization.__template`) e contas de Administrador** — a exclusão é aplicada em treze agregações distintas
    - Não confundir `adminOverview().salesTotal` (volume de vendas das Lojas) com a receita da Plataforma (transações de serviço): são grandezas diferentes e levam rótulos distintos
    - _Requisitos: 7.2, 7.3, 7.4, 7.5, 7.8_ · _Propriedade 5, decisão D5_

  - [x] 12.2 Alterar `web/supabase/admin.ts`: `trial_ends_at` e contagem de Produtos por Loja
    - Acrescentar `trial_ends_at` ao `select` **já existente** de `listAccounts()` e `trialEndsAt: string | null` a `AdminAccount`. A coluna existe em `profiles` e já é lida em `web/composition.ts`; sem ela não há «contas em teste a expirar» nem conversão de teste para pago
    - Acrescentar `adminStoreProductCounts(): Promise<ReadonlyMap<string, number>>` — consulta nova, `from("products").select("store_id")` contada em memória, sem `join`
    - Só leitura: nada escreve, nada migra
    - _Requisitos: 7.2, 7.4, 7.9_ · _Decisão D5 `[A3]`_

  - [x] 12.3 Reescrever a Visão geral em `web/views/adminPanel.ts`
    - Três secções, por esta ordem: saúde do negócio, «A precisar de atenção», histórico recente (transações de serviço e contas mais recentes, truncadas)
    - Consumir `adminMetrics.ts` com dados de `adminOverview`, `listAccounts`, `listStores`, `listAllWithdrawals`, `listServiceTransactions` e `adminStoreProductCounts`
    - Evolução mensal de receita e de contas nos 6 meses mais recentes; ligação em cada linha das cinco listas; mensagem de estado vazio por lista sem itens; estado de carregamento; «Atualizar» recarrega todas as secções
    - Valores monetários por `formatKz`; layout sem deslocamento horizontal a 360 px; separadores atuais mantidos (Visão geral, Contas, Lojas, Modelos, Transações, Levantamentos); `#F95901` é cor de interface de administração, não de Loja
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 12.7_

  - [x]* 12.4 Estender `tests/geradores.ts` com `adminSnapshotArb`
    - Conjunto arbitrário de contas (com e sem `is_admin`), Lojas (com e sem `__template`), levantamentos, transações de serviço e contagens de Produtos, tipado pelos `…Like` de `src/services/adminMetrics.ts`
    - _Requisitos: 7.2, 7.8_

  - [x]* 12.5 Escrever o teste da Propriedade 5 em `tests/adminMetrics.property.test.ts`
    - `// Feature: melhorias-loja-e-admin, Property 5: Para qualquer conjunto de dados de admin, acrescentar uma Loja_Modelo não altera nenhuma métrica nem nenhuma lista, e todas as métricas se mantêm nos seus limites`
    - Um único teste de propriedade, com `adminSnapshotArb` e `{ numRuns: 100 }` no mínimo: acrescentar uma Loja_Modelo não altera nenhuma das seis métricas nem nenhuma das cinco listas; nenhuma métrica é negativa; a conversão fica em [0, 1]; nenhuma contagem de Lojas excede o número de Lojas que não são Loja_Modelo
    - _Requisitos: 7.2, 7.4, 7.8_ · _Propriedade 5_

  - [x]* 12.6 Escrever `tests/adminMetrics.test.ts` com exemplos
    - Evolução de 6 meses com meses sem dados, listas vazias com estado vazio, e o `href` correto de cada tipo de item
    - _Requisitos: 7.3, 7.5, 7.6_

- [x] 13. Validação da Fase C
  - `get_diagnostics` nos ficheiros tocados de `src/` e `tests/` → `npm run build` → `npm run web:build` → `npx vitest run`
  - Critério de saída: **nenhum dos 197 testes da linha de base muda de resultado**; os testes novos passam
  - _Requisitos: 12.1, 12.2, 12.3_

### Fase D — variações de produto (custo 3×; adiável indefinidamente)

R4 sozinho. **É o único requisito que altera a forma dos dados de um Produto** e a
fase que nenhuma outra bloqueia. Toda esta fase é ⚠ RISCO por natureza; as tarefas
marcadas são as que alteram forma de dados ou assinaturas públicas.

- [x] 14. Domínio e módulos puros das Variação (R4)
  - [x] 14.1 ⚠ RISCO Acrescentar os tipos de Variação ao domínio e à Personalização
    - `src/models/domain.ts`: `ProductVariationAxis`, `VariationPriceMode` (`"substitui" | "acresce"`), `ProductCombination` (`values`, `price?`, `stock?`), `ProductVariations` (`enabled`, `priceMode`, `axes`, `combinations`)
    - `web/templates/types.ts`: `productVariations?: Record<string, ProductVariations>` em `StoreCustomization` — serialização na Personalização, **não** em coluna nova, pelo precedente de `productImages` (`MODELO-GUIA.md` §9)
    - Altera a forma dos dados de um Produto: as Variação ficam fora do tipo `Product` e fora da validação de `src/services/productService.ts`, e é `normalizeVariations` que faz a guarda
    - _Requisitos: 4.1, 4.2, 4.4, 4.5, 4.12, 4.16_ · _Decisão D1_

  - [x] 14.2 ⚠ RISCO Criar `src/services/variations.ts`
    - `normalizeVariations(custom: unknown, productId): ProductVariations | null` — total, nunca lança; devolve `null` quando `productVariations` não é objeto, a entrada do Produto não é objeto, `axes` não é array, não há eixos com valores, ou `enabled !== true`; descarta eixos com nome vazio, valores duplicados e Combinação com `values` de comprimento errado. É este `null` que garante o comportamento atual inalterado
    - `combinationsOf`, `syncCombinations`, `variantKeyOf` (separador U+001F), `variantLabelOf`, `findCombination`, `effectivePrice` (limitado a 0 por baixo), `combinationAvailable` (`stock === 0` esgotado, ausente = não controlado), `missingAxes`, `variationsPlainText`
    - _Requisitos: 4.3, 4.6, 4.7, 4.8, 4.10, 4.11, 4.12, 4.15, 4.16, 4.18, 4.20_ · _Propriedade 2_

  - [x] 14.3 Criar `src/services/cartLine.ts` com `CartLineIdentity` e `cartLineKey`
    - `cartLineKey({ productId, variantKey })` = `productId + "|" + (variantKey ?? "")`; para Produto sem Variação devolve `"<id>|"`, o que mantém os carrinhos já gravados em `localStorage` a funcionar sem migração
    - Duas Combinação distintas do mesmo Produto dão duas chaves distintas, logo duas linhas independentes
    - _Requisitos: 4.13, 4.14_

  - [x]* 14.4 Estender `tests/geradores.ts` com `variationsArb` e `combinationArb`
    - `ProductVariations` arbitrárias (eixos, valores, `priceMode`) e `ProductCombination` arbitrárias (com e sem `price`, com `stock` ausente, `0` e positivo), incluindo valores negativos de `price` para exercer o limite inferior de `effectivePrice`
    - _Requisitos: 4.6, 4.7, 4.8_

  - [x]* 14.5 Escrever o teste da Propriedade 2 em `tests/variations.property.test.ts`
    - `// Feature: melhorias-loja-e-admin, Property 2: Para qualquer preço base, Combinação e modo de preço, o preço efetivo nunca é negativo e é igual ao preço base quando a Combinação não define preço`
    - Um único teste de propriedade, com `combinationArb` e `{ numRuns: 100 }` no mínimo: sem preço na Combinação → preço base; «substitui» com preço → preço da Combinação; «acresce» → soma; e sempre finito e ≥ 0
    - _Requisitos: 4.6, 4.7, 4.8, 4.16_ · _Propriedade 2_

  - [x]* 14.6 Escrever `tests/variations.test.ts` com exemplos
    - Produto cartesiano de dois eixos (R4.3), remoção de um valor de eixo com preservação das Combinação restantes (R4.19, R4.20), `missingAxes` com seleção incompleta (R4.10), Combinação esgotada com `stock === 0` (R4.11)
    - _Requisitos: 4.3, 4.10, 4.11, 4.19, 4.20_

  - [x]* 14.7 Escrever `tests/cartLine.test.ts` com exemplos
    - Duas Combinação = duas linhas com quantidade própria; item legado sem `variantKey` dá `"<id>|"` e continua a encontrar-se
    - _Requisitos: 4.13, 4.16_

- [x] 15. Pontos de chamada das Variação (R4)
  - [x] 15.1 ⚠ RISCO Alterar `web/lib/cart.ts`: `CartItem` e as assinaturas de `setQuantity` e `removeFromCart`
    - `CartItem` ganha `variantKey?: string` e `variantLabel?: string`; `price` passa a ser o **preço efetivo** da linha
    - `setQuantity(storeId, lineKey, quantity)` e `removeFromCart(storeId, lineKey)`: o segundo parâmetro **muda de `productId` para `lineKey`**; o estado passa a ser chaveado por `cartLineKey`, não por `productId`
    - **Mudança de assinatura, não silenciosa:** quem passar um `productId` cru deixa de encontrar a linha, porque a chave de um item sem `variantKey` é `"<productId>|"`. Os pontos de chamada a atualizar são exatamente dois ficheiros — `web/lib/cartDrawer.ts` e `web/views/cart.ts` (tarefa 15.2)
    - `web/lib/cart.ts` depende de `localStorage` e fica fora do programa de testes; a validação é `npm run web:build` mais os testes de `cartLine.ts`
    - _Requisitos: 4.13, 4.14, 4.15, 4.16_

  - [x] 15.2 ⚠ RISCO Atualizar os pontos de chamada de `setQuantity`/`removeFromCart`
    - `web/lib/cartDrawer.ts` e `web/views/cart.ts` passam a chamar com `cartLineKey(item)`
    - Ambos passam a apresentar `variantLabel` em cada linha que a tenha
    - Sem esta tarefa a Fase D fica com pontos de chamada a passar `productId` a um parâmetro `lineKey` — e `web/` não é verificado por tipos, por isso o `tsc` não o apanha: a guarda é `npm run web:build` mais os testes
    - _Requisitos: 4.13, 4.14_

  - [x] 15.3 Acrescentar a gestão de Variação ao Formulario_De_Produto (`web/lib/productForm.ts`)
    - Controlo que ativa e desativa as Variação; definição de eixos com nome escolhido pelo Dono e lista de valores; lista de Combinação vinda de `combinationsOf`; modo de preço «substitui o preço base» / «acresce ao preço base»; preço e stock por Combinação
    - Remover uma Variação e remover um valor de Variação, com `syncCombinations` a descartar as Combinação que usavam o valor removido e a preservar as restantes
    - Gravar em `customization.productVariations[productId]`
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.19, 4.20_

  - [x] 15.4 Apresentar os seletores de Variação na Pagina_De_Produto
    - `web/views/product.ts` e as funções `renderProduct` dos Modelo_De_Loja (`web/templates/productPage.ts` e os modelos que a especializam): um seletor por eixo, preço efetivo por `effectivePrice`, Combinação com `stock === 0` marcada «Esgotado» e rejeitada, seleção incompleta rejeitada com os nomes das Variação em falta
    - Seletores com a tipografia, os cantos e as cores do próprio Modelo_De_Loja (`MODELO-GUIA.md` §0.2); botões de marca com `var(--brand)` e `var(--brand-ink)`
    - Produto com `normalizeVariations` a devolver `null` corre exatamente o código de hoje: sem seletores, sem `variantKey`, preço igual a `product.price`
    - _Requisitos: 4.9, 4.10, 4.11, 4.12, 4.16, 4.17, 12.7_

  - [x] 15.5 Enviar o preço efetivo por linha no Checkout (`web/views/checkout.ts`)
    - `products()` usa `i.price` de cada linha, que já é o preço efetivo da Combinação; a etiqueta da Combinação aparece na mensagem de WhatsApp **sem alterar `cartMessage.ts`**, porque `variantLabel` já é lido lá desde a Fase A
    - _Requisitos: 4.15, 3.11_

  - [x] 15.6 Espelhar `variationsPlainText` em `api/_seo.js` e acrescentar a guarda de paridade a `tests/seoInfra.test.ts`
    - O HTML pré-renderizado, sem JavaScript, passa a apresentar o nome de cada Variação e os respetivos valores como texto legível (`api/prerender.js` já lê `stores.customization`)
    - Paridade obrigatória do `SEO.md` §5.2, **só para esta função** — é a segunda e última das duas paridades desta spec
    - _Requisitos: 4.18, 12.4_ · _Decisão D9_

- [ ] 16. Validação da Fase D
  - `get_diagnostics` nos ficheiros tocados de `src/` e `tests/` → `npm run build` → `npm run web:build` → `npx vitest run`
  - Critério de saída: **nenhum dos 197 testes da linha de base muda de resultado**; os testes novos passam
  - Verificar as cinco invariantes do `SEO.md` §5 (com as duas guardas de paridade) e a §0.2 do `MODELO-GUIA.md` nos seletores de cada Modelo_De_Loja
  - _Requisitos: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7_

## Notes

**Tarefas opcionais (`*`) e a razão.** São as que se podem saltar para entrega mais
rápida sem deixar código órfão: os testes de exemplo e sobre a fonte (1.7, 1.8,
3.4, 4.3, 5.2, 7.2, 7.7, 8.4, 9.4, 10.7, 12.5, 12.6, 14.5, 14.6, 14.7), as
extensões de `tests/geradores.ts` que só servem testes opcionais (12.4, 14.4) e a
tarefa manual (7.5, por não ser executável por um agente). **Duas exceções
deliberadas:**

- **2.4 não é opcional** — o critério 11.6 exige cobertura automatizada dos casos
  11.2, 11.3 e 11.4. É o teste que apanha a avaria da Pagina_De_Produto em branco.
- **7.3 não é opcional** — é a verificação em base de dados que protege dados de
  produção. Guarda de dados nunca é opcional.

**A tarefa manual (7.5) e a regra de negócio que não muda.** Está marcada como
opcional e colocada na **última onda** do grafo apenas para não bloquear a
automação das outras tarefas. Isso é escalonamento, não permissão: a regra de
negócio mantém-se inteira — **`adminStoresUsingTemplate` tem de correr em produção
e o resultado tem de ser lido antes de apagar qualquer Loja_Modelo**, e a remoção
de `neonlab`/`foodmart` de `TEMPLATE_REGISTRY` (7.6) é o **último** passo, depois
da eliminação. Ordem invertida = demos publicadas e indexadas servidas com o
Modelo_De_Loja errado, porque `getTemplate` de um id desconhecido devolve o
primeiro registado. A eliminação apaga Lojas publicadas reais e é irreversível.

**As cinco propriedades, um teste cada, um ficheiro cada.**

| Propriedade | Ficheiro | Tarefa | Fase |
|---|---|---|---|
| 1 — visibilidade dos métodos online: `payments.onlineEnabled === true \|\| __demoPayments === true`, insensível a `__basedOn`/`__template` | `tests/paymentVisibility.property.test.ts` | 1.7 | A |
| 3 — leitura de campos legados nunca lança | `tests/storeCustom.property.test.ts` | 2.4 | A |
| 4 — a mensagem contém a encomenda inteira | `tests/cartMessage.property.test.ts` | 1.8 | A |
| 5 — métricas ignoram Loja_Modelo e ficam nos limites | `tests/adminMetrics.property.test.ts` | 12.5 | C |
| 2 — preço efetivo nunca negativo | `tests/variations.property.test.ts` | 14.5 | D |

Cada um leva a etiqueta `// Feature: melhorias-loja-e-admin, Property {n}: {texto}`
e `numRuns: 100` no mínimo. **Geradores partilhados vivem só em
`tests/geradores.ts`** — ficheiro novo nesta linha de base, criado em 1.6 e
estendido em 12.4 e 14.4; nenhum ficheiro de teste define geradores próprios.

**A Fase D é adiável e continua candidata a spec própria.** Nada das Fases A, B ou
C depende dela. A única costura é `variantLabel` na mensagem de WhatsApp: na Fase A
é um campo opcional que **nunca vem preenchido**, e a Propriedade 4 já cobre os
dois casos. Quando a Fase D entrar, a etiqueta aparece sem alterar
`cartMessage.ts`. Se R4 sair desta spec, os critérios 3.11, 4.13 e 4.14 tornam-se
não-aplicáveis por ausência de Combinação e todo o resto fecha. A reversão da Fase
D deixa os dados em `customization.productVariations` para trás, ignorados e
inofensivos — é a razão principal pela qual D1 escolheu a Personalização em vez de
uma coluna nova.

**`web/` não é verificado por tipos.** O `tsconfig.json` compila `src/**` e
`tests/**` com `lib: ["ES2022"]`, sem DOM. Consequência prática em três sítios
deste plano: 1.3/1.4/1.5, 15.1/15.2 e 15.4 alteram ficheiros que o `tsc` não vê, por
isso a mudança de assinatura de `setQuantity`/`removeFromCart` **não é apanhada
por `npm run build`** — a validação é `npm run web:build` mais os testes dos
módulos puros correspondentes. Pela mesma razão, toda a regra nova testável vive em
`src/services/` (D8): um teste em `tests/` não pode importar estaticamente um
módulo que dependa de `document`, `window` ou `localStorage`.

**Paridade com `api/_seo.js` só onde é obrigatória (D9).** Duas tarefas, não sete:
10.6 (localizações, R5.10) e 15.6 (`variationsPlainText`, R4.18). Os outros cinco
módulos puros não aparecem no HTML pré-renderizado; espelhá-los seria custo de
manutenção com zero benefício.

**A correção do `SEO.md` §7.3 (tarefa 8.3) é legítima.** A secção afirma que
`api/logo.js` foi apagado e que o âmbito `seotitle` saiu de `api/assistant.js`;
ambos existem e funcionam a `22cee78`. O `SEO.md` é a fonte das invariantes que o
R12.4 obriga a cumprir, e uma fonte desatualizada é uma armadilha para quem a
seguir.

**Portão de saída de cada fase (R12).** `get_diagnostics` nos ficheiros tocados →
`npm run build` → `npm run web:build` → `npx vitest run`, com o critério de
**nenhum dos 197 testes da linha de base mudar de resultado**. Nenhum teste
existente é alterado, exceto `tests/seoInfra.test.ts`, que só ganha guardas.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.2", "2.3", "3.2", "3.3", "5.1"] },
    { "id": 2, "tasks": ["1.5", "1.6", "4.1"] },
    { "id": 3, "tasks": ["1.7", "1.8", "2.4", "3.4", "4.2", "5.2"] },
    { "id": 4, "tasks": ["4.3"] },
    { "id": 5, "tasks": ["6"] },
    { "id": 6, "tasks": ["7.1", "7.3", "8.1", "8.3", "9.1", "10.1", "10.2"] },
    { "id": 7, "tasks": ["7.4", "8.2", "9.2", "9.3", "10.3", "10.4", "10.5"] },
    { "id": 8, "tasks": ["7.6", "10.6"] },
    { "id": 9, "tasks": ["7.2", "7.7", "8.4", "9.4", "10.7"] },
    { "id": 10, "tasks": ["11"] },
    { "id": 11, "tasks": ["12.1", "12.2"] },
    { "id": 12, "tasks": ["12.3", "12.4"] },
    { "id": 13, "tasks": ["12.5", "12.6"] },
    { "id": 14, "tasks": ["13"] },
    { "id": 15, "tasks": ["14.1"] },
    { "id": 16, "tasks": ["14.2", "14.3"] },
    { "id": 17, "tasks": ["14.4", "15.1", "15.3"] },
    { "id": 18, "tasks": ["15.2", "15.4", "15.5"] },
    { "id": 19, "tasks": ["15.6"] },
    { "id": 20, "tasks": ["14.5", "14.6", "14.7"] },
    { "id": 21, "tasks": ["16"] },
    { "id": 22, "tasks": ["7.5"] }
  ]
}
```

**Aviso ao grafo: a ordem da 7.5 não está aqui codificada — e não pode estar.**
As quatro validações de fase (6, 11, 13, 16) são folhas sem sub-tarefas e correm
sozinhas na última onda da sua fase: são o portão de saída do R12, não trabalho
paralelizável. A `7.5` (🖐 MANUAL) está escalonada na **última onda de todas
apenas por conveniência de execução automática**, para não bloquear as restantes
tarefas. Isso é escalonamento, não permissão. A regra de negócio é a inversa:
**`adminStoresUsingTemplate` tem de correr em produção, e o resultado tem de ser
lido, antes de apagar qualquer Loja_Modelo** — e a `7.6` (remover `neonlab` e
`foodmart` de `TEMPLATE_REGISTRY`) é o último passo, depois dessa eliminação.
Quem executar a Fase B tem de **parar antes da `7.6` e correr a `7.5` à mão**. O
grafo não consegue exprimir esta dependência porque a `7.5` é uma ação humana; a
mesma advertência está nas Notes.

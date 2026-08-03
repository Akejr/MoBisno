# Requirements Document

## Introduction

Esta spec agrupa onze correções e melhorias pedidas para a loja pública, para o
editor e para o painel de administração do MôBisno, mais uma correção acrescentada
pelo utilizador durante o esclarecimento (página de produto em branco).

O âmbito é deliberadamente **largo em número de itens** e **estreito em cada
item**: a maioria são correções pontuais em ficheiros já identificados. Duas
exceções, que devem ser lidas com atenção porque são as que fazem crescer o
trabalho:

- **Requisito 4 (variações de produto)** é o item de maior risco e maior
  superfície de toque desta spec. Atravessa o domínio (`src/models/domain.ts`,
  `src/services/productService.ts`), o repositório de produtos, o formulário de
  produto (`web/lib/productForm.ts`), a página de produto de **todos** os
  Modelo_De_Loja, o carrinho, a gaveta do carrinho, o checkout, a mensagem de
  WhatsApp e o HTML pré-renderizado. É o único requisito que altera a forma dos
  dados de um Produto.
- **Requisito 7 (dashboard de admin)** é uma reescrita da Visão geral do painel
  de administração, com métricas que hoje não são calculadas em nenhum sítio.

Linguagem de implementação: **TypeScript**. Linha de base: `22cee78`,
`npm run build` a zero erros, 197 testes verdes em 34 ficheiros.

### Honestidade de âmbito

**Expansões face ao pedido literal** (declaradas, não escondidas):

| # | Expansão | Origem |
|---|---|---|
| E1 | Requisito 11 — página de produto em branco (campos legados de tipo errado em `web/lib/whatsapp.ts` e `web/templates/perks.ts`) | Acrescentado pelo utilizador no esclarecimento, por estar no caminho do requisito 3 |
| E2 | Requisito 4 — combinações (Cor × Tamanho), modo de preço e stock por combinação | O pedido literal dizia «permitir variações»; o utilizador escolheu explicitamente a opção maior |
| E3 | Requisito 9 — o quarto bloco do rodapé do Lumière passa também a ser editável (`data-edit`) | Hoje está chumbado no código, o que viola a §6.1 do `MODELO-GUIA.md`; corrigir o texto sem o tornar editável deixaria o modelo fora de conformidade |
| E4 | Requisito 10 — o convite a criar loja passa também para o `notFoundHtml` de `api/prerender.js` | O pedido falava da página; sem o prerender, um visitante sem JavaScript vê outra coisa |
| E5 | Requisito 12 — invariantes de não-regressão | Guarda das regras do `SEO.md` §5 e do `MODELO-GUIA.md` §6.1, declaradas intocáveis |

**Assunções a confirmar na revisão** (marcadas em cada requisito como `[A1]`…`[A4]`):

| # | Assunção | Consequência se estiver errada |
|---|---|---|
| A1 | O identificador do Preset `vermelho-moderno` **mantém-se**; só muda o nome apresentado para «Ekolo Sports» | Mudar o identificador obriga a migração de dados: `getPreset(id)` e a marca `__basedOn` das Lojas em produção dependem dele |
| A2 | **Já não é assunção: é decisão tomada.** O utilizador escolheu que as Loja_Modelo de demonstração **continuam a mostrar os métodos de pagamento online**, através de uma marca de demonstração própria — `customization.__demoPayments === true` — escrita apenas pelo Semeador_De_Modelos nas Loja_Modelo e **nunca herdada** por uma Loja de cliente. `customization.__basedOn` e `customization.__template` **deixam de ser lidos** pelo Checkout e pela Gaveta_Do_Carrinho: é essa leitura, e a cópia de `__basedOn` para a Loja do cliente, a causa da avaria dos itens 2 e 3 | — (decidido; ver **D2** do `design.md`) |
| A3 | As métricas do requisito 7 são derivadas dos dados já expostos por `web/supabase/admin.ts`; métricas que exijam dados inexistentes ficam para decisão de design | Pode ser necessária consulta nova ao Supabase, o que aumenta o trabalho do requisito 7 |
| A4 | Não existe nenhuma Loja de cliente baseada em `foodmart` ou `neonlab` (o utilizador confirmou) | A verificação obrigatória em base de dados do requisito 1 é precisamente a rede de segurança para esta assunção |

## Glossary

- **Plataforma**: o sistema MôBisno no seu conjunto (SPA em `web/`, domínio em `src/`, funções serverless em `api/`).
- **Loja**: instância de loja de um cliente, com identificador próprio e estado `Rascunho` ou `Publicada`.
- **Personalização**: objeto `StoreCustomization` (`web/templates/types.ts`) guardado em JSON na coluna `customization` da Loja.
- **Modelo_De_Loja**: entrada de `TEMPLATE_REGISTRY` (`web/templates/registry.ts`) — o código que desenha uma Loja (ex.: `desportivo`, `lumiere`, `foodmart`).
- **Preset**: entrada de `TEMPLATE_PRESETS` (`web/templates/presets.ts`) — uma Personalização completa pronta a aplicar.
- **Loja_Modelo**: Loja real do administrador, publicada e marcada com `customization.__template`, usada como demonstração de um Modelo_De_Loja na galeria.
- **Variação**: eixo de escolha de um Produto (ex.: «Cor», «Tamanho»), com nome e lista de valores.
- **Combinação**: um conjunto com um valor de cada Variação de um Produto (ex.: Cor=Azul + Tamanho=M). Tem preço efetivo e stock próprios.
- **Bloco_SSR**: bloco de conteúdo de `web/templates/blocks.ts` (`info`, `text`, `testimonials`, `location`), renderizado também no HTML pré-renderizado, sem JavaScript.
- **Checkout**: `web/views/checkout.ts` e os layouts de `web/templates/checkoutLayouts.ts`.
- **Gaveta_Do_Carrinho**: mini-carrinho deslizante de `web/lib/cartDrawer.ts`.
- **Carrinho**: estado do carrinho em `web/lib/cart.ts` e a página dedicada `web/views/cart.ts`.
- **Pagina_De_Produto**: `web/views/product.ts` e as funções `renderProduct` dos Modelo_De_Loja.
- **Formulario_De_Produto**: `web/lib/productForm.ts`, usado no editor, no painel do dono e no admin.
- **Editor**: editor visual `web/views/editor.ts`.
- **Painel_Do_Dono**: `web/views/dashboard.ts` (rotas `#/painel/...`).
- **Painel_Admin**: `web/views/adminPanel.ts` (rotas `/adminPainel/...`).
- **Gerador_De_Logotipos**: o conjunto `api/logo.js` + `web/lib/logoApi.ts` + as secções de criação de logótipo no wizard e no Painel_Do_Dono.
- **Assistente_IA**: `api/assistant.js` e os textos de ajuda que consomem os âmbitos `site`, `editor`, `seo`, `seotitle` e `logo`.
- **Pagina_Loja_Nao_Encontrada**: o ecrã «Loja não encontrada» apresentado pelas vistas públicas e pelo `notFoundHtml` de `api/prerender.js`.
- **Semeador_De_Modelos**: `defaultFactoryModels()` e `seedDefaultModels()` em `web/supabase/models.ts`.
- **Dono**: utilizador proprietário de uma Loja.
- **Cliente**: visitante que compra numa Loja.
- **Administrador**: conta com `is_admin` que usa o Painel_Admin.

## Requirements

### Requirement 1: Renomear o Preset e remover os modelos FoodMart e Neon Lab (item 0)

**User Story:** Como Administrador, quero que o modelo de fábrica passe a chamar-se «Ekolo Sports» e que os modelos FoodMart e Neon Lab desapareçam da Plataforma, para a galeria mostrar apenas o que a Plataforma quer oferecer.

#### Acceptance Criteria

1. THE Plataforma SHALL apresentar o Preset com identificador `vermelho-moderno` sob o nome «Ekolo Sports» em todos os ecrãs que apresentam Presets.
2. THE Plataforma SHALL manter o identificador do Preset igual a `vermelho-moderno`. `[A1]`
3. THE Plataforma SHALL devolver o Preset «Ekolo Sports» como Preset recomendado, com a assinatura não anulável de `getRecommendedPreset()` inalterada.
4. THE Plataforma SHALL excluir de `TEMPLATE_REGISTRY` as entradas com identificador `neonlab` e `foodmart`.
5. THE Semeador_De_Modelos SHALL excluir da lista de modelos de fábrica as entradas com nome «Neon Lab» e «FoodMart».
6. WHEN o Administrador abre a secção «Modelos» do Painel_Admin, THE Painel_Admin SHALL apresentar a lista de Loja_Modelo sem entradas com nome «Neon Lab» ou «FoodMart».
7. WHEN o Administrador aciona a eliminação de uma Loja_Modelo «Neon Lab» ou «FoodMart», THE Plataforma SHALL apresentar, antes de apagar, o resultado de uma verificação em base de dados que conta as Lojas com `templateId` igual a `neonlab` ou `foodmart` e as Lojas com `customization.__basedOn` igual a `neonlab` ou `foodmart`.

   > **Nota de execução:** este critério cobre um passo com efeito em produção. A eliminação das Loja_Modelo apaga Lojas publicadas reais (as demos) e é irreversível.
8. IF a verificação do critério 1.7 contar uma ou mais Lojas que não sejam Loja_Modelo, THEN THE Plataforma SHALL manter o Modelo_De_Loja correspondente registado e apresentar ao Administrador a lista de Lojas afetadas. `[A4]`
9. WHEN o Administrador confirma a eliminação de uma Loja_Modelo «Neon Lab» ou «FoodMart», THE Painel_Admin SHALL apagar a Loja_Modelo e os respetivos Produtos, banners e assets de demonstração.
10. WHERE o identificador de um Modelo_De_Loja recebido é desconhecido, THE Plataforma SHALL devolver o primeiro Modelo_De_Loja registado, mantendo o comportamento atual de `getTemplate`.
11. WHEN o nome apresentado de um modelo de fábrica muda, THE Semeador_De_Modelos SHALL renomear a Loja_Modelo existente cujo nome corresponda a um nome anterior desse modelo de fábrica, em vez de criar uma Loja_Modelo nova.

    > **Nota de execução:** este critério fixa um defeito observado em produção. O Semeador_De_Modelos emparelhava as Loja_Modelo apenas pelo nome atual, pelo que a renomeação do modelo de fábrica levou à criação de uma segunda Loja_Modelo duplicada. «Nome anterior» designa qualquer nome apresentado que esse modelo de fábrica tenha usado antes do nome atual.
12. WHEN o Semeador_De_Modelos renomeia uma Loja_Modelo encontrada por um nome anterior, THE Semeador_De_Modelos SHALL escrever apenas o nome, em `stores.name` e no nome apresentado em `customization.__template`, preservando a Personalização, os Produtos de demonstração e o identificador da Loja_Modelo.
13. IF já existe uma Loja_Modelo com o nome atual do modelo de fábrica, THEN THE Semeador_De_Modelos SHALL NOT renomear nenhuma Loja_Modelo encontrada por um nome anterior desse modelo de fábrica.

    > **Nota de execução:** esta é a guarda contra duas Loja_Modelo homónimas. A decisão de qual das Loja_Modelo manter é do Administrador.
14. WHERE a Loja_Modelo emparelhada pelo nome atual está gravada com uma grafia diferente da grafia atual do nome apresentado, THE Semeador_De_Modelos SHALL corrigir a grafia dessa Loja_Modelo para a grafia atual.

    > **Nota de execução:** a comparação de nomes ignora maiúsculas e minúsculas, pelo que «Ekolo sports» emparelha com «Ekolo Sports» e, sem este critério, a grafia gravada nunca seria corrigida.
15. WHEN o Semeador_De_Modelos é executado imediatamente após uma execução concluída com êxito e sem alterações aos modelos de fábrica, THE Semeador_De_Modelos SHALL concluir sem escrever na base de dados.
16. WHERE existe uma Loja_Modelo com o nome atual ou com um nome anterior de um modelo de fábrica, THE Painel_Admin SHALL omitir a invocação automática do Semeador_De_Modelos.

### Requirement 2: Gerador de logótipos robusto e marcado como Beta (item 1)

**User Story:** Como Dono, quero um gerador de logótipos que dê propostas diferentes entre si e que me diga o que se passou quando falha, para não ficar a olhar para um ecrã vazio sem explicação.

#### Acceptance Criteria

1. WHEN o Dono submete uma descrição ao Gerador_De_Logotipos, THE Gerador_De_Logotipos SHALL pedir cinco propostas, uma por cada direção de arte definida em `api/logo.js` (monograma, símbolo abstrato, combinação, emblema e wordmark).
2. WHEN o servidor devolve propostas, THE Gerador_De_Logotipos SHALL apresentar todas as propostas devolvidas, cada uma como imagem PNG com fundo transparente.
3. IF o servidor devolve menos de cinco propostas, THEN THE Gerador_De_Logotipos SHALL apresentar as propostas recebidas e indicar ao Dono quantas propostas ficaram em falta.
4. IF o pedido ao servidor falha, THEN THE Gerador_De_Logotipos SHALL apresentar ao Dono o campo `error` devolvido pelo servidor e, quando presente, o campo `detail`.
5. IF o pedido ao servidor não obtém resposta, THEN THE Gerador_De_Logotipos SHALL apresentar ao Dono uma mensagem que distingue falha de comunicação de ausência de propostas.
6. THE Gerador_De_Logotipos SHALL devolver ao chamador um resultado que distingue três situações: propostas obtidas, falha reportada pelo servidor com motivo, e falha de comunicação.
7. WHILE o Gerador_De_Logotipos aguarda a resposta do servidor, THE Gerador_De_Logotipos SHALL apresentar um estado de progresso e rejeitar submissões adicionais.
8. IF o pedido falhou, THEN THE Gerador_De_Logotipos SHALL apresentar uma ação que repete o pedido com a mesma descrição.
9. THE Gerador_De_Logotipos SHALL apresentar um selo com o texto «Beta» no cabeçalho da secção de criação de logótipos, tanto no wizard (`web/views/wizard.ts`) como no separador `#/painel/logotipo` (`web/views/dashboard.ts`).
10. WHEN o Dono escolhe uma proposta, THE Gerador_De_Logotipos SHALL guardar a proposta escolhida em `customization.logos`.
11. THE Gerador_De_Logotipos SHALL manter o comportamento atual de melhoria da descrição por `improveLogoDescription` (âmbito `logo` de `api/assistant.js`).

### Requirement 3: Métodos de pagamento online visíveis apenas quando ativos (itens 2 e 3)

**User Story:** Como Cliente de uma Loja sem pagamentos online, quero comprar pelo WhatsApp com a encomenda toda escrita na mensagem, para não ficar bloqueado num checkout com métodos que a Loja não aceita.

> Este requisito trata os itens 2 e 3 do pedido como **uma única regra**: existe um só sítio que decide se os métodos online aparecem, e o resto do comportamento decorre dessa decisão.

#### Acceptance Criteria

1. THE Plataforma SHALL determinar a visibilidade dos métodos de pagamento online de uma Loja exclusivamente a partir de `customization.payments.onlineEnabled` e da marca de demonstração `customization.__demoPayments`, sem consultar nenhum outro campo. `[A2]`
2. THE Checkout SHALL usar a decisão do critério 3.1 sem consultar `customization.__basedOn` nem `customization.__template`.
3. THE Gaveta_Do_Carrinho SHALL usar a decisão do critério 3.1 sem consultar `customization.__basedOn` nem `customization.__template`.
4. WHERE `customization.__demoPayments` não é `true`, WHILE `payments.onlineEnabled` está desativado, THE Checkout SHALL apresentar apenas o método WhatsApp.
5. WHERE `customization.__demoPayments` não é `true`, WHILE `payments.onlineEnabled` está desativado, THE Gaveta_Do_Carrinho SHALL apresentar um único botão de ação com o rótulo «Comprar pelo WhatsApp».
6. WHILE `payments.onlineEnabled` está ativo, THE Gaveta_Do_Carrinho SHALL apresentar o botão «Comprar agora» com ligação ao Checkout.
7. WHILE `payments.onlineEnabled` está ativo, THE Checkout SHALL apresentar Multicaixa Express, Referência Bancária e WhatsApp.
8. WHEN o Cliente aciona «Comprar pelo WhatsApp», THE Gaveta_Do_Carrinho SHALL abrir uma conversa de WhatsApp para o número devolvido por `resolveWaPhone`.
9. THE Gaveta_Do_Carrinho SHALL incluir na mensagem de WhatsApp, para cada item do Carrinho, o nome do Produto, a quantidade e o valor da linha formatado por `formatKz`.
10. THE Gaveta_Do_Carrinho SHALL incluir na mensagem de WhatsApp o total da encomenda.
11. WHERE o item do Carrinho corresponde a uma Combinação, THE Gaveta_Do_Carrinho SHALL incluir na linha desse item os valores da Combinação escolhida.
12. WHERE a Loja tem áreas de entrega configuradas e o Cliente já escolheu uma área, THE Checkout SHALL incluir na mensagem de WhatsApp a área de entrega e o respetivo valor, mantendo o comportamento atual.
13. WHEN uma Loja é criada a partir de um Preset e ainda não tem pagamentos online ativos, THE Checkout SHALL apresentar apenas o método WhatsApp.
14. WHEN o Semeador_De_Modelos cria uma Loja_Modelo, THE Semeador_De_Modelos SHALL escrever `customization.__demoPayments` com o valor `true` nessa Loja_Modelo.
15. WHEN uma Loja de cliente aplica um Modelo_De_Loja ou um Preset, THE Plataforma SHALL omitir `__demoPayments` da Personalização dessa Loja de cliente.
16. WHERE `customization.__demoPayments` é `true`, WHILE `payments.onlineEnabled` está desativado, THE Checkout SHALL apresentar Multicaixa Express, Referência Bancária e WhatsApp.

### Requirement 4: Variações de produto com combinações, preço e stock (item 4)

**User Story:** Como Dono, quero registar variações no meu produto (cor, tamanho e outras), com preço e stock por combinação, para vender o mesmo artigo em versões diferentes sem criar um produto por versão.

> **Requisito de maior risco desta spec.** Toca no domínio (`src/models/domain.ts`,
> `src/services/productService.ts`), no repositório de Produtos, no
> Formulario_De_Produto, na Pagina_De_Produto de todos os Modelo_De_Loja, no
> Carrinho, na Gaveta_Do_Carrinho, no Checkout, na mensagem de WhatsApp e no HTML
> pré-renderizado. É o único requisito que altera a forma dos dados de um Produto.

#### Acceptance Criteria

1. THE Formulario_De_Produto SHALL apresentar um controlo que ativa e desativa as Variação de um Produto.
2. WHERE as Variação de um Produto estão ativas, THE Formulario_De_Produto SHALL permitir definir uma ou mais Variação, cada uma com um nome escolhido pelo Dono (ex.: «Cor», «Tamanho») e uma lista de valores.
3. WHERE as Variação de um Produto estão ativas, THE Formulario_De_Produto SHALL apresentar a lista de Combinação resultante do produto cartesiano dos valores de todas as Variação definidas.
4. THE Formulario_De_Produto SHALL permitir definir, por Produto, um modo de preço das Variação com dois valores possíveis: «substitui o preço base» e «acresce ao preço base».
5. THE Formulario_De_Produto SHALL permitir definir, por Combinação, um valor de preço e um valor de stock.
6. WHERE o modo de preço é «substitui o preço base» e a Combinação escolhida tem preço definido, THE Pagina_De_Produto SHALL apresentar o preço da Combinação.
7. WHERE o modo de preço é «acresce ao preço base», THE Pagina_De_Produto SHALL apresentar a soma do preço base do Produto com o valor da Combinação escolhida.
8. WHERE a Combinação escolhida não tem preço definido, THE Pagina_De_Produto SHALL apresentar o preço base do Produto.
9. WHEN o Cliente abre um Produto com Variação ativas, THE Pagina_De_Produto SHALL apresentar um seletor por Variação com os valores definidos pelo Dono.
10. IF o Cliente aciona a adição ao Carrinho sem ter escolhido um valor em cada Variação, THEN THE Pagina_De_Produto SHALL rejeitar a adição e indicar quais as Variação em falta.
11. WHILE o stock de uma Combinação é igual a 0, THE Pagina_De_Produto SHALL apresentar essa Combinação como esgotada e rejeitar a adição dessa Combinação ao Carrinho.
12. WHERE o stock de uma Combinação não está definido, THE Pagina_De_Produto SHALL tratar essa Combinação como disponível, seguindo a regra atual de stock não controlado do Produto.
13. THE Carrinho SHALL tratar duas Combinação distintas do mesmo Produto como duas linhas independentes, com quantidade própria.
14. THE Carrinho SHALL apresentar, em cada linha com Combinação, os valores da Combinação escolhida.
15. THE Checkout SHALL enviar ao serviço de pagamento, por cada linha do Carrinho, o preço efetivo da Combinação dessa linha.
16. WHERE um Produto tem as Variação desativadas, THE Plataforma SHALL manter o comportamento atual do Produto na Pagina_De_Produto, no Carrinho e no Checkout.
17. THE Pagina_De_Produto de cada Modelo_De_Loja SHALL apresentar os seletores de Variação com a tipografia, os cantos e as cores do próprio Modelo_De_Loja, cumprindo a regra de consistência da §0.2 do `MODELO-GUIA.md`.
18. WHERE o HTML é servido pré-renderizado, sem JavaScript, THE Pagina_De_Produto SHALL apresentar o nome de cada Variação e os respetivos valores como texto legível no HTML.
19. THE Formulario_De_Produto SHALL permitir remover uma Variação e um valor de Variação.
20. WHEN o Dono remove um valor de Variação, THE Formulario_De_Produto SHALL remover as Combinação que usavam esse valor e preservar os dados das restantes Combinação.

### Requirement 5: Várias localizações no bloco de mapa (item 5)

**User Story:** Como Dono com mais do que um ponto de venda, quero marcar várias localizações no bloco de mapa, para os clientes verem todas as minhas lojas físicas.

#### Acceptance Criteria

1. WHERE um Bloco_SSR de tipo `location` está presente, THE Editor SHALL permitir adicionar mais do que uma localização a esse bloco.
2. THE Editor SHALL permitir definir, por localização, um nome, uma morada e um par de coordenadas.
3. WHEN o Dono aciona a escolha no mapa de uma localização, THE Editor SHALL abrir `openMapPicker` com o pin arrastável, sem exigir chave de API.
4. THE Editor SHALL permitir remover uma localização da lista.
5. WHERE o Bloco_SSR de tipo `location` tem duas ou mais localizações, THE Bloco_SSR SHALL apresentar um mapa com pin por cada localização.
6. WHERE uma localização tem coordenadas definidas, THE Bloco_SSR SHALL apresentar o mapa dessa localização com marcador nas coordenadas.
7. WHERE uma localização tem morada e não tem coordenadas, THE Bloco_SSR SHALL apresentar o mapa dessa localização pela morada.
8. WHERE a lista de localizações está vazia, THE Bloco_SSR SHALL apresentar um mapa da morada do rodapé, mantendo o comportamento atual.
9. THE Bloco_SSR SHALL continuar a apresentar corretamente os blocos `location` gravados no formato de localização única (campos `address`, `lat` e `lng` no próprio bloco).
10. WHERE o HTML é servido pré-renderizado, sem JavaScript, THE Bloco_SSR SHALL apresentar todos os mapas e as respetivas moradas.
11. THE Editor SHALL manter o nome e a morada de cada localização editáveis, cumprindo a §6.1 do `MODELO-GUIA.md`.

### Requirement 6: SMS de confirmação e domínio próprio marcados como «Em breve» (item 6)

**User Story:** Como Dono, quero perceber que o SMS de confirmação e o domínio próprio ainda não estão disponíveis, para não tentar comprar nem configurar algo que não funciona.

#### Acceptance Criteria

1. THE Painel_Do_Dono SHALL apresentar a funcionalidade «SMS de confirmação» com uma etiqueta com o texto «Em breve».
2. WHILE a funcionalidade «SMS de confirmação» está marcada como «Em breve», THE Painel_Do_Dono SHALL rejeitar a compra de créditos de SMS.
3. WHILE a funcionalidade «SMS de confirmação» está marcada como «Em breve», THE Painel_Do_Dono SHALL rejeitar a ativação da funcionalidade.
4. THE Painel_Do_Dono SHALL apresentar a secção de domínio próprio com uma etiqueta com o texto «Em breve».
5. WHILE a secção de domínio próprio está marcada como «Em breve», THE Painel_Do_Dono SHALL rejeitar a submissão de um domínio.
6. THE Checkout SHALL concluir a encomenda sem enviar SMS de confirmação.
7. WHERE uma Loja tem saldo de créditos de SMS maior que 0, THE Painel_Do_Dono SHALL apresentar o saldo e indicar que a funcionalidade fica disponível em breve.
8. THE Plataforma SHALL preservar o valor da coluna `stores.sms_credits` de todas as Lojas.
9. THE Painel_Admin SHALL continuar a apresentar o chip de SMS de cada Loja com o estado real da funcionalidade.

### Requirement 7: Dashboard profissional na Visão geral do admin (item 7)

**User Story:** Como Administrador, quero abrir o painel e ver de imediato a saúde do negócio e o que precisa da minha ação, para gerir a plataforma sem andar de aba em aba a procurar problemas.

#### Acceptance Criteria

1. THE Painel_Admin SHALL apresentar na Visão geral três secções distintas, pela seguinte ordem: saúde do negócio, «A precisar de atenção», e histórico recente.
2. THE Painel_Admin SHALL apresentar na secção de saúde do negócio a receita do mês corrente, o número de assinaturas ativas, o número de contas em teste a expirar, a conversão de teste para pago, o número de Lojas publicadas e o número de Lojas suspensas. `[A3]`
3. THE Painel_Admin SHALL apresentar a evolução mensal da receita e do número de contas para os 6 meses mais recentes.
4. THE Painel_Admin SHALL apresentar na secção «A precisar de atenção» cinco listas: levantamentos por aprovar, pagamentos pendentes ou falhados, contas a expirar nos próximos 7 dias, Lojas sem Produtos e Lojas não publicadas.
5. THE Painel_Admin SHALL apresentar, em cada linha das listas da secção «A precisar de atenção», uma ligação para o ecrã do Painel_Admin onde essa ação se resolve.
6. WHERE uma lista da secção «A precisar de atenção» não tem itens, THE Painel_Admin SHALL apresentar uma mensagem de estado vazio para essa lista.
7. THE Painel_Admin SHALL apresentar na secção de histórico recente as transações de serviço mais recentes e as contas mais recentes.
8. THE Painel_Admin SHALL excluir as Loja_Modelo das métricas da secção de saúde do negócio e das listas de Lojas.
9. THE Painel_Admin SHALL obter os dados da Visão geral a partir de `adminOverview`, `listAccounts`, `listStores`, `listAllWithdrawals` e `listServiceTransactions`. `[A3]`
10. WHILE os dados da Visão geral estão a ser carregados, THE Painel_Admin SHALL apresentar um estado de carregamento.
11. WHEN o Administrador aciona «Atualizar», THE Painel_Admin SHALL recarregar todas as secções da Visão geral.
12. THE Painel_Admin SHALL apresentar todos os valores monetários formatados por `formatKz`.
13. THE Painel_Admin SHALL apresentar a Visão geral em ecrãs com 360 px de largura sem deslocamento horizontal.
14. THE Painel_Admin SHALL manter os separadores atuais: Visão geral, Contas, Lojas, Modelos, Transações e Levantamentos.

### Requirement 8: Ajudas por IA alinhadas com os modelos prontos de site (item 8)

**User Story:** Como visitante ou Dono, quero que as ajudas por IA descrevam a plataforma como ela é hoje — modelos prontos de site que se personalizam — para não receber instruções sobre um construtor que já não existe.

#### Acceptance Criteria

1. THE Assistente_IA, no âmbito `site`, SHALL descrever a criação de uma Loja como a escolha de um Modelo_De_Loja pronto seguida da personalização de textos, fotografias e cores.
2. THE Assistente_IA, no âmbito `site`, SHALL apresentar o percurso do visitante pela seguinte ordem: criar conta, escolher Modelo_De_Loja pronto, personalizar textos, fotografias e cores, e publicar.
3. THE Assistente_IA, no âmbito `editor`, SHALL descrever as ações disponíveis numa Loja com `customization.__locked`: editar textos, trocar fotografias e mudar cores.
4. THE Assistente_IA, no âmbito `editor`, SHALL indicar que a estrutura do Modelo_De_Loja aplicado se mantém.
5. THE texto de ajuda da página inicial SHALL descrever modelos prontos de site.
6. THE Assistente_IA, no âmbito `logo`, SHALL indicar que o Gerador_De_Logotipos devolve cinco propostas.
7. THE Assistente_IA, no âmbito `seo`, SHALL manter as regras atuais da meta-descrição: uma frase, até 160 caracteres, em português de Portugal.
8. THE Assistente_IA SHALL aceitar o âmbito `seotitle` e responder com as regras atuais desse âmbito.
9. IF a pergunta recebida está fora do âmbito do MôBisno, THEN THE Assistente_IA SHALL recusar numa frase e redirecionar para o âmbito do MôBisno.
10. THE Assistente_IA SHALL responder em português de Portugal em todos os âmbitos.

> **Nota factual:** a §7.3 do `SEO.md` afirma que `api/logo.js` foi apagado e que o âmbito `seotitle` foi removido de `api/assistant.js`. Leitura do código a `22cee78` confirma que ambos existem e funcionam. A §7.3 está desatualizada e deve ser corrigida no âmbito desta spec.

### Requirement 9: Rodapé do modelo Lumière adequado a uma loja e editável (item 9)

**User Story:** Como Dono de uma loja com o modelo Lumière, quero que o rodapé fale da minha loja e não de um atelier, e quero poder editar esse texto, para o rodapé fazer sentido para os meus clientes.

#### Acceptance Criteria

1. THE Modelo_De_Loja `lumiere` SHALL apresentar, no quarto bloco do rodapé, um título e um texto adequados a uma loja de comércio eletrónico.
2. THE Modelo_De_Loja `lumiere` SHALL apresentar o título e o texto desse bloco a partir da Personalização, com valores por omissão em português de Portugal.
3. THE Modelo_De_Loja `lumiere` SHALL marcar o título e o texto desse bloco com `data-edit`, tornando ambos editáveis no Editor. `[E3]`
4. THE Modelo_De_Loja `lumiere` SHALL manter os três primeiros blocos do rodapé com o comportamento atual (sobre, explorar, contacto).
5. WHERE a Loja_Modelo «Lumière Chic» existe com uma versão de Personalização anterior, THE Semeador_De_Modelos SHALL sincronizar a Personalização na próxima verificação de `__v`.

### Requirement 10: Página de loja não encontrada com convite a criar loja (item 10)

**User Story:** Como visitante que abre um endereço de loja que não existe, quero perceber que a loja não foi encontrada e ser convidado a criar a minha, para a página ser útil em vez de um beco sem saída.

#### Acceptance Criteria

1. THE Pagina_Loja_Nao_Encontrada SHALL apresentar um título que indica que a loja pedida não foi encontrada.
2. THE Pagina_Loja_Nao_Encontrada SHALL apresentar o endereço pedido pelo visitante.
3. THE Pagina_Loja_Nao_Encontrada SHALL apresentar uma ação principal que abre o percurso de criação de Loja na Plataforma.
4. THE Pagina_Loja_Nao_Encontrada SHALL apresentar uma ação secundária que abre o diretório público de lojas em `/lojas`.
5. THE Pagina_Loja_Nao_Encontrada SHALL usar caminhos reais em todas as ligações, sem fragmento `#`, cumprindo a §5.1 do `SEO.md`.
6. THE Plataforma SHALL apresentar a mesma Pagina_Loja_Nao_Encontrada nas vistas de storefront, produto, categoria, carrinho e checkout.
7. THE `api/prerender.js` SHALL apresentar em `notFoundHtml` a mesma mensagem e o mesmo convite a criar Loja da versão apresentada pela SPA. `[E4]`
8. WHEN uma Loja pedida não existe ou não está publicada, THE `api/prerender.js` SHALL responder com HTTP 404 e `noindex`.
9. WHEN a conta dona da Loja pedida não tem acesso ativo, THE `api/prerender.js` SHALL responder com HTTP 410 e `noindex`.
10. THE Plataforma SHALL apresentar o texto da Pagina_Loja_Nao_Encontrada em português de Portugal.

### Requirement 11: Página de produto abre com personalizações em formato legado

**User Story:** Como Cliente de uma Loja antiga, quero que a página de produto abra, para poder ver e comprar o artigo. `[E1]`

#### Acceptance Criteria

1. WHEN a Pagina_De_Produto é aberta numa Loja cuja Personalização tem campos em formato legado, THE Pagina_De_Produto SHALL apresentar o Produto pedido.
2. IF `customization.footer.phone` contém um valor que não é uma cadeia de caracteres, THEN THE Plataforma SHALL devolver por `resolveWaPhone` o número predefinido `WA_DEFAULT_PHONE`.
3. IF `customization.whatsapp.phone` contém um valor que não é uma cadeia de caracteres, THEN THE Plataforma SHALL ignorar esse valor na resolução do número de WhatsApp.
4. IF um item de `customization.productPerks` não tem a forma esperada, THEN THE Plataforma SHALL omitir esse item da lista de garantias e apresentar os restantes.
5. WHERE todos os itens de `customization.productPerks` são omitidos pelo critério 11.4, THE Plataforma SHALL apresentar a lista `DEFAULT_PERKS`.
6. THE Plataforma SHALL cobrir com teste automatizado os casos dos critérios 11.2, 11.3 e 11.4.

### Requirement 12: Não-regressão — build, testes e invariantes

**User Story:** Como Dono da Plataforma, quero que estas alterações não quebrem o que já funciona, para não trocar onze melhorias por uma regressão. `[E5]`

#### Acceptance Criteria

1. THE Plataforma SHALL manter `npm run build` sem erros de tipos.
2. THE Plataforma SHALL manter `npm run web:build` sem erros.
3. THE Plataforma SHALL manter a suite de testes verde, com pelo menos os 197 testes da linha de base `22cee78`.
4. THE Plataforma SHALL cumprir as cinco invariantes da §5 do `SEO.md`.
5. THE Plataforma SHALL cumprir a editabilidade total da §6.1 do `MODELO-GUIA.md` em todas as secções tocadas por esta spec.
6. THE Plataforma SHALL apresentar em português de Portugal todo o texto visível acrescentado por esta spec.
7. THE Plataforma SHALL usar `var(--brand)` e `var(--brand-ink)` nos botões de marca acrescentados nas Lojas, e a cor `#F95901` apenas na interface de editor e de administração.

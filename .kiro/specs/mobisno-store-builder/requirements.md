# Requirements Document

## Introduction

O MôBisno é uma plataforma SaaS multi-inquilino (multi-tenant) de criação de lojas online, voltada ao mercado angolano, com proposta semelhante à do Shopify. A plataforma permite que qualquer pessoa crie a sua própria loja online através de um fluxo guiado e simples, escolhendo um nome, o tipo de loja e um modelo (template) pré-construído. Cada loja criada recebe um subdomínio próprio no formato `[nomedaloja].mobisno.com`.

O dono da loja pode personalizar a identidade visual (logótipo exibido no cabeçalho e nos menus), cadastrar produtos e adicionar banners promocionais. A experiência de utilização deve ser deliberadamente simples e acessível, considerando que o público angolano alvo tem pouca familiaridade com ferramentas deste tipo.

Este documento cobre a primeira fase do produto: o fluxo de criação de loja, o provisionamento de subdomínio, a gestão de identidade visual, o cadastro de produtos e a gestão de banners. As fases futuras (modelos totalmente editáveis e integração com métodos de pagamento de Angola) estão fora do âmbito desta entrega e são registadas apenas como contexto.

## Glossary

- **Plataforma**: O sistema MôBisno como um todo, responsável por orquestrar a criação e gestão de lojas online.
- **Visitante**: Pessoa não autenticada que acede à Plataforma antes de criar uma conta ou loja.
- **Dono_da_Loja**: Utilizador autenticado que cria e administra uma ou mais lojas na Plataforma.
- **Cliente_Final**: Pessoa que visita uma loja publicada através do respetivo subdomínio para visualizar produtos.
- **Loja**: Conjunto de dados e configurações de uma loja online individual pertencente a um Dono_da_Loja, incluindo nome, tipo, modelo, identidade visual, produtos e banners.
- **Assistente_de_Criação**: Fluxo guiado passo a passo da Plataforma que recolhe os dados necessários para criar uma nova Loja.
- **Modelo**: Site pré-construído e selecionável que define o layout e o aspeto visual inicial de uma Loja. Nesta fase os Modelos não são editáveis pelo Dono_da_Loja.
- **Tipo_de_Loja**: Categoria de negócio da Loja (por exemplo, vestuário, alimentação, eletrónica) selecionada durante a criação.
- **Subdomínio**: Endereço web único de uma Loja no formato `[nomedaloja].mobisno.com`.
- **Identificador_de_Loja**: Texto único derivado do nome da Loja, usado para compor o Subdomínio.
- **Logótipo**: Imagem de identidade visual da Loja exibida no cabeçalho e nos menus da Loja publicada.
- **Produto**: Item à venda registado numa Loja, com atributos como nome, descrição, preço, imagem e estado de disponibilidade.
- **Banner**: Imagem promocional exibida na Loja, normalmente no topo da página inicial.
- **Painel_de_Administração**: Área autenticada onde o Dono_da_Loja gere a sua Loja, produtos, banners e identidade visual.

## Requirements

### Requirement 1: Iniciar a criação de uma loja

**User Story:** Como Visitante, quero iniciar a criação da minha loja a partir de uma ação clara, para que eu possa começar o processo sem confusão.

#### Acceptance Criteria

1. THE Plataforma SHALL apresentar de forma permanente, na área visível da página inicial sem necessidade de deslocamento, uma única ação acionável identificada com o texto "Criar o meu site".
2. WHEN o Visitante seleciona a ação "Criar o meu site", THE Plataforma SHALL iniciar o Assistente_de_Criação no primeiro passo num prazo máximo de 3 segundos.
3. IF o Assistente_de_Criação não conseguir iniciar no prazo de 3 segundos após a seleção da ação, THEN THE Plataforma SHALL apresentar ao Visitante uma mensagem de erro indicando que o início falhou e SHALL disponibilizar a opção de tentar novamente, mantendo o Visitante na página inicial.
4. IF o Visitante não possui uma conta autenticada ao iniciar o Assistente_de_Criação, THEN THE Plataforma SHALL solicitar o registo ou a autenticação antes de concluir a criação da Loja.
5. IF os dados de registo ou de autenticação fornecidos pelo Visitante forem inválidos ou incompletos, THEN THE Plataforma SHALL rejeitar a operação, apresentar uma mensagem indicando o motivo da rejeição e SHALL preservar os dados já introduzidos no Assistente_de_Criação.
6. WHILE o Dono_da_Loja se encontra no Assistente_de_Criação, THE Plataforma SHALL apresentar os passos numa sequência numerada fixa, indicar o número do passo atual e o número total de passos, e permitir a navegação para o passo anterior sem perda dos dados já introduzidos.

### Requirement 2: Definir nome e tipo da loja

**User Story:** Como Dono_da_Loja, quero indicar o nome e o tipo da minha loja, para que a loja tenha uma identidade e categoria adequadas.

#### Acceptance Criteria

1. THE Assistente_de_Criação SHALL solicitar ao Dono_da_Loja a introdução de um nome para a Loja.
2. IF o Dono_da_Loja submete um nome de Loja vazio ou composto apenas por espaços em branco, THEN THE Plataforma SHALL impedir o avanço, manter o Dono_da_Loja no passo atual e apresentar uma mensagem a indicar que o nome é obrigatório.
3. THE Assistente_de_Criação SHALL apresentar uma lista de valores de Tipo_de_Loja para seleção.
4. IF o Dono_da_Loja submete o passo sem selecionar um Tipo_de_Loja, THEN THE Plataforma SHALL impedir o avanço, manter o Dono_da_Loja no passo atual e apresentar uma mensagem a indicar que a seleção do tipo é obrigatória.
5. WHEN o Dono_da_Loja submete um nome de Loja que, após remoção dos espaços no início e no fim, contém entre 2 e 60 caracteres, THE Plataforma SHALL aceitar o nome como válido e permitir o avanço para o passo seguinte.
6. IF o nome da Loja, após remoção dos espaços no início e no fim, contém mais de 60 caracteres, THEN THE Plataforma SHALL impedir o avanço, manter o nome introduzido e apresentar uma mensagem a indicar o limite máximo de 60 caracteres.
7. IF o nome da Loja, após remoção dos espaços no início e no fim, contém menos de 2 caracteres e não está vazio, THEN THE Plataforma SHALL impedir o avanço, manter o nome introduzido e apresentar uma mensagem a indicar o número mínimo de 2 caracteres.

### Requirement 3: Selecionar o modelo do site

**User Story:** Como Dono_da_Loja, quero escolher um modelo pré-construído para a minha loja, para que o site tenha um aspeto profissional sem que eu precise de o desenhar.

#### Acceptance Criteria

1. WHEN o Dono_da_Loja acede ao passo de seleção de Modelo, THE Assistente_de_Criação SHALL apresentar a lista de Modelos disponíveis, apresentando para cada Modelo uma pré-visualização visual e o respetivo nome identificador.
2. WHEN o Dono_da_Loja seleciona um Modelo e confirma a seleção, THE Plataforma SHALL associar o Modelo selecionado à Loja e apresentar uma indicação visível de que o Modelo foi associado com sucesso.
3. WHEN o Dono_da_Loja seleciona um Modelo diferente após já existir um Modelo associado à Loja, THE Plataforma SHALL substituir a associação anterior pela associação ao novo Modelo selecionado, mantendo apenas um Modelo associado à Loja.
4. IF o Dono_da_Loja submete o passo de seleção de Modelo sem ter selecionado qualquer Modelo, THEN THE Plataforma SHALL impedir o avanço para o passo seguinte, manter o Dono_da_Loja no passo de seleção e apresentar uma mensagem a indicar que a seleção do Modelo é obrigatória.
5. IF não existe qualquer Modelo disponível no momento em que o Dono_da_Loja acede ao passo de seleção, THEN THE Plataforma SHALL impedir o avanço e apresentar uma mensagem a indicar que não existem Modelos disponíveis para seleção.

### Requirement 4: Provisionar o subdomínio da loja

**User Story:** Como Dono_da_Loja, quero que a minha loja tenha um endereço próprio no formato [nomedaloja].mobisno.com, para que os clientes possam aceder à minha loja por um endereço dedicado.

#### Acceptance Criteria

1. WHEN o Dono_da_Loja confirma o nome da Loja, THE Plataforma SHALL gerar um Identificador_de_Loja a partir do nome, convertendo para minúsculas, substituindo espaços e caracteres não alfanuméricos por hífenes, removendo hífenes consecutivos e removendo hífenes no início e no fim.
2. IF o Identificador_de_Loja gerado excede 63 caracteres, THEN THE Plataforma SHALL truncar o Identificador_de_Loja para 63 caracteres e remover qualquer hífen resultante no fim.
3. IF o Identificador_de_Loja resultante da normalização contém menos de 2 caracteres, THEN THE Plataforma SHALL rejeitar o nome, apresentar uma mensagem a solicitar um nome alternativo e preservar os dados já introduzidos.
4. THE Plataforma SHALL compor o Subdomínio da Loja no formato `[Identificador_de_Loja].mobisno.com`.
5. IF o Identificador_de_Loja gerado já está associado a outra Loja ou corresponde a um identificador reservado, THEN THE Plataforma SHALL apresentar uma indicação de indisponibilidade, solicitar ao Dono_da_Loja um Identificador_de_Loja alternativo e não persistir a Loja antes da resolução.
6. WHEN o Identificador_de_Loja é válido e está disponível, THE Plataforma SHALL apresentar ao Dono_da_Loja o Subdomínio resultante antes da confirmação final da criação da Loja.
7. WHERE o Identificador_de_Loja contém entre 2 e 63 caracteres, é composto apenas por letras minúsculas, dígitos e hífenes, e não contém hífenes no início, no fim ou consecutivos, THE Plataforma SHALL aceitar o Identificador_de_Loja como válido.
8. IF o Identificador_de_Loja alternativo fornecido pelo Dono_da_Loja não respeita as regras de validade, THEN THE Plataforma SHALL rejeitá-lo, apresentar uma mensagem a indicar o formato válido e solicitar nova introdução.

### Requirement 5: Concluir a criação e publicar a loja

**User Story:** Como Dono_da_Loja, quero concluir o assistente e ver a minha loja criada, para que eu possa começar a configurá-la.

#### Acceptance Criteria

1. WHEN o Dono_da_Loja confirma o passo final do Assistente_de_Criação com todos os campos obrigatórios válidos, THE Plataforma SHALL criar a Loja com o nome, Tipo_de_Loja, Modelo e Subdomínio definidos num prazo máximo de 10 segundos.
2. WHEN a Loja é criada, THE Plataforma SHALL associar a Loja exclusivamente ao Dono_da_Loja autenticado.
3. WHEN a Loja é criada com sucesso, THE Plataforma SHALL apresentar o Painel_de_Administração da Loja ao Dono_da_Loja num prazo máximo de 5 segundos.
4. IF a criação da Loja não for concluída por falha do sistema, THEN THE Plataforma SHALL apresentar uma mensagem de erro, preservar os dados já introduzidos no Assistente_de_Criação e não persistir uma Loja parcial.
5. IF o Subdomínio deixou de estar disponível no momento da confirmação final, THEN THE Plataforma SHALL rejeitar a criação, apresentar uma mensagem de indisponibilidade e preservar os dados já introduzidos.
6. IF, no momento da confirmação final, existirem campos obrigatórios em falta ou inválidos, THEN THE Plataforma SHALL impedir a criação da Loja, identificar os campos em causa e preservar os dados já introduzidos.

### Requirement 6: Gerir o logótipo da loja

**User Story:** Como Dono_da_Loja, quero carregar ou selecionar o logótipo da minha empresa, para que ele apareça no cabeçalho e nos menus da minha loja.

#### Acceptance Criteria

1. THE Painel_de_Administração SHALL permitir ao Dono_da_Loja carregar um ficheiro de imagem como Logótipo da Loja.
2. WHEN o Dono_da_Loja carrega um ficheiro nos formatos PNG, JPEG ou SVG com tamanho entre 1 KB e 5 MB inclusive, THE Plataforma SHALL guardar o ficheiro como Logótipo da Loja e apresentar uma mensagem de confirmação da gravação.
3. IF o Dono_da_Loja carrega um ficheiro num formato não suportado ou com tamanho superior a 5 MB, THEN THE Plataforma SHALL rejeitar o ficheiro sem o guardar, manter inalterado o Logótipo anterior e apresentar uma mensagem a indicar os formatos e o tamanho máximo aceites.
4. IF o ficheiro carregado estiver corrompido ou vazio, THEN THE Plataforma SHALL rejeitar o ficheiro sem o guardar, manter inalterado o Logótipo anterior e apresentar uma mensagem a indicar que o ficheiro é inválido.
5. WHEN um Logótipo está definido para a Loja, THE Plataforma SHALL exibir o Logótipo no cabeçalho da Loja publicada.
6. WHEN um Logótipo está definido para a Loja, THE Plataforma SHALL exibir o Logótipo nos menus da Loja publicada.
7. WHILE não existe Logótipo definido para a Loja, THE Plataforma SHALL apresentar no cabeçalho e nos menus uma identidade visual de substituição predefinida.
8. WHEN o Dono_da_Loja substitui o Logótipo, THE Plataforma SHALL passar a exibir o novo Logótipo na Loja publicada num prazo máximo de 60 segundos.

### Requirement 7: Cadastrar e gerir produtos

**User Story:** Como Dono_da_Loja, quero cadastrar e gerir os produtos da minha loja, para que os clientes possam ver o que está à venda.

#### Acceptance Criteria

1. THE Painel_de_Administração SHALL permitir ao Dono_da_Loja registar um Produto com nome (1 a 120 caracteres), descrição (até 2000 caracteres), preço (de 0,00 a 999.999.999,99) e imagem (até 5 MB).
2. IF o Dono_da_Loja submete um Produto sem nome ou sem preço, THEN THE Plataforma SHALL impedir o registo, preservar os dados introduzidos e apresentar uma mensagem a indicar quais os campos obrigatórios em falta.
3. IF o Dono_da_Loja submete um Produto com um preço menor que zero, THEN THE Plataforma SHALL impedir o registo, preservar os dados introduzidos e apresentar uma mensagem a indicar que o preço deve ser maior ou igual a zero.
4. IF o Dono_da_Loja carrega uma imagem de Produto num formato não suportado ou com tamanho superior a 5 MB, THEN THE Plataforma SHALL rejeitar a imagem sem a guardar e apresentar uma mensagem a indicar os formatos e o tamanho máximo aceites.
5. WHEN o Dono_da_Loja regista um Produto válido, THE Plataforma SHALL associar o Produto à Loja e exibir o Produto na lista de produtos do Painel_de_Administração num prazo máximo de 3 segundos.
6. THE Painel_de_Administração SHALL permitir ao Dono_da_Loja editar os atributos de um Produto existente.
7. WHEN o Dono_da_Loja remove um Produto existente, THE Plataforma SHALL solicitar confirmação, remover o Produto após confirmação num prazo máximo de 3 segundos e refletir a remoção na Loja publicada.
8. WHILE um Produto está associado à Loja e marcado como disponível, THE Plataforma SHALL exibir o Produto na Loja publicada.
9. IF o Dono_da_Loja tenta editar ou remover um Produto inexistente ou que não pertence à sua Loja, THEN THE Plataforma SHALL rejeitar a operação e apresentar uma mensagem de erro.

### Requirement 8: Gerir banners da loja

**User Story:** Como Dono_da_Loja, quero adicionar banners promocionais à minha loja, para que eu possa destacar campanhas e produtos.

#### Acceptance Criteria

1. THE Painel_de_Administração SHALL permitir ao Dono_da_Loja adicionar um Banner através do carregamento de uma imagem, até um máximo de 10 Banners por Loja.
2. WHEN o Dono_da_Loja carrega um Banner nos formatos PNG ou JPEG com tamanho até 5 MB, THE Plataforma SHALL guardar a imagem como Banner da Loja num prazo máximo de 10 segundos.
3. IF o Dono_da_Loja carrega um Banner num formato não suportado ou com tamanho superior a 5 MB, THEN THE Plataforma SHALL rejeitar o ficheiro sem o guardar e apresentar uma mensagem a indicar os formatos e o tamanho máximo aceites.
4. IF o Dono_da_Loja tenta adicionar um Banner quando já existem 10 Banners associados à Loja, THEN THE Plataforma SHALL impedir a adição e apresentar uma mensagem a indicar que foi atingido o número máximo de Banners.
5. WHEN existe pelo menos um Banner associado à Loja, THE Plataforma SHALL exibir os Banners na Loja publicada pela ordem em que foram adicionados.
6. IF o carregamento de um novo Banner falha, THEN THE Plataforma SHALL continuar a exibir os Banners já existentes na Loja publicada.
7. WHEN o Dono_da_Loja remove um Banner existente, THE Plataforma SHALL remover o Banner e deixar de o exibir na Loja publicada.

### Requirement 9: Aceder à loja publicada por subdomínio

**User Story:** Como Cliente_Final, quero aceder a uma loja através do seu endereço próprio, para que eu possa ver os produtos do negócio.

#### Acceptance Criteria

1. WHEN um Cliente_Final acede a um Subdomínio associado a uma Loja existente com estado Publicada, THE Plataforma SHALL apresentar a Loja correspondente com o Modelo, Logótipo, banners e os produtos com estado Ativo/Disponível, sem apresentar a página de erro de Loja não encontrada.
2. WHEN um Cliente_Final acede a um Subdomínio associado a uma Loja existente com estado Publicada, THE Plataforma SHALL concluir o carregamento da página da Loja num período máximo de 3 segundos em condições normais de operação.
3. IF um Cliente_Final acede a um Subdomínio que não está associado a nenhuma Loja, THEN THE Plataforma SHALL apresentar uma página de erro a indicar que a Loja não foi encontrada.
4. IF um Cliente_Final acede a um Subdomínio associado a uma Loja existente cujo estado não é Publicada, THEN THE Plataforma SHALL apresentar uma página de erro a indicar que a Loja não foi encontrada, sem expor o Modelo, Logótipo, banners ou produtos dessa Loja.
5. IF o identificador do Subdomínio acedido não respeita o formato válido (caracteres alfanuméricos e hífens, comprimento entre 1 e 63 caracteres), THEN THE Plataforma SHALL apresentar uma página de erro a indicar que a Loja não foi encontrada.

### Requirement 10: Experiência de utilização simples e acessível

**User Story:** Como Dono_da_Loja com pouca experiência em ferramentas digitais, quero uma interface simples e orientada, para que eu consiga criar e gerir a minha loja sem dificuldade.

#### Acceptance Criteria

1. WHILE o Dono_da_Loja se encontra num passo do Assistente_de_Criação, THE Assistente_de_Criação SHALL apresentar uma instrução de orientação que identifica o objetivo do passo e a ação necessária para o concluir.
2. IF o Dono_da_Loja submete um passo com um ou mais campos inválidos, THEN THE Plataforma SHALL apresentar, junto a cada campo inválido, uma mensagem de erro que descreve a correção necessária, e SHALL preservar os dados já introduzidos nos restantes campos do passo.
3. THE Plataforma SHALL apresentar em português todos os textos da interface destinados ao Dono_da_Loja, incluindo rótulos, instruções, mensagens de erro e mensagens de confirmação.
4. WHEN o Dono_da_Loja seleciona regressar ao passo anterior, THE Assistente_de_Criação SHALL apresentar esse passo com todos os dados anteriormente introduzidos preenchidos e editáveis.
5. WHEN o Dono_da_Loja conclui um passo com sucesso, THE Assistente_de_Criação SHALL apresentar o número do passo atual, o número total de passos e uma indicação visível de que o passo foi concluído.
6. WHEN o Dono_da_Loja submete um passo deixando por preencher campos de preenchimento obrigatório, THE Plataforma SHALL impedir o avanço para o passo seguinte e SHALL identificar, junto a cada campo obrigatório em falta, que o preenchimento é necessário.

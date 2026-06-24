# Implementation Plan: MôBisno Store Builder

## Overview

Plano de implementação incremental da primeira fase do MôBisno em TypeScript. A abordagem começa pelos tipos de domínio e lógica pura (normalização e validação de identificadores), evolui para os serviços de negócio com isolamento de inquilino (lojas, ficheiros, produtos, banners), depois a resolução de storefront por subdomínio e, por fim, as camadas de UI (página inicial, Assistente_de_Criação, Painel_de_Administração e loja publicada), terminando com o wiring de integração ponta a ponta.

Os testes baseados em propriedades usam **fast-check** com no mínimo **100 iterações** por teste. Cada teste de propriedade referencia a propriedade do design através de uma etiqueta de comentário no formato `**Feature: mobisno-store-builder, Property {número}: {texto}**`. Cada uma das 20 propriedades de correção é coberta por exatamente um teste de propriedade. Sub-tarefas de teste estão marcadas com `*` e são opcionais.

## Tasks

- [x] 1. Configurar estrutura do projeto e tipos base
  - [x] 1.1 Configurar estrutura de pastas e ferramentas
    - Criar a estrutura de diretórios (`src/services`, `src/models`, `src/ui`, `src/storefront`, `tests`)
    - Configurar TypeScript (`tsconfig.json`), o test runner e instalar a biblioteca de PBT **fast-check**
    - Configurar utilitário de execução de propriedades com mínimo de 100 iterações
    - _Requirements: base de implementação_

  - [x] 1.2 Definir tipos de domínio e o tipo `Result<T, E>`
    - Implementar `Result<T, E>` para erros previsíveis (sem exceções)
    - Definir `StoreOwner`, `Store`, `Template`, `Asset`, `Product`, `Banner`
    - Definir `StoreState`, `StoreType`, `ImageFormat`, `AssetKind`
    - _Requirements: 5.2, 7.1, 8.1_

- [x] 2. Implementar IdentifierService (normalização e validação)
  - [x] 2.1 Implementar normalização, validação de formato e composição de subdomínio
    - Implementar `normalize(name)` (minúsculas, substituir não-alfanuméricos por hífen, colapsar hífenes, remover hífenes inicial/final, truncar a 63 e remover hífen final resultante)
    - Implementar `isValidFormat(identifier)` (2–63 chars, `[a-z0-9-]`, sem hífen inicial/final/duplo)
    - Implementar `toSubdomain(identifier)` e a lista configurável de identificadores reservados
    - Implementar `isAvailable(identifier)` com verificador de unicidade injetável
    - _Requirements: 4.1, 4.2, 4.4, 4.7, 4.8_

  - [x] 2.2 Escrever teste de propriedade para a normalização
    - **Feature: mobisno-store-builder, Property 2: Normalização de nome em Identificador_de_Loja**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 2.3 Escrever teste de propriedade para normalização válida ou rejeitada
    - **Feature: mobisno-store-builder, Property 3: Normalização produz formato válido ou é rejeitada**
    - **Validates: Requirements 4.3, 4.7**

  - [x] 2.4 Escrever teste de propriedade para a validação de formato
    - **Feature: mobisno-store-builder, Property 4: Validação de formato de identificador**
    - **Validates: Requirements 4.7, 4.8**

  - [x] 2.5 Escrever teste de propriedade para a composição de subdomínio
    - **Feature: mobisno-store-builder, Property 5: Composição determinística do subdomínio**
    - **Validates: Requirements 4.4**

- [x] 3. Implementar AuthService
  - [x] 3.1 Implementar registo, autenticação e obtenção do dono atual
    - Implementar `register`, `login` e `getCurrentOwner` com validação de dados
    - Devolver erro com motivo em caso de dados inválidos/incompletos, permitindo à UI preservar os dados do wizard
    - _Requirements: 1.4, 1.5_

  - [x] 3.2 Escrever testes unitários do AuthService
    - Testar registo/login com credenciais válidas e inválidas/incompletas
    - _Requirements: 1.4, 1.5_

- [x] 4. Implementar camada de persistência multi-inquilino
  - [x] 4.1 Implementar repositórios com filtragem obrigatória por `storeId`/`ownerId`
    - Criar repositórios de `StoreOwner`, `Store`, `Product`, `Banner`, `Asset`
    - Garantir que toda a leitura/escrita filtra por `ownerId`/`storeId` (isolamento de inquilino)
    - Aplicar invariantes de dados (unicidade de identificador, coerência de subdomínio)
    - _Requirements: 5.2, 7.9_

- [x] 5. Implementar StoreService
  - [x] 5.1 Implementar criação de loja, seleção de modelo e leituras
    - Implementar `createStore` com validação de campos obrigatórios, validação de comprimento do nome (2–60 após trim), associação exclusiva ao dono e revalidação de disponibilidade do subdomínio (sem persistir loja parcial)
    - Implementar `setTemplate` (mantém exatamente um Modelo), `getStoreByIdentifier`, `getStoresForOwner`
    - Implementar função pura de validação do nome da Loja
    - _Requirements: 2.2, 2.5, 2.6, 2.7, 3.3, 5.1, 5.2, 5.4, 5.5, 5.6_

  - [x] 5.2 Escrever teste de propriedade para a validação de comprimento do nome
    - **Feature: mobisno-store-builder, Property 1: Validação de comprimento do nome da Loja**
    - **Validates: Requirements 2.2, 2.5, 2.6, 2.7**

  - [x] 5.3 Escrever teste de propriedade para unicidade e reserva de identificador
    - **Feature: mobisno-store-builder, Property 6: Unicidade e reserva de identificador**
    - **Validates: Requirements 4.5, 5.5**

  - [x] 5.4 Escrever teste de propriedade para posse exclusiva da Loja
    - **Feature: mobisno-store-builder, Property 7: Posse exclusiva da Loja criada**
    - **Validates: Requirements 5.2**

  - [x] 5.5 Escrever teste de propriedade para a validação de input na confirmação final
    - **Feature: mobisno-store-builder, Property 8: Validação de input de criação na confirmação final**
    - **Validates: Requirements 5.1, 5.6, 10.6**

  - [x] 5.6 Escrever teste de propriedade para a atomicidade da criação em falha
    - **Feature: mobisno-store-builder, Property 9: Atomicidade da criação em falha**
    - **Validates: Requirements 5.4**

  - [x] 5.7 Escrever teste de propriedade para Modelo único associado à Loja
    - **Feature: mobisno-store-builder, Property 10: Modelo único associado à Loja**
    - **Validates: Requirements 3.3**

- [x] 6. Checkpoint - Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implementar FileService
  - [x] 7.1 Implementar validação e armazenamento de ficheiros
    - Implementar `validate` por política (formatos permitidos, limites mín./máx., rejeição de vazios/corrompidos) com deteção por conteúdo (magic bytes)
    - Implementar `store` para object storage e as políticas de Logótipo, Produto e Banner
    - Garantir que ficheiros rejeitados não são persistidos e o recurso anterior permanece inalterado
    - _Requirements: 6.2, 6.3, 6.4, 7.4, 8.2, 8.3_

  - [x] 7.2 Escrever teste de propriedade para a validação de ficheiro por política
    - **Feature: mobisno-store-builder, Property 11: Validação de ficheiro por política**
    - **Validates: Requirements 6.2, 6.3, 6.4, 7.4, 8.2, 8.3**

- [x] 8. Implementar ProductService
  - [x] 8.1 Implementar gestão de produtos com validação e isolamento
    - Implementar `create`, `update`, `remove` com validação (nome 1–120, descrição ≤2000, preço 0,00–999.999.999,99) e verificação de posse
    - Implementar `listForStore` e `listAvailableForPublic` (apenas produtos disponíveis)
    - Rejeitar produtos sem nome/preço, com preço negativo, ou recursos inexistentes/de outra Loja
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [x] 8.2 Escrever teste de propriedade para a validação de Produto
    - **Feature: mobisno-store-builder, Property 13: Validação de Produto**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5**

  - [x] 8.3 Escrever teste de propriedade para o isolamento de inquilino em operações de Produto
    - **Feature: mobisno-store-builder, Property 14: Isolamento de inquilino em operações de Produto**
    - **Validates: Requirements 7.9**

  - [x] 8.4 Escrever teste de propriedade para a filtragem de produtos disponíveis
    - **Feature: mobisno-store-builder, Property 15: Filtragem de produtos disponíveis na loja publicada**
    - **Validates: Requirements 7.8**

- [x] 9. Implementar BannerService
  - [x] 9.1 Implementar gestão de banners com limite, ordem e tolerância a falhas
    - Implementar `add` (máximo 10 por Loja), `remove` e `listOrdered` (por ordem de adição crescente)
    - Garantir que adições para além de 10 são impedidas e que falhas de carregamento não alteram os banners existentes
    - _Requirements: 8.1, 8.4, 8.5, 8.6, 8.7_

  - [x] 9.2 Escrever teste de propriedade para o limite máximo de Banners
    - **Feature: mobisno-store-builder, Property 16: Limite máximo de Banners**
    - **Validates: Requirements 8.1, 8.4**

  - [x] 9.3 Escrever teste de propriedade para a ordem de exibição de Banners
    - **Feature: mobisno-store-builder, Property 17: Ordem de exibição de Banners**
    - **Validates: Requirements 8.5**

  - [x] 9.4 Escrever teste de propriedade para a preservação de Banners em falha
    - **Feature: mobisno-store-builder, Property 18: Preservação de Banners em falha de carregamento**
    - **Validates: Requirements 8.6**

- [x] 10. Checkpoint - Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implementar StorefrontResolver e middleware de subdomínio
  - [x] 11.1 Implementar a resolução de loja por host
    - Implementar middleware que extrai o identificador do cabeçalho `Host` e valida o formato (1–63 para resolução)
    - Implementar `resolve(host)` devolvendo `render` (Modelo, Logótipo, Banners, produtos disponíveis) apenas para Loja existente e Publicada; caso contrário `not_found` sem expor dados
    - _Requirements: 9.1, 9.3, 9.4, 9.5_

  - [x] 11.2 Escrever teste de propriedade para a resolução de storefront
    - **Feature: mobisno-store-builder, Property 19: Resolução de storefront por subdomínio**
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5**

- [x] 12. Implementar UI da página inicial e do Assistente_de_Criação
  - [x] 12.1 Implementar página inicial e estrutura do Assistente
    - Implementar a ação única e permanente "Criar o meu site" acima da dobra
    - Implementar o shell do Assistente com passos numerados, indicador de passo atual/total, navegação para trás e gestão de estado do wizard
    - _Requirements: 1.1, 1.2, 1.6, 10.1, 10.5_

  - [x] 12.2 Implementar os passos de nome/tipo, modelo, subdomínio, autenticação e confirmação
    - Ligar validação de nome e tipo, seleção de Modelo, apresentação do subdomínio resultante antes da confirmação, passo de autenticação e confirmação final
    - Apresentar mensagens de erro em português junto a cada campo inválido e preservar dados
    - _Requirements: 1.4, 2.1, 2.3, 2.4, 3.1, 3.2, 3.4, 3.5, 4.6, 5.3, 10.2, 10.3, 10.6_

  - [x] 12.3 Escrever teste de propriedade para a preservação de dados na navegação do Assistente
    - **Feature: mobisno-store-builder, Property 20: Preservação de dados na navegação do Assistente**
    - **Validates: Requirements 1.5, 1.6, 10.2, 10.4**

  - [x] 12.4 Escrever testes unitários da UI do Assistente
    - Testar presença da ação acima da dobra, listas de Tipo_de_Loja e Modelos, mensagem de retry no arranque, indicadores de passo e textos em português
    - _Requirements: 1.1, 1.3, 2.3, 3.1, 4.6, 10.1, 10.3, 10.5_

- [x] 13. Implementar UI do Painel_de_Administração
  - [x] 13.1 Implementar UI de gestão do Logótipo
    - Implementar carregamento de Logótipo com mensagens de confirmação/erro e ligação ao FileService
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 13.2 Implementar UI de gestão de Produtos
    - Implementar listagem, registo, edição e remoção (com confirmação) de Produtos ligada ao ProductService
    - _Requirements: 7.1, 7.5, 7.6, 7.7_

  - [x] 13.3 Implementar UI de gestão de Banners
    - Implementar adição e remoção de Banners ligada ao BannerService, com limite e mensagens
    - _Requirements: 8.1, 8.4, 8.7_

  - [x] 13.4 Escrever testes unitários da UI do Painel_de_Administração
    - Testar mensagens de rejeição de ficheiro, confirmação de remoção e remoção de banner
    - _Requirements: 6.3, 7.7, 8.7_

- [x] 14. Implementar renderização da loja publicada
  - [x] 14.1 Implementar o renderizador da loja publicada
    - Renderizar Modelo, Logótipo (no cabeçalho e nos menus), Banners pela ordem de adição e produtos disponíveis
    - Aplicar a identidade visual de substituição quando não existe Logótipo
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 8.5, 9.1_

  - [x] 14.2 Escrever teste de propriedade para a identidade visual de substituição
    - **Feature: mobisno-store-builder, Property 12: Identidade visual de substituição na ausência de Logótipo**
    - **Validates: Requirements 6.7**

  - [x] 14.3 Escrever testes unitários da renderização da loja
    - Testar exibição do Logótipo no cabeçalho/menus e que a remoção de Produto/Banner deixa de os exibir
    - _Requirements: 6.5, 6.6, 7.7, 8.7_

- [x] 15. Integração e wiring
  - [x] 15.1 Ligar o Assistente_de_Criação aos serviços e ao redireccionamento
    - Ligar wizard → AuthService/IdentifierService/StoreService e redireccionar ao Painel_de_Administração após criação
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 15.2 Ligar o Painel_de_Administração aos serviços de ficheiros, produtos e banners
    - Ligar UI de administração → FileService/ProductService/BannerService e propagar alterações à loja publicada
    - _Requirements: 6.1, 6.8, 7.5, 8.2_

  - [x] 15.3 Escrever testes de integração e smoke
    - Testar arranque do Assistente ≤3s, criação ≤10s, Painel ≤5s, carregamento da loja ≤3s e roteamento por subdomínio
    - _Requirements: 1.2, 1.3, 5.1, 5.3, 6.8, 7.5, 8.2, 9.2_

- [x] 16. Checkpoint final - Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- As sub-tarefas marcadas com `*` são opcionais (testes) e podem ser ignoradas para um MVP mais rápido.
- Cada tarefa referencia requisitos específicos para rastreabilidade.
- Os checkpoints garantem validação incremental.
- Os testes de propriedade (fast-check, ≥100 iterações) validam as 20 propriedades universais de correção; cada propriedade tem exatamente um teste.
- Os testes unitários e de integração validam exemplos concretos, comportamentos de UI e requisitos dependentes de infraestrutura/tempo.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1", "7.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.2", "5.1", "7.2", "8.1", "9.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "8.2", "8.3", "8.4", "9.2", "9.3", "9.4", "11.1"] },
    { "id": 5, "tasks": ["11.2", "12.1", "13.1", "13.2", "13.3", "14.1"] },
    { "id": 6, "tasks": ["12.2", "13.4", "14.2", "14.3"] },
    { "id": 7, "tasks": ["12.3", "12.4"] },
    { "id": 8, "tasks": ["15.1", "15.2"] },
    { "id": 9, "tasks": ["15.3"] }
  ]
}
```

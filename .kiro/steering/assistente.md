---
inclusion: always
---

# O assistente tem de saber o que acabaste de mudar

## A regra

**Ao alterar qualquer ecrã da plataforma, actualiza a orientação do assistente
desse ecrã na mesma alteração.** Não num commit a seguir, não «quando houver
tempo»: na mesma alteração, porque é a única altura em que se sabe o que mudou.

A orientação de cada ecrã vive em `web/lib/assistantContext.ts`, ao lado das
vistas que descreve — de propósito. Estava em `api/assistant.js`, longe dos
ecrãs, e foi assim que envelheceu sem ninguém notar.

Ecrãs abrangidos: a página inicial, o registo, o assistente de criação, o painel
do Dono e cada um dos seus separadores, o editor, o Painel_Admin, a galeria de
modelos, o diretório de lojas e as páginas legais.

**Excepção: as lojas publicadas.** As páginas públicas de uma loja
(`storefront`, `product`, `category`, `cart`, `checkout`) **não têm assistente** —
são o site do Dono, vistas pelos clientes dele. Alterar essas vistas não obriga a
tocar em nada aqui.

## Porque é que esta regra existe

O assistente respondeu a «no plano de 11 mil, consigo criar 10 lojas?» com «para
saber quantas lojas inclui, vê a secção de preços». Não foi falha do modelo: o
prompt dizia-lhe literalmente *«Há planos diferentes (ver secção de preços na
página)»* e *«No plano Básico, a venda é por WhatsApp»*.

Só que os escalões Básico/Profissional/Empresarial tinham sido **removidos**.
Passou a haver um só plano, com lojas e produtos ilimitados. O ecrã de preços foi
refeito, a faturação foi refeita, e o assistente ficou a descrever um produto que
já não existia — a mandar as pessoas consultar uma tabela de escalões que
desapareceu.

Um assistente com informação errada é pior do que não ter assistente: o
utilizador confia na resposta.

## Como cumprir

1. **Números e limites nunca se escrevem à mão.** Vêm de
   `src/services/plans.ts`, `web/lib/routing.ts` e dos outros módulos de domínio,
   através de `platformFacts()`. Se escreveres «11.000 Kz» num texto, esse texto
   está errado no dia em que o preço mudar.
2. **Descreve o que o ecrã faz agora**, com os rótulos que o Dono vê no botão. Se
   renomeaste um botão, o nome novo tem de estar na orientação — é por ele que o
   utilizador pergunta.
3. **Diz o que não existe.** Metade das perguntas é sobre coisas que a plataforma
   não faz, ou que estão «Em breve» (o SMS de confirmação e o domínio próprio).
   Sem isso, o assistente inventa.
4. **Nunca mandes o utilizador procurar o que tu sabes.** Se a resposta está nos
   factos, responde com a resposta. «Vê na secção de preços» é uma não-resposta.
5. **Se removeste uma funcionalidade, remove-a da orientação.** Foi exactamente
   este passo que faltou nos escalões de preços.

## Guarda automática

`tests/assistantScopes.test.ts` verifica os âmbitos e o texto do assistente.
Quando acrescentares um ecrã ou mudares uma orientação, acrescenta lá a asserção
correspondente — é o que impede a orientação de voltar a divergir em silêncio.

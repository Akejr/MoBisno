# O que falta fazer à mão

Tudo o que está no código está feito e testado. Isto é o que só você pode fazer:
SQL, variáveis de ambiente e painéis de terceiros.

> Detalhe completo em `DEPLOY.md`. Isto é a lista curta.

---

## 1. SQL no Supabase (SQL Editor, por esta ordem)

| Ficheiro | Sem isto |
|---|---|
| `supabase/migrations/0022_security.sql` | Qualquer utilizador autenticado promove-se a administrador |
| `supabase/migrations/0023_single_plan_and_company_verification.sql` | O painel «Pagamentos» falha ao gravar a verificação de empresa |
| `supabase/migrations/0024_wizapay_vero_and_whatsapp_orders.sql` | A venda digital não grava a factura, e as «Encomendas por WhatsApp» não aparecem |

Se a 0022 e a 0023 já foram aplicadas, falta só a **0024**. Correr duas vezes não
estraga nada (é tudo `if not exists`).

Depois de aplicar:

- Confirmar que o bucket **`company-documents`** existe e está **privado**
  (criado pela 0023).
- Confirmar que a tabela **`whatsapp_orders`** existe (criada pela 0024).

---

## 2. Variáveis de ambiente na Vercel

Settings → Environment Variables → Production **e** Preview.

| Variável | Valor |
|---|---|
| `WIPAY_CLIENT_ID` | do painel da Wiza |
| `WIPAY_CLIENT_SECRET` | do painel da Wiza (secreta) |
| `WIPAY_WEBHOOK_SECRET` | **inventada por você** — 32 caracteres aleatórios |
| `RESEND_API_KEY` | do painel do Resend |
| `RESEND_FROM` | opcional. Por omissão, `MôBisno <vendas@mobisno.store>` |
| `WIPAY_BASE_URL` | opcional. Por omissão, `https://api.wipay.ao` |
| `GOOGLE_SITE_VERIFICATION` | só se verificar o Search Console por URL em vez de DNS |

Sem as `WIPAY_*`, os pagamentos digitais respondem 503 e **as lojas continuam a
vender por WhatsApp** — nada parte.

Fazer **Redeploy** depois de as definir.

---

## 3. Painel da Wiza

URL de notificação (callback):

```
https://mobisno.store/api/payment-webhook?k=<WIPAY_WEBHOOK_SECRET>
```

O `?k=` tem de ser **exactamente** o valor da variável. É uma das três provas que
o webhook exige (as outras duas são o id do pagamento e o montante).

---

## 4. Painel do Resend

Verificar o **domínio do remetente** (registos DNS que o Resend indica). Sem
isso, o email sai para spam ou não sai.

O que é enviado: aviso de venda ao Dono e recibo com a factura ao comprador.

---

## 5. Vero — nada a fazer pela Plataforma

A factura é emitida pela **empresa de cada Dono**, não pela MôBisno. Cada Dono
abre Dashboard → «Pagamentos» → «Fatura automática (Vero)» e escreve o Org ID e a
chave `vero_live_sk_…` **dele**.

Sem credenciais, a loja vende e recebe como sempre; só não emite factura. Uma
chave `vero_test_sk_…` emite mas não chega à AGT — o painel avisa.

---

## 6. Resto da configuração (se ainda estiver pendente)

- **Domínio principal** escolhido na Vercel (apex ou `www.`), de forma coerente.
- **Wildcard** `*.sualoja.digital` com SSL emitido.
- **Search Console**: propriedade de **Domínio** para `sualoja.digital` e
  `mobisno.store`, verificadas por DNS (TXT), e os sitemaps submetidos.
- **Supabase → Authentication → URL Configuration**: Site URL e Redirect URLs
  com `/login` incluído, senão o «Esqueci-me da palavra-passe» não funciona.
- **Palavra-passe do administrador** rodada, se alguma vez foi partilhada.
- Nenhum webhook antigo a apontar para `/api/webhook` (esse endpoint foi
  apagado — aceitava qualquer pedido).

---

## 7. Primeiro teste a sério

1. Uma loja com a empresa **aprovada** e as credenciais Vero ligadas.
2. Compra por **Multicaixa Express**, paga nos primeiros 5 minutos.
3. Compra por **Referência Bancária**, paga horas depois (confirma pelo
   callback, não pelo regresso do cliente).
4. Verificar: a factura chegou ao comprador **em nome da empresa do Dono**, o
   aviso chegou ao Dono, e `orders.fee` / `orders.net` têm a comissão certa.
5. Um levantamento, para fechar o ciclo.

---

## A comissão

5% de cada venda recebida por Multicaixa Express ou Referência Bancária. O
«Disponível para levantar» do Dono é já o valor líquido. As vendas por WhatsApp
**não têm comissão nenhuma**.

O número vive em `src/services/fees.ts` e em mais sítio nenhum: muda-se ali e
muda no painel, na página inicial, no assistente e no que a encomenda grava.

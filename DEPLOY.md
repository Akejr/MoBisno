# Deploy — MôBisno (Vercel + domínio mobisno.store)

A app é uma SPA estática (Vite, routing por hash) com backend no Supabase.
As lojas dos clientes ficam em **subdomínios reais**: `nomedaloja.mobisno.store`.

## 1. Repositório

```bash
git remote add origin https://github.com/Akejr/MoBisno.git
git add .
git commit -m "MôBisno: domínio mobisno.store + deploy Vercel"
git branch -M main
git push -u origin main
```

> A `anon key` do Supabase é pública por design (o isolamento é por RLS), mas as
> variáveis ficam fora do git (ver `.gitignore`) e são definidas na Vercel.

## 2. Projeto na Vercel

1. **Add New → Project** → importar `Akejr/MoBisno`.
2. A Vercel lê o `vercel.json` (build `npm run web:build`, output `web/dist`).
3. **Environment Variables** (Production + Preview):
   - `VITE_SUPABASE_URL` = URL do projeto Supabase
   - `VITE_SUPABASE_ANON_KEY` = chave anon (pública)
4. Deploy.

## 3. Domínio `mobisno.store` + wildcard

No painel do projeto → **Settings → Domains**, adicionar:
- `mobisno.store` (apex)
- `www.mobisno.store`
- `*.mobisno.store`  ← wildcard, essencial para `nomedaloja.mobisno.store`

DNS no teu registrar (a Vercel mostra os valores exatos; tipicamente):
- Apex `mobisno.store` → registo **A** `76.76.21.21` (ou ALIAS/ANAME para `cname.vercel-dns.com`)
- `www` → **CNAME** `cname.vercel-dns.com`
- `*` (wildcard) → **CNAME** `cname.vercel-dns.com`

A Vercel emite SSL automático, incluindo para o wildcard.

## 4. Supabase

1. Aplicar as migrações por ordem no **SQL Editor**: `0001` … `0007_domain_store.sql`
   (a `0007` muda a coerência do subdomínio para `.mobisno.store`).
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://mobisno.store`
   - **Redirect URLs**: `https://mobisno.store/**`, `https://www.mobisno.store/**`
3. (Testes) Em **Authentication → Providers → Email**, desativar a confirmação de
   email para criar contas sem caixa de entrada.

## 5. Como funciona o roteamento

- `mobisno.store` / `www.mobisno.store` → app principal (landing, login, painel, criar).
- `nomedaloja.mobisno.store` → `main.ts` deteta o subdomínio e renderiza a loja
  publicada desse identificador. As sub-páginas (produto/categoria/carrinho)
  continuam a funcionar por hash (`#/loja/...`).
- Em `localhost` ou `*.vercel.app` (sem subdomínio) cai-se no modo hash
  (`/#/loja/<identificador>`), por isso o preview da Vercel funciona à mesma.

## 6. Notas

- GitHub Pages **não** serve para o produto final por não suportar wildcard de
  subdomínios; a Vercel suporta. Por isso o deploy é na Vercel.
- O `web/dist` é gerado no build e está no `.gitignore` (via `dist/`).

## Assistente de IA (olhinho do editor)

O chat do assistente usa uma função serverless em `api/assistant.js` que guarda a
chave da OpenAI **apenas no servidor**. Configura no Vercel (Project → Settings →
Environment Variables):

- `OPENAI_API_KEY` — a chave secreta da OpenAI (obrigatória).
- `OPENAI_MODEL` — opcional; por omissão `gpt-5.4-mini`.

Nunca coloques a chave no frontend nem a faças commit. Em desenvolvimento local,
o chat só funciona com `vercel dev` (a função `/api/assistant` não corre com o
`vite` puro).

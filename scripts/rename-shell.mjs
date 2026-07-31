/**
 * Renomeia o shell da SPA de `index.html` para `app.html` depois do build.
 *
 * PORQUÊ: na Vercel, os `rewrites` do `vercel.json` só são avaliados DEPOIS de
 * procurar um ficheiro estático. Enquanto existir um `index.html` na raiz do
 * output, o pedido a `/` é servido por esse ficheiro e a regra
 * `{ "source": "/", "destination": "/api/prerender" }` nunca dispara — ou seja,
 * a página inicial de cada loja (a mais importante) era a ÚNICA que nunca era
 * pré-renderizada, enquanto `/produto/...` e `/categoria/...` funcionavam.
 *
 * Sem ficheiro em `/`, o pedido falha no sistema de ficheiros, o rewrite
 * aplica-se e a função `api/prerender.js` responde com o HTML já renderizado.
 * O shell continua acessível em `/app.html`, que é de onde o prerender o lê
 * (e que o `robots.txt` bloqueia, para não ser indexado em branco).
 */
import { renameSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "web", "dist");
const from = join(dist, "index.html");
const to = join(dist, "app.html");

if (!existsSync(from)) {
  if (existsSync(to)) {
    console.log("rename-shell: app.html já existe, nada a fazer.");
    process.exit(0);
  }
  console.error(`rename-shell: ${from} não existe — o build falhou?`);
  process.exit(1);
}

renameSync(from, to);
console.log("rename-shell: web/dist/index.html -> web/dist/app.html");

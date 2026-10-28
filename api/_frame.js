/**
 * A página de pagamento do fornecedor deixa-se abrir dentro do nosso modal?
 *
 * Ficheiro com prefixo `_` → o Vercel não o trata como endpoint.
 *
 * ## Porque é que se pergunta no servidor
 *
 * Quem decide é a própria página, pelos cabeçalhos `X-Frame-Options` e
 * `Content-Security-Policy: frame-ancestors`. O navegador não diz a quem a
 * embute se ela foi recusada: o `iframe` fica com uma página de erro e o evento
 * `load` dispara na mesma. Detetá-lo em JavaScript não é fiável, e um modal em
 * branco é pior do que nenhum. O servidor lê os cabeçalhos no momento em que a
 * cobrança é criada, e o painel abre o `iframe` só quando ela deixa.
 *
 * `wipay.ao` responde `X-Frame-Options: SAMEORIGIN`; a página da cobrança vive
 * num endereço que só se conhece quando ela é criada. Daí a pergunta ser feita a
 * cada cobrança, e não escrita à mão.
 */

/** Tempo máximo da pergunta. Mais do que isto atrasa o «Pagar» do cliente. */
const TIMEOUT_MS = 2500;

/** A origem `o` (https://host) cabe na fonte `fonte` de um `frame-ancestors`? */
function cabeNaFonte(fonte, o) {
  const f = String(fonte || "").trim().toLowerCase();
  if (!f) return false;
  if (f === "*") return true;
  // `'self'` é a origem da própria página do fornecedor, não a nossa.
  if (f === "'self'" || f === "'none'") return false;
  // Só o esquema: `https:` aceita qualquer origem em https.
  if (/^[a-z][a-z0-9+.-]*:$/.test(f)) return o.startsWith(f);
  let url;
  try {
    url = new URL(o);
  } catch {
    return false;
  }
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?/.exec(f);
  if (!m) return false;
  const [, esquema, curinga, host] = m;
  if (esquema && `${esquema}:` !== url.protocol) return false;
  if (curinga) return url.hostname.endsWith(`.${host}`);
  return url.hostname === host;
}

/**
 * Decide pelos cabeçalhos. `true` deixa, `false` recusa.
 *
 * O `frame-ancestors` manda quando existe (os navegadores ignoram o
 * `X-Frame-Options` nesse caso); sem ele, decide o `X-Frame-Options`.
 *
 * @param origens As origens que vão embutir a página (a da loja ou a do painel).
 */
export function frameableFromHeaders(xfo, csp, origens) {
  const politica = String(csp || "");
  const fa = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(politica);
  if (fa) {
    const fontes = fa[1].trim().split(/\s+/).filter(Boolean);
    return (origens || []).some((o) => fontes.some((f) => cabeNaFonte(f, o)));
  }
  const x = String(xfo || "").trim().toLowerCase();
  if (x === "deny" || x === "sameorigin" || x.startsWith("allow-from")) return false;
  return true;
}

/**
 * Pergunta à página se se deixa embutir. `null` quando não foi possível saber
 * (o pedido falhou, demorou, ou respondeu com erro): quem chama abre o `iframe`
 * e deixa à vista a ligação para a abrir à parte.
 *
 * `HEAD`, e não `GET`: só interessam os cabeçalhos, e um `GET` à página de uma
 * cobrança é uma visita a mais que o fornecedor pode contar.
 */
export async function frameable(url, origens) {
  let alvo;
  try {
    alvo = new URL(String(url || ""));
  } catch {
    return null;
  }
  if (alvo.protocol !== "https:") return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(alvo.toString(), { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (r.status >= 400) return null;
    return frameableFromHeaders(r.headers.get("x-frame-options"), r.headers.get("content-security-policy"), origens);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

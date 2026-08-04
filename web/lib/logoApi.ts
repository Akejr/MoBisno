/**
 * Cliente do gerador de logótipos por IA (função serverless `/api/logo`).
 *
 * `api/logo.js` pede CINCO propostas em paralelo, uma por direção de arte, e
 * devolve as que conseguiu gerar em PNG com fundo transparente (base64).
 * `generateLogos` converte essas propostas em data URLs prontas a mostrar em
 * `<img>` e distingue explicitamente três situações (R2.6, decisão D3):
 *
 *  - `ok` — houve resposta do servidor; `images` traz as propostas recebidas e
 *    `missing` diz quantas das `requested` ficaram em falta;
 *  - `server-error` — o servidor recusou (`!res.ok`); `status`, `error` e
 *    `detail` são os que `api/logo.js` devolve, sem texto inventado aqui;
 *  - `network-error` — o `fetch` rejeitou (rede em baixo, pedido abortado,
 *    resposta ilegível); nunca se confunde com «não vieram propostas».
 *
 * O chamador é que escolhe o texto apresentado ao Dono. Este módulo não
 * inventa mensagens de erro do servidor: limita-se a transportá-las.
 *
 * NOTA sobre o payload de sucesso: o servidor deixou de devolver imagens
 * prontas. Devolve o briefing estruturado e cinco RECEITAS de composição, cada
 * uma com a tipografia, a cor e o arranjo a aplicar, e o símbolo em PNG apenas
 * nas direções que o exigem. O PNG final nasce em `web/lib/logoCompose.ts`, no
 * browser — é o que garante que o nome da marca está sempre bem escrito e que
 * as cinco propostas partilham a mesma tipografia.
 */
import type { LogoDirection } from "./logoCompose.js";

export type { LogoDirection };

/** Nº de propostas pedidas ao servidor (uma por direção de `api/logo.js`). */
export const LOGO_PROPOSALS = 5;

/** Briefing estruturado que o servidor extrai da descrição do Dono. */
export interface LogoBrief {
  brandName: string;
  sector: string;
  wantsSymbol: "yes" | "no" | "either";
  colors: string[];
  typographyMood: string;
  letterCase: string;
  symbolConcepts: string[];
  avoid: string[];
}

/**
 * Resultado do Gerador_De_Logotipos.
 *
 * Discriminado por `kind`; os pontos de chamada têm de tratar as três
 * variantes (wizard e separador `#/painel/logotipo` do Painel_Do_Dono).
 */
export type LogoResult =
  /**
   * O servidor respondeu com propostas. `directions` são receitas de
   * composição — o PNG só existe depois de `composeLogo` as desenhar — e podem
   * ser menos de `requested` quando um símbolo falhou. `missing = requested -
   * directions.length` e nunca é negativo.
   */
  | { kind: "ok"; brief: LogoBrief; directions: LogoDirection[]; requested: number; missing: number }
  /**
   * O servidor recusou o pedido. `status` é o código HTTP; `error` e `detail`
   * vêm tal como `api/logo.js` os devolve (`{ error, detail? }`). `error` pode
   * vir vazio quando a resposta não trouxe motivo legível — nesse caso o
   * chamador mostra o seu próprio texto genérico, com o `status` à mão.
   */
  | { kind: "server-error"; status: number; error: string; detail?: string }
  /**
   * Não houve resposta utilizável: o `fetch` rejeitou ou o corpo não se
   * conseguiu ler. `message` é o motivo técnico, para diagnóstico.
   */
  | { kind: "network-error"; message: string };

/** Devolve o texto quando é uma string não vazia; senão `undefined`. */
function textOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Pede as propostas de logótipo ao servidor a partir da descrição do Dono.
 *
 * Substitui a assinatura antiga `Promise<string[]>`, que devolvia `[]` em
 * qualquer falha e engolia o `detail` que o servidor manda (decisão D3).
 */
export async function generateLogos(description: string): Promise<LogoResult> {
  let res: Response;
  try {
    res = await fetch("/api/logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
  } catch (err) {
    return { kind: "network-error", message: errorMessage(err) };
  }

  // Corpo lido sempre em JSON: é o que `api/logo.js` devolve nos dois casos.
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    // Resposta sem JSON legível. Com `!res.ok` ainda dá para reportar o
    // estado do servidor; com `res.ok` não há propostas nem motivo, e a
    // falha é de comunicação.
    if (!res.ok) return { kind: "server-error", status: res.status, error: "" };
    return { kind: "network-error", message: errorMessage(err) };
  }

  const data = (body ?? {}) as { brief?: unknown; directions?: unknown; requested?: unknown; error?: unknown; detail?: unknown };

  if (!res.ok) {
    const detail = textOrUndefined(data.detail);
    return {
      kind: "server-error",
      status: res.status,
      error: textOrUndefined(data.error) ?? "",
      ...(detail ? { detail } : {}),
    };
  }

  const raw = Array.isArray(data.directions) ? data.directions : [];
  const directions = raw.filter(isDirection);
  const requested = typeof data.requested === "number" && data.requested > 0 ? data.requested : LOGO_PROPOSALS;
  return {
    kind: "ok",
    brief: (data.brief ?? {}) as LogoBrief,
    directions,
    requested,
    missing: Math.max(0, requested - directions.length),
  };
}

/**
 * Uma direção só é utilizável se trouxer a receita mínima de composição. O
 * corpo vem de uma função serverless que fala com um modelo: filtrar aqui
 * impede que uma entrada truncada rebente no Canvas.
 */
function isDirection(value: unknown): value is LogoDirection {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<LogoDirection>;
  return typeof d.slot === "string"
    && typeof d.layout === "string"
    && typeof d.fontFamily === "string"
    && typeof d.color === "string"
    && typeof d.weight === "number";
}

/** Motivo técnico de uma exceção, em texto utilizável. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  const text = textOrUndefined(err);
  return text ?? "Falha de comunicação com o servidor.";
}

/**
 * Melhora/estrutura a descrição do logótipo escrita pelo dono, via IA
 * (`/api/assistant`, scope "logo"). Devolve o texto melhorado, ou `null` se a
 * IA não estiver disponível (ex.: dev local) para o chamador tratar o caso.
 */
export async function improveLogoDescription(text: string): Promise<string | null> {
  try {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "logo", question: text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { answer?: string };
    const answer = (data?.answer ?? "").replace(/^["']|["']$/g, "").trim();
    return answer || null;
  } catch {
    return null;
  }
}

/** Converte uma data URL base64 (PNG) em bytes para o FileService. */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

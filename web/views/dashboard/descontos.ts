/**
 * Separador «Código de desconto» do Dashboard do Dono.
 *
 * Criar um código (percentagem ou valor fixo, com limite de usos e data-limite
 * opcionais) e gerir os que existem. O estado de cada código é o de
 * `discountState` — o mesmo que o checkout respeita —, nunca uma conta à parte:
 * um código caducado ou esgotado diz «Caducado» ou «Esgotado» mesmo estando
 * ligado.
 */
import { toast, withBusy, withButton } from "../../lib/dom.js";
import { createDiscount, deleteDiscount, discountState, listDiscounts, setDiscountActive, type DiscountCode } from "../../supabase/discounts.js";
import type { DashCtx } from "./context.js";
import { card, cardHead, pageIntro, pill, plural } from "./ui.js";
import { discountFormHtml, discountListHtml } from "./markup.js";
import { inputValue, todayLocalIso } from "./forms.js";

/** Fim do dia escolhido, no fuso de quem cria: «válido até 12/08» vale o dia 12 inteiro. */
function fimDoDia(data: string): string | null {
  if (!data) return null;
  const t = new Date(`${data}T23:59:59`);
  return Number.isNaN(t.getTime()) ? data : t.toISOString();
}

export async function renderDescontos(ctx: DashCtx): Promise<void> {
  ctx.loading();
  const { store } = ctx;
  let codigos: DiscountCode[] = await listDiscounts(store.id);

  const listaHtml = (): string => discountListHtml(codigos.map((code) => ({ code, state: discountState(code) })));
  const contagem = (): string => pill(plural(codigos.length, "código", "códigos"), "neutral");

  const pintado = ctx.paint(`
    ${pageIntro("Códigos que os clientes escrevem no checkout para ganhar desconto. Pode limitar quantas vezes cada um é usado e até quando vale.")}
    <div class="space-y-6">
      ${card(`${cardHead({ icon: "add_card", title: "Criar código" })}<div class="mt-5">${discountFormHtml(todayLocalIso())}</div>`)}
      ${card(`${cardHead({ icon: "sell", title: "Os seus códigos", aside: `<span id="dc-count">${contagem()}</span>` })}<div id="dc-list" class="mt-2">${listaHtml()}</div>`)}
    </div>`);
  if (!pintado) return;

  const lista = document.getElementById("dc-list");
  const redesenhar = (): void => {
    if (lista) lista.innerHTML = listaHtml();
    const n = document.getElementById("dc-count");
    if (n) n.innerHTML = contagem();
  };

  // A unidade do valor acompanha o tipo: «(%)» ou «(Kz)».
  const tipo = document.getElementById("dc-type") as HTMLSelectElement | null;
  tipo?.addEventListener("change", () => {
    const unidade = document.getElementById("dc-value-unit");
    if (unidade) unidade.textContent = tipo.value === "fixed" ? "(Kz)" : "(%)";
  });

  const erro = document.getElementById("dc-error");
  const formulario = document.getElementById("dc-form") as HTMLFormElement | null;
  formulario?.addEventListener("input", () => { if (erro) erro.textContent = ""; });
  formulario?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const maxRaw = inputValue("dc-max").trim();
    const entrada = {
      code: inputValue("dc-code"),
      type: (inputValue("dc-type") === "fixed" ? "fixed" : "percent") as "percent" | "fixed",
      value: Number(inputValue("dc-value").replace(",", ".")),
      maxUses: maxRaw === "" ? null : Number(maxRaw),
      expiresAt: fimDoDia(inputValue("dc-until").trim()),
    };
    const botao = document.getElementById("dc-add") as HTMLButtonElement | null;
    // `createDiscount` valida tudo (código, valor, limite, data) e devolve a frase.
    const falha = await withButton(botao, () => createDiscount(store.id, entrada), "A criar…");
    if (falha) {
      if (erro) erro.textContent = falha;
      return;
    }
    toast(`Código ${entrada.code.trim().toUpperCase()} criado.`);
    form.reset();
    const unidade = document.getElementById("dc-value-unit");
    if (unidade) unidade.textContent = "(%)";
    codigos = await listDiscounts(store.id);
    redesenhar();
    document.getElementById("dc-code")?.focus();
  });

  // Um ouvinte só para a lista: redesenhar não deixa botões sem ligação.
  lista?.addEventListener("click", async (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-dc-toggle],[data-dc-del]");
    if (!alvo) return;
    const id = alvo.dataset.dcToggle ?? alvo.dataset.dcDel ?? "";
    const codigo = codigos.find((c) => c.id === id);
    if (!codigo) return;
    if (alvo.dataset.dcToggle) {
      const ok = await withButton(alvo, () => setDiscountActive(id, !codigo.active), "A atualizar…");
      if (!ok) { toast("Não foi possível mudar o código.", "error"); return; }
      codigo.active = !codigo.active;
      toast(codigo.active ? `Código ${codigo.code} ativado.` : `Código ${codigo.code} desativado.`);
      redesenhar();
      return;
    }
    if (!confirm(`Apagar o código ${codigo.code}? Os clientes deixam de o poder usar, e não é possível recuperá-lo.`)) return;
    const ok = await withBusy(() => deleteDiscount(id), "A apagar o código…");
    if (!ok) { toast("Não foi possível apagar o código.", "error"); return; }
    codigos = codigos.filter((c) => c.id !== id);
    toast("Código apagado.");
    redesenhar();
  });
}

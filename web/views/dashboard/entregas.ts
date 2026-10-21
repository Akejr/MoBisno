/**
 * Separador «Taxa de entrega» do Dashboard do Dono.
 *
 * Vivia dentro das «Configurações», num acordeão entre o SMS e os pixels — o
 * sítio menos provável de procurar quanto se cobra pela entrega. É a mesma
 * gravação de sempre, `custom.delivery`, que o checkout e o servidor leem: só o
 * ecrã mudou de lugar e ganhou validação e um resumo.
 */
import { toast, withButton } from "../../lib/dom.js";
import { saveCustomization, getCustomization } from "../../supabase/customization.js";
import { DELIVERY_PROVINCE } from "../../lib/areas.js";
import type { DashCtx } from "./context.js";
import { BTN_PRIMARY, card, cardHead, icon, pageIntro } from "./ui.js";
import { buildDelivery, deliveryEditorHtml, deliveryModeOf, deliverySummaryHtml, type DeliveryMode } from "./markup.js";
import { inputValue, setFieldError } from "./forms.js";

export async function renderEntregas(ctx: DashCtx): Promise<void> {
  ctx.loading();
  const { store, ownerId } = ctx;
  const custom = await getCustomization(store.id);

  const pintado = ctx.paint(`
    ${pageIntro(`Quanto cobra pela entrega em ${DELIVERY_PROVINCE}. A taxa é somada ao total da encomenda, no checkout e na mensagem de WhatsApp.`)}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      ${card(`
        ${cardHead({ icon: "local_shipping", title: "Taxa de entrega", subtitle: `Província: ${DELIVERY_PROVINCE}` })}
        <form id="del-form" novalidate class="mt-6">
          ${deliveryEditorHtml(custom.delivery)}
          <div class="mt-6 pt-5 border-t border-gray-100 flex flex-wrap items-center gap-3">
            <button type="submit" id="save-delivery" class="${BTN_PRIMARY}">${icon("save", "text-[18px]")} Guardar a taxa de entrega</button>
          </div>
        </form>`, "lg:col-span-2")}
      ${card(`
        ${cardHead({ icon: "receipt", title: "Resumo", subtitle: "O que está guardado agora." })}
        <div id="del-summary" class="mt-4">${deliverySummaryHtml(custom.delivery)}</div>`)}
    </div>`);
  if (!pintado) return;

  let modo: DeliveryMode = deliveryModeOf(custom.delivery);

  const aplicarModo = (): void => {
    document.querySelectorAll<HTMLElement>("[data-dmode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dmode === modo)));
    document.getElementById("del-single")?.classList.toggle("hidden", modo !== "single");
    document.getElementById("del-perarea")?.classList.toggle("hidden", modo !== "perArea");
  };
  document.querySelectorAll<HTMLElement>("[data-dmode]").forEach((b) =>
    b.addEventListener("click", () => {
      modo = b.dataset.dmode === "single" ? "single" : "perArea";
      aplicarModo();
    }));

  // Marcar uma área liga o campo da taxa e põe lá o cursor; desmarcar desliga-o.
  document.querySelectorAll<HTMLElement>(".mb-area").forEach((linha) => {
    const on = linha.querySelector<HTMLInputElement>("[data-a-on]");
    const fee = linha.querySelector<HTMLInputElement>("[data-a-fee]");
    on?.addEventListener("change", () => {
      if (!fee) return;
      fee.disabled = !on.checked;
      fee.removeAttribute("aria-invalid");
      if (on.checked) fee.focus();
    });
    fee?.addEventListener("input", () => fee.removeAttribute("aria-invalid"));
  });

  const form = document.getElementById("del-form") as HTMLFormElement | null;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const areas = [...document.querySelectorAll<HTMLElement>(".mb-area")].map((linha) => ({
      area: linha.dataset.area ?? "",
      on: linha.querySelector<HTMLInputElement>("[data-a-on]")?.checked === true,
      fee: linha.querySelector<HTMLInputElement>("[data-a-fee]")?.value ?? "",
      linha,
    }));
    const r = buildDelivery({ mode: modo, flat: inputValue("del-flat"), free: inputValue("del-free"), areas });

    setFieldError("del-flat", r.ok ? null : r.errors.flat ?? null);
    setFieldError("del-free", r.ok ? null : r.errors.free ?? null);
    const erroAreas = document.getElementById("del-areas-err");
    if (erroAreas) {
      erroAreas.textContent = r.ok ? "" : r.errors.areas ?? "";
      erroAreas.classList.toggle("hidden", r.ok || !r.errors.areas);
    }
    for (const a of areas) {
      const fee = a.linha.querySelector<HTMLInputElement>("[data-a-fee]");
      if (!fee) continue;
      if (!r.ok && r.badAreas.includes(a.area)) fee.setAttribute("aria-invalid", "true");
      else fee.removeAttribute("aria-invalid");
    }

    if (!r.ok) {
      // O foco vai para o primeiro campo errado, pela ordem do ecrã.
      const alvo: HTMLElement | null = r.errors.flat
        ? document.getElementById("del-flat")
        : r.badAreas.length
          ? areas.find((a) => r.badAreas.includes(a.area))?.linha.querySelector<HTMLInputElement>("[data-a-fee]") ?? null
          : r.errors.areas
            ? document.querySelector<HTMLInputElement>(".mb-area [data-a-on]")
            : document.getElementById("del-free");
      alvo?.focus();
      return;
    }

    custom.delivery = r.value;
    const botao = document.getElementById("save-delivery") as HTMLButtonElement | null;
    const ok = await withButton(botao, () => saveCustomization(ownerId, store.id, custom), "A guardar…");
    if (!ok) { toast("Não foi possível guardar a taxa de entrega.", "error"); return; }
    toast("Taxa de entrega guardada.");
    const resumo = document.getElementById("del-summary");
    if (resumo) resumo.innerHTML = deliverySummaryHtml(r.value);
  });
}

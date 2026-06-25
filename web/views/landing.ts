/** Página inicial — hero com "image accordion" interativo + CTAs dinâmicos. */
import { render, $, go, esc } from "../lib/dom.js";
import { currentOwnerId } from "../composition.js";

const ACCENT = "#F95901";

interface AccordionItem { title: string; imageUrl: string; }

const accordionItems: AccordionItem[] = [
  { title: "Sem código", imageUrl: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1200&auto=format&fit=crop" },
  { title: "Editor visual ao vivo", imageUrl: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?q=80&w=1200&auto=format&fit=crop" },
  { title: "Pagamentos integrados", imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200&auto=format&fit=crop" },
  { title: "Vendas no WhatsApp", imageUrl: "https://images.unsplash.com/photo-1611746872915-64382b5c76da?q=80&w=1200&auto=format&fit=crop" },
  { title: "Domínio .mobisno.store", imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&auto=format&fit=crop" },
];

const CAP_BASE = "absolute text-white text-base font-semibold whitespace-nowrap transition-all duration-500 ease-in-out drop-shadow";

export async function renderLanding(): Promise<void> {
  const loggedIn = (await currentOwnerId()) !== null;

  const navActions = loggedIn
    ? `<button id="cta-painel" class="text-white px-5 py-2 rounded-lg text-label-md font-bold transition-all active:scale-95 flex items-center gap-1" style="background:${ACCENT}"><span class="material-symbols-outlined text-[18px]">dashboard</span> Abrir Painel</button>`
    : `<button id="cta-login" class="text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg text-label-md transition-colors">Login</button>
       <button id="cta-nav" class="text-white px-5 py-2 rounded-lg text-label-md font-bold transition-all active:scale-95" style="background:${ACCENT}">Criar minha loja</button>`;

  const heroActions = loggedIn
    ? `<button id="cta-hero-painel" class="inline-flex items-center gap-2 text-white font-semibold px-8 py-3 rounded-lg shadow-lg transition-colors duration-300 active:scale-95" style="background:${ACCENT}"><span class="material-symbols-outlined text-[20px]">dashboard</span> Abrir Painel</button>`
    : `<button id="cta-hero" class="inline-flex items-center gap-2 text-white font-semibold px-8 py-3 rounded-lg shadow-lg transition-colors duration-300 active:scale-95" style="background:${ACCENT}">Criar minha loja <span class="material-symbols-outlined text-[20px]">arrow_forward</span></button>
       <button id="cta-hero-login" class="inline-flex items-center justify-center border border-gray-300 text-gray-800 font-semibold px-8 py-3 rounded-lg hover:bg-gray-50 transition-colors">Já tenho conta</button>`;

  const accordion = accordionItems.map((it, idx) => `
    <div data-acc data-index="${idx}" class="relative h-[360px] sm:h-[440px] rounded-2xl overflow-hidden cursor-pointer transition-all duration-700 ease-in-out shrink-0" style="width:3.5rem">
      <img src="${esc(it.imageUrl)}" alt="${esc(it.title)}" class="absolute inset-0 w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/400x450/1a1a1a/ffffff?text=MôBisno'" />
      <div class="absolute inset-0 bg-black/40"></div>
      <span data-cap class="${CAP_BASE} bottom-24 left-1/2 -translate-x-1/2 rotate-90">${esc(it.title)}</span>
    </div>`).join("");

  render(`
  <div class="min-h-screen flex flex-col bg-white font-sans text-gray-900">
    <nav class="bg-white/90 backdrop-blur sticky top-0 border-b border-gray-100 z-50">
      <div class="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 max-w-container-max mx-auto">
        <div class="flex items-center gap-2 cursor-pointer" id="brand">
          <img id="brand-logo" src="/logo-header.png" alt="MôBisno" class="w-auto object-contain" style="height:24px" />
        </div>
        <div class="flex items-center gap-2 sm:gap-3">${navActions}</div>
      </div>
    </nav>

    <main class="flex-grow flex flex-col">
      <!-- Hero com image accordion -->
      <section class="max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop py-12 md:py-20">
        <div class="flex flex-col lg:flex-row items-center justify-between gap-12">
          <div class="w-full lg:w-1/2 text-center lg:text-left">
            <h1 class="text-4xl md:text-6xl font-black leading-[1.05] tracking-tight">Crie sua loja<br/>Online em minutos</h1>
            <p class="mt-6 text-lg text-gray-600 max-w-xl lg:w-[30rem] mx-auto lg:mx-0">Escolha um modelo, adicione os seus produtos e personalize tudo ao seu gosto. Tenha uma loja profissional, com endereço próprio, pronta a receber clientes e a vender.</p>
            <div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">${heroActions}</div>
          </div>

          <div class="w-full lg:w-1/2">
            <div id="accordion" class="flex flex-row items-center justify-center lg:justify-end gap-3 overflow-x-auto p-2">
              ${accordion}
            </div>
          </div>
        </div>
      </section>

      <!-- Funcionalidades (bento grid com brilho que segue o rato) -->
      <section class="w-full bg-gray-100 py-14 border-t border-gray-100">
        <div class="max-w-5xl mx-auto px-margin-mobile md:px-margin-desktop">
          <div class="text-center max-w-2xl mx-auto mb-8">
            <h2 class="text-3xl md:text-4xl font-black tracking-tight">Tudo o que precisa para vender</h2>
            <p class="text-gray-600 mt-3">Ferramentas simples e poderosas para a sua loja online.</p>
          </div>
          <div class="mb-bento">
            ${bento({ span: "bento-col-2 bento-row-2", icon: "palette", title: "Editor visual ao vivo", body: "Edite a sua loja diretamente no preview — logótipo, cores, textos, secções e produtos. Sem código.", big: true })}
            ${bento({ icon: "dashboard_customize", title: "Modelos prontos", body: "Designs profissionais e responsivos, prontos a usar." })}
            ${bento({ icon: "payments", title: "Pagamentos locais", body: "Multicaixa, Referência bancária e finalização rápida por WhatsApp." })}
            ${bento({ span: "bento-row-2", icon: "category", title: "Categorias & Destaques", body: "Organize os produtos por categorias e realce os melhores na secção Destaques." })}
            ${bento({ span: "bento-col-2", icon: "shopping_cart", title: "Fluxo totalmente automático", body: "Os seus clientes escolhem, somam quantidades e finalizam a compra sem complicações." })}
            ${bento({ icon: "public", title: "Endereço próprio", body: "Receba o seu endereço nome.mobisno.store, ou use o seu próprio." })}
          </div>
        </div>
      </section>

      <!-- Integrações (órbita semicircular) -->
      <section class="w-full bg-white py-16 border-t border-gray-100 overflow-hidden">
        <div class="max-w-5xl mx-auto px-margin-mobile md:px-margin-desktop text-center">
          <h2 class="text-3xl md:text-4xl font-black tracking-tight">Integrações</h2>
          <p class="text-gray-600 mt-3 max-w-2xl mx-auto">A sua loja conectada a vários serviços de forma automática.</p>
          <div id="orbit" class="relative mx-auto mt-8"></div>
        </div>
      </section>

      <!-- Preços -->
      <section class="w-full bg-white py-16 border-t border-gray-100">
        <div class="max-w-6xl mx-auto px-margin-mobile md:px-margin-desktop">
          <div class="text-center max-w-2xl mx-auto">
            <h2 class="text-3xl md:text-5xl font-black tracking-tight">Escolha o seu plano</h2>
            <p class="text-gray-600 mt-3">Comece no Básico. Evolua quando a sua loja crescer.</p>
          </div>
          <div class="flex items-center justify-center gap-3 mt-8 mb-12">
            <button data-cycle="mensal" class="px-4 py-2 rounded-full text-sm font-bold transition-colors">Mensal</button>
            <button data-cycle="anual" class="px-4 py-2 rounded-full text-sm font-bold transition-colors">Anual <span class="opacity-80">· poupe 20%</span></button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            ${priceCard({ plan: "basico", name: "Básico", desc: "Para começar a vender já.", monthly: "5.000", yearly: "48.000", cta: "Começar agora", features: ["1 loja publicada", "100 produtos cadastrados", "Checkout via WhatsApp", "Endereço .mobisno.store"] })}
            ${priceCard({ plan: "profissional", name: "Profissional", desc: "Para vender a sério, sem limites.", featured: true, monthly: "11.000", yearly: "105.600", cta: "Escolher Profissional", features: ["Tudo do plano Básico", "Produtos ilimitados", "Checkout Multicaixa Express e referência bancária", "3 lojas publicadas", "Domínio próprio (opcional)"] })}
            ${priceCard({ plan: "empresarial", name: "Empresarial", desc: "Para operações maiores.", monthly: "25.000", yearly: "240.000", cta: "Falar connosco", features: ["Tudo do plano Profissional", "Lojas ilimitadas", "Gestor dedicado", "Integrações à medida", "Suporte prioritário"] })}
          </div>
        </div>
      </section>
    </main>

    <footer class="bg-white border-t border-gray-100">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-14">
        <div class="grid grid-cols-2 md:grid-cols-12 gap-10">
          <!-- Marca -->
          <div class="col-span-2 md:col-span-4 flex flex-col gap-4">
            <img src="/logo-header.png" alt="MôBisno" style="height:26px" class="w-auto object-contain self-start" />
            <p class="text-sm text-gray-500 max-w-xs leading-relaxed">A forma mais simples de criar a sua loja online em Angola. Modelos prontos, pagamentos locais e venda pelo WhatsApp.</p>
            <div class="flex items-center gap-2 mt-1">
              <a href="https://wa.me/244900000000" target="_blank" rel="noopener" aria-label="WhatsApp" class="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:text-white transition-colors" onmouseover="this.style.background='${ACCENT}';this.style.borderColor='${ACCENT}'" onmouseout="this.style.background='';this.style.borderColor=''"><span class="material-symbols-outlined text-[18px]">chat</span></a>
              <a href="mailto:geral@mobisno.store" aria-label="Email" class="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:text-white transition-colors" onmouseover="this.style.background='${ACCENT}';this.style.borderColor='${ACCENT}'" onmouseout="this.style.background='';this.style.borderColor=''"><span class="material-symbols-outlined text-[18px]">mail</span></a>
              <a href="#" aria-label="Instagram" class="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:text-white transition-colors" onmouseover="this.style.background='${ACCENT}';this.style.borderColor='${ACCENT}'" onmouseout="this.style.background='';this.style.borderColor=''"><span class="material-symbols-outlined text-[18px]">photo_camera</span></a>
            </div>
          </div>

          <!-- Plataforma -->
          <div class="md:col-span-3">
            <h4 class="text-sm font-bold text-gray-900 mb-4">Plataforma</h4>
            <ul class="space-y-3 text-sm">
              <li><a href="#/criar" class="text-gray-500 hover:text-gray-900 transition-colors">Criar loja</a></li>
              <li><a href="#/login" class="text-gray-500 hover:text-gray-900 transition-colors">Entrar</a></li>
              <li><a href="#/painel" class="text-gray-500 hover:text-gray-900 transition-colors">Painel</a></li>
              <li><a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Preços</a></li>
            </ul>
          </div>

          <!-- Recursos -->
          <div class="md:col-span-3">
            <h4 class="text-sm font-bold text-gray-900 mb-4">Recursos</h4>
            <ul class="space-y-3 text-sm">
              <li><a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Como funciona</a></li>
              <li><a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Integrações</a></li>
              <li><a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Centro de ajuda</a></li>
              <li><a href="https://wa.me/244900000000" target="_blank" rel="noopener" class="text-gray-500 hover:text-gray-900 transition-colors">Contacto</a></li>
            </ul>
          </div>

          <!-- Legal -->
          <div class="md:col-span-2">
            <h4 class="text-sm font-bold text-gray-900 mb-4">Legal</h4>
            <ul class="space-y-3 text-sm">
              <li><a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Termos</a></li>
              <li><a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Privacidade</a></li>
            </ul>
          </div>
        </div>

        <!-- Barra inferior -->
        <div class="mt-12 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p class="text-sm text-gray-500">© 2026 MôBisno</p>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400 uppercase tracking-wider">Pagamentos</span>
            <img src="/integrations/Express.png" alt="Multicaixa Express" class="h-6 w-auto object-contain" />
            <img src="/integrations/ATM.png" alt="Multicaixa" class="h-6 w-auto object-contain" />
          </div>
        </div>
      </div>
    </footer>
  </div>`);

  // --- Image accordion (hover no desktop, toque no telemóvel) ---
  const items = Array.from(document.querySelectorAll<HTMLElement>("[data-acc]"));
  function setActive(active: number): void {
    items.forEach((el, idx) => {
      const on = idx === active;
      el.style.width = on ? "20rem" : "3.5rem";
      const cap = el.querySelector<HTMLElement>("[data-cap]");
      if (cap) {
        cap.className = on
          ? `${CAP_BASE} bottom-5 left-1/2 -translate-x-1/2 rotate-0`
          : `${CAP_BASE} bottom-24 left-1/2 -translate-x-1/2 rotate-90`;
      }
    });
  }
  // Cards reagem ao rato (hover) e ao toque; o texto à esquerda fica fixo.
  items.forEach((el, idx) => {
    el.addEventListener("mouseenter", () => setActive(idx));
    el.addEventListener("click", () => setActive(idx));
  });
  setActive(items.length - 1);

  $("#brand")?.addEventListener("click", () => go("#/"));
  $("#cta-nav")?.addEventListener("click", () => go("#/criar"));
  $("#cta-hero")?.addEventListener("click", () => go("#/criar"));
  $("#cta-login")?.addEventListener("click", () => go("#/login"));
  $("#cta-hero-login")?.addEventListener("click", () => go("#/login"));
  $("#cta-painel")?.addEventListener("click", () => go("#/painel"));
  $("#cta-hero-painel")?.addEventListener("click", () => go("#/painel"));

  mountBento();
  mountIntegrations();
  mountPricing();
}

/** Cartão de preço. */
function priceCard(o: { plan: string; name: string; desc: string; monthly: string; yearly: string; features: string[]; cta: string; featured?: boolean; free?: boolean }): string {
  const border = o.featured ? `border-2` : "border border-gray-200";
  const style = o.featured ? `style="border-color:${ACCENT};box-shadow:0 24px 60px -24px rgba(249,89,1,.4)"` : "";
  const btn = o.featured
    ? `style="background:${ACCENT};color:#fff" class="w-full mt-8 text-center font-bold rounded-lg py-3 hover:opacity-90 transition-opacity"`
    : `class="w-full mt-8 text-center font-bold rounded-lg py-3 bg-gray-100 text-gray-900 hover:bg-gray-200 transition-colors"`;
  const href = o.name === "Empresarial" ? "https://wa.me/244900000000" : `#/criar?plano=${esc(o.plan)}`;
  const target = o.name === "Empresarial" ? ` target="_blank" rel="noopener"` : "";
  return `<div data-card data-free="${o.free ? "1" : "0"}" data-monthly="${esc(o.monthly)}" data-yearly="${esc(o.yearly)}" class="relative rounded-2xl ${border} bg-white p-8 flex flex-col text-left overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl" ${style}>
    ${o.featured ? `<div class="absolute top-0 right-0 text-[11px] font-bold text-white px-4 py-1.5 rounded-bl-xl" style="background:${ACCENT}">MAIS POPULAR</div>` : ""}
    <h3 class="text-2xl font-bold text-gray-900">${esc(o.name)}</h3>
    <p class="text-gray-500 mt-2 text-sm">${esc(o.desc)}</p>
    <div class="flex items-baseline mt-6">
      ${o.free
        ? `<span data-price class="text-4xl font-black text-gray-900">Grátis</span>`
        : `<span class="text-2xl font-bold text-gray-900 mr-1">Kz</span><span data-price class="text-4xl font-black text-gray-900 tracking-tight">${esc(o.monthly)}</span><span data-period class="text-gray-400 ml-2">/mês</span>`}
    </div>
    <ul class="mt-7 space-y-3 flex-grow">
      ${o.features.map((f) => `<li class="flex items-start gap-2.5 text-gray-700 text-sm"><span class="material-symbols-outlined text-[20px]" style="color:${ACCENT}">check_circle</span> ${esc(f)}</li>`).join("")}
    </ul>
    <a href="${href}"${target} ${btn}>${esc(o.cta)}</a>
  </div>`;
}

/** Alternância Mensal/Anual dos preços. */
function mountPricing(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("[data-cycle]"));
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-card]"));
  if (!buttons.length) return;
  let cycle: "mensal" | "anual" = "mensal";

  const apply = () => {
    buttons.forEach((b) => {
      const active = b.dataset.cycle === cycle;
      b.style.background = active ? ACCENT : "#f3f4f6";
      b.style.color = active ? "#fff" : "#4b5563";
    });
    cards.forEach((card) => {
      if (card.dataset.free === "1") return;
      const price = card.querySelector<HTMLElement>("[data-price]");
      const period = card.querySelector<HTMLElement>("[data-period]");
      if (price) price.textContent = cycle === "mensal" ? card.dataset.monthly! : card.dataset.yearly!;
      if (period) period.textContent = cycle === "mensal" ? "/mês" : "/ano";
    });
  };
  buttons.forEach((b) => b.addEventListener("click", () => { cycle = b.dataset.cycle === "anual" ? "anual" : "mensal"; apply(); }));
  apply();
}

/** Secção de Integrações — logos em órbita semicircular sobre a loja. */
function mountIntegrations(): void {
  const host = document.getElementById("orbit");
  if (!host) return;
  const ICONS = [
    { name: "Multicaixa Express", img: "/integrations/Express.png" },
    { name: "Multicaixa (ATM)", img: "/integrations/ATM.png" },
    { name: "WhatsApp", img: "/integrations/Whatsapp.png" },
    { name: "GoDaddy", img: "/integrations/Godaddy.png" },
  ];

  const build = () => {
    const vw = window.innerWidth;
    const base = Math.min(vw * 0.86, 600);
    const height = base * 0.6;
    const cx = base / 2;
    const cy = height - 8; // base da semicircunferência (centro em baixo)
    const R = base * 0.42;
    const Rin = base * 0.26;
    const iconSize = vw < 480 ? 46 : 58;

    host.style.width = `${base}px`;
    host.style.height = `${height}px`;

    const svg =
      `<svg width="${base}" height="${height}" class="absolute inset-0" style="overflow:visible">` +
      `<path d="M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}" fill="none" stroke="#ececec" stroke-width="1.5"/>` +
      `<path d="M ${cx - Rin} ${cy} A ${Rin} ${Rin} 0 0 1 ${cx + Rin} ${cy}" fill="none" stroke="#f3f3f3" stroke-width="1.5"/>` +
      `</svg>`;

    const icons = ICONS.map((it, i) => {
      const angle = (i / (ICONS.length - 1)) * 180;
      const x = R * Math.cos((angle * Math.PI) / 180);
      const y = R * Math.sin((angle * Math.PI) / 180);
      const left = cx + x - iconSize / 2;
      const top = cy - y - iconSize / 2;
      return `<div class="absolute group" style="left:${left}px;top:${top}px;z-index:5">
        <div class="bg-white rounded-2xl border border-gray-100 flex items-center justify-center transition-transform hover:scale-110" style="width:${iconSize}px;height:${iconSize}px;box-shadow:0 10px 26px -10px rgba(0,0,0,.22)">
          <img src="${esc(it.img)}" alt="${esc(it.name)}" style="width:${Math.round(iconSize * 0.62)}px;height:${Math.round(iconSize * 0.62)}px;object-fit:contain" />
        </div>
        <div class="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] hidden group-hover:block whitespace-nowrap rounded-lg bg-black px-2 py-1 text-xs text-white shadow-lg">${esc(it.name)}</div>
      </div>`;
    }).join("");

    const center = `<div class="absolute -translate-x-1/2 -translate-y-1/2" style="left:${cx}px;top:${cy}px;z-index:6">
      <div class="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center" style="box-shadow:0 12px 30px -10px rgba(249,89,1,.35)"><img src="/logo-header.png" alt="MôBisno" style="height:22px" /></div>
    </div>`;

    const glow = `<div class="absolute inset-0 pointer-events-none" style="background:radial-gradient(circle at 50% 100%, rgba(249,89,1,.12), transparent 60%)"></div>`;

    host.innerHTML = `${glow}${svg}${icons}${center}`;
  };

  build();
  window.addEventListener("resize", build, { passive: true });
}

/** Cartão do bento grid. */
function bento(o: { span?: string; icon?: string; title: string; body: string; big?: boolean }): string {
  return `<div class="bento-item ${o.span ?? ""} flex flex-col justify-center">
    <h3 class="${o.big ? "text-2xl" : "text-xl"} font-bold text-gray-900">${o.title}</h3>
    <p class="mt-2 text-gray-600 ${o.big ? "text-base" : "text-sm"}">${o.body}</p>
  </div>`;
}

/** Estilos + brilho que segue o rato nos cartões do bento. */
function mountBento(): void {
  if (!document.getElementById("mb-bento-style")) {
    const st = document.createElement("style");
    st.id = "mb-bento-style";
    st.textContent =
      ".mb-bento{display:grid;grid-template-columns:repeat(1,1fr);gap:1rem}" +
      "@media(min-width:768px){.mb-bento{grid-template-columns:repeat(3,1fr);grid-auto-rows:minmax(112px,auto)}}" +
      ".bento-item{position:relative;background:#f9fafb;border:1px solid #e9e9e9;border-radius:1rem;padding:1.25rem 1.35rem;overflow:hidden;transition:border-color .3s ease,box-shadow .3s ease}" +
      ".bento-item::before{content:'';position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity .3s ease;background:radial-gradient(450px circle at var(--mouse-x,50%) var(--mouse-y,50%),rgba(249,89,1,.12),transparent 42%);pointer-events:none;z-index:0}" +
      ".bento-item:hover{border-color:rgba(249,89,1,.45);box-shadow:0 16px 40px -18px rgba(249,89,1,.35)}" +
      ".bento-item:hover::before{opacity:1}" +
      ".bento-item>*{position:relative;z-index:1}" +
      "@media(min-width:768px){.bento-col-2{grid-column:span 2}.bento-row-2{grid-row:span 2}}";
    document.head.appendChild(st);
  }
  document.querySelectorAll<HTMLElement>(".bento-item").forEach((item) => {
    item.addEventListener("mousemove", (e) => {
      const r = item.getBoundingClientRect();
      item.style.setProperty("--mouse-x", `${(e as MouseEvent).clientX - r.left}px`);
      item.style.setProperty("--mouse-y", `${(e as MouseEvent).clientY - r.top}px`);
    });
  });
}

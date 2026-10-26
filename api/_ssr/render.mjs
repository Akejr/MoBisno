// Gerado por scripts/build-ssr.mjs a partir de web/ssr/entry.ts - nao editar a mao.
// Para o voltar a gerar: npm run ssr:build

// web/ssr/hash.ts
function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// src/storefront/storeRenderer.ts
var STORE_NOT_FOUND_MESSAGE = "Loja n\xE3o encontrada";
var DEFAULT_LOGO = Object.freeze({
  kind: "fallback",
  label: "M\xF4Bisno",
  backgroundColor: "#1f2937",
  textColor: "#ffffff"
});
var DEFAULT_MENU_ITEMS = Object.freeze([
  Object.freeze({ label: "In\xEDcio" }),
  Object.freeze({ label: "Produtos" })
]);
function buildBrandMark(storeName, logo) {
  if (logo !== null) {
    return {
      kind: "logo",
      url: logo.url,
      format: logo.format,
      alt: `Log\xF3tipo de ${storeName}`
    };
  }
  return {
    kind: "fallback",
    identity: DEFAULT_LOGO,
    alt: storeName
  };
}
function renderStore(result) {
  if (result.kind === "not_found") {
    return { kind: "not_found", message: STORE_NOT_FOUND_MESSAGE };
  }
  const { store, logo, banners, products } = result;
  const brand = buildBrandMark(store.name, logo);
  const header = {
    brand,
    storeName: store.name
  };
  const menu = {
    brand,
    items: DEFAULT_MENU_ITEMS
  };
  const orderedBanners = [...banners].sort((a, b) => a.position - b.position).map((banner) => ({
    id: banner.id,
    imageUrl: banner.imageUrl,
    position: banner.position
  }));
  const productViews = products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category ?? null,
    featured: product.featured === true,
    physical: product.physical !== false,
    price: product.price,
    imageUrl: product.imageUrl ?? null,
    stock: product.stock ?? null
  }));
  return {
    kind: "render",
    templateId: store.templateId,
    storeName: store.name,
    subdomain: store.subdomain,
    header,
    menu,
    banners: orderedBanners,
    products: productViews
  };
}

// web/supabase/mappers.ts
function toStore(r) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    storeType: r.store_type,
    templateId: r.template_id,
    identifier: r.identifier,
    subdomain: r.subdomain,
    state: r.state,
    createdAt: r.created_at,
    digitalPayments: r.digital_payments === true,
    planExpiresAt: typeof r.plan_expires_at === "string" ? r.plan_expires_at : null
  };
}
function toProduct(r) {
  return {
    id: r.id,
    storeId: r.store_id,
    name: r.name,
    description: r.description ?? "",
    category: r.category ?? void 0,
    featured: r.featured === true,
    physical: r.physical !== false,
    price: Number(r.price),
    imageUrl: r.image_url ?? void 0,
    available: r.available,
    stock: r.stock ?? null,
    createdAt: r.created_at
  };
}
function toBanner(r) {
  return { id: r.id, storeId: r.store_id, imageUrl: r.image_url, position: r.position, createdAt: r.created_at };
}
function toAsset(r) {
  return { id: r.id, storeId: r.store_id, kind: r.kind, url: r.url, format: r.format, sizeBytes: r.size_bytes };
}

// web/ssr/storefrontRows.ts
function customizationOf(store) {
  const c = store?.customization;
  return c && typeof c === "object" && !Array.isArray(c) ? c : {};
}
function storefrontFromRows(rows) {
  const store = rows?.store;
  if (!store || typeof store !== "object") return null;
  const result = {
    kind: "render",
    store: toStore(store),
    logo: rows.logo ? toAsset(rows.logo) : null,
    banners: (rows.banners ?? []).map(toBanner),
    products: (rows.products ?? []).filter((p) => p && p.available === true).map(toProduct)
  };
  return { result, view: renderStore(result), custom: customizationOf(store) };
}

// src/services/storeCustom.ts
function asRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}
function asText(v) {
  return typeof v === "string" && v !== "" ? v : void 0;
}
var WA_DEFAULT_PHONE = "+244 900 000 000";
function resolveWaPhone(custom) {
  const record = asRecord(custom);
  const fromWhatsApp = asText(asRecord(record?.["whatsapp"])?.["phone"]);
  if (fromWhatsApp !== void 0) return fromWhatsApp;
  const fromFooter = asText(asRecord(record?.["footer"])?.["phone"]);
  if (fromFooter !== void 0) return fromFooter;
  return WA_DEFAULT_PHONE;
}
var DEFAULT_PERKS = [
  { icon: "local_shipping", text: "Entrega em toda Angola" },
  { icon: "verified", text: "Produto original garantido" },
  { icon: "payments", text: "Pagamento na entrega ou Multicaixa" }
];
function normalizePerks(custom) {
  const raw = asRecord(custom)?.["productPerks"];
  const list = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const item = asRecord(entry);
      if (!item) continue;
      const icon2 = asText(item["icon"]);
      const text = asText(item["text"]);
      if (icon2 === void 0 || text === void 0 || text.trim() === "") continue;
      list.push({ icon: icon2, text });
    }
  }
  if (list.length > 0) return list;
  return DEFAULT_PERKS.map((p) => ({ icon: p.icon, text: p.text }));
}
var CSS_NAMED_COLORS = /* @__PURE__ */ new Set([
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
  "transparent"
]);
var CSS_HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
var CSS_NUMBER = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:%|deg|grad|rad|turn)?`;
var CSS_FUNCTION_COLOR = new RegExp(
  String.raw`^(?:rgba?|hsla?)\(\s*${CSS_NUMBER}(?:\s*,\s*${CSS_NUMBER}\s*,\s*${CSS_NUMBER}(?:\s*,\s*${CSS_NUMBER})?|\s+${CSS_NUMBER}\s+${CSS_NUMBER}(?:\s*\/\s*${CSS_NUMBER})?)\s*\)$`,
  "i"
);
function safeCssColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (v === "" || v.length > 64) return fallback;
  if (CSS_HEX_COLOR.test(v) || CSS_FUNCTION_COLOR.test(v) || CSS_NAMED_COLORS.has(v.toLowerCase())) return v;
  return fallback;
}

// web/lib/fieldColors.ts
var BUTTON_ANCESTORS = [
  "a",
  "button",
  '[role="button"]',
  "[data-hero-cta]",
  "[data-add-cart]",
  "[data-edit-whatsapp]"
];
var SAFE_FIELD_PATH = /^[A-Za-z0-9_.-]{1,120}$/;
var BUTTON_ANCESTOR_SELECTOR = BUTTON_ANCESTORS.join(",");
var ICON_SELECTOR = ".material-symbols-outlined";
function fieldColorCss(map) {
  return Object.entries(map ?? {}).map(([p, c]) => [p, safeCssColor(c, "")]).filter(([p, c]) => !!c && SAFE_FIELD_PATH.test(p)).map(([p, c]) => {
    const f = `[data-edit="${p}"]`;
    return `${f}{color:${c} !important}${f} ${ICON_SELECTOR}{color:${c} !important}:is(${BUTTON_ANCESTOR_SELECTOR}):has(${f}) ${ICON_SELECTOR}:not([data-edit] *){color:${c} !important}`;
  }).join("");
}

// web/lib/iconColor.ts
var ICON_TEXT_ATTR = "data-mb-icon-text";
var ICON_CLASS = ICON_SELECTOR.slice(1);
var NON_LABEL_SELECTOR = "[data-cart-count]";
var ICON_CSS = `[data-icons] .material-symbols-outlined{color:var(--mb-icons) !important}[data-icons] .mb-dark .material-symbols-outlined{color:inherit !important}[data-icons] [${ICON_TEXT_ATTR}] ${ICON_SELECTOR}:not([style*="color"]){color:inherit !important}`;
function ensureIconStyle() {
  if (document.getElementById("mb-icons-style")) return;
  const st = document.createElement("style");
  st.id = "mb-icons-style";
  st.textContent = ICON_CSS;
  document.head.appendChild(st);
}
function scanButton(button) {
  let icon2 = false;
  let text = false;
  const visit = (node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (icon2 && text) return;
      if (child.nodeType === 3) {
        if ((child.nodeValue ?? "").trim() !== "") text = true;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child;
      if (el.classList.contains(ICON_CLASS)) {
        icon2 = true;
        continue;
      }
      if (el.matches(NON_LABEL_SELECTOR)) continue;
      visit(el);
    }
  };
  visit(button);
  return { icon: icon2, text };
}
function markIconTextButtons(scope) {
  if (!scope) return;
  const buttons = [];
  if (scope.matches(BUTTON_ANCESTOR_SELECTOR)) buttons.push(scope);
  scope.querySelectorAll(BUTTON_ANCESTOR_SELECTOR).forEach((b) => buttons.push(b));
  for (const b of buttons) {
    const { icon: icon2, text } = scanButton(b);
    if (icon2 && text) b.setAttribute(ICON_TEXT_ATTR, "");
    else b.removeAttribute(ICON_TEXT_ATTR);
  }
}
var observers = /* @__PURE__ */ new WeakMap();
function observeLateMounts(root) {
  const existing = observers.get(root);
  if (existing) return existing;
  if (typeof MutationObserver === "undefined") return null;
  const obs = new MutationObserver((records) => {
    const scopes = /* @__PURE__ */ new Set();
    for (const r of records) {
      const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (!target) continue;
      scopes.add(target.closest(BUTTON_ANCESTOR_SELECTOR) ?? target);
    }
    for (const s of scopes) markIconTextButtons(s);
  });
  obs.observe(root, { childList: true, subtree: true });
  observers.set(root, obs);
  return obs;
}
function markIconTextButtonsForInk(root, custom) {
  if (!root) return;
  const icon2 = custom?.colors?.icon;
  if (icon2 && icon2.trim() !== "") return;
  markIconTextButtons(root);
  observeLateMounts(root)?.takeRecords();
}
function applyIconColor(root, custom) {
  if (!root) return;
  ensureIconStyle();
  const c = custom?.colors?.icon;
  if (c && c.trim() !== "") {
    root.setAttribute("data-icons", "");
    root.style.setProperty("--mb-icons", c);
    markIconTextButtons(root);
    observeLateMounts(root)?.takeRecords();
  } else {
    root.removeAttribute("data-icons");
    root.style.removeProperty("--mb-icons");
  }
}

// web/lib/ink.ts
var INK_CSS = `[data-ink] :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,figcaption,label){color:var(--ink)}[data-ink] .material-symbols-outlined{color:var(--ink)}[data-ink] .mb-dark,[data-ink] .mb-dark :is(h1,h2,h3,h4,h5,h6,p,li,a,blockquote,span,figcaption,label),[data-ink] .mb-dark .material-symbols-outlined{color:inherit}[data-ink] [${ICON_TEXT_ATTR}] ${ICON_SELECTOR}{color:inherit}`;
function ensureInkStyle() {
  if (document.getElementById("mb-ink-style")) return;
  const st = document.createElement("style");
  st.id = "mb-ink-style";
  st.textContent = INK_CSS;
  document.head.appendChild(st);
}
function applyInk(root, custom) {
  if (!root) return;
  ensureInkStyle();
  const ink = custom?.colors?.text;
  if (ink && ink.trim() !== "") {
    root.setAttribute("data-ink", "");
    root.style.setProperty("--ink", ink);
    markIconTextButtonsForInk(root, custom);
  } else {
    root.removeAttribute("data-ink");
    root.style.removeProperty("--ink");
  }
}

// web/lib/theme.ts
var THEME_CSS = "[data-theme]{font-family:var(--mb-body-font,inherit)}[data-theme] :is(.rounded,.rounded-lg,.rounded-xl,.rounded-2xl,.rounded-3xl){border-radius:var(--mb-radius)}[data-theme] :is(h1,h2,h3,h4){font-family:var(--mb-head-font)}";
var VARS = {
  moderno: { radius: "1rem", headFont: "Inter, sans-serif" },
  classico: { radius: "0.35rem", headFont: "'Noto Serif', serif" },
  minimal: { radius: "0px", headFont: "Inter, sans-serif" },
  editorial: { radius: "0.125rem", headFont: "'Playfair Display', serif", bodyFont: "'Montserrat', sans-serif" }
};
function ensureThemeStyle() {
  if (document.getElementById("mb-theme-style")) return;
  const st = document.createElement("style");
  st.id = "mb-theme-style";
  st.textContent = THEME_CSS;
  document.head.appendChild(st);
}
function applyTheme(root, custom) {
  if (!root) return;
  ensureThemeStyle();
  const style = custom?.theme?.style;
  if (style && VARS[style]) {
    root.setAttribute("data-theme", style);
    root.style.setProperty("--mb-radius", VARS[style].radius);
    root.style.setProperty("--mb-head-font", VARS[style].headFont);
    const body = VARS[style].bodyFont;
    if (body) root.style.setProperty("--mb-body-font", body);
    else root.style.removeProperty("--mb-body-font");
  } else {
    root.removeAttribute("data-theme");
    root.style.removeProperty("--mb-radius");
    root.style.removeProperty("--mb-head-font");
    root.style.removeProperty("--mb-body-font");
  }
}

// src/services/domains.ts
var PLATFORM_APEX = "mobisno.store";
var STORE_APEX = "sualoja.digital";
var LEGACY_STORE_APEX = "mobisno.store";
var PLATFORM_CONTACT_EMAIL = `geral@${PLATFORM_APEX}`;

// web/lib/routing.ts
var STORE_APEXES = [STORE_APEX, LEGACY_STORE_APEX];
function storeSubdomain() {
  const host = location.hostname.toLowerCase();
  for (const apex of STORE_APEXES) {
    if (host.endsWith(`.${apex}`)) {
      const sub = host.slice(0, host.length - apex.length - 1);
      if (!sub || sub === "www" || sub === "app" || sub.includes(".")) return null;
      return sub;
    }
  }
  return null;
}
function storeBasePath(identifier2) {
  return storeSubdomain() ? "" : `/loja/${encodeURIComponent(identifier2)}`;
}
function storeHomePath(identifier2) {
  return storeBasePath(identifier2) || "/";
}
function platformHomeUrl() {
  return storeSubdomain() ? `https://${PLATFORM_APEX}` : "/";
}

// src/services/format.ts
function formatKz(price) {
  const safe = Number.isFinite(price) ? price : 0;
  const cents = Math.round(Math.abs(safe) * 100);
  const whole = Math.floor(cents / 100).toString();
  const frac = (cents % 100).toString().padStart(2, "0");
  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += ".";
    grouped += whole[i];
  }
  return `${safe < 0 ? "-" : ""}${grouped},${frac} Kz`;
}

// web/lib/dom.ts
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// web/templates/shared.ts
function brandMarkHtml(brand, heightClass = "h-10") {
  if (brand.kind === "logo") {
    return `<img src="${esc(brand.url)}" alt="${esc(brand.alt)}" class="${heightClass} w-auto object-contain" />`;
  }
  return `<span class="text-headline-md font-bold" style="color:${esc(brand.identity.backgroundColor)}">${esc(brand.identity.label)}</span>`;
}
function bannersHtml(banners, imgClass) {
  if (banners.length === 0) return "";
  return banners.map((b) => `<img src="${esc(b.imageUrl)}" alt="banner" class="${imgClass}" />`).join("");
}
function productCardHtml(p) {
  return `<div class="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col shadow-sm">
    <div class="aspect-square bg-surface-container-low flex items-center justify-center overflow-hidden">
      ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" class="w-full h-full object-cover" alt="${esc(p.name)}" />` : `<span class="material-symbols-outlined text-on-surface-variant text-4xl">image</span>`}
    </div>
    <div class="p-4 flex flex-col gap-1 flex-grow">
      <h3 class="font-medium text-on-surface truncate">${esc(p.name)}</h3>
      <p class="text-label-sm text-on-surface-variant flex-grow line-clamp-2">${esc(p.description)}</p>
      <p class="text-primary font-bold mt-2">${esc(formatKz(p.price))}</p>
    </div>
  </div>`;
}
function productsGridHtml(products, gridClass = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-gutter") {
  if (products.length === 0) {
    return `<p class="text-on-surface-variant col-span-full text-center py-12">Esta loja ainda n\xE3o tem produtos dispon\xEDveis.</p>`;
  }
  return `<div class="${gridClass}">${products.map(productCardHtml).join("")}</div>`;
}
function menuItemsHtml(items) {
  return items.map((i) => `<span class="hover:text-primary cursor-pointer">${esc(i.label)}</span>`).join("");
}

// src/services/slug.ts
function slugify(input) {
  const s = (input ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "item";
}
var DEFAULT_CATEGORY_SLUG = "geral";
function productSlugPath(p) {
  const cat = slugify(p.category && p.category.trim() !== "" ? p.category : DEFAULT_CATEGORY_SLUG);
  return `${cat}/${slugify(p.name)}`;
}
function categorySlug(label) {
  return slugify(label);
}
function resolveCategoryLabel(slugOrLabel, labels) {
  const wanted = slugify(slugOrLabel);
  for (const label of labels) {
    if (slugify(label) === wanted) return label;
  }
  return null;
}

// web/templates/perks.ts
function perksList(custom) {
  return normalizePerks(custom);
}
function perksItemsHtml(custom, brandVar) {
  return perksList(custom).map(
    (p, i) => `<li data-edit-perk-item="${i}" class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${brandVar}">${esc(p.icon)}</span> <span data-perk-text>${esc(p.text)}</span></li>`
  ).join("");
}

// src/services/locations.ts
var DEFAULT_ADDRESS = "Luanda, Angola";
var BBOX_HALF_SIDE = 8e-3;
function asRecord2(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}
function asAddress(value) {
  if (typeof value !== "string") return void 0;
  return value.trim() === "" ? void 0 : value;
}
function asCoord(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function asPlace(value) {
  const record = asRecord2(value);
  if (!record) return null;
  return {
    name: asAddress(record["name"]),
    address: asAddress(record["address"]),
    lat: asCoord(record["lat"]),
    lng: asCoord(record["lng"])
  };
}
function hasMapData(place) {
  return place.address !== void 0 || place.lat !== void 0 && place.lng !== void 0;
}
function resolveLocations(block, footerLocation) {
  const record = asRecord2(block);
  const rawPlaces = record?.["places"];
  if (Array.isArray(rawPlaces)) {
    const places = [];
    for (const entry of rawPlaces) {
      const place = asPlace(entry);
      if (place) places.push(place);
    }
    if (places.length > 0) return places;
  }
  const legacy = asPlace(record);
  if (legacy && hasMapData(legacy)) {
    return [{ address: legacy.address, lat: legacy.lat, lng: legacy.lng }];
  }
  const footer = asAddress(footerLocation);
  if (footer !== void 0) return [{ address: footer }];
  return [{}];
}
function mapEmbedSrc(place, fallbackAddress) {
  const lat = asCoord(place?.lat);
  const lng = asCoord(place?.lng);
  if (lat !== void 0 && lng !== void 0) {
    const d = BBOX_HALF_SIDE;
    const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  }
  const addr = asAddress(place?.address) ?? asAddress(fallbackAddress) ?? DEFAULT_ADDRESS;
  return `https://maps.google.com/maps?q=${encodeURIComponent(addr.trim())}&z=15&output=embed`;
}

// web/templates/blocks.ts
var DEFAULT_INFO_IMG = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1000";
var DEFAULT_LOCATION_ADDRESS = "Luanda, Angola";
function bgStyle(bg) {
  const cor = safeCssColor(bg, "");
  return cor ? ` style="background:${esc(cor)}"` : "";
}
var LOOK_DEFAULTS = {
  heading: "font-black tracking-tight text-gray-900",
  body: "text-gray-500 leading-relaxed",
  surface: "bg-white border border-gray-100 shadow-sm",
  radius: "rounded-2xl",
  band: "bg-gray-50 border-y border-gray-100"
};
function lookOf(ctx) {
  const s = ctx.style;
  if (!s) return null;
  const heading = s.heading ?? LOOK_DEFAULTS.heading;
  const headingStyle = s.headingStyle ?? "";
  const body = s.body ?? LOOK_DEFAULTS.body;
  const bodyStyle = s.bodyStyle ?? "";
  return {
    heading,
    headingStyle,
    body,
    bodyStyle,
    // Nomes e citações seguem o título, e o texto secundário segue o corpo,
    // quando o modelo não os declara: nunca caem no desenho genérico.
    name: s.name ?? heading,
    nameStyle: s.nameStyle ?? (s.name === void 0 ? headingStyle : ""),
    quote: s.quote ?? heading,
    quoteStyle: s.quoteStyle ?? (s.quote === void 0 ? headingStyle : ""),
    muted: s.muted ?? body,
    mutedStyle: s.mutedStyle ?? (s.muted === void 0 ? bodyStyle : ""),
    surface: s.surface ?? LOOK_DEFAULTS.surface,
    surfaceStyle: s.surfaceStyle ?? "",
    radius: s.radius ?? LOOK_DEFAULTS.radius,
    band: s.band ?? LOOK_DEFAULTS.band,
    bandStyle: s.bandStyle ?? ""
  };
}
function cx(...parts) {
  return parts.filter((p) => p.trim() !== "").join(" ");
}
function styleAttr(...decls) {
  const v = decls.filter((d) => d.trim() !== "").join(";");
  return v ? ` style="${v}"` : "";
}
function look(L, generic, styled) {
  if (!L) return `class="${generic}"`;
  const [cls = "", ...decls] = styled(L);
  return `class="${cls}"${styleAttr(...decls)}`;
}
var GENERIC_HEADING = "font-black tracking-tight text-gray-900";
function headingAttrs(L, before, after = "") {
  return L ? `class="${cx(before, L.heading, after)}"${styleAttr(L.headingStyle)}` : `class="${cx(before, GENERIC_HEADING, after)}"`;
}
function infoBlock(b, i, ctx) {
  return infoByVariant(b.variant ?? "lado", b, i, ctx);
}
function infoByVariant(variant, b, i, ctx) {
  const imgUrl = esc(b.imageUrl || DEFAULT_INFO_IMG);
  const fallback = "this.onerror=null;this.src='https://placehold.co/800x600/eef2ff/64748b?text=Imagem'";
  const title = esc(b.title ?? "");
  const text = esc(b.text ?? "");
  const L = lookOf(ctx);
  if (variant === "sobreposto") {
    const frame2 = look(
      L,
      "relative rounded-3xl overflow-hidden min-h-[340px] md:min-h-[440px] flex items-end",
      (L2) => [cx("relative", L2.radius, "overflow-hidden min-h-[340px] md:min-h-[440px] flex items-end")]
    );
    const h22 = look(
      L,
      "text-3xl md:text-4xl font-black tracking-tight text-white",
      (L2) => [cx("text-3xl md:text-4xl", L2.heading), L2.headingStyle, "color:#fff"]
    );
    const p2 = look(
      L,
      "mt-4 text-white/85 text-lg leading-relaxed",
      (L2) => [cx("mt-4 text-lg", L2.body), L2.bodyStyle, "color:rgba(255,255,255,.85)"]
    );
    return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="sobreposto" class="relative py-12 md:py-16"${bgStyle(b.bg)}>
      <div class="${ctx.container}">
        <div data-edit-block-image="${i}" ${frame2}>
          <img src="${imgUrl}" alt="" class="absolute inset-0 w-full h-full object-cover" onerror="${fallback}" />
          <div class="absolute inset-0" style="background:linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.15) 60%, transparent)"></div>
          <div class="relative p-8 md:p-12 max-w-xl">
            <h2 data-edit="blocks.${i}.title" ${h22}>${title}</h2>
            <p data-edit="blocks.${i}.text" ${p2}>${text}</p>
          </div>
        </div>
      </div>
    </section>`;
  }
  const h2 = headingAttrs(L, "text-2xl md:text-3xl");
  const p = look(L, "mt-4 text-gray-500 text-lg leading-relaxed", (L2) => [cx("mt-4 text-lg", L2.body), L2.bodyStyle]);
  if (variant === "cartao") {
    const card = look(
      L,
      "max-w-2xl mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden",
      (L2) => [cx("max-w-2xl mx-auto", L2.surface, L2.radius, "overflow-hidden"), L2.surfaceStyle]
    );
    return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="cartao" class="relative py-12 md:py-16"${bgStyle(b.bg)}>
      <div class="${ctx.container}">
        <div ${card}>
          <div data-edit-block-image="${i}" class="relative aspect-[16/9] bg-gray-100">
            <img src="${imgUrl}" alt="" class="w-full h-full object-cover" onerror="${fallback}" />
          </div>
          <div class="p-8 md:p-10 text-center">
            <h2 data-edit="blocks.${i}.title" ${h2}>${title}</h2>
            <p data-edit="blocks.${i}.text" ${p}>${text}</p>
          </div>
        </div>
      </div>
    </section>`;
  }
  const frame = look(
    L,
    "relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100",
    (L2) => [cx("relative aspect-[4/3]", L2.radius, "overflow-hidden bg-gray-100")]
  );
  const img = `<div data-edit-block-image="${i}" ${frame}>
    <img src="${imgUrl}" alt="" class="w-full h-full object-cover" onerror="${fallback}" />
  </div>`;
  const txt = `<div>
    <h2 data-edit="blocks.${i}.title" ${h2}>${title}</h2>
    <p data-edit="blocks.${i}.text" ${p}>${text}</p>
  </div>`;
  const left = b.imageSide !== "right";
  return `<section data-edit-block="${i}" data-block-type="info" data-block-variant="lado" class="relative py-12 md:py-16"${bgStyle(b.bg)}>
    <div class="${ctx.container}">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-center">
        ${left ? img + txt : txt + img}
      </div>
    </div>
  </section>`;
}
function textBlock(b, i, ctx) {
  return textByVariant(b.variant ?? "centrado", b, i, ctx);
}
function textByVariant(variant, b, i, ctx) {
  const title = esc(b.title ?? "");
  const text = esc(b.text ?? "");
  const L = lookOf(ctx);
  if (variant === "destaque") {
    const h22 = headingAttrs(L, "text-3xl md:text-5xl", "leading-[1.05]");
    const p2 = look(
      L,
      "md:col-span-7 text-gray-500 text-lg md:text-xl leading-relaxed whitespace-pre-line",
      (L2) => [cx("md:col-span-7 text-lg md:text-xl whitespace-pre-line", L2.body), L2.bodyStyle]
    );
    return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="destaque" class="relative py-14 md:py-20"${bgStyle(b.bg)}>
      <div class="${ctx.container}">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 items-start">
          <div class="md:col-span-5 flex items-start gap-4">
            <span class="mt-2 inline-block w-1.5 h-12 rounded-full shrink-0" style="background:${ctx.brand}"></span>
            <h2 data-edit="blocks.${i}.title" ${h22}>${title}</h2>
          </div>
          <p data-edit="blocks.${i}.text" ${p2}>${text}</p>
        </div>
      </div>
    </section>`;
  }
  const h2 = headingAttrs(L, "text-2xl md:text-4xl");
  if (variant === "linha") {
    const p2 = look(
      L,
      "mt-5 text-gray-500 text-lg leading-relaxed whitespace-pre-line",
      (L2) => [cx("mt-5 text-lg whitespace-pre-line", L2.body), L2.bodyStyle]
    );
    return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="linha" class="relative py-14 md:py-20"${bgStyle(b.bg)}>
      <div class="${ctx.container}">
        <div class="max-w-3xl mx-auto text-center">
          <div class="flex items-center justify-center gap-4">
            <span class="h-px flex-1 max-w-[80px]" style="background:linear-gradient(90deg,transparent,#d1d5db)"></span>
            <h2 data-edit="blocks.${i}.title" ${h2}>${title}</h2>
            <span class="h-px flex-1 max-w-[80px]" style="background:linear-gradient(90deg,#d1d5db,transparent)"></span>
          </div>
          <p data-edit="blocks.${i}.text" ${p2}>${text}</p>
        </div>
      </div>
    </section>`;
  }
  const p = look(
    L,
    "mt-4 text-gray-500 text-lg leading-relaxed whitespace-pre-line",
    (L2) => [cx("mt-4 text-lg whitespace-pre-line", L2.body), L2.bodyStyle]
  );
  return `<section data-edit-block="${i}" data-block-type="text" data-block-variant="centrado" class="relative py-12 md:py-16"${bgStyle(b.bg)}>
    <div class="${ctx.container}">
      <div class="max-w-3xl mx-auto text-center">
        <h2 data-edit="blocks.${i}.title" ${h2}>${title}</h2>
        <p data-edit="blocks.${i}.text" ${p}>${text}</p>
      </div>
    </div>
  </section>`;
}
function testiAvatar(t, i, j, ctx, sizeCls = "w-10 h-10", clone = false) {
  if (t.avatarUrl) {
    return `<span ${clone ? "" : `data-testi-avatar="${j}"`} class="relative ${sizeCls} rounded-full overflow-hidden shrink-0 bg-gray-100">
      <img src="${esc(t.avatarUrl)}" alt="" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/80x80/eee/999?text=%20'" />
    </span>`;
  }
  const letter = esc((t.avatarText && t.avatarText.trim() || (t.name ?? "?").trim().charAt(0) || "?").slice(0, 2).toUpperCase());
  const edit = clone ? "" : `data-edit="blocks.${i}.items.${j}.avatarText"`;
  return `<span ${clone ? "" : `data-testi-avatar="${j}"`} class="relative ${sizeCls} rounded-full flex items-center justify-center font-bold text-white shrink-0" style="background:${ctx.brand}"><span ${edit}>${letter}</span></span>`;
}
function testimonialsVariantOf(b, ctx) {
  return b.variant ?? (ctx.variant === "galeria" ? "editorial" : "cards");
}
function testimonialsBlock(b, i, ctx) {
  return testimonialsByVariant(testimonialsVariantOf(b, ctx), b, i, ctx);
}
function testimonialsByVariant(variant, b, i, ctx) {
  if (variant === "editorial") return testimonialsEditorial(b, i, ctx);
  if (variant === "marquee") return testimonialsMarquee(b, i, ctx);
  return testimonialsCards(b, i, ctx);
}
function testiNameAttrs(L, generic) {
  return look(L, generic, (L2) => [cx("text-sm", L2.name), L2.nameStyle]);
}
function testimonialsCards(b, i, ctx) {
  const L = lookOf(ctx);
  const items = b.items ?? [];
  const card = look(
    L,
    "relative bg-white border border-gray-100 rounded-2xl p-6 shadow-sm",
    (L2) => [cx("relative", L2.surface, L2.radius, "p-6"), L2.surfaceStyle]
  );
  const quote = look(L, "mt-2 text-gray-600 leading-relaxed", (L2) => [cx("mt-2", L2.body), L2.bodyStyle]);
  const name = testiNameAttrs(L, "font-semibold text-gray-900 text-sm");
  const role = look(L, "text-gray-400 text-xs", (L2) => [cx("text-xs", L2.muted), L2.mutedStyle]);
  const cards = items.map((t, j) => {
    return `<div data-testi-item="${j}" ${card}>
      <span class="material-symbols-outlined text-[28px]" style="color:${ctx.brand}">format_quote</span>
      <p data-edit="blocks.${i}.items.${j}.text" ${quote}>${esc(t.text ?? "")}</p>
      <div class="mt-5 flex items-center gap-3">
        ${testiAvatar(t, i, j, ctx)}
        <div>
          <p data-edit="blocks.${i}.items.${j}.name" ${name}>${esc(t.name ?? "")}</p>
          <p data-edit="blocks.${i}.items.${j}.role" ${role}>${esc(t.role ?? "")}</p>
        </div>
      </div>
    </div>`;
  }).join("");
  const band = look(L, "relative bg-gray-50 border-y border-gray-100", (L2) => [cx("relative", L2.band), L2.bandStyle]);
  return `<section data-edit-block="${i}" data-block-type="testimonials" data-block-variant="cards" ${band}>
    <div class="${ctx.container} py-14 md:py-20">
      <h2 data-edit="blocks.${i}.title" ${headingAttrs(L, "text-2xl md:text-3xl", "text-center")}>${esc(b.title ?? "")}</h2>
      <div data-edit-testimonials="${i}" class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">${cards}</div>
    </div>
  </section>`;
}
function locationBlock(b, i, ctx) {
  return locationByVariant(b.variant ?? "classico", b, i, ctx);
}
function placeAddress(p) {
  return (p.address ?? "").trim() || DEFAULT_LOCATION_ADDRESS;
}
function placeMap(p, ctx, extra) {
  const label = (p.name ?? "").trim() || placeAddress(p);
  return `<iframe title="Mapa ${esc(label)}" class="w-full border-0" style="${extra}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(mapEmbedSrc(p, ctx.footerLocation))}"></iframe>`;
}
function placeName(p, i, j, attrs) {
  const name = (p.name ?? "").trim();
  return name ? `<p data-edit="blocks.${i}.places.${j}.name" ${attrs}>${esc(name)}</p>` : "";
}
function placeAddressHtml(p, i, j) {
  return `<span data-edit-loc-address data-edit="blocks.${i}.places.${j}.address">${esc(placeAddress(p))}</span>`;
}
function placeAddressLine(p, i, j, ctx, attrs) {
  return `<p ${attrs}><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> ${placeAddressHtml(p, i, j)}</p>`;
}
function locationBlockSection(variant, i, inner, ctx) {
  return `<section data-edit-block="${i}" data-block-type="location" data-block-variant="${variant}" class="relative py-12 md:py-16">
    <div class="${ctx.container}">${inner}</div>
  </section>`;
}
function locationHeading(title, i, L) {
  return `<div class="text-center max-w-2xl mx-auto mb-8">
        <h2 data-edit="blocks.${i}.title" ${headingAttrs(L, "text-2xl md:text-3xl")}>${title}</h2>
      </div>`;
}
function locationGrid(i, cards, cols = " md:grid-cols-2") {
  return `<div data-edit-places="${i}" class="grid grid-cols-1${cols} gap-6 md:gap-8">${cards}</div>`;
}
function stylizedMap(p, ctx, height, L) {
  const frame = look(
    L,
    "relative rounded-3xl overflow-hidden border border-gray-100 shadow-md",
    (L2) => [cx("relative", L2.radius, "overflow-hidden", L2.surface), L2.surfaceStyle]
  );
  const ring = look(
    L,
    "pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5 rounded-3xl",
    (L2) => [cx("pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5", L2.radius)]
  );
  return `<div ${frame}>
          <div style="filter:grayscale(1) contrast(1.05) brightness(1.02)">${placeMap(p, ctx, `height:${height}`)}</div>
          <div class="pointer-events-none absolute inset-0" style="background:${ctx.brand};mix-blend-mode:multiply;opacity:.28"></div>
          <div ${ring}></div>
          <div class="pointer-events-none absolute top-4 left-4 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur px-3 py-1.5 rounded-full shadow text-sm font-semibold text-gray-800">
            <span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">pin_drop</span> Estamos aqui
          </div>
        </div>`;
}
function locationByVariant(variant, b, i, ctx) {
  const places = resolveLocations(b, ctx.footerLocation);
  const title = esc(b.title ?? "");
  const single = places.length === 1;
  const first = places[0];
  const L = lookOf(ctx);
  if (variant === "cartao") {
    const frame = look(
      L,
      "grid grid-cols-1 md:grid-cols-3 gap-0 rounded-3xl overflow-hidden border border-gray-100 shadow-sm",
      (L2) => [cx("grid grid-cols-1 md:grid-cols-3 gap-0", L2.radius, "overflow-hidden", L2.surface), L2.surfaceStyle]
    );
    const column = look(
      L,
      "md:col-span-1 p-8 md:p-10 flex flex-col justify-center bg-white",
      () => ["md:col-span-1 p-8 md:p-10 flex flex-col justify-center"]
    );
    const name = look(L, "mt-3 text-xl font-black tracking-tight text-gray-900", (L2) => [cx("mt-3 text-xl", L2.heading), L2.headingStyle]);
    const address = look(L, "mt-3 text-gray-500 leading-relaxed", (L2) => [cx("mt-3", L2.body), L2.bodyStyle]);
    const card = (p, j, withTitle) => `<div data-edit-place="${j}" ${frame}>
          <div ${column}>
            <span class="material-symbols-outlined" style="font-size:32px;color:${ctx.brand}">location_on</span>
            ${withTitle ? `<h2 data-edit="blocks.${i}.title" ${headingAttrs(L, "mt-3 text-2xl md:text-3xl")}>${title}</h2>` : ""}
            ${placeName(p, i, j, name)}
            <p ${address}>${placeAddressHtml(p, i, j)}</p>
          </div>
          <div class="md:col-span-2 min-h-[300px]">${placeMap(p, ctx, "height:100%;min-height:300px")}</div>
        </div>`;
    if (single) return locationBlockSection("cartao", i, card(first, 0, true), ctx);
    const cards2 = places.map((p, j) => card(p, j, false)).join("");
    return locationBlockSection("cartao", i, `${locationHeading(title, i, L)}${locationGrid(i, cards2, "")}`, ctx);
  }
  const nameTop = look(L, "mt-2 font-semibold text-gray-900", (L2) => [cx("mt-2", L2.name), L2.nameStyle]);
  const addressTop = look(
    L,
    "mt-2 text-gray-500 inline-flex items-center gap-1.5",
    (L2) => [cx("mt-2 inline-flex items-center gap-1.5", L2.body), L2.bodyStyle]
  );
  const nameCard = look(L, "font-semibold text-gray-900", (L2) => [cx(L2.name), L2.nameStyle]);
  const addressCard = look(
    L,
    "mt-1 text-gray-500 text-sm inline-flex items-center gap-1.5",
    (L2) => [cx("mt-1 text-sm inline-flex items-center gap-1.5", L2.body), L2.bodyStyle]
  );
  if (variant === "estilizado") {
    if (single) {
      return locationBlockSection("estilizado", i, `<div class="text-center max-w-2xl mx-auto mb-8">
        <h2 data-edit="blocks.${i}.title" ${headingAttrs(L, "text-2xl md:text-3xl")}>${title}</h2>
        ${placeName(first, i, 0, nameTop)}
        ${placeAddressLine(first, i, 0, ctx, addressTop)}
      </div>
      <div data-edit-place="0">${stylizedMap(first, ctx, "420px", L)}</div>`, ctx);
    }
    const cards2 = places.map((p, j) => `<div data-edit-place="${j}" class="flex flex-col">
        ${stylizedMap(p, ctx, "320px", L)}
        <div class="mt-4 text-center">
          ${placeName(p, i, j, nameCard)}
          ${placeAddressLine(p, i, j, ctx, addressCard)}
        </div>
      </div>`).join("");
    return locationBlockSection("estilizado", i, `${locationHeading(title, i, L)}${locationGrid(i, cards2)}`, ctx);
  }
  const mapFrame = look(
    L,
    "rounded-2xl overflow-hidden border border-gray-100 shadow-sm",
    (L2) => [cx(L2.radius, "overflow-hidden", L2.surface), L2.surfaceStyle]
  );
  if (single) {
    return locationBlockSection("classico", i, `<div class="text-center max-w-2xl mx-auto mb-8">
        <h2 data-edit="blocks.${i}.title" ${headingAttrs(L, "text-2xl md:text-3xl")}>${title}</h2>
        ${placeName(first, i, 0, nameTop)}
        ${placeAddressLine(first, i, 0, ctx, addressTop)}
      </div>
      <div data-edit-place="0" ${mapFrame}>${placeMap(first, ctx, "height:400px")}</div>`, ctx);
  }
  const cards = places.map((p, j) => `<div data-edit-place="${j}" class="flex flex-col">
        <div ${mapFrame}>${placeMap(p, ctx, "height:300px")}</div>
        <div class="mt-4 text-center">
          ${placeName(p, i, j, nameCard)}
          ${placeAddressLine(p, i, j, ctx, addressCard)}
        </div>
      </div>`).join("");
  return locationBlockSection("classico", i, `${locationHeading(title, i, L)}${locationGrid(i, cards)}`, ctx);
}
function testimonialsEditorial(b, i, ctx) {
  const L = lookOf(ctx);
  const items = b.items ?? [];
  const quote = look(
    L,
    "text-lg md:text-xl font-medium leading-relaxed tracking-tight text-gray-900",
    (L2) => [cx("text-lg md:text-xl leading-relaxed", L2.quote), L2.quoteStyle]
  );
  const name = testiNameAttrs(L, "text-sm font-semibold text-gray-900");
  const role = look(
    L,
    "text-[11px] uppercase tracking-widest text-gray-400 mt-0.5",
    (L2) => [cx("text-[11px] uppercase tracking-widest mt-0.5", L2.muted), L2.mutedStyle]
  );
  const cards = items.map((t, j) => {
    return `<div data-testi-item="${j}" class="relative pt-6" style="border-top:2px solid ${ctx.brand}">
      <p data-edit="blocks.${i}.items.${j}.text" ${quote}>${esc(t.text ?? "")}</p>
      <div class="mt-6 flex items-center gap-3">
        ${testiAvatar(t, i, j, ctx)}
        <div class="leading-tight">
          <p data-edit="blocks.${i}.items.${j}.name" ${name}>${esc(t.name ?? "")}</p>
          <p data-edit="blocks.${i}.items.${j}.role" ${role}>${esc(t.role ?? "")}</p>
        </div>
      </div>
    </div>`;
  }).join("");
  return `<section data-edit-block="${i}" data-block-type="testimonials" data-block-variant="editorial" class="relative py-16 md:py-24">
    <div class="${ctx.container}">
      <h2 data-edit="blocks.${i}.title" ${headingAttrs(L, "text-3xl md:text-5xl", "max-w-2xl")}>${esc(b.title ?? "")}</h2>
      <div data-edit-testimonials="${i}" class="grid grid-cols-1 md:grid-cols-3 gap-10 mt-12">${cards}</div>
    </div>
  </section>`;
}
function testimonialsMarquee(b, i, ctx) {
  const L = lookOf(ctx);
  const items = b.items ?? [];
  const frame = look(
    L,
    "mb-mq-card relative shrink-0 w-[300px] bg-white border border-gray-100 rounded-2xl p-6 shadow-sm",
    (L2) => [cx("mb-mq-card relative shrink-0 w-[300px]", L2.surface, L2.radius, "p-6"), L2.surfaceStyle]
  );
  const quote = look(
    L,
    "mt-1 text-gray-600 leading-relaxed text-[15px] line-clamp-5",
    (L2) => [cx("mt-1 text-[15px] line-clamp-5", L2.body), L2.bodyStyle]
  );
  const name = testiNameAttrs(L, "font-semibold text-gray-900 text-sm");
  const role = look(L, "text-gray-400 text-xs", (L2) => [cx("text-xs", L2.muted), L2.mutedStyle]);
  const card = (t, j, clone) => {
    const attrs = clone ? `aria-hidden="true"` : `data-testi-item="${j}"`;
    const te = clone ? "" : `data-edit="blocks.${i}.items.${j}.text"`;
    const ne = clone ? "" : `data-edit="blocks.${i}.items.${j}.name"`;
    const re = clone ? "" : `data-edit="blocks.${i}.items.${j}.role"`;
    return `<div ${attrs} ${frame}>
      <span class="material-symbols-outlined text-[26px]" style="color:${ctx.brand}">format_quote</span>
      <p ${te} ${quote}>${esc(t.text ?? "")}</p>
      <div class="mt-5 flex items-center gap-3">
        ${testiAvatar(t, i, j, ctx, "w-10 h-10", clone)}
        <div>
          <p ${ne} ${name}>${esc(t.name ?? "")}</p>
          <p ${re} ${role}>${esc(t.role ?? "")}</p>
        </div>
      </div>
    </div>`;
  };
  const originals = items.map((t, j) => card(t, j, false)).join("");
  const clones = items.map((t, j) => card(t, j, true)).join("");
  const band = look(
    L,
    "relative overflow-hidden bg-gray-50 border-y border-gray-100",
    (L2) => [cx("relative overflow-hidden", L2.band), L2.bandStyle]
  );
  return `<section data-edit-block="${i}" data-block-type="testimonials" data-block-variant="marquee" ${band}>
    <style>
      @keyframes mbMqScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      .mb-mq-mask{position:relative;-webkit-mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent);mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent)}
      .mb-mq-track{display:flex;gap:20px;width:max-content;padding:0 10px;animation:mbMqScroll 36s linear infinite}
      .mb-mq-mask:hover .mb-mq-track{animation-play-state:paused}
      .mb-mq-card{transition:transform .25s ease, box-shadow .25s ease}
      .mb-mq-card:hover{transform:translateY(-4px);box-shadow:0 16px 36px -16px rgba(0,0,0,.3)}
    </style>
    <div class="${ctx.container} pt-14 md:pt-20 pb-8">
      <h2 data-edit="blocks.${i}.title" ${headingAttrs(L, "text-2xl md:text-3xl", "text-center")}>${esc(b.title ?? "")}</h2>
    </div>
    <div class="mb-mq-mask pb-16 md:pb-20">
      <div data-edit-testimonials="${i}" class="mb-mq-track">${originals}${clones}</div>
    </div>
  </section>`;
}
function blockHtml(b, i, ctx) {
  switch (b.type) {
    case "info":
      return infoBlock(b, i, ctx);
    case "text":
      return textBlock(b, i, ctx);
    case "testimonials":
      return testimonialsBlock(b, i, ctx);
    case "location":
      return locationBlock(b, i, ctx);
    default:
      return "";
  }
}
function blocksHtml(custom, ctx) {
  const blocks = custom?.blocks ?? [];
  const footer = typeof custom?.footer?.location === "string" ? custom.footer.location : void 0;
  const full = ctx.footerLocation === void 0 && footer !== void 0 ? { ...ctx, footerLocation: footer } : ctx;
  return `<div data-edit-blocks>${blocks.map((b, i) => blockHtml(b, i, full)).join("")}</div>`;
}

// web/templates/heroes.ts
var HERO_FALLBACK = "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1600";
var ARC_FALLBACK = [
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=400",
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=400",
  "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=400",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?q=80&w=400",
  "https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=400",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=400"
];
function texts(view, custom) {
  return {
    title: custom?.hero?.title || view.storeName,
    subtitle: custom?.hero?.subtitle || "Produtos selecionados, entrega em toda Angola e checkout simples.",
    cta: custom?.hero?.ctaLabel || "Ver produtos"
  };
}
function heroImagem(view, custom, ctx) {
  const { title, subtitle, cta } = texts(view, custom);
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;
  return `
  <section data-edit-hero class="mb-dark text-white relative h-[520px] md:h-[660px] overflow-hidden bg-neutral-900">
    <img src="${esc(img)}" alt="" class="absolute inset-0 w-full h-full object-cover" />
    <div class="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-transparent"></div>
    <div class="relative h-full ${ctx.container} flex items-center">
      <div class="max-w-xl">
        <h1 data-edit="hero.title" class="text-4xl md:text-6xl font-black leading-[1.04] tracking-tight">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="mt-5 text-base md:text-lg text-white/85 max-w-md">${esc(subtitle)}</p>
        <a href="#produtos" class="mt-8 inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg hover:opacity-95 transition-opacity" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>
      </div>
    </div>
  </section>`;
}
function heroSplit(view, custom, ctx) {
  const { title, subtitle, cta } = texts(view, custom);
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK;
  return `
  <section data-edit-hero class="relative overflow-hidden">
    <div class="${ctx.container} py-10 md:py-16">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-center">
        <div>
          <h1 data-edit="hero.title" class="text-4xl md:text-6xl font-black leading-[1.04] tracking-tight text-gray-900">${esc(title)}</h1>
          <p data-edit="hero.subtitle" class="mt-5 text-lg text-gray-500 max-w-md">${esc(subtitle)}</p>
          <a href="#produtos" class="mt-8 inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg hover:opacity-95 transition-opacity" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>
        </div>
        <div class="relative aspect-[4/5] md:aspect-square rounded-3xl overflow-hidden bg-gray-100">
          <img src="${esc(img)}" alt="" class="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  </section>`;
}
function arcImages(view, custom) {
  const fromCustom = (custom?.heroImages ?? []).filter((u) => !!u);
  if (fromCustom.length) return fromCustom.slice(0, 13);
  const fromProducts = view.products.map((p) => p.imageUrl).filter((u) => !!u);
  const fromBanners = view.banners.map((b) => b.imageUrl);
  const base = [...fromProducts, ...fromBanners];
  return (base.length ? base : ARC_FALLBACK).slice(0, 13);
}
function heroArco(view, custom, ctx) {
  const { title, subtitle, cta } = texts(view, custom);
  const imgs = arcImages(view, custom);
  const startAngle = 18, endAngle = 162;
  const count = Math.max(imgs.length, 2);
  const step = (endAngle - startAngle) / (count - 1);
  const cards = imgs.map((src, i) => {
    const angle = startAngle + step * i;
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad).toFixed(4);
    const sin = Math.sin(rad).toFixed(4);
    const rot = (angle / 4 - 22).toFixed(2);
    return `<div class="mb-arc-card" data-edit-arc-item="${i}" style="left:calc(50% + (${cos} * var(--arc-r)));bottom:calc(${sin} * var(--arc-r));z-index:${count - i};animation-delay:${i * 80}ms">
      <div class="mb-arc-inner" style="transform:rotate(${rot}deg)"><img src="${esc(src)}" alt="" class="block w-full h-full object-cover" draggable="false" onerror="this.onerror=null;this.src='https://placehold.co/300x300/eef2ff/64748b?text=Foto'" /></div>
    </div>`;
  }).join("");
  return `
  <section class="relative overflow-hidden bg-white">
    <style>
      @keyframes mbArcIn{from{opacity:0;transform:translate(-50%,62%)}to{opacity:1;transform:translate(-50%,50%)}}
      @keyframes mbHeroIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      .mb-arc{position:relative;width:100%;height:calc(var(--arc-r) + var(--arc-card));--arc-r:clamp(150px,40vw,440px);--arc-card:clamp(52px,11vw,112px)}
      @media(max-width:639px){.mb-arc-card:nth-child(2n){display:none}}
      .mb-arc-pivot{position:absolute;left:50%;bottom:0;transform:translateX(-50%)}
      .mb-arc-card{position:absolute;width:var(--arc-card);height:var(--arc-card);transform:translate(-50%,50%);opacity:0;animation:mbArcIn .8s ease-out forwards}
      .mb-arc-inner{width:100%;height:100%;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 14px 30px -12px rgba(0,0,0,.3);outline:1px solid rgba(0,0,0,.05);transition:transform .3s ease}
      .mb-arc-inner:hover{transform:scale(1.06) !important}
      .mb-hero-text{opacity:0;animation:mbHeroIn .8s ease-out forwards;animation-delay:.7s}
    </style>
    <div class="mb-arc" data-edit-arc><div class="mb-arc-pivot">${cards}</div></div>
    <div class="relative z-10 ${ctx.container} text-center -mt-10 sm:-mt-28 lg:-mt-44 pb-14">
      <div class="mb-hero-text max-w-2xl mx-auto">
        <h1 data-edit="hero.title" class="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-gray-900 leading-[1.05]">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="mt-4 text-base md:text-lg text-gray-500 max-w-xl mx-auto">${esc(subtitle)}</p>
        <a href="#produtos" class="mt-8 inline-flex items-center gap-2 text-white font-semibold px-7 py-3 rounded-full shadow-lg hover:opacity-95 transition-opacity" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span></a>
      </div>
    </div>
  </section>`;
}
function heroParticulas(view, custom, ctx) {
  const { title, subtitle, cta } = texts(view, custom);
  return `
  <section class="mb-dark relative overflow-hidden bg-[#0a0a12] text-white">
    <div class="relative h-[520px] md:h-[640px]">
      <canvas data-particles-hero class="absolute inset-0 block w-full h-full"></canvas>
      <div class="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
        <h1 data-edit="hero.title" class="text-4xl md:text-7xl font-black tracking-tight leading-[1.03] bg-clip-text text-transparent" style="background-image:linear-gradient(to bottom,#ffffff,#9ca3af)">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="mt-5 max-w-2xl text-base md:text-lg text-gray-300">${esc(subtitle)}</p>
        <a href="#produtos" class="mt-9 inline-flex items-center gap-2 font-semibold px-8 py-3.5 rounded-xl shadow-lg hover:opacity-95 transition-opacity text-white" style="background:${ctx.brand}"><span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>
      </div>
    </div>
  </section>`;
}
function renderHero(variant, view, custom, ctx, fallback = "imagem") {
  const v = variant ?? fallback;
  if (v === "arco") return heroArco(view, custom, ctx);
  if (v === "split") return heroSplit(view, custom, ctx);
  if (v === "particulas") return heroParticulas(view, custom, ctx);
  return heroImagem(view, custom, ctx);
}

// web/templates/sectionsModel.ts
var SEC_ALL = "__all__";
var SEC_FEATURED = "__featured__";
var FEATURED_LABEL = "Destaques";
var ALL_LABEL = "Produtos";
function identifier(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function catHref(view, label) {
  return `${storeBasePath(identifier(view))}/categoria/${categorySlug(label)}`;
}
function allProductsHref(view) {
  return catHref(view, ALL_LABEL);
}
function resolveSections(view, custom) {
  const list = custom?.sections && custom.sections.length ? custom.sections : [{ category: SEC_ALL }];
  return list.map((s) => {
    if (s.category === SEC_FEATURED) {
      return { token: SEC_FEATURED, title: FEATURED_LABEL, products: view.products.filter((p) => p.featured), moreHref: catHref(view, FEATURED_LABEL) };
    }
    if (!s.category || s.category === SEC_ALL) {
      return { token: SEC_ALL, title: ALL_LABEL, products: [...view.products], moreHref: catHref(view, "Todos") };
    }
    return { token: s.category, title: s.category, products: view.products.filter((p) => (p.category ?? "") === s.category), moreHref: catHref(view, s.category) };
  });
}
function filterForCategoryPage(view, label) {
  if (label === FEATURED_LABEL) return view.products.filter((p) => p.featured);
  if (label === "Todos" || label === ALL_LABEL) return [...view.products];
  return view.products.filter((p) => (p.category ?? "") === label);
}
function headerCategories(view) {
  const cats = [...new Set(view.products.map((p) => p.category).filter((c) => !!c))];
  return view.products.some((p) => p.featured) ? [FEATURED_LABEL, ...cats] : cats;
}
function listingProducts(view, category) {
  if (filterForCategoryPage(view, category).length === 0) return [];
  if (category === FEATURED_LABEL) return view.products.filter((p) => p.featured);
  return [...view.products];
}
function categoryFilterLabels(view, active) {
  if (active === FEATURED_LABEL || listingProducts(view, active).length === 0) return [];
  const cats = headerCategories(view).filter(
    (c) => c !== FEATURED_LABEL && filterForCategoryPage(view, c).length > 0
  );
  return [ALL_LABEL, ...cats];
}

// web/templates/headers.ts
function storeIdentifier(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeBase(view) {
  return storeBasePath(storeIdentifier(view));
}
function homeHref(view) {
  return storeHomePath(storeIdentifier(view));
}
function categoryHref(view, c) {
  return `${storeBase(view)}/categoria/${categorySlug(c)}`;
}
function cartHref(view) {
  return `${storeBase(view)}/carrinho`;
}
function brandHtml(view, custom) {
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${custom?.logoScale ?? 32}px" />`;
  }
  return `<span class="text-xl md:text-2xl font-black tracking-tight" style="color:inherit">${esc(view.storeName)}</span>`;
}
function menuLinks(view) {
  const cls = "hover:opacity-70 cursor-pointer transition-opacity";
  return `<a href="${esc(homeHref(view))}" class="${cls}">In\xEDcio</a><a href="${esc(allProductsHref(view))}" class="${cls}">Produtos</a>`;
}
function categoriesDropdown(view) {
  const cats = headerCategories(view);
  if (!cats.length) return "";
  return `<div class="relative group" data-categories-menu>
    <button type="button" class="flex items-center gap-0.5 hover:opacity-70 transition-opacity">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
    <div class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
      <div class="bg-white border border-gray-100 rounded-xl shadow-lg py-2 min-w-[180px]">
        ${cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">${esc(c)}</a>`).join("")}
      </div>
    </div>
  </div>`;
}
function searchBtn() {
  return `<button type="button" data-search-btn class="hover:opacity-70 transition-opacity"><span class="material-symbols-outlined">search</span></button>`;
}
function cartBtn(view, brand) {
  return `<a href="${esc(cartHref(view))}" data-cart-link class="relative inline-flex hover:opacity-70 transition-opacity">
    <span class="material-symbols-outlined">shopping_cart</span>
    <span data-cart-count class="hidden absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:${brand}"></span>
  </a>`;
}
function mobileMenuParts(view, container) {
  const cats = headerCategories(view);
  const linkCls = "block px-1 py-3 text-[15px] font-medium border-b border-black/5 hover:opacity-70 transition-opacity";
  const items = `<a href="${esc(homeHref(view))}" class="${linkCls}">In\xEDcio</a><a href="${esc(allProductsHref(view))}" class="${linkCls}">Produtos</a>`;
  const catBlock = cats.length ? `<p class="px-1 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">Categorias</p>` + cats.map((c) => `<a href="${esc(categoryHref(view, c))}" class="${linkCls}">${esc(c)}</a>`).join("") : "";
  const head = `<input type="checkbox" id="mb-mnav" class="mb-mnav-cb" aria-hidden="true" /><style>.mb-mnav-cb{position:absolute;width:0;height:0;opacity:0;pointer-events:none}.mb-mnav-panel{display:none}@media(max-width:1023px){#mb-mnav:checked~.mb-mnav-panel{display:block}#mb-mnav:checked~* .mb-mnav-open{display:none}#mb-mnav:checked~* .mb-mnav-close{display:inline-block}}</style>`;
  const button = `<label for="mb-mnav" class="lg:hidden cursor-pointer inline-flex items-center justify-center w-9 h-9 -ml-1.5 rounded-full hover:bg-black/5 transition-colors shrink-0" aria-label="Abrir menu"><span class="material-symbols-outlined mb-mnav-open">menu</span><span class="material-symbols-outlined mb-mnav-close hidden">close</span></label>`;
  const panel = `<div class="mb-mnav-panel lg:hidden border-t border-black/5 bg-white/95 backdrop-blur text-gray-800"><nav class="${container} py-2 flex flex-col">${items}${catBlock}</nav></div>`;
  return { head, button, panel };
}
function renderHeader(variant, view, custom, ctx) {
  const logo = `<a href="${esc(homeHref(view))}" data-edit-logo class="flex items-center gap-2 min-w-0">${brandHtml(view, custom)}</a>`;
  const nav = (cls) => `<nav class="${cls}">${menuLinks(view)}${categoriesDropdown(view)}</nav>`;
  const m = mobileMenuParts(view, ctx.container);
  const icons = `<div class="flex items-center gap-3 shrink-0">${searchBtn()}${cartBtn(view, ctx.brand)}</div>`;
  if (variant === "centrado") {
    return `<header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
      ${m.head}
      <div class="${ctx.container}">
        <div class="grid grid-cols-3 items-center h-16">
          <div class="flex items-center gap-1 min-w-0">
            ${m.button}
            <nav class="hidden lg:flex items-center gap-6 text-sm font-medium">${menuLinks(view)}${categoriesDropdown(view)}</nav>
          </div>
          <div class="flex justify-center min-w-0">${logo}</div>
          <div class="flex items-center justify-end gap-3 shrink-0">${searchBtn()}${cartBtn(view, ctx.brand)}</div>
        </div>
      </div>
      ${m.panel}
    </header>`;
  }
  if (variant === "transparente") {
    return `<header class="absolute top-0 inset-x-0 z-50 text-white">
      ${m.head}
      <div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to bottom, rgba(0,0,0,.35), transparent)"></div>
      <div class="relative ${ctx.container}">
        <div class="flex items-center justify-between gap-3 h-16">
          <div class="flex items-center gap-1 min-w-0">${m.button}${logo}</div>
          ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
          ${icons}
        </div>
      </div>
      ${m.panel}
    </header>`;
  }
  if (variant === "promo") {
    const promo = esc(custom?.header?.promo || "Entrega em toda Angola \u2022 Compra via WhatsApp");
    return `<div>
      <div class="text-white text-center text-xs font-semibold py-2 px-4" style="background:${ctx.brand}"><span data-edit="header.promo">${promo}</span></div>
      <header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
        ${m.head}
        <div class="${ctx.container}">
          <div class="relative flex items-center justify-between gap-3 h-16">
            <div class="flex items-center gap-1 min-w-0">${m.button}${logo}</div>
            ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
            ${icons}
          </div>
        </div>
        ${m.panel}
      </header>
    </div>`;
  }
  return `<header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 text-gray-700">
    ${m.head}
    <div class="${ctx.container}">
      <div class="relative flex items-center justify-between gap-3 h-16">
        <div class="flex items-center gap-1 min-w-0">${m.button}${logo}</div>
        ${nav("hidden lg:flex items-center gap-7 text-sm font-medium")}
        ${icons}
      </div>
    </div>
    ${m.panel}
  </header>`;
}

// web/templates/footers.ts
function storeIdentifier2(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function homeHref2(view) {
  return storeHomePath(storeIdentifier2(view));
}
function footerBrandHtml(view, custom, dark) {
  const url = custom?.footer?.logoUrl || (view.header.brand.kind === "logo" ? view.header.brand.url : null);
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 w-auto object-contain" />`;
  return `<span class="text-xl font-black tracking-tight ${dark ? "text-white" : "text-gray-900"}">${esc(view.storeName)}</span>`;
}
function readData(view, custom) {
  return {
    about: custom?.footer?.about || "A sua loja online em Angola. Produtos selecionados e entrega r\xE1pida.",
    location: custom?.footer?.location || "Luanda, Angola",
    phone: custom?.footer?.phone || "+244 900 000 000",
    email: custom?.footer?.email || "geral@minhaloja.ao",
    menu: custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label)
  };
}
function renderFooter(variant, view, custom, ctx) {
  const d = readData(view, custom);
  const credit = `${esc(storeIdentifier2(view) + "." + STORE_APEX)} \xB7 Loja criada com <a href="${platformHomeUrl()}" style="color:${ctx.brand}">M\xF4Bisno</a>`;
  if (variant === "centrado") {
    return `<footer class="bg-white border-t border-gray-100 mt-auto">
      <div class="${ctx.container} py-14 text-center">
        <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom, false)}</div>
        <p data-edit="footer.about" class="mt-4 text-sm text-gray-500 max-w-md mx-auto leading-relaxed">${esc(d.about)}</p>
        <nav class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-gray-600">
          ${d.menu.map((l) => `<a href="${esc(homeHref2(view))}" class="hover:text-gray-900 transition-colors">${esc(l)}</a>`).join("")}
        </nav>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-gray-500">
          <span class="inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> <span data-edit="footer.location">${esc(d.location)}</span></span>
          <span class="inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">call</span> <span data-edit="footer.phone">${esc(d.phone)}</span></span>
          <span class="inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">mail</span> <span data-edit="footer.email">${esc(d.email)}</span></span>
        </div>
      </div>
      <div class="border-t border-gray-100"><div class="${ctx.container} py-5 text-xs text-gray-400 text-center">${credit}</div></div>
    </footer>`;
  }
  if (variant === "moderno") {
    return `<footer class="mt-auto bg-gray-50 border-t-4" style="border-color:${ctx.brand}">
      <div class="${ctx.container} py-14">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:items-center">
          <div class="space-y-3">
            <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom, false)}</div>
            <p data-edit="footer.about" class="text-sm text-gray-500 max-w-md leading-relaxed">${esc(d.about)}</p>
          </div>
          <div class="flex flex-col gap-2 md:items-end text-sm text-gray-600">
            <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">location_on</span> <span data-edit="footer.location">${esc(d.location)}</span></span>
            <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">call</span> <span data-edit="footer.phone">${esc(d.phone)}</span></span>
            <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" style="color:${ctx.brand}">mail</span> <span data-edit="footer.email">${esc(d.email)}</span></span>
          </div>
        </div>
        <div class="mt-10 pt-6 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <nav class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-gray-600">
            ${d.menu.map((l) => `<a href="${esc(homeHref2(view))}" class="hover:text-gray-900 transition-colors">${esc(l)}</a>`).join("")}
          </nav>
          <span class="text-xs text-gray-400">${credit}</span>
        </div>
      </div>
    </footer>`;
  }
  return `<footer class="bg-gray-50 border-t border-gray-100 mt-auto">
    <div class="${ctx.container} py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="space-y-3">
        <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml(view, custom, false)}</div>
        <p data-edit="footer.about" class="text-sm text-gray-500 max-w-xs leading-relaxed">${esc(d.about)}</p>
      </div>
      <div>
        <h3 class="text-sm font-bold text-gray-900 mb-4">Loja</h3>
        <ul class="space-y-2.5 text-sm">${d.menu.map((l) => `<li><a href="${esc(homeHref2(view))}" class="text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">${esc(l)}</a></li>`).join("")}</ul>
      </div>
      <div>
        <h3 class="text-sm font-bold text-gray-900 mb-4">Contacto</h3>
        <ul class="space-y-2.5 text-sm text-gray-500">
          <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(d.location)}</span></li>
          <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(d.phone)}</span></li>
          <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(d.email)}</span></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-gray-100"><div class="${ctx.container} py-5 text-xs text-gray-400 text-center">${credit}</div></div>
  </footer>`;
}

// src/services/variations.ts
var VALUE_SEPARATOR = "";
var MAX_COMBINATIONS = 2e3;
function asRecord3(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}
function asList(value) {
  return Array.isArray(value) ? value : [];
}
function asLabel(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed === "" ? void 0 : trimmed;
}
function asFinite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function asStock(value) {
  const n = asFinite(value);
  if (n === void 0) return void 0;
  return Math.max(0, Math.floor(n));
}
function asPriceMode(value) {
  return value === "acresce" ? "acresce" : "substitui";
}
function normalizeAxes(value) {
  const axes = [];
  for (const entry of asList(value)) {
    const record = asRecord3(entry);
    if (!record) continue;
    const name = asLabel(record["name"]);
    if (name === void 0) continue;
    const values = [];
    for (const rawValue of asList(record["values"])) {
      const label = asLabel(rawValue);
      if (label === void 0) continue;
      if (values.includes(label)) continue;
      values.push(label);
    }
    if (values.length === 0) continue;
    axes.push({ name, values });
  }
  return axes;
}
function normalizeCombinations(value, axes) {
  const combinations = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of asList(value)) {
    const record = asRecord3(entry);
    if (!record) continue;
    const rawValues = asList(record["values"]);
    if (rawValues.length !== axes.length) continue;
    const values = [];
    for (let i = 0; i < axes.length; i += 1) {
      const label = asLabel(rawValues[i]);
      const axis = axes[i];
      if (label === void 0 || axis === void 0 || !axis.values.includes(label)) break;
      values.push(label);
    }
    if (values.length !== axes.length) continue;
    const key = variantKeyOf(values);
    if (seen.has(key)) continue;
    seen.add(key);
    const combination = { values };
    const price = asFinite(record["price"]);
    if (price !== void 0) combination.price = price;
    const stock = asStock(record["stock"]);
    if (stock !== void 0) combination.stock = stock;
    const image = asLabel(record["image"]);
    if (image !== void 0) combination.image = image;
    combinations.push(combination);
  }
  return combinations;
}
function normalizeVariations(custom, productId) {
  const map = asRecord3(asRecord3(custom)?.["productVariations"]);
  if (!map) return null;
  if (typeof productId !== "string" || productId === "") return null;
  const entry = asRecord3(map[productId]);
  if (!entry) return null;
  if (entry["enabled"] !== true) return null;
  if (!Array.isArray(entry["axes"])) return null;
  const axes = normalizeAxes(entry["axes"]);
  if (axes.length === 0) return null;
  return {
    enabled: true,
    priceMode: asPriceMode(entry["priceMode"]),
    axes,
    combinations: normalizeCombinations(entry["combinations"], axes)
  };
}
function combinationsOf(axes) {
  const normalized = normalizeAxes(axes);
  if (normalized.length === 0) return [];
  let result = [[]];
  for (const axis of normalized) {
    const next = [];
    for (const prefix of result) {
      for (const value of axis.values) {
        if (next.length >= MAX_COMBINATIONS) break;
        next.push([...prefix, value]);
      }
      if (next.length >= MAX_COMBINATIONS) break;
    }
    result = next;
  }
  return result;
}
function variantKeyOf(values) {
  return asList(values).map((value) => typeof value === "string" ? value : "").join(VALUE_SEPARATOR);
}
function findCombination(v, values) {
  const list = asList(values);
  if (list.length === 0) return null;
  const key = variantKeyOf(values);
  for (const entry of asList(asRecord3(v)?.["combinations"])) {
    const record = asRecord3(entry);
    if (!record) continue;
    const combinationValues = asList(record["values"]).map(
      (value) => typeof value === "string" ? value : ""
    );
    if (combinationValues.length !== list.length) continue;
    if (variantKeyOf(combinationValues) === key) return record;
  }
  return null;
}
function combinationAvailable(comb) {
  const stock = asStock(asRecord3(comb)?.["stock"]);
  return stock === void 0 || stock > 0;
}
function variationImages(v) {
  const out = [];
  for (const entry of asList(asRecord3(v)?.["combinations"])) {
    const image = asLabel(asRecord3(entry)?.["image"]);
    if (image === void 0 || out.includes(image)) continue;
    out.push(image);
  }
  return out;
}

// web/templates/gallery.ts
function productImages(product, custom) {
  const extra = custom?.productImages?.[product.id] ?? [];
  const variants = variationImages(normalizeVariations(custom, product.id));
  const all = [product.imageUrl ?? "", ...extra, ...variants].map((u) => (u ?? "").trim()).filter(Boolean);
  return [...new Set(all)];
}
function galleryUid(productId) {
  return "g" + productId.replace(/[^a-zA-Z0-9]/g, "");
}
function placeholder() {
  return `<div class="absolute inset-0 flex items-center justify-center" style="background:#f4f4f4"><span class="material-symbols-outlined text-5xl" style="color:#c7c7bf">image</span></div>`;
}
function productGalleryHtml(product, custom, opts) {
  const imgs = productImages(product, custom);
  const editAttr = opts.editProduct === false ? "" : ` data-edit-product="${esc(product.id)}"`;
  const imgCls = opts.imgClass ?? "w-full h-full object-cover";
  const style = opts.stageStyle ? ` style="${opts.stageStyle}"` : "";
  if (imgs.length <= 1) {
    const inner = imgs[0] ? `<img data-product-image src="${esc(imgs[0])}" alt="${esc(product.name)}" class="${imgCls}" />` : placeholder();
    return `<div class="relative ${opts.stageClass}"${editAttr}${style}>${inner}</div>`;
  }
  const uid = galleryUid(product.id);
  const brand = opts.brand ?? "#1c1b1b";
  const radios = imgs.map((src, i) => `<input type="radio" name="${uid}" id="${uid}-${i}" class="${uid}-r" data-img-src="${esc(src)}"${i === 0 ? " checked" : ""} aria-hidden="true" />`).join("");
  const slides = imgs.map((src, i) => `<img src="${esc(src)}" alt="${esc(product.name)}" class="${uid}-img ${uid}-img-${i} absolute inset-0 ${imgCls}" style="opacity:${i === 0 ? 1 : 0};transition:opacity .35s ease" />`).join("");
  const thumbs = imgs.map((src, i) => `<label for="${uid}-${i}" class="${uid}-th ${uid}-th-${i} relative block aspect-square overflow-hidden rounded-lg cursor-pointer" style="box-shadow:inset 0 0 0 2px transparent">
      <img src="${esc(src)}" alt="" class="w-full h-full object-cover" />
    </label>`).join("");
  const activeRules = imgs.map((_, i) => `#${uid}-${i}:checked~.${uid}-stage .${uid}-img-${i}{opacity:1;z-index:2}#${uid}-${i}:checked~.${uid}-thumbs .${uid}-th-${i}{box-shadow:inset 0 0 0 2px ${brand}}`).join("");
  const css = `<style>.${uid}-r{position:absolute;width:0;height:0;opacity:0;pointer-events:none}.${uid}-img{opacity:0}${activeRules}</style>`;
  const thumbsCls = opts.thumbsClass ?? "mt-3 grid grid-cols-5 gap-2";
  return `<div${editAttr}>
    ${css}${radios}
    <div class="${uid}-stage relative ${opts.stageClass}"${style}>${slides}</div>
    <div class="${uid}-thumbs ${thumbsCls}">${thumbs}</div>
  </div>`;
}

// web/lib/whatsapp.ts
var WA_DEFAULT_TEMPLATE = 'Ol\xE1! Tenho interesse no produto "{produto}" ({preco}). Est\xE1 dispon\xEDvel?';
function buildProductMessage(template, name, priceFormatted) {
  const t = template && template.trim() ? template : WA_DEFAULT_TEMPLATE;
  return t.replace(/\{produto\}/g, name).replace(/\{preco\}/g, priceFormatted);
}
function waLink(phone, message) {
  const digits = (phone || WA_DEFAULT_PHONE).replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// web/templates/variationPicker.ts
var DEFAULT_SELECTED_STYLE = "background:var(--brand);color:var(--brand-ink)";
var DEFAULT_NOTE_CLASS = "text-sm";
function imageOfValue(v, axisIndex, value) {
  for (const comb of v.combinations) {
    if (comb.values[axisIndex] !== value) continue;
    if (typeof comb.image === "string" && comb.image !== "") return comb.image;
  }
  return "";
}
function valueSoldOut(v, axisIndex, value) {
  const free = v.axes.filter((_, i) => i !== axisIndex);
  const tuples = free.length ? combinationsOf(free) : [[]];
  for (const tuple of tuples) {
    const values = [];
    let k = 0;
    for (let i = 0; i < v.axes.length; i += 1) {
      values.push(i === axisIndex ? value : tuple[k++] ?? "");
    }
    if (combinationAvailable(findCombination(v, values))) return false;
  }
  return true;
}
function variationPickerHtml(product, custom, style) {
  const v = normalizeVariations(custom, product.id);
  if (!v) return "";
  const selected = style.selectedStyle ?? DEFAULT_SELECTED_STYLE;
  const base = style.valueStyle ?? "";
  const axesHtml = v.axes.map((axis, i) => {
    const values = axis.values.map((value) => {
      const out = valueSoldOut(v, i, value);
      const image = imageOfValue(v, i, value);
      const thumb = image ? `<img src="${esc(image)}" alt="" aria-hidden="true" class="w-6 h-6 rounded object-cover shrink-0" />` : "";
      return `<button type="button" data-variation-pick="${i}" data-variation-value="${esc(value)}" data-pick-base="${esc(base)}"${image ? ` data-variation-image="${esc(image)}"` : ""}${out ? ' data-sold-out="1" disabled' : ""} aria-pressed="false" class="${style.valueClass}"${base ? ` style="${esc(base)}"` : ""}>
            ${thumb}<span>${esc(value)}</span><span data-sold-out-badge class="${out ? "" : "hidden "}text-[10px] uppercase opacity-60">Esgotado</span>
          </button>`;
    }).join("");
    return `<div data-variation-axis="${i}" class="flex flex-col gap-2 min-w-0">
        <span class="${style.labelClass}"${style.labelStyle ? ` style="${esc(style.labelStyle)}"` : ""}>${esc(axis.name)}</span>
        <div class="flex flex-wrap gap-2 min-w-0">${values}</div>
      </div>`;
  }).join("");
  return `<div data-variations="${esc(product.id)}" data-pick-style="${esc(selected)}" class="${style.rootClass ?? "mt-8 flex flex-col gap-4 min-w-0"}">
      ${axesHtml}
      <p data-variation-note class="hidden ${style.noteClass ?? DEFAULT_NOTE_CLASS}" style="color:#b91c1c" role="status"></p>
    </div>`;
}

// web/templates/productPage.ts
function storeIdentifier3(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeBase2(view) {
  return storeBasePath(storeIdentifier3(view));
}
function homeHref3(view) {
  return storeHomePath(storeIdentifier3(view));
}
function categoryHref2(view, c) {
  return `${storeBase2(view)}/categoria/${categorySlug(c)}`;
}
function productHref(view, p) {
  return `${storeBase2(view)}/produto/${productSlugPath(p)}`;
}
function imgHtml(p, cls) {
  return p.imageUrl ? `<img data-product-image src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="${cls}" />` : `<div class="absolute inset-0 flex items-center justify-center bg-gray-100"><span class="material-symbols-outlined text-gray-300 text-6xl">image</span></div>`;
}
function variationsHtml(product, custom) {
  return variationPickerHtml(product, custom, {
    labelClass: "text-sm font-medium text-gray-700",
    valueClass: "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    noteClass: "text-sm font-medium"
  });
}
function qtyHtml() {
  return `<div class="flex items-center border border-gray-300 rounded-xl overflow-hidden">
    <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><span class="material-symbols-outlined text-[20px]">remove</span></button>
    <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none border-x border-gray-300" />
    <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><span class="material-symbols-outlined text-[20px]">add</span></button>
  </div>`;
}
function actionsHtml(product, ctx, waHref) {
  return `<div class="mt-8 flex flex-col sm:flex-row gap-3">
    <button type="button" data-add-cart="${esc(product.id)}" style="background:${ctx.brand};color:#fff" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity">
      <span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho
    </button>
    <a href="${esc(waHref)}" data-edit-whatsapp target="_blank" rel="noopener" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl border border-gray-300 text-gray-900 hover:bg-gray-50 transition-colors">
      <span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp
    </a>
  </div>`;
}
function descHtml(product) {
  return product.description ? `<p class="mt-6 text-gray-600 leading-relaxed whitespace-pre-line">${esc(product.description)}</p>` : `<p class="mt-6 text-gray-400 italic">Sem descri\xE7\xE3o.</p>`;
}
function relatedHtml(view, product, ctx) {
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  if (!related.length) return "";
  const cards = related.map((p) => `<a href="${esc(productHref(view, p))}" class="group block">
    <div class="relative aspect-square bg-gray-50 overflow-hidden rounded-2xl border border-gray-100 mb-3">
      ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />` : ""}
    </div>
    <h3 class="text-sm font-semibold text-gray-900 line-clamp-2">${esc(p.name)}</h3>
    <p class="pt-1 text-sm font-bold" style="color:${ctx.brand}">${esc(formatKz(p.price))}</p>
  </a>`).join("");
  return `<section class="mt-16">
    <h2 class="text-2xl md:text-3xl font-black tracking-tight mb-6 text-gray-900">Tamb\xE9m pode gostar</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">${cards}</div>
  </section>`;
}
function breadcrumb(view, product, light = false) {
  const t = light ? "text-white/80" : "text-gray-500";
  const hov = light ? "hover:text-white" : "hover:text-gray-900";
  const cur = light ? "text-white" : "text-gray-900";
  const crumbCat = product.category ? `<a href="${esc(categoryHref2(view, product.category))}" class="${hov}">${esc(product.category)}</a><span class="material-symbols-outlined text-[16px]">chevron_right</span>` : "";
  return `<nav class="text-sm ${t} mb-6 flex items-center gap-1.5 flex-wrap">
    <a href="${esc(homeHref3(view))}" class="${hov}">In\xEDcio</a>
    <span class="material-symbols-outlined text-[16px]">chevron_right</span>
    ${crumbCat}
    <span class="${cur} font-medium truncate">${esc(product.name)}</span>
  </nav>`;
}
function renderProductPage(variant, view, product, custom, ctx) {
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const waHref = waLink(phone, waMsg);
  const price = `<p data-product-price class="mt-3 text-3xl font-bold" style="color:${ctx.brand}">${esc(formatKz(product.price))}</p>`;
  const perks = `<ul data-edit-perks class="mt-8 space-y-2 text-sm text-gray-600 border-t border-gray-100 pt-6">${perksItemsHtml(custom, ctx.brand)}</ul>`;
  if (variant === "imersivo") {
    return `<main class="flex-grow">
      <section class="relative min-h-[58vh] md:min-h-[68vh] flex items-end overflow-hidden bg-neutral-900" data-edit-product="${esc(product.id)}">
        ${imgHtml(product, "absolute inset-0 w-full h-full object-cover")}
        <div class="absolute inset-0" style="background:linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,.25) 55%, rgba(0,0,0,.35))"></div>
        <div class="relative ${ctx.container} pb-10 md:pb-14 text-white w-full">
          ${breadcrumb(view, product, true)}
          <h1 class="text-4xl md:text-6xl font-black tracking-tight leading-[1.04] max-w-3xl">${esc(product.name)}</h1>
          <p data-product-price class="mt-3 text-3xl font-bold">${esc(formatKz(product.price))}</p>
        </div>
      </section>
      <div class="${ctx.container} py-10 md:py-14">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 items-start">
          <div class="lg:col-span-2">
            ${product.description ? `<p class="text-gray-600 text-lg leading-relaxed whitespace-pre-line">${esc(product.description)}</p>` : `<p class="text-gray-400 italic">Sem descri\xE7\xE3o.</p>`}
            ${perks}
          </div>
          <div class="lg:col-span-1 lg:sticky lg:top-24 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p data-product-price class="text-2xl font-bold mb-4" style="color:${ctx.brand}">${esc(formatKz(product.price))}</p>
            ${variationsHtml(product, custom)}
            <div class="flex items-center gap-4 mb-2"><span class="text-sm font-medium text-gray-700">Quantidade</span>${qtyHtml()}</div>
            ${actionsHtml(product, ctx, waHref)}
          </div>
        </div>
      </div>
      <div class="${ctx.container}">${relatedHtml(view, product, ctx)}</div>
    </main>`;
  }
  if (variant === "galeria") {
    return `<main class="${ctx.container} py-8 md:py-12 flex-grow">
      ${breadcrumb(view, product)}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        <div class="lg:col-span-7 space-y-4">
          ${productGalleryHtml(product, custom, { stageClass: "aspect-[4/5] bg-gray-50 rounded-2xl overflow-hidden border border-gray-100", imgClass: "w-full h-full object-cover", brand: ctx.brand })}
        </div>
        <div class="lg:col-span-5 lg:sticky lg:top-24 flex flex-col">
          <h1 class="text-3xl md:text-4xl font-black tracking-tight leading-tight">${esc(product.name)}</h1>
          ${price}
          ${descHtml(product)}
          ${variationsHtml(product, custom)}
          <div class="mt-8 flex items-center gap-4"><span class="text-sm font-medium text-gray-700">Quantidade</span>${qtyHtml()}</div>
          ${actionsHtml(product, ctx, waHref)}
          ${perks}
        </div>
      </div>
      ${relatedHtml(view, product, ctx)}
    </main>`;
  }
  return `<main class="${ctx.container} py-6 md:py-10 flex-grow">
    ${breadcrumb(view, product)}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
      ${productGalleryHtml(product, custom, { stageClass: "aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100", imgClass: "w-full h-full object-cover", brand: ctx.brand })}
      <div class="flex flex-col">
        <h1 class="text-3xl md:text-4xl font-black tracking-tight leading-tight">${esc(product.name)}</h1>
        ${price}
        ${descHtml(product)}
        ${variationsHtml(product, custom)}
        <div class="mt-8 flex items-center gap-4"><span class="text-sm font-medium text-gray-700">Quantidade</span>${qtyHtml()}</div>
        ${actionsHtml(product, ctx, waHref)}
        ${perks}
      </div>
    </div>
    ${relatedHtml(view, product, ctx)}
  </main>`;
}

// web/templates/productGrid.ts
function gridColsClass(v) {
  const cols = v === "alto" ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return `grid grid-cols-2 md:grid-cols-3 ${cols} gap-x-5 gap-y-10`;
}
function cardAspectClass(v) {
  if (v === "quadrado") return "aspect-square";
  if (v === "alto") return "aspect-[4/5]";
  return "aspect-[3/4]";
}

// web/templates/categoryFilter.ts
var DEFAULT_ACTIVE_STYLE = "background:var(--brand);color:var(--brand-ink,#fff);border:1px solid var(--brand)";
function sameLabel(a, b) {
  const all = (s) => s === ALL_LABEL || s === "Todos";
  return a === b || all(a) && all(b);
}
function categoryFilterHtml(labels, active, style) {
  if (labels.length < 2) return "";
  const activeStyle = style.activeStyle ?? DEFAULT_ACTIVE_STYLE;
  const base = style.chipStyle ?? "";
  const chips = labels.map((label) => {
    const on = sameLabel(label, active);
    const inline = on ? activeStyle : base;
    return `<button type="button" data-cat-filter="${esc(label)}" data-cat-base="${esc(base)}" aria-pressed="${on ? "true" : "false"}" class="${style.chipClass}"${inline ? ` style="${esc(inline)}"` : ""}>${esc(label)}</button>`;
  }).join("");
  return `<div data-cat-filter-bar data-cat-active-style="${esc(activeStyle)}" class="${style.rootClass ?? "flex flex-wrap items-center gap-2 mb-8 min-w-0"}" role="group" aria-label="Filtrar por categoria">${chips}</div>`;
}

// web/templates/desportivo.ts
var PER_ROW = 4;
var TWO_ROWS = 8;
var BEBAS = "font-family:'Bebas Neue',sans-serif";
var CONTAINER = "w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8";
var HERO_FALLBACK2 = "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=2000";
var DEFAULT_SUBTITLE = "Produtos originais. Qualidade premium. Entrega em toda Angola.";
var DEFAULT_CTA = "COMPRAR AGORA";
var DEFAULT_PHONE = "+244 900 000 000";
var BLOCK_STYLE = {
  heading: "font-black tracking-tight text-neutral-900",
  body: "text-neutral-600 leading-relaxed",
  muted: "text-neutral-400",
  surface: "bg-white border border-neutral-200",
  radius: "rounded-lg",
  band: "bg-neutral-50 border-y border-neutral-100"
};
var mbLogoScale;
var mbGridVariant;
var SEARCH_VARS = "--mb-search-radius:8px;--mb-search-h:40px;--mb-search-bg:#fff;--mb-search-border:#d4d4d4;--mb-search-ink:#171717;--mb-search-ph:rgba(23,23,23,.45)";
function cardAspect() {
  return cardAspectClass(mbGridVariant ?? "quadrado");
}
function storeIdentifier4(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeBase3(view) {
  return storeBasePath(storeIdentifier4(view));
}
function storeHomeHref(view) {
  return storeHomePath(storeIdentifier4(view));
}
function productHref2(view, p) {
  return `${storeBase3(view)}/produto/${productSlugPath(p)}`;
}
function categoryHref3(view, category) {
  return `${storeBase3(view)}/categoria/${categorySlug(category)}`;
}
function cartHref2(view) {
  return `${storeBase3(view)}/carrinho`;
}
function categoriesOf(view) {
  return headerCategories(view);
}
function brandHtml2(view) {
  const brand = view.header.brand;
  if (brand.kind === "logo") {
    return `<img src="${esc(brand.url)}" alt="${esc(brand.alt)}" class="w-auto object-contain" style="height:${mbLogoScale ?? 40}px" />`;
  }
  return `<span style="${BEBAS}" class="text-2xl md:text-3xl text-neutral-900 tracking-tight">${esc(view.storeName.toUpperCase())}</span>`;
}
function footerBrandHtml2(view, custom) {
  const footerLogo = custom?.footer?.logoUrl;
  const headerLogo = view.header.brand.kind === "logo" ? view.header.brand.url : null;
  const url = footerLogo || headerLogo;
  if (url) {
    return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 md:h-10 w-auto object-contain" />`;
  }
  return `<span style="${BEBAS}" class="text-2xl text-white tracking-tight">${esc(view.storeName.toUpperCase())}</span>`;
}
function headerHtml(view, _menuLabels, custom) {
  if (custom?.header?.variant) return renderHeader(custom.header.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" });
  const linkCls = "hover:text-neutral-900 cursor-pointer transition-colors";
  const menu = `<a href="${esc(storeHomeHref(view))}" class="${linkCls}">In\xEDcio</a><a href="${esc(allProductsHref(view))}" class="${linkCls}">Produtos</a>`;
  const cats = categoriesOf(view);
  const mnav = mobileMenuParts(view, CONTAINER);
  const categoriesMenu = cats.length ? `<div class="relative group" data-categories-menu>
        <button type="button" class="flex items-center gap-0.5 hover:text-neutral-900 transition-colors">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
          <div class="bg-white border border-neutral-100 rounded-lg shadow-lg py-2 min-w-[180px]">
            ${cats.map((c) => `<a href="${esc(categoryHref3(view, c))}" class="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>` : "";
  return `
    <header class="sticky top-0 z-50 bg-white border-b border-neutral-100" style="${SEARCH_VARS}">
      ${mnav.head}
      <div class="${CONTAINER}">
        <div class="relative flex items-center justify-between h-14 md:h-16">
          <div class="flex items-center gap-1 min-w-0">
            ${mnav.button}
            <nav data-search-collapse class="hidden lg:flex items-center gap-6 text-sm font-medium text-neutral-700">${menu}${categoriesMenu}</nav>
          </div>
          <a href="${esc(storeHomeHref(view))}" data-edit-logo class="absolute left-1/2 -translate-x-1/2">${brandHtml2(view)}</a>
          <div data-search-host class="flex items-center gap-3 text-neutral-700 shrink-0 min-w-0">
            <button type="button" data-search-btn class="hover:opacity-70 transition-opacity"><span class="material-symbols-outlined">search</span></button>
            <a href="${esc(cartHref2(view))}" data-cart-link class="relative inline-flex">
              <span class="material-symbols-outlined">shopping_cart</span>
              <span data-cart-count class="hidden absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,#DC2626)"></span>
            </a>
          </div>
        </div>
      </div>
      ${mnav.panel}
    </header>`;
}
function footerHtml(view, custom, menuLabels) {
  if (custom?.footer?.variant) return renderFooter(custom.footer.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" });
  const about = custom?.footer?.about || "A sua loja desportiva em Angola. Produtos originais e de qualidade premium.";
  const location2 = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="mb-dark bg-neutral-900 text-neutral-400 mt-auto">
      <div class="${CONTAINER} py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="space-y-3">
          <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml2(view, custom)}</div>
          <p data-edit="footer.about" class="text-sm max-w-xs leading-relaxed">${esc(about)}</p>
        </div>
        <div>
          <h3 class="text-sm font-medium text-white mb-4">Loja</h3>
          <ul class="space-y-2.5 text-sm">${menuLabels.map((l) => `<li><a href="${esc(storeHomeHref(view))}" class="hover:text-white transition-colors cursor-pointer">${esc(l)}</a></li>`).join("")}</ul>
        </div>
        <div>
          <h3 class="text-sm font-medium text-white mb-4">Contacto</h3>
          <ul class="space-y-2.5 text-sm">
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location2)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-neutral-800">
        <div class="${CONTAINER} py-5 text-xs text-neutral-500 text-center">
          ${esc(storeIdentifier4(view) + "." + STORE_APEX)} \xB7 Loja criada com <a href="${platformHomeUrl()}" class="text-white">M\xF4Bisno</a>
        </div>
      </div>
    </footer>`;
}
function productCard(view, p, opts = {}) {
  const img = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />` : `<div class="absolute inset-0 flex items-center justify-center bg-neutral-100"><span class="material-symbols-outlined text-neutral-400 text-4xl">image</span></div>`;
  const badge = p.featured ? `<span class="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded" style="background:var(--brand,#DC2626)">Destaque</span>` : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref2(view, p))}" class="group relative block" data-edit-product="${esc(p.id)}" data-product-category="${esc(p.category ?? "")}"${hide}>
    <div class="relative ${cardAspect()} bg-neutral-50 overflow-hidden mb-3 rounded-sm">${img}${badge}</div>
    <h3 class="text-sm font-medium text-neutral-900 line-clamp-2">${esc(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-neutral-500 line-clamp-1">${esc(p.description)}</p>` : ""}
    <p class="pt-1 text-sm font-bold text-neutral-900">${esc(formatKz(p.price))}</p>
  </a>`;
}
var GRID_CLS = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8";
function sectionsArea(view, custom) {
  const gridCls = mbGridVariant ? gridColsClass(mbGridVariant) : GRID_CLS;
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW) : sec.products;
    const cards = items.map((p, idx) => productCard(view, p, { hidden: !multi && idx >= TWO_ROWS })).join("");
    const moreRight = multi ? `<a href="${esc(sec.moreHref)}" class="text-sm font-bold flex items-center gap-1 hover:opacity-80" style="color:var(--brand,#DC2626)">Ver mais <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>` : "";
    const moreBottom = !multi && sec.products.length > TWO_ROWS ? `<div class="text-center mt-10"><button type="button" data-load-more data-step="${TWO_ROWS}" class="inline-flex items-center gap-1 border-2 border-neutral-900 text-neutral-900 font-bold px-8 py-3 rounded-lg hover:bg-neutral-900 hover:text-white transition-colors">Ver mais <span class="material-symbols-outlined text-[18px]">expand_more</span></button></div>` : "";
    const empty = items.length === 0 ? `<p class="text-neutral-400 col-span-full py-8 text-center">Sem produtos nesta sec\xE7\xE3o.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-14" : ""}">
      <div data-edit-section-head class="flex items-center justify-between gap-3 mb-6">
        <div class="flex items-center gap-3 min-w-0">
          <span style="background:var(--brand,#DC2626)" class="inline-block w-8 h-1.5 rounded-full shrink-0"></span>
          <h2 style="${BEBAS}" class="text-3xl md:text-4xl text-neutral-900 tracking-tight truncate">${esc(sec.title.toUpperCase())}</h2>
        </div>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}
function menuFor(view, custom) {
  mbLogoScale = custom?.logoScale;
  mbGridVariant = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}
function render(view, custom) {
  const menuLabels = menuFor(view, custom);
  const title = custom?.hero?.title || view.storeName.toUpperCase();
  const subtitle = custom?.hero?.subtitle || DEFAULT_SUBTITLE;
  const cta = custom?.hero?.ctaLabel || DEFAULT_CTA;
  const heroImg = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK2;
  const extraBanners = custom?.hero?.imageUrl ? view.banners : view.banners.slice(1);
  const nativeHero = `
    <!-- Hero -->
    <section data-edit-hero class="mb-dark text-white relative h-[420px] md:h-[520px] overflow-hidden bg-neutral-900">
      <img src="${esc(heroImg)}" alt="" class="absolute inset-0 w-full h-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent"></div>
      <div class="relative h-full ${CONTAINER} flex items-center">
        <div class="max-w-xl">
          <h1 data-edit="hero.title" style="${BEBAS}" class="text-5xl md:text-7xl text-white leading-[0.95] tracking-tight mb-4">${esc(title)}</h1>
          <p data-edit="hero.subtitle" class="text-base md:text-lg text-white/80 mb-8 max-w-md">${esc(subtitle)}</p>
          <a href="#produtos" style="background:var(--brand,#DC2626);color:#fff" class="inline-flex items-center gap-2 hover:opacity-90 font-medium px-8 py-3 rounded-lg transition-opacity">
            <span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </a>
        </div>
      </div>
    </section>`;
  const hero = custom?.hero?.variant ? renderHero(custom.hero.variant, view, custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" }, "imagem") : nativeHero;
  return `
  <div class="relative min-h-screen flex flex-col bg-white text-neutral-900 overflow-x-hidden">
    ${headerHtml(view, menuLabels, custom)}

    ${hero}

    ${extraBanners.length ? `<section class="${CONTAINER} mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          ${extraBanners.map((b) => `<img src="${esc(b.imageUrl)}" alt="banner" class="w-full h-40 md:h-52 object-cover rounded-lg" />`).join("")}
        </section>` : ""}

    <!-- Produtos -->
    <main id="produtos" class="${CONTAINER} py-12 md:py-16 flex-grow">
      ${sectionsArea(view, custom)}
    </main>
    ${blocksHtml(custom, { container: CONTAINER, brand: "var(--brand,#DC2626)", style: BLOCK_STYLE })}

    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}
function renderProduct(view, product, custom) {
  const menuLabels = menuFor(view, custom);
  if (custom?.productPage?.variant) {
    return `
  <div class="min-h-screen flex flex-col bg-white text-neutral-900">
    ${headerHtml(view, menuLabels, custom)}
    ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER, brand: "var(--brand,#DC2626)" })}
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  const crumbCategory = product.category ? `<a href="${esc(categoryHref3(view, product.category))}" class="hover:text-neutral-900">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[16px]">chevron_right</span>` : "";
  return `
  <div class="min-h-screen flex flex-col bg-white text-neutral-900">
    ${headerHtml(view, menuLabels, custom)}

    <main class="${CONTAINER} py-6 md:py-10 flex-grow">
      <!-- Migalhas -->
      <nav class="text-sm text-neutral-500 mb-6 flex items-center gap-1.5 flex-wrap">
        <a href="${esc(storeHomeHref(view))}" class="hover:text-neutral-900">In\xEDcio</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${crumbCategory}
        <span class="text-neutral-900 font-medium truncate">${esc(product.name)}</span>
      </nav>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        <!-- Imagem -->
        ${productGalleryHtml(product, custom, { stageClass: "aspect-square bg-neutral-50 rounded-xl overflow-hidden", imgClass: "w-full h-full object-cover", brand: "var(--brand,#DC2626)" })}

        <!-- Detalhe -->
        <div class="flex flex-col">
          <h1 style="${BEBAS}" class="text-4xl md:text-5xl tracking-tight leading-tight">${esc(product.name)}</h1>
          <p data-product-price class="mt-3 text-3xl font-bold" style="color:var(--brand,#DC2626)">${esc(formatKz(product.price))}</p>

          ${product.description ? `<p class="mt-6 text-neutral-600 leading-relaxed whitespace-pre-line">${esc(product.description)}</p>` : `<p class="mt-6 text-neutral-400 italic">Sem descri\xE7\xE3o.</p>`}

          <!-- Varia\xE7\xF5es (cantos e molduras do modelo \u2014 MODELO-GUIA \xA70.2) -->
          ${variationPickerHtml(product, custom, {
    labelClass: "text-sm font-medium text-neutral-700",
    valueClass: "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 text-sm font-bold text-neutral-900 hover:bg-neutral-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    noteClass: "text-sm font-medium"
  })}

          <!-- Quantidade -->
          <div class="mt-8 flex items-center gap-4">
            <span class="text-sm font-medium text-neutral-700">Quantidade</span>
            <div class="flex items-center border border-neutral-300 rounded-lg overflow-hidden">
              <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-neutral-100 text-neutral-700"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none border-x border-neutral-300" />
              <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-neutral-100 text-neutral-700"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
          </div>

          <!-- A\xE7\xF5es -->
          <div class="mt-8 flex flex-col sm:flex-row gap-3">
            <button type="button" data-add-cart="${esc(product.id)}" style="background:var(--brand,#DC2626);color:#fff" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-lg hover:opacity-90 transition-opacity">
              <span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho
            </button>
            <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="relative flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-lg border border-neutral-300 text-neutral-900 hover:bg-neutral-50 transition-colors">
              <span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp
            </a>
          </div>

          <!-- Garantias -->
          <ul data-edit-perks class="mt-8 space-y-2 text-sm text-neutral-600 border-t border-neutral-100 pt-6">
            ${perksItemsHtml(custom, "var(--brand,#DC2626)")}
          </ul>
        </div>
      </div>

      ${related.length ? `<section class="mt-16">
            <div class="flex items-center gap-3 mb-6">
              <span style="background:var(--brand,#DC2626)" class="inline-block w-8 h-1.5 rounded-full"></span>
              <h2 style="${BEBAS}" class="text-2xl md:text-3xl tracking-tight">TAMB\xC9M PODE GOSTAR</h2>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">${related.map((p) => productCard(view, p)).join("")}</div>
          </section>` : ""}
    </main>

    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}
function renderCategory(view, category, custom) {
  const menuLabels = menuFor(view, custom);
  const items = filterForCategoryPage(view, category);
  const cards = listingProducts(view, category);
  const grid = cards.length ? `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">${cards.map((p) => productCard(view, p)).join("")}</div>` : `<div class="py-16 text-center text-neutral-500">
        <span class="material-symbols-outlined" style="font-size:48px;">category</span>
        <p class="mt-2">Ainda n\xE3o h\xE1 produtos nesta categoria.</p>
       </div>`;
  const filters = categoryFilterHtml(categoryFilterLabels(view, category), category, {
    chipClass: "text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-sm whitespace-nowrap transition-colors",
    chipStyle: "border:1px solid #e5e5e5;color:#171717;background:#fff",
    rootClass: "flex flex-wrap items-center gap-2 mb-8 min-w-0"
  });
  return `
  <div class="min-h-screen flex flex-col bg-white text-neutral-900">
    ${headerHtml(view, menuLabels, custom)}
    <main class="${CONTAINER} py-8 md:py-12 flex-grow">
      <nav class="text-sm text-neutral-500 mb-6 flex items-center gap-1.5">
        <a href="${esc(storeHomeHref(view))}" class="hover:text-neutral-900">In\xEDcio</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span class="text-neutral-900 font-medium">${esc(category)}</span>
      </nav>
      <div class="flex items-center gap-3 mb-8">
        <span style="background:var(--brand,#DC2626)" class="inline-block w-8 h-1.5 rounded-full"></span>
        <h1 data-cat-title style="${BEBAS}" class="text-3xl md:text-4xl tracking-tight uppercase">${esc(category)}</h1>
        <span data-cat-count class="text-sm text-neutral-400">${items.length} produto(s)</span>
      </div>
      ${filters}
      ${grid}
    </main>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}
var desportivoTemplate = {
  id: "desportivo",
  name: "Desportivo",
  previewUrl: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=600",
  ready: true,
  defaultBrand: "#DC2626",
  /**
   * Nenhuma secção nativa: este modelo não traz testemunhos nem mapa, por isso
   * as quatro podem ser acrescentadas. As variantes são as de maior contraste,
   * a par do Bebas Neue e das faixas de marca do resto do modelo. Fundos: o
   * `neutral-100` das faixas claras e o `neutral-900` das faixas escuras.
   */
  sections: {
    variants: { info: "lado", text: "destaque", testimonials: "cards", location: "classico" },
    style: BLOCK_STYLE,
    backgrounds: [{ label: "Cinza claro", value: "#f5f5f5" }, { label: "Escuro", value: "#171717" }]
  },
  render,
  renderProduct,
  renderCategory,
  renderCheckout
};
function renderCheckout(view, innerHtml, custom) {
  const menuLabels = menuFor(view, custom);
  return `
  <div class="min-h-screen flex flex-col bg-white text-neutral-900">
    ${headerHtml(view, menuLabels, custom)}
    <main class="${CONTAINER} py-8 md:py-12 flex-grow">${innerHtml}</main>
    ${footerHtml(view, custom, menuLabels)}
  </div>`;
}

// web/templates/beauty.ts
var PER_ROW2 = 3;
var TWO_ROWS2 = 6;
var SERIF = "font-family:'Noto Serif',serif";
var CONTAINER2 = "w-full max-w-7xl mx-auto px-6";
var HERO_FALLBACK3 = "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?q=80&w=2000";
var DEFAULT_BRAND = "#b71656";
var DEFAULT_PHONE2 = "+244 900 000 000";
var DEFAULT_SUBTITLE2 = "Descubra fragr\xE2ncias exclusivas que capturam a sofistica\xE7\xE3o moderna. Agora em Angola.";
var DEFAULT_CTA2 = "Comprar agora";
var BLOCK_STYLE2 = {
  heading: "tracking-tight",
  headingStyle: `${SERIF};color:var(--brand,${DEFAULT_BRAND})`,
  body: "font-light leading-relaxed",
  bodyStyle: "color:#524345",
  surface: "",
  surfaceStyle: "background:#f6f3f2",
  radius: "rounded-xl",
  band: "",
  bandStyle: "background:#f6f3f2"
};
var mbLogoScale2;
var mbGridVariant2;
var SEARCH_VARS2 = "--mb-search-radius:12px;--mb-search-h:42px;--mb-search-bg:#f0dee3;--mb-search-border:transparent;--mb-search-ink:#1c1b1b;--mb-search-ph:rgba(104,91,95,.75);--mb-search-font:'Manrope',sans-serif";
function cardAspect2() {
  return cardAspectClass(mbGridVariant2 ?? "alto");
}
function storeIdentifier5(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeBase4(view) {
  return storeBasePath(storeIdentifier5(view));
}
function storeHomeHref2(view) {
  return storeHomePath(storeIdentifier5(view));
}
function productHref3(view, p) {
  return `${storeBase4(view)}/produto/${productSlugPath(p)}`;
}
function categoryHref4(view, category) {
  return `${storeBase4(view)}/categoria/${categorySlug(category)}`;
}
function cartHref3(view) {
  return `${storeBase4(view)}/carrinho`;
}
function categoriesOf2(view) {
  return headerCategories(view);
}
function menuFor2(view, custom) {
  mbLogoScale2 = custom?.logoScale;
  mbGridVariant2 = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}
function brandHtml3(view) {
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${mbLogoScale2 ?? 38}px" />`;
  }
  return `<span style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-2xl font-bold tracking-tighter">${esc(view.storeName)}</span>`;
}
function footerBrandHtml3(view, custom) {
  const url = custom?.footer?.logoUrl || (view.header.brand.kind === "logo" ? view.header.brand.url : null);
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-10 w-auto object-contain" />`;
  return `<span style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-xl font-bold">${esc(view.storeName)}</span>`;
}
function headerHtml2(view, _menuLabels, custom) {
  if (custom?.header?.variant) return renderHeader(custom.header.variant, view, custom, { container: CONTAINER2, brand: `var(--brand,${DEFAULT_BRAND})` });
  const linkCls = `text-[#524345] hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors font-medium tracking-widest text-xs uppercase`;
  const menu = `<a href="${esc(storeHomeHref2(view))}" class="${linkCls}">In\xEDcio</a><a href="${esc(allProductsHref(view))}" class="${linkCls}">Produtos</a>`;
  const cats = categoriesOf2(view);
  const mnav = mobileMenuParts(view, CONTAINER2);
  const categoriesMenu = cats.length ? `<div class="relative group" data-categories-menu>
        <button type="button" class="flex items-center gap-0.5 text-[#524345] hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors font-medium tracking-widest text-xs uppercase">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
          <div class="bg-white rounded-xl py-2 min-w-[180px]" style="box-shadow:0 10px 40px rgba(28,27,27,.1)">
            ${cats.map((c) => `<a href="${esc(categoryHref4(view, c))}" class="block px-4 py-2 text-sm text-[#524345] hover:bg-[#f6f3f2] transition-colors">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>` : "";
  return `
    <nav class="sticky top-0 w-full z-50" style="background:rgba(252,249,248,.72);backdrop-filter:blur(20px);${SEARCH_VARS2}">
      ${mnav.head}
      <div class="${CONTAINER2} flex justify-between items-center gap-3 py-4">
        <div class="flex items-center gap-1 min-w-0">
          ${mnav.button}
          <a href="${esc(storeHomeHref2(view))}" data-edit-logo class="shrink-0">${brandHtml3(view)}</a>
        </div>
        <div data-search-collapse class="hidden lg:flex items-center gap-8">${menu}${categoriesMenu}</div>
        <div data-search-host class="flex items-center gap-4 text-[#1c1b1b] shrink-0 min-w-0">
          <button type="button" data-search-btn class="hover:opacity-70 transition-opacity p-1"><span class="material-symbols-outlined">search</span></button>
          <a href="${esc(cartHref3(view))}" data-cart-link class="relative inline-flex hover:opacity-70 transition-opacity p-1">
            <span class="material-symbols-outlined">shopping_bag</span>
            <span data-cart-count class="hidden absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,${DEFAULT_BRAND})"></span>
          </a>
        </div>
      </div>
      ${mnav.panel}
    </nav>`;
}
function footerHtml2(view, custom, menuLabels) {
  if (custom?.footer?.variant) return renderFooter(custom.footer.variant, view, custom, { container: CONTAINER2, brand: `var(--brand,${DEFAULT_BRAND})` });
  const about = custom?.footer?.about || "Transformando a perfumaria em Angola com fragr\xE2ncias que elevam a autoestima e celebram a beleza.";
  const location2 = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE2;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="bg-[#f6f3f2] w-full pt-16 pb-8 mt-auto">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-10 ${CONTAINER2}">
        <div class="space-y-5">
          <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml3(view, custom)}</div>
          <p data-edit="footer.about" class="text-[#685b5f] text-sm leading-relaxed max-w-xs">${esc(about)}</p>
        </div>
        <div class="flex flex-col gap-3">
          <h4 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="font-bold mb-2 uppercase tracking-widest text-xs">Loja</h4>
          ${menuLabels.map((l) => `<a href="${esc(storeHomeHref2(view))}" class="text-[#685b5f] hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors text-sm">${esc(l)}</a>`).join("")}
        </div>
        <div class="flex flex-col gap-3">
          <h4 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="font-bold mb-2 uppercase tracking-widest text-xs">Contacto</h4>
          <span class="text-[#685b5f] text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location2)}</span></span>
          <span class="text-[#685b5f] text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></span>
          <span class="text-[#685b5f] text-sm flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></span>
        </div>
      </div>
      <div class="${CONTAINER2} mt-16 pt-8 text-center" style="border-top:1px solid rgba(214,194,196,.4)">
        <p class="text-[#685b5f] text-[10px] tracking-widest uppercase">${esc(storeIdentifier5(view) + "." + STORE_APEX)} \xB7 Loja criada com <a href="${platformHomeUrl()}" style="color:var(--brand,${DEFAULT_BRAND})">M\xF4Bisno</a></p>
      </div>
    </footer>`;
}
function productCard2(view, p, opts = {}) {
  const img = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />` : `<div class="absolute inset-0 flex items-center justify-center bg-[#f0eded]"><span class="material-symbols-outlined text-[#d6c2c4] text-5xl">image</span></div>`;
  const badge = p.featured ? `<div class="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded text-[10px] font-bold tracking-widest" style="color:var(--brand,${DEFAULT_BRAND})">DESTAQUE</div>` : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref3(view, p))}" data-edit-product="${esc(p.id)}" data-product-category="${esc(p.category ?? "")}" class="group block relative ${opts.offset ? "md:mt-8" : ""}"${hide}>
    <div class="${cardAspect2()} bg-white overflow-hidden rounded-xl mb-5 relative">${img}${badge}</div>
    <div class="flex justify-between items-start gap-3">
      <div class="min-w-0">
        <h3 style="${SERIF}" class="text-xl text-[#1c1b1b] group-hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors truncate">${esc(p.name)}</h3>
        <p class="text-sm text-[#685b5f] mb-2 truncate">${p.description ? esc(p.description) : p.category ? esc(p.category) : "&nbsp;"}</p>
        <p style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-2xl">${esc(formatKz(p.price))}</p>
      </div>
      <span class="shrink-0 bg-[#f0dee3] text-[#6e6165] p-3 rounded-xl transition-colors"><span class="material-symbols-outlined">add_shopping_cart</span></span>
    </div>
  </a>`;
}
var GRID_CLS2 = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16";
function sectionsArea2(view, custom) {
  const gridCls = mbGridVariant2 ? gridColsClass(mbGridVariant2) : GRID_CLS2;
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW2) : sec.products;
    const cards = items.map((p, idx) => productCard2(view, p, { offset: !multi && idx % 3 === 1, hidden: !multi && idx >= TWO_ROWS2 })).join("");
    const moreRight = multi ? `<a href="${esc(sec.moreHref)}" class="text-sm font-bold flex items-center gap-1 hover:opacity-80 shrink-0" style="color:var(--brand,${DEFAULT_BRAND})">Ver mais <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>` : "";
    const moreBottom = !multi && sec.products.length > TWO_ROWS2 ? `<div class="text-center mt-12"><button type="button" data-load-more data-step="${TWO_ROWS2}" class="inline-flex items-center gap-1 font-bold px-10 py-4 rounded-lg transition-all hover:opacity-90" style="background:var(--brand,${DEFAULT_BRAND});color:#fff">Ver mais <span class="material-symbols-outlined text-[18px]">expand_more</span></button></div>` : "";
    const empty = items.length === 0 ? `<p class="text-[#685b5f] col-span-full py-8 text-center">Sem produtos nesta sec\xE7\xE3o.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-16" : ""}">
      <div data-edit-section-head class="flex items-end justify-between gap-3 mb-10">
        <div class="min-w-0">
          <h2 style="${SERIF}" class="text-3xl md:text-4xl text-[#1c1b1b] truncate">${esc(sec.title)}</h2>
        </div>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}
function render2(view, custom) {
  const menuLabels = menuFor2(view, custom);
  const title = custom?.hero?.title || "A Ess\xEAncia da Eleg\xE2ncia";
  const subtitle = custom?.hero?.subtitle || DEFAULT_SUBTITLE2;
  const cta = custom?.hero?.ctaLabel || DEFAULT_CTA2;
  const heroImg = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK3;
  const nativeHero = `
    <!-- Hero -->
    <section data-edit-hero class="relative min-h-[60vh] md:h-[620px] flex items-center overflow-hidden bg-[#f6f3f2]">
      <img src="${esc(heroImg)}" alt="" class="absolute inset-0 w-full h-full object-cover" />
      <div class="absolute inset-0" style="background:linear-gradient(to right, rgba(252,249,248,.92), rgba(252,249,248,.35), transparent)"></div>
      <div class="relative z-10 ${CONTAINER2}">
        <div class="max-w-xl py-16">
          <span class="inline-block font-medium tracking-[0.2em] uppercase text-xs mb-4" style="color:var(--brand,${DEFAULT_BRAND})">Nova Cole\xE7\xE3o</span>
          <h1 data-edit="hero.title" style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-5xl md:text-7xl leading-tight mb-6 tracking-tighter">${esc(title)}</h1>
          <p data-edit="hero.subtitle" class="text-[#524345] text-lg md:text-xl mb-10 max-w-md leading-relaxed">${esc(subtitle)}</p>
          <a href="#produtos" style="background:var(--brand,${DEFAULT_BRAND});color:#fff" class="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-bold tracking-wide hover:opacity-90 transition-all active:scale-95">
            <span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </a>
        </div>
      </div>
    </section>`;
  const hero = custom?.hero?.variant ? renderHero(custom.hero.variant, view, custom, { container: CONTAINER2, brand: `var(--brand,${DEFAULT_BRAND})` }, "split") : nativeHero;
  return `
  <div class="relative min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b] overflow-x-hidden" style="font-family:'Manrope',sans-serif">
    ${headerHtml2(view, menuLabels, custom)}

    ${hero}

    <!-- Galeria de produtos -->
    <section id="produtos" class="py-20 ${CONTAINER2} flex-grow">
      ${sectionsArea2(view, custom)}
    </section>

    <!-- CTA tonal -->
    <section class="py-24 bg-[#f6f3f2]">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <h2 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-4xl md:text-5xl mb-6 tracking-tight">Pronta para encontrar a sua assinatura?</h2>
        <p class="text-[#524345] text-lg mb-10 max-w-2xl mx-auto leading-relaxed">Pagamentos seguros e entregas em toda Luanda. Atendimento pr\xF3ximo e dedicado.</p>
        <a href="#produtos" style="background:var(--brand,${DEFAULT_BRAND});color:#fff" class="inline-block px-12 py-5 rounded-lg font-bold hover:opacity-90 transition-all">Ver todos os produtos</a>
      </div>
    </section>

    ${blocksHtml(custom, { container: CONTAINER2, brand: `var(--brand,${DEFAULT_BRAND})`, style: BLOCK_STYLE2 })}

    ${footerHtml2(view, custom, menuLabels)}
  </div>`;
}
function renderProduct2(view, product, custom) {
  const menuLabels = menuFor2(view, custom);
  if (custom?.productPage?.variant) {
    return `
  <div class="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b]" style="font-family:'Manrope',sans-serif">
    ${headerHtml2(view, menuLabels, custom)}
    ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER2, brand: `var(--brand,${DEFAULT_BRAND})` })}
    ${footerHtml2(view, custom, menuLabels)}
  </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const crumbCategory = product.category ? `<a href="${esc(categoryHref4(view, product.category))}" class="hover:text-[color:var(--brand,${DEFAULT_BRAND})] transition-colors">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[14px]">chevron_right</span>` : "";
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 3);
  return `
  <div class="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b]" style="font-family:'Manrope',sans-serif">
    ${headerHtml2(view, menuLabels, custom)}

    <main class="${CONTAINER2} pt-10 pb-20 flex-grow">
      <nav class="mb-10">
        <ol class="flex items-center gap-2 text-xs tracking-widest text-[#685b5f] uppercase flex-wrap">
          <li><a href="${esc(storeHomeHref2(view))}" class="hover:text-[color:var(--brand,${DEFAULT_BRAND})]">In\xEDcio</a></li>
          <li><span class="material-symbols-outlined text-[14px]">chevron_right</span></li>
          ${crumbCategory ? `<li>${crumbCategory}</li>` : ""}
          <li class="text-[#1c1b1b] font-semibold">${esc(product.name)}</li>
        </ol>
      </nav>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
        <div class="lg:col-span-7">
          ${productGalleryHtml(product, custom, { stageClass: "aspect-[4/5] bg-[#f6f3f2] overflow-hidden rounded-xl", imgClass: "w-full h-full object-cover transition-transform duration-700 hover:scale-105", brand: `var(--brand,${DEFAULT_BRAND})` })}
        </div>

        <div class="lg:col-span-5 lg:sticky lg:top-28">
          <div class="space-y-8">
            <div>
              <h1 style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-5xl md:text-6xl mb-3 leading-tight">${esc(product.name)}</h1>
              <p data-product-price style="${SERIF}" class="text-2xl text-[#1c1b1b]">${esc(formatKz(product.price))}</p>
            </div>

            <!-- Varia\xE7\xF5es (tipografia e cantos do modelo \u2014 MODELO-GUIA \xA70.2) -->
            ${variationPickerHtml(product, custom, {
    labelClass: "text-xs tracking-widest uppercase text-[#685b5f] font-bold",
    valueClass: "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold tracking-[0.1em] uppercase text-[#6e6165] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    valueStyle: "background:#f0dee3",
    noteClass: "text-sm font-bold"
  })}

            ${product.description ? `<div class="space-y-3"><h3 class="text-xs tracking-widest uppercase text-[#685b5f] font-bold">Descri\xE7\xE3o</h3><p class="text-[#524345] leading-relaxed text-lg font-light whitespace-pre-line">${esc(product.description)}</p></div>` : ""}

            <div class="flex items-center gap-4">
              <span class="text-xs tracking-widest uppercase text-[#685b5f] font-bold">Quantidade</span>
              <div class="flex items-center rounded-lg overflow-hidden bg-[#f0dee3]">
                <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center text-[#6e6165] hover:bg-[#e0ccd2]"><span class="material-symbols-outlined text-[20px]">remove</span></button>
                <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center bg-transparent outline-none text-[#1c1b1b]" />
                <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center text-[#6e6165] hover:bg-[#e0ccd2]"><span class="material-symbols-outlined text-[20px]">add</span></button>
              </div>
            </div>

            <div class="flex flex-col gap-3">
              <button type="button" data-add-cart="${esc(product.id)}" style="background:linear-gradient(135deg, var(--brand,${DEFAULT_BRAND}) 0%, #ffa0b6 100%);color:#fff" class="w-full py-5 rounded-lg font-bold text-sm tracking-[0.2em] uppercase transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-3">
                <span class="material-symbols-outlined text-xl">shopping_cart</span> Adicionar ao carrinho
              </button>
              <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="relative w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors" style="background:#f0dee3;color:#6e6165">
                <span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp
              </a>
            </div>

            <div class="mt-4 p-6 bg-[#f6f3f2] rounded-xl space-y-3">
              <div class="flex items-center gap-3" style="color:var(--brand,${DEFAULT_BRAND})">
                <span class="material-symbols-outlined">payments</span>
                <h3 style="${SERIF}" class="font-bold">Pagamento & Entrega</h3>
              </div>
              <ul data-edit-perks class="text-sm text-[#524345] space-y-2">
                ${perksItemsHtml(custom, `var(--brand,${DEFAULT_BRAND})`)}
              </ul>
            </div>
          </div>
        </div>
      </div>

      ${related.length ? `<section class="mt-28">
            <h2 style="${SERIF}" class="text-3xl text-[#1c1b1b] mb-10">Tamb\xE9m pode gostar</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-16">${related.map((p) => productCard2(view, p)).join("")}</div>
          </section>` : ""}
    </main>

    ${footerHtml2(view, custom, menuLabels)}
  </div>`;
}
function renderCategory2(view, category, custom) {
  const menuLabels = menuFor2(view, custom);
  const items = filterForCategoryPage(view, category);
  const cards = listingProducts(view, category);
  const grid = cards.length ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16">${cards.map((p, i) => productCard2(view, p, { offset: i % 3 === 1 })).join("")}</div>` : `<div class="py-20 text-center text-[#685b5f]"><span class="material-symbols-outlined" style="font-size:48px;">category</span><p class="mt-2">Ainda n\xE3o h\xE1 produtos nesta categoria.</p></div>`;
  const filters = categoryFilterHtml(categoryFilterLabels(view, category), category, {
    chipClass: "text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl whitespace-nowrap transition-colors",
    chipStyle: "border:1px solid #e7dcdd;color:#685b5f;background:#fff",
    rootClass: "flex flex-wrap items-center gap-2 mb-10 min-w-0"
  });
  return `
  <div class="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b]" style="font-family:'Manrope',sans-serif">
    ${headerHtml2(view, menuLabels, custom)}
    <main class="${CONTAINER2} pt-10 pb-20 flex-grow">
      <nav class="mb-8 flex items-center gap-2 text-xs tracking-widest text-[#685b5f] uppercase">
        <a href="${esc(storeHomeHref2(view))}" class="hover:text-[color:var(--brand,${DEFAULT_BRAND})]">In\xEDcio</a>
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        <span class="text-[#1c1b1b] font-semibold">${esc(category)}</span>
      </nav>
      <div class="mb-12">
        <h1 data-cat-title style="${SERIF};color:var(--brand,${DEFAULT_BRAND})" class="text-4xl md:text-5xl tracking-tight">${esc(category)}</h1>
        <p data-cat-count class="text-[#685b5f] mt-2">${items.length} produto(s)</p>
      </div>
      ${filters}
      ${grid}
    </main>
    ${footerHtml2(view, custom, menuLabels)}
  </div>`;
}
var beautyTemplate = {
  id: "beauty",
  name: "Beauty",
  previewUrl: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?q=80&w=600",
  ready: true,
  defaultBrand: DEFAULT_BRAND,
  /**
   * Sem secções nativas. As variantes escolhidas são as de superfície tonal, a
   * par das camadas alabastro/rosa deste modelo — que não usa molduras. Fundos:
   * as duas camadas tonais da página (creme e areia).
   */
  sections: {
    variants: { info: "cartao", text: "centrado", testimonials: "cards", location: "cartao" },
    style: BLOCK_STYLE2,
    backgrounds: [{ label: "Creme", value: "#fcf9f8" }, { label: "Areia", value: "#f6f3f2" }]
  },
  render: render2,
  renderProduct: renderProduct2,
  renderCategory: renderCategory2,
  renderCheckout: renderCheckout2
};
function renderCheckout2(view, innerHtml, custom) {
  const menuLabels = menuFor2(view, custom);
  return `
  <div class="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1c1b1b]" style="font-family:'Manrope',sans-serif">
    ${headerHtml2(view, menuLabels, custom)}
    <main class="${CONTAINER2} py-8 md:py-12 flex-grow">${innerHtml}</main>
    ${footerHtml2(view, custom, menuLabels)}
  </div>`;
}

// web/templates/galeria.ts
var PER_ROW3 = 4;
var TWO_ROWS3 = 8;
var CONTAINER3 = "w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8";
var DEFAULT_PHONE3 = "+244 900 000 000";
var BLOCK_STYLE3 = {
  heading: "font-black tracking-tight text-gray-900",
  body: "text-gray-500 leading-relaxed",
  name: "font-semibold text-gray-900",
  quote: "font-medium tracking-tight text-gray-900",
  muted: "text-gray-400",
  surface: "bg-white border border-gray-100 shadow-sm",
  radius: "rounded-2xl",
  band: "bg-gray-50 border-y border-gray-100"
};
var mbLogoScale3;
var mbGridVariant3;
var SEARCH_VARS3 = "--mb-search-radius:9999px;--mb-search-h:42px;--mb-search-bg:#fff;--mb-search-border:#d1d5db;--mb-search-ink:#111827;--mb-search-ph:rgba(17,24,39,.45)";
function cardAspect3() {
  return cardAspectClass(mbGridVariant3 ?? "quadrado");
}
function storeIdentifier6(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeBase5(view) {
  return storeBasePath(storeIdentifier6(view));
}
function storeHomeHref3(view) {
  return storeHomePath(storeIdentifier6(view));
}
function productHref4(view, p) {
  return `${storeBase5(view)}/produto/${productSlugPath(p)}`;
}
function categoryHref5(view, category) {
  return `${storeBase5(view)}/categoria/${categorySlug(category)}`;
}
function cartHref4(view) {
  return `${storeBase5(view)}/carrinho`;
}
function categoriesOf3(view) {
  return headerCategories(view);
}
function menuFor3(view, custom) {
  mbLogoScale3 = custom?.logoScale;
  mbGridVariant3 = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}
function brandHtml4(view) {
  const brand = view.header.brand;
  if (brand.kind === "logo") {
    return `<img src="${esc(brand.url)}" alt="${esc(brand.alt)}" class="w-auto object-contain" style="height:${mbLogoScale3 ?? 32}px" />`;
  }
  return `<span class="text-xl md:text-2xl font-black tracking-tight text-gray-900">${esc(view.storeName)}</span>`;
}
function footerBrandHtml4(view, custom) {
  const footerLogo = custom?.footer?.logoUrl;
  const headerLogo = view.header.brand.kind === "logo" ? view.header.brand.url : null;
  const url = footerLogo || headerLogo;
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 w-auto object-contain" />`;
  return `<span class="text-xl font-black tracking-tight text-gray-900">${esc(view.storeName)}</span>`;
}
function headerHtml3(view, _menuLabels, custom) {
  if (custom?.header?.variant) return renderHeader(custom.header.variant, view, custom, { container: CONTAINER3, brand: "var(--brand,#4f46e5)" });
  const linkCls = "hover:text-gray-900 cursor-pointer transition-colors";
  const menu = `<a href="${esc(storeHomeHref3(view))}" class="${linkCls}">In\xEDcio</a><a href="${esc(allProductsHref(view))}" class="${linkCls}">Produtos</a>`;
  const cats = categoriesOf3(view);
  const mnav = mobileMenuParts(view, CONTAINER3);
  const categoriesMenu = cats.length ? `<div class="relative group" data-categories-menu>
        <button type="button" class="flex items-center gap-0.5 hover:text-gray-900 transition-colors">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
          <div class="bg-white border border-gray-100 rounded-xl shadow-lg py-2 min-w-[180px]">
            ${cats.map((c) => `<a href="${esc(categoryHref5(view, c))}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>` : "";
  return `
    <header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100" style="${SEARCH_VARS3}">
      ${mnav.head}
      <div class="${CONTAINER3}">
        <div class="relative flex items-center justify-between gap-3 h-16">
          <div class="flex items-center gap-1 min-w-0">
            ${mnav.button}
            <a href="${esc(storeHomeHref3(view))}" data-edit-logo class="flex items-center gap-2 min-w-0">${brandHtml4(view)}</a>
          </div>
          <nav data-search-collapse class="hidden lg:flex items-center gap-7 text-sm font-medium text-gray-600">${menu}${categoriesMenu}</nav>
          <div data-search-host class="flex items-center gap-3 text-gray-700 shrink-0 min-w-0">
            <button type="button" data-search-btn class="hover:opacity-70 transition-opacity"><span class="material-symbols-outlined">search</span></button>
            <a href="${esc(cartHref4(view))}" data-cart-link class="relative inline-flex">
              <span class="material-symbols-outlined">shopping_cart</span>
              <span data-cart-count class="hidden absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,#4f46e5)"></span>
            </a>
          </div>
        </div>
      </div>
      ${mnav.panel}
    </header>`;
}
function productCard3(view, p, opts = {}) {
  const img = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />` : `<div class="absolute inset-0 flex items-center justify-center bg-gray-100"><span class="material-symbols-outlined text-gray-400 text-4xl">image</span></div>`;
  const badge = p.featured ? `<span class="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded-full" style="background:var(--brand,#4f46e5)">Destaque</span>` : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref4(view, p))}" class="group block" data-edit-product="${esc(p.id)}" data-product-category="${esc(p.category ?? "")}"${hide}>
    <div class="relative ${cardAspect3()} bg-gray-50 overflow-hidden rounded-2xl border border-gray-100 mb-3">${img}${badge}</div>
    <h3 class="text-sm font-semibold text-gray-900 line-clamp-2">${esc(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-gray-500 line-clamp-1 mt-0.5">${esc(p.description)}</p>` : ""}
    <p class="pt-1 text-sm font-bold" style="color:var(--brand,#4f46e5)">${esc(formatKz(p.price))}</p>
  </a>`;
}
var GRID_CLS3 = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8";
function sectionsArea3(view, custom) {
  const gridCls = mbGridVariant3 ? gridColsClass(mbGridVariant3) : GRID_CLS3;
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW3) : sec.products;
    const cards = items.map((p, idx) => productCard3(view, p, { hidden: !multi && idx >= TWO_ROWS3 })).join("");
    const moreRight = multi ? `<a href="${esc(sec.moreHref)}" class="text-sm font-bold flex items-center gap-1 hover:opacity-80" style="color:var(--brand,#4f46e5)">Ver mais <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>` : "";
    const moreBottom = !multi && sec.products.length > TWO_ROWS3 ? `<div class="text-center mt-10"><button type="button" data-load-more data-step="${TWO_ROWS3}" class="inline-flex items-center gap-1 border-2 font-bold px-8 py-3 rounded-full transition-colors" style="border-color:var(--brand,#4f46e5);color:var(--brand,#4f46e5)">Ver mais <span class="material-symbols-outlined text-[18px]">expand_more</span></button></div>` : "";
    const empty = items.length === 0 ? `<p class="text-gray-400 col-span-full py-8 text-center">Sem produtos nesta sec\xE7\xE3o.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-14" : ""}">
      <div data-edit-section-head class="flex items-center justify-between gap-3 mb-6">
        <h2 class="text-2xl md:text-3xl font-black tracking-tight text-gray-900 truncate">${esc(sec.title)}</h2>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}
function footerHtml3(view, custom, menuLabels) {
  if (custom?.footer?.variant) return renderFooter(custom.footer.variant, view, custom, { container: CONTAINER3, brand: "var(--brand,#4f46e5)" });
  const about = custom?.footer?.about || "A sua loja online em Angola. Produtos selecionados e entrega r\xE1pida.";
  const location2 = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE3;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="bg-gray-50 border-t border-gray-100 mt-auto">
      <div class="${CONTAINER3} py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="space-y-3">
          <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml4(view, custom)}</div>
          <p data-edit="footer.about" class="text-sm text-gray-500 max-w-xs leading-relaxed">${esc(about)}</p>
        </div>
        <div>
          <h3 class="text-sm font-bold text-gray-900 mb-4">Loja</h3>
          <ul class="space-y-2.5 text-sm">${menuLabels.map((l) => `<li><a href="${esc(storeHomeHref3(view))}" class="text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">${esc(l)}</a></li>`).join("")}</ul>
        </div>
        <div>
          <h3 class="text-sm font-bold text-gray-900 mb-4">Contacto</h3>
          <ul class="space-y-2.5 text-sm text-gray-500">
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location2)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-gray-100">
        <div class="${CONTAINER3} py-5 text-xs text-gray-400 text-center">
          ${esc(storeIdentifier6(view) + "." + STORE_APEX)} \xB7 Loja criada com <a href="${platformHomeUrl()}" style="color:var(--brand,#4f46e5)">M\xF4Bisno</a>
        </div>
      </div>
    </footer>`;
}
function render3(view, custom) {
  const menuLabels = menuFor3(view, custom);
  return `
  <div class="relative min-h-screen flex flex-col bg-white text-gray-900 font-sans overflow-x-hidden">
    ${headerHtml3(view, menuLabels, custom)}
    ${renderHero(custom?.hero?.variant, view, custom, { container: CONTAINER3, brand: "var(--brand,#4f46e5)" }, "arco")}
    <main id="produtos" class="${CONTAINER3} py-10 md:py-14">
      ${sectionsArea3(view, custom)}
    </main>
    ${blocksHtml(custom, { container: CONTAINER3, brand: "var(--brand,#4f46e5)", variant: "galeria", style: BLOCK_STYLE3 })}
    ${footerHtml3(view, custom, menuLabels)}
  </div>`;
}
function renderProduct3(view, product, custom) {
  const menuLabels = menuFor3(view, custom);
  if (custom?.productPage?.variant) {
    return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml3(view, menuLabels, custom)}
    ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER3, brand: "var(--brand,#4f46e5)" })}
    ${footerHtml3(view, custom, menuLabels)}
  </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  const crumbCategory = product.category ? `<a href="${esc(categoryHref5(view, product.category))}" class="hover:text-gray-900">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[16px]">chevron_right</span>` : "";
  return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml3(view, menuLabels, custom)}
    <main class="${CONTAINER3} py-6 md:py-10 flex-grow">
      <nav class="text-sm text-gray-500 mb-6 flex items-center gap-1.5 flex-wrap">
        <a href="${esc(storeHomeHref3(view))}" class="hover:text-gray-900">In\xEDcio</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${crumbCategory}
        <span class="text-gray-900 font-medium truncate">${esc(product.name)}</span>
      </nav>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        ${productGalleryHtml(product, custom, { stageClass: "aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100", imgClass: "w-full h-full object-cover", brand: "var(--brand,#4f46e5)" })}
        <div class="flex flex-col">
          <h1 class="text-3xl md:text-4xl font-black tracking-tight leading-tight">${esc(product.name)}</h1>
          <p data-product-price class="mt-3 text-3xl font-bold" style="color:var(--brand,#4f46e5)">${esc(formatKz(product.price))}</p>
          ${product.description ? `<p class="mt-6 text-gray-600 leading-relaxed whitespace-pre-line">${esc(product.description)}</p>` : `<p class="mt-6 text-gray-400 italic">Sem descri\xE7\xE3o.</p>`}
          ${variationPickerHtml(product, custom, {
    labelClass: "text-sm font-medium text-gray-700",
    valueClass: "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    noteClass: "text-sm font-medium"
  })}
          <div class="mt-8 flex items-center gap-4">
            <span class="text-sm font-medium text-gray-700">Quantidade</span>
            <div class="flex items-center border border-gray-300 rounded-xl overflow-hidden">
              <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none border-x border-gray-300" />
              <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
          </div>
          <div class="mt-8 flex flex-col sm:flex-row gap-3">
            <button type="button" data-add-cart="${esc(product.id)}" style="background:var(--brand,#4f46e5);color:#fff" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity">
              <span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho
            </button>
            <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="flex-1 inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-xl border border-gray-300 text-gray-900 hover:bg-gray-50 transition-colors">
              <span class="material-symbols-outlined text-[20px]">chat</span> Comprar via WhatsApp
            </a>
          </div>
          <ul data-edit-perks class="mt-8 space-y-2 text-sm text-gray-600 border-t border-gray-100 pt-6">
            ${perksItemsHtml(custom, "var(--brand,#4f46e5)")}
          </ul>
        </div>
      </div>
      ${related.length ? `<section class="mt-16">
            <h2 class="text-2xl md:text-3xl font-black tracking-tight mb-6">Tamb\xE9m pode gostar</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">${related.map((p) => productCard3(view, p)).join("")}</div>
          </section>` : ""}
    </main>
    ${footerHtml3(view, custom, menuLabels)}
  </div>`;
}
function renderCategory3(view, category, custom) {
  const menuLabels = menuFor3(view, custom);
  const items = filterForCategoryPage(view, category);
  const cards = listingProducts(view, category);
  const grid = cards.length ? `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">${cards.map((p) => productCard3(view, p)).join("")}</div>` : `<div class="py-16 text-center text-gray-500">
        <span class="material-symbols-outlined" style="font-size:48px;">category</span>
        <p class="mt-2">Ainda n\xE3o h\xE1 produtos nesta categoria.</p>
       </div>`;
  const filters = categoryFilterHtml(categoryFilterLabels(view, category), category, {
    chipClass: "text-sm font-semibold px-4 py-2 rounded-full whitespace-nowrap transition-colors",
    chipStyle: "border:1px solid #e5e7eb;color:#374151;background:#fff",
    rootClass: "flex flex-wrap items-center gap-2 mb-8 min-w-0"
  });
  return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml3(view, menuLabels, custom)}
    <main class="${CONTAINER3} py-8 md:py-12 flex-grow">
      <nav class="text-sm text-gray-500 mb-6 flex items-center gap-1.5">
        <a href="${esc(storeHomeHref3(view))}" class="hover:text-gray-900">In\xEDcio</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span class="text-gray-900 font-medium">${esc(category)}</span>
      </nav>
      <div class="flex items-center gap-3 mb-8">
        <h1 data-cat-title class="text-3xl md:text-4xl font-black tracking-tight">${esc(category)}</h1>
        <span data-cat-count class="text-sm text-gray-400">${items.length} produto(s)</span>
      </div>
      ${filters}
      ${grid}
    </main>
    ${footerHtml3(view, custom, menuLabels)}
  </div>`;
}
var galeriaTemplate = {
  id: "galeria",
  name: "Galeria",
  previewUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600",
  ready: true,
  defaultBrand: "#4f46e5",
  /**
   * Sem secções nativas. `testimonials: "editorial"` é o desenho que este
   * modelo já produzia para os blocos gravados sem variante (`variant:
   * "galeria"` no `BlockCtx`) — as secções novas levam-no gravado.
   *
   * Fundos: os cinzentos `gray-50`/`gray-100` do rodapé e das molduras.
   */
  sections: {
    variants: { info: "lado", text: "centrado", testimonials: "editorial", location: "estilizado" },
    style: BLOCK_STYLE3,
    backgrounds: [{ label: "Cinza claro", value: "#f9fafb" }, { label: "Cinza", value: "#f3f4f6" }]
  },
  render: render3,
  renderProduct: renderProduct3,
  renderCategory: renderCategory3,
  renderCheckout: renderCheckout3
};
function renderCheckout3(view, innerHtml, custom) {
  const menuLabels = menuFor3(view, custom);
  return `
  <div class="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
    ${headerHtml3(view, menuLabels, custom)}
    <main class="${CONTAINER3} py-8 md:py-12 flex-grow">${innerHtml}</main>
    ${footerHtml3(view, custom, menuLabels)}
  </div>`;
}

// web/templates/lumiere.ts
var CONTAINER4 = "w-full max-w-[1280px] mx-auto px-5 md:px-16";
var DEFAULT_PHONE4 = "+244 900 000 000";
var HERO_FALLBACK4 = "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=1600";
var STYLE = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600&display=swap');
  .lx-root{font-family:'Montserrat',sans-serif;color:#1c1b1b;background:#fcf9f8}
  .lx-root :is(h1,h2,h3),.lx-root .lx-serif{font-family:'Playfair Display',serif !important;font-weight:400}
  .lx-root .lx-body{font-family:'Montserrat',sans-serif}
  .lx-track{letter-spacing:.16em}
  .lx-glass{background:rgba(252,249,248,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .lx-root .material-symbols-outlined{font-family:'Material Symbols Outlined' !important}
  .lx-noscroll{scrollbar-width:none;-ms-overflow-style:none}
  .lx-noscroll::-webkit-scrollbar{display:none}
  /* Pesquisa: cantos RETOS e Montserrat, como o resto do modelo. Nem os chips de
     categoria levam raio aqui, e a pesquisa n\xE3o \xE9 excep\xE7\xE3o. */
  .lx-root{--mb-search-radius:2px;--mb-search-h:42px;--mb-search-bg:#fcf9f8;--mb-search-border:rgba(28,27,27,.2);--mb-search-ink:#1c1b1b;--mb-search-ph:rgba(70,71,66,.6);--mb-search-font:'Montserrat',sans-serif}
</style>`;
var mbGridVariant4;
var mbLogoScale4;
var BLOCK_STYLE4 = {
  heading: "lx-serif",
  headingStyle: "color:#1c1b1b",
  body: "lx-body font-light leading-relaxed",
  bodyStyle: "color:#464742",
  muted: "lx-body",
  mutedStyle: "color:#777871",
  surface: "border border-black/5",
  surfaceStyle: "background:#fcf9f8",
  radius: "",
  band: "",
  bandStyle: "background:#f6f3f2"
};
function storeIdentifier7(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeBase6(view) {
  return storeBasePath(storeIdentifier7(view));
}
function homeHref4(view) {
  return storeHomePath(storeIdentifier7(view));
}
function productHref5(view, p) {
  return `${storeBase6(view)}/produto/${productSlugPath(p)}`;
}
function categoryHref6(view, c) {
  return `${storeBase6(view)}/categoria/${categorySlug(c)}`;
}
function cartHref5(view) {
  return `${storeBase6(view)}/carrinho`;
}
function menuFor4(view, custom) {
  mbLogoScale4 = custom?.logoScale;
  mbGridVariant4 = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}
function brandHtml5(view) {
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${mbLogoScale4 ?? 34}px" />`;
  }
  return `<span class="lx-serif text-xl md:text-2xl" style="color:#1c1b1b;text-transform:uppercase;letter-spacing:.22em">${esc(view.storeName)}</span>`;
}
function headerHtml4(view) {
  const cats = headerCategories(view);
  const mnav = mobileMenuParts(view, CONTAINER4);
  const linkCls = "lx-body lx-track uppercase text-[12px] font-semibold hover:opacity-60 transition-opacity";
  const links = `<a href="${esc(homeHref4(view))}" class="${linkCls}" style="color:#464742">In\xEDcio</a><a href="${esc(allProductsHref(view))}" class="${linkCls}" style="color:#464742">Produtos</a>`;
  const catsMenu = cats.length ? `<div class="relative group" data-categories-menu>
        <button type="button" class="lx-body lx-track uppercase text-[12px] font-semibold flex items-center gap-0.5 hover:opacity-60 transition-opacity" style="color:#464742">Categorias <span class="material-symbols-outlined text-[16px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
          <div class="bg-white border border-black/5 rounded-sm shadow-xl py-2 min-w-[190px]">
            ${cats.map((c) => `<a href="${esc(categoryHref6(view, c))}" class="block px-4 py-2 text-sm hover:bg-black/[.03] transition-colors lx-body" style="color:#1c1b1b">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>` : "";
  const icons = `<div data-search-host class="flex items-center gap-1 shrink-0 min-w-0">
      <button type="button" data-search-btn class="p-2 rounded-full hover:bg-black/5 transition-colors" style="color:#1c1b1b"><span class="material-symbols-outlined">search</span></button>
      <a href="${esc(cartHref5(view))}" data-cart-link class="relative inline-flex p-2 rounded-full hover:bg-black/5 transition-colors" style="color:#1c1b1b">
        <span class="material-symbols-outlined">shopping_bag</span>
        <span data-cart-count class="hidden absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white" style="background:var(--brand,#1c1b1b)"></span>
      </a>
    </div>`;
  return `
    <header class="sticky top-0 z-50 lx-glass border-b border-black/5">
      ${mnav.head}
      <div class="${CONTAINER4}">
        <div class="flex items-center justify-between h-[76px] gap-4">
          <div class="flex items-center gap-1 min-w-0">
            ${mnav.button}
            <a href="${esc(homeHref4(view))}" data-edit-logo class="flex items-center min-w-0">${brandHtml5(view)}</a>
          </div>
          <nav data-search-collapse class="hidden lg:flex items-center gap-8">${links}${catsMenu}</nav>
          ${icons}
        </div>
      </div>
      ${mnav.panel}
    </header>`;
}
function heroHtml(view, custom) {
  const title = custom?.hero?.title || "A ess\xEAncia do luxo silencioso.";
  const subtitle = custom?.hero?.subtitle || "Descubra a nossa cole\xE7\xE3o bot\xE2nica, formulada com extratos raros para revelar o seu brilho natural.";
  const cta = custom?.hero?.ctaLabel || "Explorar cole\xE7\xE3o";
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK4;
  const ctaTarget = custom?.hero?.ctaTarget?.trim();
  const ctaHref = ctaTarget ? categoryHref6(view, ctaTarget) : "#produtos";
  return `
  <section class="${CONTAINER4} pt-12 md:pt-16 pb-16 md:pb-24">
    <div class="flex flex-col md:flex-row items-stretch gap-10 md:gap-12">
      <div class="flex-1 flex flex-col justify-center md:pr-8">
        <h1 data-edit="hero.title" class="lx-serif text-4xl md:text-6xl leading-[1.08] mb-6" style="color:#1c1b1b">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="lx-body text-lg font-light leading-relaxed mb-10 max-w-md" style="color:#464742">${esc(subtitle)}</p>
        <div class="flex items-center gap-6 flex-wrap">
          <a href="${esc(ctaHref)}" data-hero-cta class="lx-body lx-track uppercase text-[12px] font-semibold px-8 py-4 hover:opacity-90 transition-opacity" style="background:var(--brand,#1c1b1b);color:var(--brand-ink,#fff)"><span data-edit="hero.ctaLabel">${esc(cta)}</span></a>
          <a href="${esc(ctaHref)}" class="lx-body lx-track uppercase text-[12px] font-semibold underline underline-offset-8 decoration-1 hover:opacity-60 transition-opacity" style="color:#1c1b1b">Ver mais</a>
        </div>
      </div>
      <div class="flex-1 relative">
        <div data-edit-hero class="w-full h-[52vh] md:h-[78vh] overflow-hidden" style="background:#f6f3f2;box-shadow:0 30px 60px -15px rgba(28,27,27,.08);border-radius:2px">
          <img src="${esc(img)}" alt="" class="w-full h-full object-cover hover:scale-105 transition-transform duration-[1800ms] ease-out" />
        </div>
        <div class="absolute -bottom-6 -left-4 md:-left-10 bg-[#fcf9f8] p-6 md:p-8 hidden md:block w-60" style="box-shadow:0 20px 40px -10px rgba(28,27,27,.06)">
          <p class="lx-body lx-track uppercase text-[11px] mb-1" style="color:#464742">Em destaque</p>
          <p class="lx-serif text-2xl" style="color:#1c1b1b">${esc(view.storeName)}</p>
        </div>
      </div>
    </div>
  </section>`;
}
function cardAspect4() {
  return cardAspectClass(mbGridVariant4 ?? "retrato");
}
function productCard4(view, p, opts = {}) {
  const img = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out" />` : `<div class="absolute inset-0 flex items-center justify-center" style="background:#f9f7f2"><span class="material-symbols-outlined text-4xl" style="color:#c7c7bf">image</span></div>`;
  const badge = p.featured ? `<div class="absolute top-4 left-4 z-10 px-3 py-1 lx-body lx-track uppercase text-[11px]" style="background:#E5D3C0;color:#1c1b1b">Destaque</div>` : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref5(view, p))}" class="group block" data-edit-product="${esc(p.id)}" data-product-category="${esc(p.category ?? "")}"${hide}>
    <div class="relative ${cardAspect4()} overflow-hidden mb-5" style="background:#f9f7f2;border-radius:2px">${img}${badge}</div>
    <div class="text-center">
      <h3 class="lx-serif text-xl mb-1" style="color:#1c1b1b">${esc(p.name)}</h3>
      ${p.category ? `<p class="lx-body lx-track uppercase text-[11px] mb-2" style="color:#464742">${esc(p.category)}</p>` : ""}
      <p class="lx-body text-sm" style="color:var(--brand,#1c1b1b)">${esc(formatKz(p.price))}</p>
    </div>
  </a>`;
}
var PER_ROW4 = 4;
var TWO_ROWS4 = 8;
function sectionsArea4(view, custom) {
  const gridCls = mbGridVariant4 ? gridColsClass(mbGridVariant4) : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8";
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW4) : sec.products;
    const cards = items.map((p, idx) => productCard4(view, p, { hidden: !multi && idx >= TWO_ROWS4 })).join("");
    const moreRight = multi ? `<a href="${esc(sec.moreHref)}" class="lx-body lx-track uppercase text-[12px] font-semibold hover:opacity-60 transition-opacity" style="color:#1c1b1b">Ver tudo</a>` : "";
    const moreBottom = !multi && sec.products.length > TWO_ROWS4 ? `<div class="text-center mt-12"><button type="button" data-load-more data-step="${TWO_ROWS4}" class="lx-body lx-track uppercase text-[12px] font-semibold border px-8 py-3 hover:bg-black/[.03] transition-colors" style="border-color:rgba(28,27,27,.3);color:#1c1b1b">Ver mais</button></div>` : "";
    const empty = items.length === 0 ? `<p class="col-span-full py-8 text-center lx-body" style="color:#777871">Sem produtos nesta sec\xE7\xE3o.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-20" : ""}">
      <div data-edit-section-head class="flex items-end justify-between gap-3 mb-10">
        <h2 class="lx-serif text-3xl md:text-4xl" style="color:#1c1b1b">${esc(sec.title)}</h2>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}
function footerBrandHtml5(view, custom) {
  const footerLogo = custom?.footer?.logoUrl;
  const headerLogo = view.header.brand.kind === "logo" ? view.header.brand.url : null;
  const url = footerLogo || headerLogo;
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 w-auto object-contain" />`;
  return `<span class="lx-serif text-2xl" style="color:#1c1b1b;text-transform:uppercase;letter-spacing:.22em">${esc(view.storeName)}</span>`;
}
function footerHtml4(view, custom, labels) {
  const about = custom?.footer?.about || "Elevamos o ritual da beleza atrav\xE9s do luxo minimalista e de bot\xE2nicos potentes.";
  const location2 = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE4;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  const extraTitle = custom?.footer?.extraTitle || "Compras seguras";
  const extraText = custom?.footer?.extraText || "Entrega em toda Angola, pagamento por Multicaixa ou na entrega, e apoio pelo WhatsApp.";
  return `
    <footer class="mt-auto" style="background:#f6f3f2">
      <div class="${CONTAINER4} py-16 md:py-24 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div class="md:col-span-1">
          <div data-edit-footer-logo class="relative inline-block mb-5">${footerBrandHtml5(view, custom)}</div>
          <p data-edit="footer.about" class="lx-body font-light leading-relaxed max-w-xs" style="color:#464742">${esc(about)}</p>
        </div>
        <div>
          <h3 class="lx-body lx-track uppercase text-[12px] font-semibold mb-5" style="color:#1c1b1b">Explorar</h3>
          <ul class="space-y-3">${labels.map((l) => `<li><a href="${esc(homeHref4(view))}" class="lx-body hover:opacity-60 transition-opacity" style="color:#464742">${esc(l)}</a></li>`).join("")}</ul>
        </div>
        <div>
          <h3 class="lx-body lx-track uppercase text-[12px] font-semibold mb-5" style="color:#1c1b1b">Contacto</h3>
          <ul class="space-y-3">
            <li class="lx-body" style="color:#464742"><span data-edit="footer.location">${esc(location2)}</span></li>
            <li class="lx-body" style="color:#464742"><span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="lx-body" style="color:#464742"><span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
        <div>
          <h3 data-edit="footer.extraTitle" class="lx-body lx-track uppercase text-[12px] font-semibold mb-5" style="color:#1c1b1b">${esc(extraTitle)}</h3>
          <p data-edit="footer.extraText" class="lx-body font-light mb-3" style="color:#464742">${esc(extraText)}</p>
        </div>
      </div>
      <div class="border-t border-black/5">
        <div class="${CONTAINER4} py-6 lx-body lx-track uppercase text-[11px] text-center" style="color:#777871">
          ${esc(storeIdentifier7(view) + "." + STORE_APEX)} \xB7 Loja criada com <a href="${platformHomeUrl()}" style="color:var(--brand,#1c1b1b)">M\xF4Bisno</a>
        </div>
      </div>
    </footer>`;
}
function cx2(custom, path, fallback) {
  const parts = path.split(".");
  let o = custom;
  for (const p of parts) {
    if (o == null || typeof o !== "object") return fallback;
    o = o[p];
  }
  return typeof o === "string" && o.trim() ? o : fallback;
}
function testimonialSection(custom) {
  const list = custom?.testimonials && custom.testimonials.length ? custom.testimonials : [{ quote: "A textura \xE9 uma experi\xEAncia de calma no meu ritual di\xE1rio. Verdadeiramente transformadora.", author: "Am\xE9lia R.", role: "Cliente verificada" }];
  const slides = list.map((t, i) => `
    <div data-lx-slide="${i}" class="${i === 0 ? "" : "hidden"}">
      <p data-edit="testimonials.${i}.quote" class="lx-serif text-2xl md:text-3xl leading-relaxed max-w-3xl mx-auto" style="color:#1c1b1b">${esc(t.quote ?? "")}</p>
      <div class="mt-8">
        <p data-edit="testimonials.${i}.author" class="lx-body lx-track uppercase text-[12px] font-semibold mb-1" style="color:#1c1b1b">${esc(t.author ?? "")}</p>
        <p data-edit="testimonials.${i}.role" class="lx-body text-sm" style="color:#464742">${esc(t.role || "Cliente verificada")}</p>
      </div>
    </div>`).join("");
  const dots = list.map((_, i) => `<button type="button" data-lx-dot="${i}" aria-label="Testemunho ${i + 1}" class="w-2 h-2 rounded-full transition-colors" style="background:${i === 0 ? "#5e5e5b" : "#c8c6c2"}"></button>`).join("");
  const arrows = list.length > 1 ? `<button type="button" data-lx-prev aria-label="Anterior" class="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center hover:opacity-60 transition-opacity" style="color:#1c1b1b"><span class="material-symbols-outlined">chevron_left</span></button>
       <button type="button" data-lx-next aria-label="Seguinte" class="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center hover:opacity-60 transition-opacity" style="color:#1c1b1b"><span class="material-symbols-outlined">chevron_right</span></button>` : "";
  return `
  <section style="background:#f6f3f2" class="py-20 md:py-28" data-lx-testi>
    <div class="${CONTAINER4} text-center relative">
      <span class="material-symbols-outlined text-4xl mb-6" style="color:#c8c6c2">format_quote</span>
      <div data-lx-testi-track>${slides}</div>
      <div class="flex justify-center gap-3 mt-12" data-lx-dots>${dots}</div>
      ${arrows}
    </div>
  </section>`;
}
function boutiquesSection(custom) {
  const title = cx2(custom, "lumiere.boutiquesTitle", "As nossas lojas");
  const list = custom?.lumiere?.boutiques ?? [];
  if (list.length) {
    const gridCls = list.length === 1 ? "grid grid-cols-1 max-w-3xl mx-auto" : "grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10";
    const cards = list.map((b, i) => {
      const name = (b.name ?? "").trim();
      const address = (b.address ?? "").trim() || "Luanda, Angola";
      return `<div data-boutique="${i}" class="flex flex-col">
        <div class="w-full overflow-hidden rounded-xl" style="box-shadow:0 24px 50px -20px rgba(28,27,27,.12)">
          <iframe title="Mapa ${esc(name || address)}" src="${esc(mapEmbedSrc(b))}" class="w-full block" style="height:300px;border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
        </div>
        <div class="text-center mt-4">
          <p data-edit="lumiere.boutiques.${i}.name" class="lx-serif text-xl mb-1" style="color:#1c1b1b">${esc(name)}</p>
          <address data-edit="lumiere.boutiques.${i}.address" class="not-italic lx-body text-sm" style="color:#464742">${esc(address)}</address>
        </div>
      </div>`;
    }).join("");
    return `
  <section class="${CONTAINER4} py-20 md:py-28" data-lx-boutiques>
    <h2 data-edit="lumiere.boutiquesTitle" class="lx-serif text-3xl md:text-4xl text-center mb-12" style="color:#1c1b1b">${esc(title)}</h2>
    <div class="${gridCls}" data-boutiques-grid>${cards}</div>
  </section>`;
  }
  const location2 = cx2(custom, "footer.location", "Luanda, Angola");
  const mapSrc = mapEmbedSrc({ address: location2 });
  return `
  <section class="${CONTAINER4} py-20 md:py-28" data-lx-boutiques>
    <h2 data-edit="lumiere.boutiquesTitle" class="lx-serif text-3xl md:text-4xl text-center mb-12" style="color:#1c1b1b">${esc(title)}</h2>
    <div class="flex flex-col items-center gap-8" data-boutiques-grid>
      <div class="w-full max-w-3xl overflow-hidden rounded-xl" style="box-shadow:0 30px 60px -15px rgba(28,27,27,.08)">
        <iframe title="Mapa das lojas" src="${esc(mapSrc)}" class="w-full block" style="height:380px;border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
      </div>
      <div class="text-center">
        <p class="lx-body lx-track uppercase text-[12px] font-semibold mb-2" style="color:#1c1b1b">Visite-nos</p>
        <address data-edit="footer.location" class="not-italic lx-body text-lg" style="color:#464742">${esc(location2)}</address>
      </div>
    </div>
  </section>`;
}
function productGallery(_view, product, custom) {
  return productGalleryHtml(product, custom, {
    stageClass: "aspect-[4/5] overflow-hidden",
    stageStyle: "background:#f6f3f2;border-radius:2px",
    imgClass: "object-cover w-full h-full transition-transform duration-700 hover:scale-105",
    brand: "var(--brand,#1c1b1b)",
    thumbsClass: "mt-3 grid grid-cols-5 gap-2"
  });
}
function render4(view, custom) {
  const labels = menuFor4(view, custom);
  return `${STYLE}
  <div class="lx-root relative min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml4(view)}
    ${heroHtml(view, custom)}
    <main id="produtos" class="${CONTAINER4} pb-20 md:pb-28">
      ${sectionsArea4(view, custom)}
    </main>
    ${blocksHtml(custom, { container: CONTAINER4, brand: "var(--brand,#1c1b1b)", variant: "galeria", style: BLOCK_STYLE4 })}
    <div data-lumiere-slot="testimonials">${custom?.lumiere?.hideTestimonials ? "" : testimonialSection(custom)}</div>
    <div data-lumiere-slot="boutiques">${custom?.lumiere?.hideBoutiques ? "" : boutiquesSection(custom)}</div>
    ${footerHtml4(view, custom, labels)}
  </div>`;
}
function renderProduct4(view, product, custom) {
  const labels = menuFor4(view, custom);
  if (custom?.productPage?.variant) {
    return `${STYLE}<div class="lx-root min-h-screen flex flex-col overflow-x-hidden">
      ${headerHtml4(view)}
      ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER4, brand: "var(--brand,#1c1b1b)" })}
      ${footerHtml4(view, custom, labels)}
    </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  const badge = product.featured ? `<span class="inline-block px-3 py-1 lx-body lx-track uppercase text-[11px] mb-4" style="background:#E5D3C0;color:#1c1b1b">Destaque</span>` : "";
  return `${STYLE}
  <div class="lx-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml4(view)}
    <main class="${CONTAINER4} pt-10 md:pt-16 pb-20 flex-grow">
      <nav class="lx-body text-sm mb-8 flex items-center gap-1.5 flex-wrap" style="color:#777871">
        <a href="${esc(homeHref4(view))}" class="hover:opacity-60">In\xEDcio</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${product.category ? `<a href="${esc(categoryHref6(view, product.category))}" class="hover:opacity-60">${esc(product.category)}</a><span class="material-symbols-outlined text-[16px]">chevron_right</span>` : ""}
        <span style="color:#1c1b1b">${esc(product.name)}</span>
      </nav>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-20 items-start">
        ${productGallery(view, product, custom)}
        <div class="flex flex-col md:sticky md:top-28 md:px-2">
          ${badge}
          <h1 class="lx-serif text-4xl md:text-5xl mb-3" style="color:#1c1b1b">${esc(product.name)}</h1>
          <p data-product-price class="lx-serif text-2xl mb-6" style="color:var(--brand,#1c1b1b)">${esc(formatKz(product.price))}</p>
          ${product.description ? `<p class="lx-body font-light leading-relaxed mb-8 whitespace-pre-line" style="color:#464742">${esc(product.description)}</p>` : `<p class="lx-body italic mb-8" style="color:#777871">Sem descri\xE7\xE3o.</p>`}
          <!-- Varia\xE7\xF5es: cantos RETOS e tipografia lx-body, como o resto do modelo (MODELO-GUIA \xA70.2) -->
          ${variationPickerHtml(product, custom, {
    labelClass: "lx-body lx-track uppercase text-[12px] font-semibold",
    labelStyle: "color:#1c1b1b",
    valueClass: "inline-flex items-center gap-1.5 px-4 py-2.5 border lx-body lx-track uppercase text-[12px] font-semibold hover:bg-black/[.03] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    valueStyle: "border-color:rgba(28,27,27,.2);color:#1c1b1b",
    selectedStyle: "background:var(--brand,#1c1b1b);color:var(--brand-ink,#fff);border-color:var(--brand,#1c1b1b)",
    noteClass: "lx-body text-sm",
    rootClass: "flex flex-col gap-4 mb-8 min-w-0"
  })}
          <div class="flex items-center gap-4 mb-8">
            <span class="lx-body lx-track uppercase text-[12px] font-semibold" style="color:#1c1b1b">Quantidade</span>
            <div class="flex items-center border" style="border-color:rgba(28,27,27,.2)">
              <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center hover:bg-black/5" style="color:#1c1b1b"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none border-x lx-body" style="border-color:rgba(28,27,27,.2);background:transparent" />
              <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center hover:bg-black/5" style="color:#1c1b1b"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-3">
            <button type="button" data-add-cart="${esc(product.id)}" class="flex-1 inline-flex items-center justify-center gap-2 lx-body lx-track uppercase text-[12px] font-semibold px-6 py-4 hover:opacity-90 transition-opacity" style="background:var(--brand,#1c1b1b);color:var(--brand-ink,#fff)"><span class="material-symbols-outlined text-[18px]">shopping_bag</span> Adicionar ao carrinho</button>
            <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="flex-1 inline-flex items-center justify-center gap-2 lx-body lx-track uppercase text-[12px] font-semibold px-6 py-4 border hover:bg-black/[.03] transition-colors" style="border-color:#1c1b1b;color:#1c1b1b"><span class="material-symbols-outlined text-[18px]">chat</span> WhatsApp</a>
          </div>
          <ul data-edit-perks class="mt-8 space-y-2 lx-body text-sm border-t pt-6" style="color:#464742;border-color:rgba(28,27,27,.1)">
            ${perksItemsHtml(custom, "var(--brand,#1c1b1b)")}
          </ul>
        </div>
      </div>
      ${related.length ? `<section data-related class="mt-24">
            <h2 class="lx-serif text-3xl md:text-4xl mb-10 text-center" style="color:#1c1b1b">Tamb\xE9m pode gostar</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">${related.map((p) => productCard4(view, p)).join("")}</div>
          </section>` : ""}
    </main>
    ${footerHtml4(view, custom, labels)}
  </div>`;
}
function renderCategory4(view, category, custom) {
  const labels = menuFor4(view, custom);
  const items = filterForCategoryPage(view, category);
  const cards = listingProducts(view, category);
  const grid = cards.length ? `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">${cards.map((p) => productCard4(view, p)).join("")}</div>` : `<div class="py-16 text-center lx-body" style="color:#777871"><span class="material-symbols-outlined" style="font-size:48px">category</span><p class="mt-2">Ainda n\xE3o h\xE1 produtos nesta categoria.</p></div>`;
  const filters = categoryFilterHtml(categoryFilterLabels(view, category), category, {
    chipClass: "lx-body lx-track uppercase text-[11px] px-4 py-2.5 whitespace-nowrap transition-colors",
    chipStyle: "border:1px solid #e2e0d8;color:#464742;background:transparent",
    rootClass: "flex flex-wrap items-center gap-2 mb-10 min-w-0"
  });
  return `${STYLE}
  <div class="lx-root min-h-screen flex flex-col">
    ${headerHtml4(view)}
    <main class="${CONTAINER4} pt-10 md:pt-14 pb-20 flex-grow">
      <nav class="lx-body text-sm mb-8 flex items-center gap-1.5" style="color:#777871">
        <a href="${esc(homeHref4(view))}" class="hover:opacity-60">In\xEDcio</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span style="color:#1c1b1b">${esc(category)}</span>
      </nav>
      <div class="flex items-end gap-3 mb-10">
        <h1 data-cat-title class="lx-serif text-4xl md:text-5xl" style="color:#1c1b1b">${esc(category)}</h1>
        <span data-cat-count class="lx-body text-sm" style="color:#777871">${items.length} produto(s)</span>
      </div>
      ${filters}
      ${grid}
    </main>
    ${footerHtml4(view, custom, labels)}
  </div>`;
}
function renderCheckout4(view, innerHtml, custom) {
  const labels = menuFor4(view, custom);
  return `${STYLE}
  <div class="lx-root min-h-screen flex flex-col">
    ${headerHtml4(view)}
    <main class="${CONTAINER4} py-10 md:py-16 flex-grow">${innerHtml}</main>
    ${footerHtml4(view, custom, labels)}
  </div>`;
}
var lumiereTemplate = {
  id: "lumiere",
  name: "Lumi\xE8re Chic",
  previewUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=600",
  ready: true,
  defaultBrand: "#1c1b1b",
  /**
   * Testemunhos e mapa são **nativos** deste modelo: o carrossel editorial
   * (`data-lx-testi`, alimentado por `custom.testimonials`) e «As nossas lojas»
   * (`lumiere.boutiques[]`). Já estão no ecrã e editam-se lá — oferecê-los no
   * «Adicionar secção» era convidar o Dono a duplicar o que tem, e foi o defeito
   * reportado. Cada um esconde-se com `lumiere.hideTestimonials` /
   * `lumiere.hideBoutiques`, não removendo a secção acrescentada.
   *
   * As duas que restam desenham-se com as variantes de cantos retos e
   * composição editorial, coerentes com o resto do modelo. Fundos: o creme da
   * página e a areia das faixas (testemunhos, rodapé).
   */
  sections: {
    native: ["testimonials", "location"],
    allowed: ["info", "text"],
    variants: { info: "lado", text: "linha" },
    style: BLOCK_STYLE4,
    backgrounds: [{ label: "Creme", value: "#fcf9f8" }, { label: "Areia", value: "#f6f3f2" }]
  },
  render: render4,
  renderProduct: renderProduct4,
  renderCategory: renderCategory4,
  renderCheckout: renderCheckout4
};

// web/templates/techEssentials.ts
var PER_ROW5 = 4;
var TWO_ROWS5 = 8;
var CANVAS = "#f8f9ff";
var GREY_BAND = "#f1f2f6";
var GREY_MARK = "#4b5563";
var CARD = "#ffffff";
var TONE_LOW = "#eff4ff";
var TONE = "#e5eeff";
var TONE_HIGH = "#dce9ff";
var INK = "#0b1c30";
var INK_SOFT = "#45464d";
var LINE = "rgba(198,198,205,.5)";
var OUTLINE = "#76777d";
var ACTION = "#0058be";
var SHADOW_1 = "0 4px 20px rgba(15,23,42,.05)";
var SHADOW_2 = "0 10px 40px rgba(15,23,42,.12)";
var BRAND = `var(--brand,${ACTION})`;
var BRAND_INK = "var(--brand-ink,#fff)";
var CONTAINER5 = "w-full max-w-[1280px] mx-auto px-4 md:px-16";
var HERO_FALLBACK5 = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1600";
var DEFAULT_PHONE5 = "+244 900 000 000";
var DEFAULT_SUBTITLE3 = "Equipamento escolhido a dedo, com garantia e entrega em toda Angola. Compre com a confian\xE7a de quem conhece o que vende.";
var DEFAULT_CTA3 = "Ver produtos";
var BRAND_SLOTS = 4;
function brandLogo(nome, simbolo) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48" fill="none"><g fill="${GREY_MARK}">${simbolo}</g><text x="56" y="31" font-family="Inter,Arial,sans-serif" font-size="19" font-weight="700" letter-spacing="2" fill="${GREY_MARK}">${nome}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function defaultTechBrands() {
  return [
    // Processador: quadrado com pinos.
    { name: "Nexa", imageUrl: brandLogo("NEXA", '<path d="M14 14h20v20H14zM19 19h10v10H19z" fill-rule="evenodd"/><path d="M22 8h4v6h-4zM22 34h4v6h-4zM8 22h6v4H8zM34 22h6v4h-6z"/>') },
    // Auscultadores: arco com duas almofadas.
    { name: "Aura", imageUrl: brandLogo("AURA", '<path d="M10 28v-4a14 14 0 0 1 28 0v4h-4v-4a10 10 0 0 0-20 0v4z"/><rect x="8" y="26" width="7" height="13" rx="3"/><rect x="33" y="26" width="7" height="13" rx="3"/>') },
    // Rede: três nós ligados.
    { name: "Synergy", imageUrl: brandLogo("SYNERGY", '<circle cx="24" cy="12" r="5"/><circle cx="12" cy="34" r="5"/><circle cx="36" cy="34" r="5"/><path d="M23 16h2l-10 16h-2zM23 16h2l10 16h-2zM14 31h20v2H14z"/>') },
    // Armazenamento: discos empilhados.
    { name: "Quantum", imageUrl: brandLogo("QUANTUM", '<ellipse cx="24" cy="13" rx="15" ry="5"/><path d="M9 19c0 2.8 6.7 5 15 5s15-2.2 15-5v6c0 2.8-6.7 5-15 5S9 27.8 9 25z"/><path d="M9 31c0 2.8 6.7 5 15 5s15-2.2 15-5v4c0 2.8-6.7 5-15 5S9 37.8 9 35z"/>') }
  ];
}
var STYLE2 = `<style>
  .tx-root{background:${CANVAS};color:${INK};font-family:Inter,sans-serif}
  .tx-root .material-symbols-outlined{font-family:'Material Symbols Outlined' !important;font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24}
  .tx-card{background:${CARD};border:1px solid ${LINE};box-shadow:${SHADOW_1};transition:box-shadow .3s ease}
  .tx-card:hover{box-shadow:${SHADOW_2}}
  .tx-link{transition:color .2s ease}
  .tx-link:hover{color:${BRAND} !important}
  .tx-icon{transition:opacity .2s ease,color .2s ease}
  .tx-icon:hover{opacity:.75}
  .tx-menu-item:hover{background:${TONE_LOW};color:${BRAND} !important}
  .tx-outline{transition:border-color .2s ease,color .2s ease}
  .tx-outline:hover{border-color:${BRAND} !important;color:${BRAND} !important}
  .tx-brand-mark{filter:grayscale(1);opacity:.75;transition:filter .4s ease,opacity .4s ease}
  .tx-brands:hover .tx-brand-mark{filter:grayscale(1);opacity:1}
  .tx-noscroll{scrollbar-width:none;-ms-overflow-style:none}
  .tx-noscroll::-webkit-scrollbar{display:none}
  /* Pesquisa: cantos de 8px e moldura de 1px, como os controlos deste modelo. */
  .tx-root{--mb-search-radius:8px;--mb-search-h:44px;--mb-search-bg:${CARD};--mb-search-border:${LINE};--mb-search-ink:${INK};--mb-search-ph:rgba(11,28,48,.45)}
</style>`;
var mbLogoScale5;
var mbGridVariant5;
var BLOCK_STYLE5 = {
  heading: "font-semibold tracking-tight",
  headingStyle: `color:${INK}`,
  body: "leading-relaxed",
  bodyStyle: `color:${INK_SOFT}`,
  surface: "border",
  surfaceStyle: `background:${CARD};border-color:${LINE};box-shadow:${SHADOW_1}`,
  radius: "rounded-lg",
  band: "",
  bandStyle: `background:${TONE_LOW};border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}`
};
function storeIdentifier8(view) {
  return view.subdomain.split(".")[0] ?? view.subdomain;
}
function storeBase7(view) {
  return storeBasePath(storeIdentifier8(view));
}
function storeHomeHref4(view) {
  return storeHomePath(storeIdentifier8(view));
}
function productHref6(view, p) {
  return `${storeBase7(view)}/produto/${productSlugPath(p)}`;
}
function categoryHref7(view, category) {
  return `${storeBase7(view)}/categoria/${categorySlug(category)}`;
}
function cartHref6(view) {
  return `${storeBase7(view)}/carrinho`;
}
function menuFor5(view, custom) {
  mbLogoScale5 = custom?.logoScale;
  mbGridVariant5 = custom?.productGrid?.variant;
  return custom?.menu && custom.menu.length ? custom.menu : view.menu.items.map((i) => i.label);
}
function cardAspect5() {
  return cardAspectClass(mbGridVariant5 ?? "quadrado");
}
function brandHtml6(view) {
  const b = view.header.brand;
  if (b.kind === "logo") {
    return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" class="w-auto object-contain" style="height:${mbLogoScale5 ?? 32}px" />`;
  }
  return `<span class="text-headline-md font-bold tracking-tight" style="color:${INK}">${esc(view.storeName)}</span>`;
}
function footerBrandHtml6(view, custom) {
  const url = custom?.footer?.logoUrl || (view.header.brand.kind === "logo" ? view.header.brand.url : null);
  if (url) return `<img src="${esc(url)}" alt="${esc(view.storeName)}" class="h-9 w-auto object-contain" />`;
  return `<span class="text-[20px] font-black tracking-tight" style="color:${INK}">${esc(view.storeName)}</span>`;
}
function headerHtml5(view, _labels, custom) {
  if (custom?.header?.variant) return renderHeader(custom.header.variant, view, custom, { container: CONTAINER5, brand: BRAND });
  const cats = headerCategories(view);
  const mnav = mobileMenuParts(view, CONTAINER5);
  const linkCls = "tx-link text-body-md";
  const links = `<a href="${esc(storeHomeHref4(view))}" class="${linkCls}" style="color:${INK_SOFT}">In\xEDcio</a><a href="${esc(allProductsHref(view))}" class="${linkCls}" style="color:${INK_SOFT}">Produtos</a>`;
  const catsMenu = cats.length ? `<div class="relative group" data-categories-menu>
        <button type="button" class="tx-link text-body-md flex items-center gap-0.5" style="color:${INK_SOFT}">Categorias <span class="material-symbols-outlined text-[18px]">expand_more</span></button>
        <div class="absolute left-0 top-full pt-3 hidden group-hover:block z-50">
          <div class="rounded-lg py-2 min-w-[190px]" style="background:${CARD};border:1px solid ${LINE};box-shadow:${SHADOW_2}">
            ${cats.map((c) => `<a href="${esc(categoryHref7(view, c))}" class="tx-menu-item block px-4 py-2 text-label-md transition-colors" style="color:${INK}">${esc(c)}</a>`).join("")}
          </div>
        </div>
      </div>` : "";
  return `
    <nav class="sticky top-0 z-50" style="background:${CANVAS};border-bottom:1px solid ${LINE};box-shadow:0 1px 2px rgba(15,23,42,.04)">
      ${mnav.head}
      <div class="${CONTAINER5}">
        <div class="flex justify-between items-center gap-4 h-20">
          <div class="flex items-center gap-1 min-w-0">
            ${mnav.button}
            <a href="${esc(storeHomeHref4(view))}" data-edit-logo class="flex items-center min-w-0">${brandHtml6(view)}</a>
          </div>
          <div data-search-collapse class="hidden lg:flex items-center gap-6">${links}${catsMenu}</div>
          <div data-search-host class="flex items-center gap-3 shrink-0 min-w-0">
            <!-- A cor vai no PR\xD3PRIO glifo, n\xE3o no bot\xE3o: a regra da tinta global
                 acerta directamente no \xEDcone, e uma cor herdada do bot\xE3o perde
                 sempre para ela. Ver web/lib/ink.ts. -->
            <button type="button" data-search-btn aria-label="Pesquisar produtos" class="tx-icon p-1"><span class="material-symbols-outlined" style="color:${BRAND}">search</span></button>
            <a href="${esc(cartHref6(view))}" data-cart-link aria-label="Carrinho" class="tx-icon relative inline-flex p-1">
              <span class="material-symbols-outlined" style="color:${BRAND}">shopping_cart</span>
              <span data-cart-count class="hidden absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center" style="background:${BRAND};color:${BRAND_INK}"></span>
            </a>
          </div>
        </div>
      </div>
      ${mnav.panel}
    </nav>`;
}
function heroHtml2(view, custom) {
  const title = custom?.hero?.title || "Tecnologia que trabalha para si.";
  const subtitle = custom?.hero?.subtitle || DEFAULT_SUBTITLE3;
  const cta = custom?.hero?.ctaLabel || DEFAULT_CTA3;
  const img = custom?.hero?.imageUrl || view.banners[0]?.imageUrl || HERO_FALLBACK5;
  const target = custom?.hero?.ctaTarget?.trim();
  const href = target ? categoryHref7(view, target) : "#produtos";
  return `
  <section class="${CONTAINER5} py-12 md:py-20">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
      <div class="flex flex-col gap-6 z-10">
        <span class="text-label-sm uppercase tracking-widest w-fit px-3 py-1 rounded-full" style="background:${TONE_HIGH};color:${BRAND}">Nova gera\xE7\xE3o</span>
        <h1 data-edit="hero.title" class="text-[36px] md:text-display-lg font-bold tracking-tight leading-[1.15]" style="color:${INK}">${esc(title)}</h1>
        <p data-edit="hero.subtitle" class="text-body-lg max-w-md" style="color:${INK_SOFT}">${esc(subtitle)}</p>
        <div class="flex flex-wrap gap-3 mt-1">
          <a href="${esc(href)}" data-hero-cta class="inline-flex items-center gap-2 text-label-md px-4 py-3 rounded transition-opacity hover:opacity-90" style="background:${BRAND};color:${BRAND_INK};box-shadow:${SHADOW_1}"><span data-edit="hero.ctaLabel">${esc(cta)}</span> <span class="material-symbols-outlined text-[18px]">arrow_forward</span></a>
          <a href="${esc(allProductsHref(view))}" class="tx-outline inline-flex items-center text-label-md px-4 py-3 rounded" style="border:1px solid ${OUTLINE};color:${INK}">Ver cat\xE1logo</a>
        </div>
      </div>
      <div data-edit-hero class="relative w-full aspect-[4/3] rounded-xl overflow-hidden" style="background:${TONE_LOW};box-shadow:${SHADOW_2}">
        <img src="${esc(img)}" alt="" class="object-cover w-full h-full absolute inset-0" />
      </div>
    </div>
  </section>`;
}
function brandList(custom) {
  const saved = custom?.techEssentials?.brands;
  const base = Array.isArray(saved) && saved.length > 0 ? saved : defaultTechBrands();
  const out = [];
  for (let i = 0; i < BRAND_SLOTS; i++) out.push(base[i] ?? {});
  return out;
}
function materializeBrands(custom) {
  const brands = custom.techEssentials?.brands;
  if (Array.isArray(brands) && brands.length === BRAND_SLOTS) return;
  const lista = brandList(custom);
  if (!custom.techEssentials) custom.techEssentials = {};
  custom.techEssentials.brands = lista;
}
function brandsSection(custom) {
  const brands = brandList(custom);
  const cards = brands.map((b, i) => {
    const name = (b.name ?? "").trim();
    const inner = b.imageUrl ? `<img src="${esc(b.imageUrl)}" alt="${esc(name || "Marca")}" class="max-h-10 w-auto object-contain" />` : `<span data-edit="techEssentials.brands.${i}.name" class="text-[20px] font-semibold tracking-widest uppercase" style="color:${GREY_MARK}">${esc(name || "A sua marca")}</span>`;
    return `<div data-tx-brand="${i}" class="tx-brand-mark flex items-center justify-center h-14 min-w-0">${inner}</div>`;
  }).join("");
  return `<section class="tx-brands py-12" data-tx-brands style="background:${GREY_BAND};border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">
    <div class="${CONTAINER5}">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-12 items-center">${cards}</div>
    </div>
  </section>`;
}
function productCard5(view, p, opts = {}) {
  const img = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" />` : `<div class="absolute inset-0 flex items-center justify-center" style="background:${TONE_LOW}"><span class="material-symbols-outlined text-4xl" style="color:${LINE}">image</span></div>`;
  const badge = p.featured ? `<span class="absolute top-3 left-3 z-10 text-label-sm px-2 py-[2px] rounded" style="background:${BRAND};color:${BRAND_INK}">Destaque</span>` : "";
  const hide = opts.hidden ? ` data-extra style="display:none"` : "";
  return `<a href="${esc(productHref6(view, p))}" class="tx-card group rounded-lg overflow-hidden flex flex-col h-full" data-edit-product="${esc(p.id)}" data-product-category="${esc(p.category ?? "")}"${hide}>
    <div class="relative w-full ${cardAspect5()} overflow-hidden" style="background:${TONE_LOW}">${img}${badge}</div>
    <div class="p-6 flex flex-col flex-grow">
      <h3 class="text-label-md font-semibold line-clamp-2" style="color:${INK}">${esc(p.name)}</h3>
      ${p.category ? `<p class="text-label-sm mt-1" style="color:${INK_SOFT}">${esc(p.category)}</p>` : ""}
      <div class="mt-auto pt-3 flex justify-between items-center gap-2">
        <span class="text-[20px] font-semibold" style="color:${INK}">${esc(formatKz(p.price))}</span>
        <span class="p-2 rounded transition-colors" style="background:${TONE};color:${INK}"><span class="material-symbols-outlined text-[20px]">arrow_forward</span></span>
      </div>
    </div>
  </a>`;
}
var GRID_CLS4 = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6";
function sectionsArea5(view, custom) {
  const gridCls = mbGridVariant5 ? gridColsClass(mbGridVariant5) : GRID_CLS4;
  const sections = resolveSections(view, custom);
  const multi = sections.length > 1;
  const blocks = sections.map((sec, i) => {
    const items = multi ? sec.products.slice(0, PER_ROW5) : sec.products;
    const cards = items.map((p, idx) => productCard5(view, p, { hidden: !multi && idx >= TWO_ROWS5 })).join("");
    const moreRight = multi ? `<a href="${esc(sec.moreHref)}" class="tx-link text-label-md flex items-center gap-1 hover:underline shrink-0" style="color:${BRAND}">Ver tudo <span class="material-symbols-outlined text-[16px]">arrow_forward</span></a>` : "";
    const moreBottom = !multi && sec.products.length > TWO_ROWS5 ? `<div class="text-center mt-12"><button type="button" data-load-more data-step="${TWO_ROWS5}" class="tx-outline inline-flex items-center gap-1 text-label-md px-8 py-3 rounded" style="border:1px solid ${OUTLINE};color:${INK}">Ver mais <span class="material-symbols-outlined text-[18px]">expand_more</span></button></div>` : "";
    const empty = items.length === 0 ? `<p class="col-span-full py-8 text-center text-body-md" style="color:${INK_SOFT}">Sem produtos nesta sec\xE7\xE3o.</p>` : "";
    return `<section data-section data-edit-section="${i}" class="${i > 0 ? "mt-20" : ""}">
      <div data-edit-section-head class="flex justify-between items-end gap-3 mb-12 pb-3" style="border-bottom:1px solid ${LINE}">
        <h2 class="text-headline-md tracking-tight truncate" style="color:${INK}">${esc(sec.title)}</h2>
        ${moreRight}
      </div>
      <div data-section-grid data-edit-products class="${gridCls}">${cards}${empty}</div>
      ${moreBottom}
    </section>`;
  }).join("");
  return `<div data-edit-sections>${blocks}</div>`;
}
function footerHtml5(view, custom, labels) {
  if (custom?.footer?.variant) return renderFooter(custom.footer.variant, view, custom, { container: CONTAINER5, brand: BRAND });
  const about = custom?.footer?.about || "Equipamento electr\xF3nico para quem trabalha e joga a s\xE9rio. Garantia, apoio e entrega em toda Angola.";
  const location2 = custom?.footer?.location || "Luanda, Angola";
  const phone = custom?.footer?.phone || DEFAULT_PHONE5;
  const email = custom?.footer?.email || "geral@minhaloja.ao";
  return `
    <footer class="mt-20 w-full" style="background:${TONE};border-top:1px solid ${LINE}">
      <div class="${CONTAINER5} py-20 flex flex-col md:flex-row justify-between gap-8">
        <div class="flex flex-col gap-3 max-w-sm">
          <div data-edit-footer-logo class="relative inline-block">${footerBrandHtml6(view, custom)}</div>
          <p data-edit="footer.about" class="text-label-md leading-relaxed mt-1" style="color:${INK_SOFT}">${esc(about)}</p>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-label-sm uppercase tracking-wider mb-1" style="color:${INK}">Loja</span>
          <ul class="flex flex-col gap-3">${labels.map((l) => `<li><a href="${esc(storeHomeHref4(view))}" class="tx-link text-label-md" style="color:${INK_SOFT}">${esc(l)}</a></li>`).join("")}</ul>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-label-sm uppercase tracking-wider mb-1" style="color:${INK}">Contacto</span>
          <ul class="flex flex-col gap-3 text-label-md" style="color:${INK_SOFT}">
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">location_on</span> <span data-edit="footer.location">${esc(location2)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">call</span> <span data-edit="footer.phone">${esc(phone)}</span></li>
            <li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px]">mail</span> <span data-edit="footer.email">${esc(email)}</span></li>
          </ul>
        </div>
      </div>
      <div style="border-top:1px solid ${LINE}">
        <div class="${CONTAINER5} py-6 text-label-sm text-center" style="color:${INK_SOFT}">
          ${esc(storeIdentifier8(view) + "." + STORE_APEX)} \xB7 Loja criada com <a href="${platformHomeUrl()}" style="color:${BRAND}">M\xF4Bisno</a>
        </div>
      </div>
    </footer>`;
}
function render5(view, custom) {
  const labels = menuFor5(view, custom);
  const hero = custom?.hero?.variant ? renderHero(custom.hero.variant, view, custom, { container: CONTAINER5, brand: BRAND }, "split") : heroHtml2(view, custom);
  return `${STYLE2}
  <div class="tx-root relative min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml5(view, labels, custom)}
    ${hero}
    <div data-tx-slot="brands">${custom?.techEssentials?.hideBrands ? "" : brandsSection(custom)}</div>
    <main id="produtos" class="${CONTAINER5} py-20 flex-grow">
      ${sectionsArea5(view, custom)}
    </main>
    ${blocksHtml(custom, { container: CONTAINER5, brand: BRAND, style: BLOCK_STYLE5 })}
    ${footerHtml5(view, custom, labels)}
  </div>`;
}
function renderProduct5(view, product, custom) {
  const labels = menuFor5(view, custom);
  if (custom?.productPage?.variant) {
    return `${STYLE2}<div class="tx-root min-h-screen flex flex-col overflow-x-hidden">
      ${headerHtml5(view, labels, custom)}
      ${renderProductPage(custom.productPage.variant, view, product, custom, { container: CONTAINER5, brand: BRAND })}
      ${footerHtml5(view, custom, labels)}
    </div>`;
  }
  const phone = resolveWaPhone(custom);
  const waMsg = buildProductMessage(custom?.whatsapp?.messageTemplate, product.name, formatKz(product.price));
  const related = view.products.filter((p) => p.id !== product.id).slice(0, 4);
  const crumbCategory = product.category ? `<a href="${esc(categoryHref7(view, product.category))}" class="hover:opacity-70">${esc(product.category)}</a>
       <span class="material-symbols-outlined text-[16px]">chevron_right</span>` : "";
  return `${STYLE2}
  <div class="tx-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml5(view, labels, custom)}
    <main class="${CONTAINER5} py-12 md:py-20 flex-grow">
      <nav class="text-label-md mb-8 flex items-center gap-1.5 flex-wrap" style="color:${INK_SOFT}">
        <a href="${esc(storeHomeHref4(view))}" class="hover:opacity-70">In\xEDcio</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        ${crumbCategory}
        <span class="font-semibold truncate" style="color:${INK}">${esc(product.name)}</span>
      </nav>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
        ${productGalleryHtml(product, custom, {
    stageClass: "aspect-[4/3] rounded-xl overflow-hidden",
    stageStyle: `background:${TONE_LOW};box-shadow:${SHADOW_2}`,
    imgClass: "w-full h-full object-cover",
    brand: BRAND,
    thumbsClass: "mt-3 grid grid-cols-5 gap-2"
  })}

        <div class="flex flex-col md:sticky md:top-28">
          ${product.featured ? `<span class="w-fit text-label-sm px-3 py-1 rounded-full mb-4" style="background:${TONE_HIGH};color:${BRAND}">Destaque</span>` : ""}
          <h1 class="text-[28px] md:text-headline-lg font-semibold tracking-tight leading-tight" style="color:${INK}">${esc(product.name)}</h1>
          <p data-product-price class="mt-3 text-display-lg" style="color:${INK}">${esc(formatKz(product.price))}</p>

          ${product.description ? `<p class="mt-6 text-body-md leading-relaxed whitespace-pre-line" style="color:${INK_SOFT}">${esc(product.description)}</p>` : `<p class="mt-6 text-body-md italic" style="color:${INK_SOFT}">Sem descri\xE7\xE3o.</p>`}

          <!-- Varia\xE7\xF5es: chips de 4px e moldura de 1px, como os controlos do modelo (MODELO-GUIA \xA70.2) -->
          ${variationPickerHtml(product, custom, {
    labelClass: "text-label-md font-semibold",
    labelStyle: `color:${INK}`,
    valueClass: "inline-flex items-center gap-1.5 px-4 py-2.5 rounded text-label-md transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    valueStyle: `border:1px solid ${LINE};background:${CARD};color:${INK}`,
    selectedStyle: `background:${BRAND};color:${BRAND_INK};border-color:${BRAND}`,
    noteClass: "text-label-md",
    rootClass: "flex flex-col gap-4 mt-8 min-w-0"
  })}

          <div class="mt-8 flex items-center gap-4">
            <span class="text-label-md font-semibold" style="color:${INK}">Quantidade</span>
            <div class="flex items-center rounded overflow-hidden" style="border:1px solid ${LINE};background:${CARD}">
              <button type="button" data-qty-dec class="w-10 h-10 flex items-center justify-center transition-colors" style="color:${INK}"><span class="material-symbols-outlined text-[20px]">remove</span></button>
              <input data-qty type="text" inputmode="numeric" value="1" class="w-12 h-10 text-center outline-none bg-transparent" style="border-left:1px solid ${LINE};border-right:1px solid ${LINE};color:${INK}" />
              <button type="button" data-qty-inc class="w-10 h-10 flex items-center justify-center transition-colors" style="color:${INK}"><span class="material-symbols-outlined text-[20px]">add</span></button>
            </div>
          </div>

          <div class="mt-8 flex flex-col sm:flex-row gap-3">
            <button type="button" data-add-cart="${esc(product.id)}" class="flex-1 inline-flex items-center justify-center gap-2 text-label-md px-6 py-3.5 rounded transition-opacity hover:opacity-90" style="background:${BRAND};color:${BRAND_INK};box-shadow:${SHADOW_1}">
              <span class="material-symbols-outlined text-[20px]">shopping_cart</span> Adicionar ao carrinho
            </button>
            <a href="${esc(waLink(phone, waMsg))}" data-edit-whatsapp target="_blank" rel="noopener" class="tx-outline flex-1 inline-flex items-center justify-center gap-2 text-label-md px-6 py-3.5 rounded" style="border:1px solid ${OUTLINE};color:${INK}">
              <span class="material-symbols-outlined text-[20px]">chat</span> Comprar por WhatsApp
            </a>
          </div>

          <ul data-edit-perks class="mt-8 pt-6 space-y-2 text-label-md" style="color:${INK_SOFT};border-top:1px solid ${LINE}">
            ${perksItemsHtml(custom, BRAND)}
          </ul>
        </div>
      </div>

      ${related.length ? `<section data-related class="mt-20">
            <div class="flex justify-between items-end gap-3 mb-12 pb-3" style="border-bottom:1px solid ${LINE}">
              <h2 class="text-headline-md tracking-tight" style="color:${INK}">Tamb\xE9m pode gostar</h2>
            </div>
            <div class="${GRID_CLS4}">${related.map((p) => productCard5(view, p)).join("")}</div>
          </section>` : ""}
    </main>
    ${footerHtml5(view, custom, labels)}
  </div>`;
}
function renderCategory5(view, category, custom) {
  const labels = menuFor5(view, custom);
  const items = filterForCategoryPage(view, category);
  const cards = listingProducts(view, category);
  const grid = cards.length ? `<div class="${GRID_CLS4}">${cards.map((p) => productCard5(view, p)).join("")}</div>` : `<div class="py-16 text-center" style="color:${INK_SOFT}">
        <span class="material-symbols-outlined" style="font-size:48px">category</span>
        <p class="mt-2 text-body-md">Ainda n\xE3o h\xE1 produtos nesta categoria.</p>
       </div>`;
  const filters = categoryFilterHtml(categoryFilterLabels(view, category), category, {
    chipClass: "text-label-md px-4 py-2 rounded-full whitespace-nowrap transition-colors",
    chipStyle: `border:1px solid ${LINE};color:${INK_SOFT};background:${CARD}`,
    rootClass: "flex flex-wrap items-center gap-2 mb-12 min-w-0"
  });
  return `${STYLE2}
  <div class="tx-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml5(view, labels, custom)}
    <main class="${CONTAINER5} py-12 md:py-20 flex-grow">
      <nav class="text-label-md mb-8 flex items-center gap-1.5" style="color:${INK_SOFT}">
        <a href="${esc(storeHomeHref4(view))}" class="hover:opacity-70">In\xEDcio</a>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
        <span class="font-semibold" style="color:${INK}">${esc(category)}</span>
      </nav>
      <div class="flex items-end gap-3 mb-8 pb-3" style="border-bottom:1px solid ${LINE}">
        <h1 data-cat-title class="text-[28px] md:text-headline-lg font-semibold tracking-tight" style="color:${INK}">${esc(category)}</h1>
        <span data-cat-count class="text-label-md" style="color:${INK_SOFT}">${items.length} produto(s)</span>
      </div>
      ${filters}
      ${grid}
    </main>
    ${footerHtml5(view, custom, labels)}
  </div>`;
}
function renderCheckout5(view, innerHtml, custom) {
  const labels = menuFor5(view, custom);
  return `${STYLE2}
  <div class="tx-root min-h-screen flex flex-col overflow-x-hidden">
    ${headerHtml5(view, labels, custom)}
    <main class="${CONTAINER5} py-12 md:py-20 flex-grow">${innerHtml}</main>
    ${footerHtml5(view, custom, labels)}
  </div>`;
}
var techEssentialsTemplate = {
  id: "tech-essentials",
  name: "Tech Essentials",
  previewUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600",
  ready: true,
  defaultBrand: ACTION,
  /**
   * Este modelo não traz testemunhos nem mapa próprios, por isso aceita as
   * quatro secções acrescentáveis (`MODELO-GUIA.md` §9.3). As variantes são as
   * que assentam na composição da home: fotografia ao lado do texto, título
   * centrado no espaço branco, testemunhos em cartões de nível 1, e o mapa no
   * cartão de texto mais mapa.
   *
   * Fundos: as faixas tonais azul-gelo e azul claro do próprio modelo e o
   * cinzento neutro da faixa de marcas — nunca o creme de outro modelo, que era
   * o que o editor lhe dava quando a lista vivia lá.
   *
   * `materialize` prepara a faixa de marcas (sempre quatro) para edição.
   */
  sections: {
    variants: { info: "lado", text: "centrado", testimonials: "cards", location: "cartao" },
    style: BLOCK_STYLE5,
    backgrounds: [
      { label: "Azul-gelo", value: TONE_LOW },
      { label: "Azul claro", value: TONE },
      { label: "Cinzento", value: GREY_BAND }
    ],
    materialize: materializeBrands
  },
  render: render5,
  renderProduct: renderProduct5,
  renderCategory: renderCategory5,
  renderCheckout: renderCheckout5
};

// web/templates/registry.ts
function renderDefault(view, _custom) {
  const brand = brandMarkHtml(view.header.brand);
  const banners = bannersHtml(view.banners, "w-full h-48 md:h-64 object-cover rounded-xl border border-outline-variant");
  return `
  <div class="min-h-screen flex flex-col">
    <header class="bg-surface border-b border-outline-variant sticky top-0 z-40">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">${brand}<span class="text-headline-md text-on-surface truncate">${esc(view.storeName)}</span></div>
        <nav class="hidden md:flex items-center gap-6 text-on-surface-variant text-label-md">${menuItemsHtml(view.menu.items)}</nav>
      </div>
    </header>
    ${banners ? `<section class="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop mt-6 flex flex-col gap-4">${banners}</section>` : ""}
    <main class="flex-grow w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-10">
      <h2 class="text-headline-lg text-on-surface mb-6">Produtos</h2>
      ${productsGridHtml(view.products)}
    </main>
    <footer class="bg-surface-container-low border-t border-outline-variant mt-auto">
      <div class="max-w-container-max mx-auto px-margin-mobile py-8 text-center text-on-surface-variant">
        <p class="break-words">${esc((view.subdomain.split(".")[0] ?? view.subdomain) + "." + STORE_APEX)}</p>
        <p class="text-label-sm mt-1">Loja criada com M\xF4Bisno \xB7 <a href="${platformHomeUrl()}" class="text-primary">criar a minha</a></p>
      </div>
    </footer>
  </div>`;
}
var TEMPLATE_REGISTRY = [
  desportivoTemplate,
  beautyTemplate,
  galeriaTemplate,
  lumiereTemplate,
  techEssentialsTemplate,
  { id: "boutique-elegante", name: "Boutique Elegante", previewUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&q=70", render: renderDefault },
  { id: "tech-dinamico", name: "Tech Din\xE2mico", previewUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=70", render: renderDefault },
  { id: "sabor-artesanal", name: "Sabor Artesanal", previewUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=70", render: renderDefault }
];
function getTemplate(id) {
  return TEMPLATE_REGISTRY.find((t) => t.id === id) ?? TEMPLATE_REGISTRY[0];
}

// web/lib/brand.ts
var FALLBACK_BRAND = "#DC2626";
function brandOf(custom, templateId) {
  return custom?.colors?.primary || getTemplate(templateId).defaultBrand || FALLBACK_BRAND;
}
function readableInk(hex) {
  const h = (hex ?? "").trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.55 ? "#111827" : "#ffffff";
}

// src/services/plans.ts
var PLAN_NAME = "M\xF4Bisno";
var PLAN_PRICE_KZ = 1e4;
var PLAN_PERIOD_DAYS = 30;
var PLAN_UNIT_LABEL = "por loja";
var PLAN_HIGHLIGHTS = [
  "Produtos ilimitados",
  "Checkout por WhatsApp",
  "Multicaixa Express e Refer\xEAncia Banc\xE1ria para empresas verificadas",
  `Endere\xE7o pr\xF3prio nomedaloja.${STORE_APEX}`,
  "Editor visual e modelos prontos",
  "Taxas de entrega, c\xF3digos de desconto, stock, varia\xE7\xF5es e avalia\xE7\xF5es"
];

// src/services/comingSoon.ts
var COMING_SOON = {
  /** SMS de confirmação de compra (falta integrar um fornecedor). */
  sms: true,
  /** Domínio próprio (a ligação de DNS ainda é manual). */
  customDomain: true,
  /** Marketing e pixels (Meta Pixel e Google Analytics 4). */
  marketing: true
};
var COMING_SOON_LABELS = {
  sms: "SMS de confirma\xE7\xE3o de compra",
  customDomain: "Dom\xEDnio pr\xF3prio",
  marketing: "Marketing e pixels (Meta Pixel e Google Analytics)"
};
function isComingSoon(feature) {
  return COMING_SOON[feature] === true;
}
function comingSoonList() {
  return Object.keys(COMING_SOON).filter(isComingSoon).map((f) => COMING_SOON_LABELS[f]);
}

// src/services/fees.ts
var PLATFORM_FEE_RATE = 0.05;
var PLATFORM_FEE_LABEL = `${Number((PLATFORM_FEE_RATE * 100).toFixed(2))}%`;
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function amount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function platformFee(total) {
  const t = amount(total);
  return Math.min(t, round2(t * PLATFORM_FEE_RATE));
}
function netForOwner(total) {
  const t = amount(total);
  return round2(t - platformFee(t));
}
function feeForMethod(method, total) {
  return method === "whatsapp" ? 0 : platformFee(total);
}

// src/services/payments.ts
var PAYMENTS_PROVIDER_READY = true;

// src/services/seo.ts
function joinPt(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}
function kzWhole(value) {
  return formatKz(value).replace(/,00 Kz$/, " Kz");
}
function planPeriodLabel() {
  return PLAN_PERIOD_DAYS === 30 ? "/m\xEAs" : ` por ${PLAN_PERIOD_DAYS} dias`;
}
function platformPriceLabel() {
  return `${kzWhole(PLAN_PRICE_KZ)}${planPeriodLabel()}`;
}
var DIGITAL_PAYMENTS_LABEL = "Multicaixa Express e Refer\xEAncia Banc\xE1ria";
function platformFeeNote() {
  return `As vendas por WhatsApp n\xE3o t\xEAm comiss\xE3o nenhuma. Nas vendas recebidas por ${DIGITAL_PAYMENTS_LABEL}, a M\xF4Bisno fica com ${PLATFORM_FEE_LABEL} do valor da encomenda; o resto \xE9 levantado para a conta banc\xE1ria da sua empresa.`;
}
function platformAddressNote() {
  return isComingSoon("customDomain") ? `A loja fica em nomedaloja.${STORE_APEX} desde o primeiro dia. O dom\xEDnio pr\xF3prio est\xE1 \xABEm breve\xBB e ainda n\xE3o est\xE1 inclu\xEDdo na subscri\xE7\xE3o.` : `A loja fica em nomedaloja.${STORE_APEX} desde o primeiro dia, e pode tamb\xE9m ligar um dom\xEDnio pr\xF3prio.`;
}
function platformComingSoon(providerReady = PAYMENTS_PROVIDER_READY) {
  const pagamentos = providerReady === true ? [] : [`${DIGITAL_PAYMENTS_LABEL} para empresas registadas`];
  return [...pagamentos, ...comingSoonList()];
}
function platformFaq(providerReady = PAYMENTS_PROVIDER_READY) {
  const breve = platformComingSoon(providerReady);
  const faq = [
    {
      question: "Preciso de saber programar?",
      answer: "N\xE3o. A loja \xE9 personalizada num editor visual, por cima da pr\xF3pria p\xE1gina: log\xF3tipo, cores, textos, sec\xE7\xF5es, categorias e produtos. N\xE3o h\xE1 c\xF3digo para escrever nem nada para instalar."
    },
    {
      question: "Como crio uma loja online em Angola?",
      answer: `Registe-se na M\xF4Bisno, escolha um modelo pronto, personalize os textos, as fotografias e as cores e adicione os seus produtos. A loja fica no endere\xE7o nomedaloja.${STORE_APEX}, sem precisar de conhecimentos t\xE9cnicos.`
    },
    {
      question: "J\xE1 vendo pelo Instagram e pelo WhatsApp. Para que preciso de uma loja?",
      answer: "Para o cliente escolher sozinho. Em vez de enviar fotografias uma a uma e repetir pre\xE7os, envia um link com o cat\xE1logo inteiro, com pre\xE7o, stock e varia\xE7\xF5es. A encomenda chega-lhe ao WhatsApp escrita, a qualquer hora, mesmo quando n\xE3o est\xE1 a responder: produtos, varia\xE7\xF5es, zona de entrega, desconto e total. E a loja \xE9 uma p\xE1gina que o Google indexa, o que um perfil de rede social n\xE3o \xE9."
    },
    {
      question: "Quanto custa?",
      answer: `${platformPriceLabel()} ${PLAN_UNIT_LABEL}, com tudo inclu\xEDdo. Cada loja tem a sua subscri\xE7\xE3o: quem tem duas lojas online paga duas. Produtos ilimitados e sem escal\xF5es. Criar a loja e v\xEA-la \xE9 gr\xE1tis; a subscri\xE7\xE3o serve para a publicar.`
    },
    {
      question: "A M\xF4Bisno fica com uma parte das minhas vendas?",
      answer: `${platformFeeNote()} A fatura da venda \xE9 emitida pela sua empresa, n\xE3o pela M\xF4Bisno.`
    },
    {
      question: "Que pagamentos posso receber?",
      answer: providerReady === true ? "Todas as lojas recebem encomendas por WhatsApp. O Multicaixa Express e a Refer\xEAncia Banc\xE1ria ficam dispon\xEDveis para empresas registadas, depois de a M\xF4Bisno aprovar os documentos da empresa." : "Todas as lojas recebem encomendas por WhatsApp. O Multicaixa Express e a Refer\xEAncia Banc\xE1ria chegam em breve, para empresas registadas, depois de a M\xF4Bisno aprovar os documentos da empresa; at\xE9 l\xE1, as encomendas s\xE3o feitas por WhatsApp."
    },
    {
      question: "E se eu n\xE3o tiver empresa registada?",
      answer: "Pode criar a loja, public\xE1-la e receber encomendas por WhatsApp, sem comiss\xE3o nenhuma. S\xE3o os pagamentos digitais que exigem empresa registada: a M\xF4Bisno pede a Matr\xEDcula e a Certid\xE3o e s\xF3 liga o Multicaixa Express e a Refer\xEAncia Banc\xE1ria depois de as aprovar."
    },
    {
      question: "Posso usar o meu dom\xEDnio pr\xF3prio?",
      answer: platformAddressNote()
    }
  ];
  if (breve.length) {
    faq.push({
      question: "O que ainda n\xE3o est\xE1 dispon\xEDvel?",
      answer: `Em breve: ${joinPt(breve.map((b) => `\xAB${b}\xBB`))}. Ainda n\xE3o est\xE3o inclu\xEDdos na subscri\xE7\xE3o.`
    });
  }
  return faq;
}

// web/ssr/htmlScan.ts
var VOID = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
var RAW = /* @__PURE__ */ new Set(["script", "style", "textarea", "title"]);
var isNameChar = (c) => /[A-Za-z0-9:_-]/.test(c);
var isSpace = (c) => c === " " || c === "\n" || c === "	" || c === "\r" || c === "\f";
function readStartTag(html, i) {
  let j = i + 1;
  while (j < html.length && isNameChar(html[j])) j += 1;
  const name = html.slice(i + 1, j).toLowerCase();
  const attrs = /* @__PURE__ */ new Map();
  const attrSpans = /* @__PURE__ */ new Map();
  for (; ; ) {
    while (j < html.length && isSpace(html[j])) j += 1;
    if (j >= html.length) return null;
    const c = html[j];
    if (c === ">") {
      return { el: { name, attrs, attrSpans, start: i, insertAt: j, openEnd: j + 1 }, selfClosing: false, next: j + 1 };
    }
    if (c === "/" && html[j + 1] === ">") {
      return { el: { name, attrs, attrSpans, start: i, insertAt: j, openEnd: j + 2 }, selfClosing: true, next: j + 2 };
    }
    if (c === "/") {
      j += 1;
      continue;
    }
    const nameStart = j;
    while (j < html.length && !isSpace(html[j]) && html[j] !== "=" && html[j] !== ">" && !(html[j] === "/" && html[j + 1] === ">")) j += 1;
    const attrName = html.slice(nameStart, j).toLowerCase();
    let end = j;
    let valueStart = j;
    let valueEnd = j;
    let k = j;
    while (k < html.length && isSpace(html[k])) k += 1;
    if (html[k] === "=") {
      k += 1;
      while (k < html.length && isSpace(html[k])) k += 1;
      const q = html[k];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, k + 1);
        if (close === -1) return null;
        valueStart = k + 1;
        valueEnd = close;
        end = close + 1;
      } else {
        valueStart = k;
        while (k < html.length && !isSpace(html[k]) && html[k] !== ">") k += 1;
        valueEnd = k;
        end = k;
      }
      j = end;
    }
    if (attrName && !attrs.has(attrName)) {
      attrs.set(attrName, html.slice(valueStart, valueEnd));
      attrSpans.set(attrName, { start: nameStart, end, valueStart, valueEnd });
    }
    if (j === nameStart) j += 1;
  }
}
function scanHtml(html, handlers) {
  const stack = [];
  const text = (t) => {
    if (t && handlers.onText) handlers.onText(t, stack);
  };
  const close = (el, at) => {
    handlers.onClose?.(el, at);
  };
  let lower = null;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      text(html.slice(i));
      break;
    }
    if (lt > i) text(html.slice(i, lt));
    i = lt;
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const end = html.indexOf(">", i);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    if (html[i + 1] === "/") {
      const m = /^<\/([A-Za-z][A-Za-z0-9:_-]*)[^>]*>/.exec(html.slice(i, i + 200));
      if (!m) {
        text("<");
        i += 1;
        continue;
      }
      const name = m[1].toLowerCase();
      let k = stack.length - 1;
      while (k >= 0 && stack[k].name !== name) k -= 1;
      if (k >= 0) {
        while (stack.length > k) close(stack.pop(), i);
      }
      i += m[0].length;
      continue;
    }
    if (!/[A-Za-z]/.test(html[i + 1] ?? "")) {
      text("<");
      i += 1;
      continue;
    }
    const tag = readStartTag(html, i);
    if (!tag) {
      text(html.slice(i));
      break;
    }
    handlers.onOpen?.(tag.el, stack);
    i = tag.next;
    if (VOID.has(tag.el.name) || tag.selfClosing) {
      close(tag.el, tag.el.openEnd);
      continue;
    }
    stack.push(tag.el);
    if (RAW.has(tag.el.name)) {
      lower ??= html.toLowerCase();
      const end = lower.indexOf(`</${tag.el.name}`, i);
      const stop = end === -1 ? html.length : end;
      text(html.slice(i, stop));
      i = stop;
    }
  }
  while (stack.length) close(stack.pop(), html.length);
}
function classesOf(el) {
  return (el.attrs.get("class") ?? "").split(/\s+/).filter(Boolean);
}
function applyEdits(html, edits) {
  if (!edits.length) return html;
  const sorted = [...edits].sort((a, b) => b.from - a.from || b.to - a.to);
  let out = html;
  for (const e of sorted) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}

// web/views/storeHtml.ts
function storeBrand(view, custom) {
  const brand = brandOf(custom, view.templateId);
  return { brand, ink: readableInk(brand) };
}
function storeHomeHtml(view, custom) {
  return getTemplate(view.templateId).render(view, custom);
}
function findProduct(view, slugOrId) {
  const wanted = slugOrId.replace(/^\/+|\/+$/g, "").toLowerCase();
  return view.products.find((p) => productSlugPath(p).toLowerCase() === wanted) ?? view.products.find((p) => p.id === slugOrId) ?? null;
}
var SOLD_OUT_LABEL_HTML = `<span class="material-symbols-outlined text-[20px]">block</span> Esgotado`;
var SOLD_OUT_STYLE = "opacity:0.55;pointer-events:none;cursor:not-allowed";
function withSoldOutCtas(html) {
  const edits = [];
  const isCta = (el) => el.attrs.has("data-add-cart") || el.attrs.has("data-edit-whatsapp");
  scanHtml(html, {
    onClose(el, closeStart) {
      if (!isCta(el)) return;
      const style = el.attrSpans.get("style");
      if (style) {
        const current = el.attrs.get("style") ?? "";
        const sep = current.trim() === "" || current.trim().endsWith(";") ? "" : ";";
        edits.push({ from: style.valueStart, to: style.valueEnd, text: `${current}${sep}${SOLD_OUT_STYLE}` });
      }
      const extra = `${el.attrs.has("disabled") ? "" : ' disabled="true"'} aria-disabled="true"${style ? "" : ` style="${SOLD_OUT_STYLE}"`}`;
      edits.push({ from: el.insertAt, to: el.insertAt, text: extra });
      if (closeStart > el.openEnd) edits.push({ from: el.openEnd, to: closeStart, text: SOLD_OUT_LABEL_HTML });
    }
  });
  return applyEdits(html, edits);
}
function productPageHtml(view, product, custom, identifier2) {
  const template = getTemplate(view.templateId);
  const html = template.renderProduct ? template.renderProduct(view, product, custom) : `<div class="min-h-screen"><a href="${esc(storeHomePath(identifier2))}">Voltar</a><h1>${esc(product.name)}</h1></div>`;
  return product.stock === 0 ? withSoldOutCtas(html) : html;
}
function isAllListingLabel(label) {
  return label === ALL_LABEL || label === "Todos";
}
function categoryCanonicalLabel(label) {
  return isAllListingLabel(label) ? ALL_LABEL : label;
}
function resolveCategory(view, slugOrLabel) {
  const known = [ALL_LABEL, FEATURED_LABEL, "Todos", ...headerCategories(view)];
  const label = resolveCategoryLabel(slugOrLabel, known);
  if (label === null) return { label: slugOrLabel, known: false, hasItems: false };
  return { label, known: true, hasItems: filterForCategoryPage(view, label).length > 0 };
}
var SORT_SELECT = `<select data-listing-sort aria-label="Ordenar produtos" class="text-sm rounded-full pl-4 pr-9 py-2 appearance-none cursor-pointer outline-none" style="border:1px solid rgba(128,128,128,.32);background:transparent;color:inherit">
      <option value="rel">Ordenar: Relev\xE2ncia</option>
      <option value="preco-asc">Pre\xE7o: mais baixo</option>
      <option value="preco-desc">Pre\xE7o: mais alto</option>
      <option value="nome">Nome (A\u2013Z)</option>
    </select>
    <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[18px]" style="opacity:.6" aria-hidden="true">expand_more</span>`;
function withListingSort(html) {
  const found = {
    cards: 0,
    gridStart: -1,
    bar: null,
    barClose: -1
  };
  scanHtml(html, {
    onOpen(el, stack) {
      if (el.attrs.has("data-edit-product")) {
        found.cards += 1;
        if (found.cards === 1) found.gridStart = stack.length ? stack[stack.length - 1].start : -1;
      }
      if (!found.bar && el.attrs.has("data-cat-filter-bar")) found.bar = el;
    },
    onClose(el, closeStart) {
      if (el === found.bar && found.barClose === -1) found.barClose = closeStart;
    }
  });
  if (found.cards < 2) return html;
  if (found.bar && found.barClose !== -1) {
    const at2 = found.barClose;
    return applyEdits(html, [{ from: at2, to: at2, text: `<div class="ml-auto relative" data-listing-sort-box>${SORT_SELECT}</div>` }]);
  }
  if (found.gridStart === -1) return html;
  const at = found.gridStart;
  return applyEdits(html, [{ from: at, to: at, text: `<div class="flex justify-end mb-6" data-listing-sort-box><div class="relative">${SORT_SELECT}</div></div>` }]);
}
function categoryPageHtml(view, label, custom) {
  const template = getTemplate(view.templateId);
  const html = template.renderCategory ? template.renderCategory(view, label, custom) : template.render(view, custom);
  return withListingSort(html);
}

// web/ssr/look.ts
function withGlobal(name, value, fn) {
  const g = globalThis;
  const before = Object.getOwnPropertyDescriptor(g, name);
  Object.defineProperty(g, name, { value, configurable: true, writable: true, enumerable: false });
  try {
    return fn();
  } finally {
    if (before) Object.defineProperty(g, name, before);
    else delete g[name];
  }
}
function safeCssValue(v) {
  return v.length < 200 && !/[;{}<>"\\\n\r]/.test(v);
}
function safeStyleText(css) {
  return css.replace(/</g, "\\3c ");
}
function storeLook(view, custom) {
  const attrs = /* @__PURE__ */ new Map();
  const vars = /* @__PURE__ */ new Map();
  const styles = [];
  const { brand, ink } = storeBrand(view, custom);
  vars.set("--brand", brand);
  vars.set("--brand-ink", ink);
  const root = {
    setAttribute: (k, v) => {
      attrs.set(k, String(v));
    },
    removeAttribute: (k) => {
      attrs.delete(k);
    },
    style: {
      setProperty: (k, v) => {
        vars.set(k, String(v));
      },
      removeProperty: (k) => {
        vars.delete(k);
      }
    },
    // A travessia dos botões (`markIconTextButtons`) corre sobre um `#app` sem
    // filhos: a marca é feita no texto do HTML (`web/ssr/iconText.ts`).
    matches: () => false,
    querySelectorAll: () => []
  };
  const fakeDocument = {
    getElementById: (id) => styles.find((s) => s.id === id) ?? null,
    createElement: () => ({ id: "", textContent: "" }),
    head: {
      appendChild: (el) => {
        styles.push({ id: el.id || void 0, css: el.textContent, ssrOnly: false });
      }
    }
  };
  withGlobal("document", fakeDocument, () => {
    const app = root;
    applyInk(app, custom);
    applyTheme(app, custom);
    applyIconColor(app, custom);
  });
  const map = custom.fieldColors;
  if (map && typeof map === "object" && Object.values(map).some((c) => !!c)) {
    styles.push({ css: fieldColorCss(map), ssrOnly: true });
  }
  return {
    vars: [...vars].filter(([, v]) => safeCssValue(v)),
    attrs: [...attrs],
    styles,
    markIconTextButtons: attrs.has("data-ink") || attrs.has("data-icons")
  };
}
function attrEsc(v) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function lookAppAttrs(look2) {
  const style = look2.vars.map(([k, v]) => `${k}:${v}`).join(";");
  const attrs = look2.attrs.filter(([k]) => /^data-[a-z0-9-]+$/.test(k)).map(([k, v]) => ` ${k}="${attrEsc(v)}"`).join("");
  return `${style ? ` style="${attrEsc(style)}"` : ""}${attrs}`;
}
function lookHeadHtml(styles) {
  return styles.map((s) => {
    const id = s.id && /^[a-z0-9-]+$/i.test(s.id) ? ` id="${s.id}"` : "";
    const only = s.ssrOnly ? " data-mb-ssr-only" : "";
    return `<style${id}${only}>${safeStyleText(s.css)}</style>`;
  }).join("");
}
function categoryHideStyle(label) {
  const value = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ");
  return { css: `#app [data-product-category]:not([data-product-category="${value}"]){display:none}`, ssrOnly: true };
}

// web/ssr/iconText.ts
var NON_LABEL_ATTR = "data-cart-count";
var ICON_CLASS2 = ICON_SELECTOR.replace(/^\./, "");
function matcherOf(selector) {
  const s = selector.trim();
  if (/^[a-z][a-z0-9-]*$/i.test(s)) {
    const name = s.toLowerCase();
    return (el) => el.name === name;
  }
  const presence = /^\[([a-z0-9_:-]+)\]$/i.exec(s);
  if (presence) {
    const attr = presence[1].toLowerCase();
    return (el) => el.attrs.has(attr);
  }
  const equals = /^\[([a-z0-9_:-]+)="([^"]*)"\]$/i.exec(s);
  if (equals) {
    const attr = equals[1].toLowerCase();
    const value = equals[2];
    return (el) => el.attrs.get(attr) === value;
  }
  throw new Error(`iconText: seletor de bot\xE3o n\xE3o suportado: ${selector}`);
}
var matchers = null;
function isButton(el) {
  matchers ??= BUTTON_ANCESTORS.map(matcherOf);
  return matchers.some((m) => m(el));
}
function hasLabelText(raw) {
  return raw.replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, " ").trim() !== "";
}
function markIconTextButtonsHtml(html) {
  try {
    matchers ??= BUTTON_ANCESTORS.map(matcherOf);
  } catch {
    return html;
  }
  const flags = /* @__PURE__ */ new Map();
  const blockers = /* @__PURE__ */ new Set();
  const edits = [];
  const propagate = (stack, kind) => {
    for (let k = stack.length - 1; k >= 0; k -= 1) {
      const el = stack[k];
      const f = flags.get(el);
      if (f) f[kind] = true;
      if (blockers.has(el)) return;
    }
  };
  scanHtml(html, {
    onOpen(el, stack) {
      const icon2 = classesOf(el).includes(ICON_CLASS2);
      if (icon2) propagate(stack, "icon");
      if (icon2 || el.attrs.has(NON_LABEL_ATTR)) blockers.add(el);
      if (isButton(el)) flags.set(el, { icon: false, text: false });
    },
    onText(text, stack) {
      if (hasLabelText(text)) propagate(stack, "text");
    },
    onClose(el) {
      const f = flags.get(el);
      if (f && f.icon && f.text && !el.attrs.has(ICON_TEXT_ATTR)) {
        edits.push({ from: el.insertAt, to: el.insertAt, text: ` ${ICON_TEXT_ATTR}=""` });
      }
    }
  });
  return applyEdits(html, edits);
}

// web/templates/platformChrome.ts
var PLATFORM_ACCENT = "#F95901";
var PLATFORM_LABEL = "M\xF4Bisno";
var HOME_SECTIONS = [
  { id: "como-funciona", label: "Como funciona" },
  { id: "funcionalidades", label: "Funcionalidades" },
  { id: "pagamentos", label: "Pagamentos" },
  { id: "precos", label: "Pre\xE7os" }
];
function platformNavHtml(opts = {}) {
  const brand = opts.brandHtml ?? `<a href="/" class="flex items-center gap-2" aria-label="${esc(PLATFORM_LABEL)}"><img src="/logo-header.png" alt="${esc(PLATFORM_LABEL)}" class="w-auto object-contain" style="height:24px" /></a>`;
  const actions = opts.actionsHtml ?? `<a href="/criar" class="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-white px-4 sm:px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95" style="background:${PLATFORM_ACCENT}">Criar<span class="hidden sm:inline">minha</span>loja</a>`;
  const sections = HOME_SECTIONS.map((s) => `<a href="/" data-goto="${esc(s.id)}" class="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap">${esc(s.label)}</a>`).join("");
  return `
    <nav class="bg-white/90 backdrop-blur sticky top-0 border-b border-gray-100 z-50">
      <div class="flex justify-between items-center gap-3 md:gap-4 px-margin-mobile md:px-margin-desktop py-4 max-w-container-max mx-auto">
        <div class="shrink-0 min-w-0">${brand}</div>
        <div class="hidden md:flex items-center gap-4 lg:gap-6 shrink-0">${sections}</div>
        <div class="flex items-center gap-2 sm:gap-3 shrink-0">${actions}</div>
      </div>
    </nav>`;
}
function platformFooterHtml() {
  const link = (href, label, extra = "") => `<li><a href="${esc(href)}"${extra} class="text-gray-500 hover:text-gray-900 transition-colors">${esc(label)}</a></li>`;
  const mail = `mailto:${PLATFORM_CONTACT_EMAIL}`;
  return `
    <footer class="bg-white border-t border-gray-100">
      <div class="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-14">
        <div class="grid grid-cols-2 md:grid-cols-12 gap-10">
          <div class="col-span-2 md:col-span-4 flex flex-col gap-4">
            <img src="/logo-header.png" alt="${esc(PLATFORM_LABEL)}" style="height:26px" class="w-auto object-contain self-start" />
            <!-- Sem superlativos: \xABa forma mais simples\xBB n\xE3o \xE9 verific\xE1vel. O que
                 a loja faz \xE9 que \xE9. -->
            <p class="text-sm text-gray-500 max-w-xs leading-relaxed">Lojas online angolanas, sem programar: modelos prontos, editor visual e encomendas por WhatsApp em todas as lojas.</p>
            <a href="${esc(mail)}" class="inline-flex items-center gap-2 self-start text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"><span class="material-symbols-outlined mb-ico text-[18px]" aria-hidden="true">mail</span>${esc(PLATFORM_CONTACT_EMAIL)}</a>
          </div>
          <!-- Os titulos das colunas sao h3, e nao h4: a pagina acima deles
               acaba em h2, e saltar de h2 para h4 deixa um degrau vazio na
               arvore de titulos \u2014 um leitor de ecra anuncia uma seccao de nivel
               quatro sem a de nivel tres existir. O teste landingCopy guarda-o.
               (Sem acentos graves aqui: isto esta dentro de um template literal.) -->
          <div class="md:col-span-3">
            <h3 class="text-sm font-bold text-gray-900 mb-4">Plataforma</h3>
            <ul class="space-y-3 text-sm">
              ${link("/criar", "Criar loja")}
              ${link("/login", "Entrar")}
              ${link("/painel", "Dashboard")}
              ${link("/", "Pre\xE7os", ' data-goto="precos"')}
            </ul>
          </div>
          <div class="md:col-span-3">
            <h3 class="text-sm font-bold text-gray-900 mb-4">Recursos</h3>
            <ul class="space-y-3 text-sm">
              ${link("/lojas", "Lojas criadas na M\xF4Bisno")}
              ${link("/modelos", "Modelos prontos")}
              ${link("/criar", "Criar loja online")}
              ${link("/", "Perguntas frequentes", ' data-goto="perguntas"')}
              ${link(mail, "Contacto")}
            </ul>
          </div>
          <div class="md:col-span-2">
            <h3 class="text-sm font-bold text-gray-900 mb-4">Legal</h3>
            <ul class="space-y-3 text-sm">
              ${link("/termos", "Termos")}
              ${link("/privacidade", "Privacidade")}
              ${link("/politica", "Pol\xEDtica Geral")}
            </ul>
          </div>
        </div>
        <div class="mt-12 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p class="text-sm text-gray-500">\xA9 2026 ${esc(PLATFORM_LABEL)}</p>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400 uppercase tracking-wider">Pagamentos</span>
            <img src="/integrations/Express.png" alt="Multicaixa Express" class="h-6 w-auto object-contain" />
            <img src="/integrations/ATM.png" alt="Multicaixa" class="h-6 w-auto object-contain" />
          </div>
        </div>
      </div>
    </footer>`;
}

// web/lib/glowCards.ts
var GLOW_STYLE_ID = "mb-bento-style";
var GLOW_CARD_CSS = ".mb-bento{display:grid;grid-template-columns:repeat(1,1fr);gap:1rem}@media(min-width:768px){.mb-bento{grid-template-columns:repeat(3,1fr);grid-auto-rows:minmax(112px,auto)}}.bento-item{position:relative;background:#f9fafb;border:1px solid #e9e9e9;border-radius:1rem;padding:1.25rem 1.35rem;overflow:hidden;transition:border-color .3s ease,box-shadow .3s ease}.bento-item::before{content:'';position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity .3s ease;background:radial-gradient(450px circle at var(--mouse-x,50%) var(--mouse-y,50%),rgba(249,89,1,.12),transparent 42%);pointer-events:none;z-index:0}.bento-item:hover{border-color:rgba(249,89,1,.45);box-shadow:0 16px 40px -18px rgba(249,89,1,.35)}.bento-item:hover::before{opacity:1}.bento-item>*{position:relative;z-index:1}@media(min-width:768px){.bento-col-2{grid-column:span 2}.bento-row-2{grid-row:span 2}}.mb-ico{display:inline-block;flex-shrink:0;width:1em;height:1em;line-height:1;overflow:hidden;white-space:nowrap;vertical-align:-.125em}@media(prefers-reduced-motion:no-preference){.mb-rise{opacity:0;transform:translateY(14px);animation:mb-rise .55s cubic-bezier(.22,.61,.36,1) forwards;animation-delay:calc(var(--i,0)*45ms)}@keyframes mb-rise{to{opacity:1;transform:none}}}";
function glowCardStyleTag() {
  return `<style id="${GLOW_STYLE_ID}">${GLOW_CARD_CSS}</style>`;
}

// src/services/delivery.ts
var DELIVERY_PROVINCE = "Luanda";
var LUANDA_AREAS = [
  "Benfica",
  "Cacuaco",
  "Calemba 2",
  "Camama",
  "Cassequel",
  "Cidade",
  "Escongolenses",
  "Golf 2",
  "Kilamba",
  "Morro Bento",
  "Nova Vida",
  "Palanca",
  "Prenda",
  "Rocha Pinto",
  "Samba",
  "Sequel",
  "Talatona",
  "Viana",
  "Zango"
];

// web/views/landingHtml.ts
var ACCENT = PLATFORM_ACCENT;
var ACCENT_INK = "#C2410C";
var SOFT = "#fff4ed";
var WRAP = "max-w-6xl mx-auto px-margin-mobile md:px-margin-desktop";
var H2 = "mt-4 text-[2.25rem] leading-[1.08] md:text-5xl font-black tracking-[-0.03em] text-gray-900";
var LEAD = "mt-5 text-lg md:text-xl leading-relaxed text-gray-600";
var BTN_MAIN = "mb-go inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 font-semibold text-white shadow-[0_14px_30px_-12px_rgba(249,89,1,.75)] transition-transform active:scale-[.98]";
var BTN_ALT = "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-7 py-3.5 font-semibold text-gray-800 transition-colors hover:bg-gray-50";
var ACCORDION_ITEMS = [
  { title: "Sem c\xF3digo", imageUrl: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1200&auto=format&fit=crop" },
  { title: "Editor visual ao vivo", imageUrl: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?q=80&w=1200&auto=format&fit=crop" },
  { title: `Endere\xE7o .${STORE_APEX}`, imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&auto=format&fit=crop" },
  { title: "Pagamentos e entregas", imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200&auto=format&fit=crop" },
  { title: "Encomendas por WhatsApp", imageUrl: "https://images.unsplash.com/photo-1611746872915-64382b5c76da?q=80&w=1200&auto=format&fit=crop" }
];
var CAP_BASE = "absolute text-white text-base font-semibold whitespace-nowrap transition-all duration-500 ease-in-out drop-shadow";
var CAP_ACTIVE = `${CAP_BASE} bottom-5 left-1/2 -translate-x-1/2 rotate-0`;
var CAP_IDLE = `${CAP_BASE} bottom-24 left-1/2 -translate-x-1/2 rotate-90`;
var ACC_OPEN_WIDTH = "20rem";
var ACC_IDLE_WIDTH = "3.5rem";
var ACC_INITIAL = ACCORDION_ITEMS.length - 1;
function landingNavActions(loggedIn) {
  return loggedIn ? `<a href="/painel" id="cta-painel" class="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 text-white px-4 sm:px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95" style="background:${ACCENT}"><span class="material-symbols-outlined mb-ico text-[18px]" aria-hidden="true">dashboard</span><span class="hidden sm:inline">Abrir</span>Dashboard</a>` : `<a href="/login" id="cta-login" class="hidden sm:inline-flex items-center whitespace-nowrap shrink-0 text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg text-sm transition-colors">Login</a>
       <a href="/criar" id="cta-nav" class="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-white px-4 sm:px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95" style="background:${ACCENT}">Criar<span class="hidden sm:inline">minha</span>loja</a>`;
}
function landingHeroActions(loggedIn) {
  return loggedIn ? `<a href="/painel" id="cta-hero-painel" class="${BTN_MAIN}" style="background:${ACCENT}"><span class="material-symbols-outlined mb-ico text-[20px]" aria-hidden="true">dashboard</span> Abrir Dashboard</a>` : `<a href="/criar" id="cta-hero" class="${BTN_MAIN}" style="background:${ACCENT}">Criar minha loja <span class="material-symbols-outlined mb-ico text-[20px]" aria-hidden="true">arrow_forward</span></a>
       <a href="/login" id="cta-hero-login" class="${BTN_ALT}">J\xE1 tenho conta</a>`;
}
function icon(name, cls = "text-[22px]") {
  return `<span class="material-symbols-outlined mb-ico ${cls}" aria-hidden="true">${esc(name)}</span>`;
}
function eyebrow(text) {
  return `<p class="text-xs font-bold uppercase tracking-[0.18em]" style="color:${ACCENT_INK}">${esc(text)}</p>`;
}
var LANDING_STYLE_ID = "mb-landing-style";
var EASE_OUT = "cubic-bezier(.16,1,.3,1)";
var LANDING_CSS = [
  "summary::-webkit-details-marker{display:none}",
  ".mb-go .mb-ico{transition:transform .3s ease}",
  ".mb-go:hover .mb-ico{transform:translateX(3px)}",
  "@keyframes mb-up{from{opacity:0;transform:translate3d(0,28px,0)}to{opacity:1;transform:none}}",
  "@keyframes mb-fade{from{opacity:0}to{opacity:1}}",
  "@keyframes mb-pop{0%{opacity:0;transform:scale(.6)}70%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:none}}",
  "@keyframes mb-draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
  "@media (prefers-reduced-motion:no-preference){",
  "details[open] .mb-answer{animation:mb-fade .35s ease both}",
  // As secções: entram ao rolar (web/lib/landingMotion.ts).
  ".mb-armed[data-reveal],.mb-armed [data-reveal]{opacity:0;transform:translate3d(0,28px,0)}",
  `.mb-in[data-reveal],.mb-in [data-reveal]{animation:mb-up .9s ${EASE_OUT} both;animation-delay:var(--d,0ms)}`,
  ".mb-armed [data-pop]{opacity:0}",
  ".mb-in [data-pop]{animation:mb-pop .6s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--d,0ms)}",
  ".mb-armed [data-draw]{transform:scaleX(0)}",
  ".mb-in [data-draw]{animation:mb-draw 1.4s cubic-bezier(.65,0,.35,1) both;animation-delay:var(--d,0ms)}",
  "}"
].join("");
var GRID_BG = "background-image:linear-gradient(to right,rgba(17,24,39,.05) 1px,transparent 1px),linear-gradient(to bottom,rgba(17,24,39,.05) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 70% 20%,#000 20%,transparent 70%);mask-image:radial-gradient(ellipse 70% 60% at 70% 20%,#000 20%,transparent 70%)";
function heroSection() {
  const accordion = ACCORDION_ITEMS.map((it, idx) => {
    const open = idx === ACC_INITIAL;
    return `
              <div data-acc data-index="${idx}" class="relative h-[360px] sm:h-[440px] rounded-2xl overflow-hidden cursor-pointer transition-all duration-700 ease-in-out shrink-0" style="width:${open ? ACC_OPEN_WIDTH : ACC_IDLE_WIDTH}">
                <img src="${esc(it.imageUrl)}" alt="" class="absolute inset-0 w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/400x450/1a1a1a/ffffff?text=M\xF4Bisno'" />
                <div class="absolute inset-0 bg-black/40"></div>
                <span data-cap class="${open ? CAP_ACTIVE : CAP_IDLE}">${esc(it.title)}</span>
              </div>`;
  }).join("");
  return `
      <section class="relative w-full overflow-hidden">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0">
          <div class="absolute -right-40 -top-48 h-[40rem] w-[40rem] rounded-full blur-3xl" style="background:radial-gradient(closest-side,rgba(249,89,1,.22),rgba(249,89,1,0))"></div>
          <div class="absolute inset-0" style="${GRID_BG}"></div>
        </div>
        <div class="relative max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop py-12 md:py-20">
          <div class="flex flex-col lg:flex-row items-center justify-between gap-12">
            <div class="w-full lg:w-1/2 text-center lg:text-left">
              <h1 class="text-[2.25rem] leading-[1.05] sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl font-black tracking-[-0.035em] text-gray-900">Crie a sua loja<br/><span class="whitespace-nowrap">online <span data-typed class="whitespace-nowrap" style="color:${ACCENT}">em minutos</span></span></h1>
              <p class="mt-6 text-lg md:text-xl leading-relaxed text-gray-600 max-w-xl mx-auto lg:mx-0">Os seus clientes veem os produtos, escolhem e encomendam sozinhos, a qualquer hora. Cada pedido chega-lhe ao WhatsApp com o total j\xE1 calculado.</p>
              <div id="hero-actions" class="mt-9 flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">${landingHeroActions(false)}</div>
              <p class="mt-5 text-sm text-gray-500">Sem programar. Gr\xE1tis at\xE9 publicar.</p>
            </div>
            <div class="w-full lg:w-1/2">
              <div id="accordion" class="flex flex-row items-center justify-center lg:justify-end gap-3 overflow-x-auto p-2">${accordion}
              </div>
            </div>
          </div>
        </div>
      </section>`;
}
function partnersStrip() {
  const meios = [
    { src: "/integrations/Whatsapp.png", name: "WhatsApp" },
    { src: "/integrations/Express.png", name: "Multicaixa Express" },
    { src: "/integrations/ATM.png", name: "Refer\xEAncia Banc\xE1ria" }
  ];
  return `
      <section aria-label="Encomendas e pagamentos" class="w-full border-y border-gray-100 bg-white">
        <div data-motion class="${WRAP} flex flex-col items-center justify-center gap-x-12 gap-y-5 py-9 md:flex-row">
          <p data-reveal class="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Encomendas e pagamentos com</p>
          <ul class="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">${meios.map((m, i) => `
            <li data-reveal style="--d:${120 + i * 90}ms" class="flex items-center gap-2.5 text-sm font-semibold text-gray-700"><img src="${m.src}" alt="" loading="lazy" decoding="async" class="h-8 w-8 rounded-full" />${esc(m.name)}</li>`).join("")}
          </ul>
        </div>
      </section>`;
}
function stepsSection() {
  const passos = [
    { title: "Escolha um modelo", body: "Lojas prontas, feitas por tipo de neg\xF3cio." },
    { title: "Ponha os produtos", body: "Fotografia, pre\xE7o e stock. O resto j\xE1 est\xE1 feito." },
    { title: "Publique e partilhe", body: `A loja fica em nomedaloja.${STORE_APEX}.` }
  ];
  return `
      <section id="como-funciona" class="scroll-mt-20 w-full bg-gray-50 py-24 md:py-32">
        <div class="${WRAP}">
          <div data-motion data-reveal class="max-w-2xl">
            ${eyebrow("Como funciona")}
            <h2 class="${H2}">Tr\xEAs passos. Nenhum c\xF3digo.</h2>
            <p class="${LEAD}">Da conta criada \xE0 loja no ar, sem instalar nada.</p>
          </div>
          <div data-motion class="relative mt-16">
            <div aria-hidden="true" class="absolute top-[23px] hidden h-0.5 rounded-full bg-gray-200 md:block" style="left:24px;right:calc((100% - 80px) / 3 - 24px)">
              <div data-draw class="h-full w-full origin-left" style="background:linear-gradient(90deg,${ACCENT},#ffb38a)"></div>
            </div>
            <ol class="relative grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-10">${passos.map((p, i) => `
              <li>
                <span data-pop style="--d:${200 + i * 350}ms;background:${ACCENT}" class="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-full text-lg font-black text-white shadow-[0_10px_30px_-10px_rgba(249,89,1,.8)]">${i + 1}</span>
                <h3 data-reveal style="--d:${300 + i * 350}ms" class="mt-6 text-xl font-bold tracking-tight text-gray-900">${esc(p.title)}</h3>
                <p data-reveal style="--d:${380 + i * 350}ms" class="mt-2 text-gray-600">${esc(p.body)}</p>
              </li>`).join("")}
            </ol>
          </div>
          <div data-motion data-reveal class="mt-14">
            <a href="/criar" class="${BTN_MAIN}" style="background:${ACCENT}">Criar minha loja ${icon("arrow_forward", "text-[20px]")}</a>
          </div>
        </div>
      </section>`;
}
var FEATURES = [
  { icon: "edit_square", title: "Editor ao vivo", body: "Mude cores e textos e veja na hora." },
  { icon: "inventory_2", title: "Stock e varia\xE7\xF5es", body: "O que esgota deixa de se vender." },
  { icon: "local_shipping", title: "Entregas por zona", body: `${LUANDA_AREAS.length} zonas de ${DELIVERY_PROVINCE}, com a taxa j\xE1 somada.` },
  { icon: "sell", title: "C\xF3digos de desconto", body: "Com validade e usos contados." },
  { icon: "travel_explore", title: "Encontrada no Google", body: "Cada produto tem a sua p\xE1gina." },
  { icon: "monitoring", title: "Visitas e produtos", body: "Saiba o que os clientes mais veem." }
];
function featuresSection() {
  return `
      <section id="funcionalidades" class="scroll-mt-20 w-full bg-white py-24 md:py-32">
        <div class="${WRAP}">
          <div data-motion data-reveal class="max-w-2xl">
            ${eyebrow("Funcionalidades")}
            <h2 class="${H2}">Tudo o que o WhatsApp n\xE3o faz sozinho.</h2>
            <p class="${LEAD}">Cat\xE1logo, stock, entregas e descontos, ligados \xE0s conversas que j\xE1 tem.</p>
          </div>
          <div data-motion class="mt-14">
            <ul data-reveal class="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-3">${FEATURES.map((f, i) => `
              <li class="bg-white p-7 md:p-9">
                <span data-pop style="--d:${250 + i * 90}ms;background:${SOFT};color:${ACCENT_INK}" class="inline-flex h-11 w-11 items-center justify-center rounded-xl">${icon(f.icon, "text-[22px]")}</span>
                <h3 class="mt-5 text-lg font-bold tracking-tight text-gray-900">${esc(f.title)}</h3>
                <p class="mt-1.5 text-gray-600">${esc(f.body)}</p>
              </li>`).join("")}
            </ul>
          </div>
        </div>
      </section>`;
}
var DEMO_SALE_KZ = 2e4;
var WHATSAPP_FEE_PCT = feeForMethod("whatsapp", 100);
var DIGITAL_FEE_PCT = Number((PLATFORM_FEE_RATE * 100).toFixed(2));
function payLogo(src) {
  return `<img src="${src}" alt="" loading="lazy" decoding="async" class="h-11 w-11 rounded-full ring-4 ring-white" />`;
}
function payRow(o) {
  return `
                <div class="flex items-center gap-4 p-6 md:gap-6 md:p-8">
                  <span class="flex shrink-0 -space-x-3">${o.logos}</span>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-base font-bold text-gray-900 md:text-lg">${esc(o.title)}</h3>
                    <p class="mt-1 text-sm text-gray-600">${esc(o.body)}</p>
                  </div>
                  <p class="shrink-0 text-right">${o.value}<span class="block text-xs font-semibold text-gray-500">${esc(o.unit)}</span></p>
                </div>`;
}
function paymentsSection() {
  const venda = DEMO_SALE_KZ;
  const fee = platformFee(venda);
  const net = netForOwner(venda);
  const parteDoDono = (net / venda * 100).toFixed(1);
  const condicao = `${PAYMENTS_PROVIDER_READY ? "" : "Em breve. "}Para empresas registadas, depois de aprovarmos a Matr\xEDcula e a Certid\xE3o.`;
  const numero = "block text-3xl font-black tracking-tight tabular-nums text-gray-900 md:text-4xl";
  return `
      <section id="pagamentos" class="scroll-mt-20 w-full bg-gray-50 py-24 md:py-32">
        <div class="${WRAP} grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div data-motion data-reveal class="lg:col-span-5">
            ${eyebrow("Pagamentos")}
            <h2 class="${H2}">Receba como os seus clientes j\xE1 pagam.</h2>
            <p class="${LEAD}">Comece pelo WhatsApp, sem comiss\xE3o. Com a empresa aprovada, junte o Multicaixa Express e a Refer\xEAncia Banc\xE1ria.</p>
            <p class="mt-6 flex items-center gap-2 text-sm text-gray-500">${icon("receipt_long", "text-[18px]")}A fatura de cada venda sai em nome da sua empresa.</p>
          </div>
          <div data-motion class="lg:col-span-7">
            <div data-reveal class="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-gray-200 shadow-[0_40px_90px_-50px_rgba(17,24,39,.45)]">${payRow({
    logos: payLogo("/integrations/Whatsapp.png"),
    title: "WhatsApp",
    body: "Em todas as lojas, desde o primeiro dia. O cliente paga-lhe diretamente.",
    value: `<span class="${numero}">${WHATSAPP_FEE_PCT}%</span>`,
    unit: "de comiss\xE3o"
  })}
              <div class="border-t border-gray-100"></div>${payRow({
    logos: `${payLogo("/integrations/Express.png")}${payLogo("/integrations/ATM.png")}`,
    title: DIGITAL_PAYMENTS_LABEL,
    body: condicao,
    value: `<span data-count="${DIGITAL_FEE_PCT}" data-count-format="pct" class="${numero}">${esc(PLATFORM_FEE_LABEL)}</span>`,
    unit: "por venda"
  })}
              <div class="border-t border-gray-100 p-6 md:p-8" style="background:#fffaf6">
                <p class="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Exemplo: uma venda pelo Multicaixa</p>
                <div aria-hidden="true" class="mt-4 flex h-2.5 overflow-hidden rounded-full bg-gray-200">
                  <div data-draw style="--d:450ms;width:${parteDoDono}%;background:linear-gradient(90deg,${ACCENT},#ff8a4c)" class="h-full origin-left rounded-full"></div>
                </div>
                <dl class="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt class="text-gray-500">Venda</dt><dd class="mt-0.5 font-bold tabular-nums text-gray-900">${esc(kzWhole(venda))}</dd></div>
                  <div><dt class="text-gray-500">Comiss\xE3o</dt><dd class="mt-0.5 font-bold tabular-nums text-gray-900">-${esc(kzWhole(fee))}</dd></div>
                  <div class="text-right"><dt class="text-gray-500">Para levantar</dt><dd class="mt-0.5 font-black tabular-nums" style="color:${ACCENT_INK}"><span data-count="${net}" data-count-format="kz">${esc(kzWhole(net))}</span></dd></div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </section>`;
}
function pricingSection() {
  const incluido = PLAN_HIGHLIGHTS.map((f) => `
                  <li class="flex items-start gap-3 text-[15px] text-gray-700"><span class="mt-0.5 shrink-0" style="color:${ACCENT}">${icon("check_circle", "text-[20px]")}</span><span>${esc(f)}</span></li>`).join("");
  const soon = comingSoonList();
  const breve = soon.length ? `<p class="mt-8 border-t border-gray-100 pt-6 text-xs leading-relaxed text-gray-500">Em breve, e ainda n\xE3o inclu\xEDdo: ${esc(soon.join(", "))}.</p>` : "";
  return `
      <section id="precos" class="scroll-mt-20 w-full bg-white py-24 md:py-32">
        <div class="max-w-5xl mx-auto px-margin-mobile md:px-margin-desktop">
          <div data-motion data-reveal class="mx-auto max-w-2xl text-center">
            ${eyebrow("Pre\xE7o")}
            <h2 class="${H2}">Um s\xF3 plano. Tudo inclu\xEDdo.</h2>
            <p class="${LEAD}">Criar e ver a loja \xE9 gr\xE1tis. S\xF3 paga para a publicar.</p>
          </div>
          <div data-motion data-reveal class="mt-14">
            <div class="grid overflow-hidden rounded-[2rem] bg-white ring-1 ring-gray-200 shadow-[0_40px_90px_-50px_rgba(17,24,39,.45)] md:grid-cols-5">
              <div class="flex flex-col bg-gray-50 p-8 md:col-span-2 md:p-10">
                <h3 class="text-lg font-bold text-gray-900">${esc(PLAN_NAME)}</h3>
                <p class="mt-6 flex flex-wrap items-baseline gap-x-2"><span data-price class="text-5xl font-black tracking-tight text-gray-900">${esc(kzWhole(PLAN_PRICE_KZ))}</span><span data-period class="text-gray-500">${esc(planPeriodLabel())} ${esc(PLAN_UNIT_LABEL)}</span></p>
                <p class="mt-3 text-sm text-gray-500">Cada loja tem a sua subscri\xE7\xE3o. Cada pagamento cobre ${esc(PLAN_PERIOD_DAYS)} dias.</p>
                <a href="/criar" class="${BTN_MAIN} mt-8 w-full md:mt-auto" style="background:${ACCENT}">Criar minha loja ${icon("arrow_forward", "text-[20px]")}</a>
              </div>
              <div class="p-8 md:col-span-3 md:p-10">
                <p class="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">O que inclui</p>
                <ul class="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">${incluido}
                </ul>
                ${breve}
              </div>
            </div>
          </div>
        </div>
      </section>`;
}
function faqSection() {
  const items = platformFaq().map((f, i) => `
            <details class="group border-b border-gray-200 py-5"${i === 0 ? " open" : ""}>
              <summary class="flex cursor-pointer list-none items-start justify-between gap-6">
                <h3 class="text-base font-semibold text-gray-900 md:text-lg">${esc(f.question)}</h3>
                <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-gray-600 ring-1 ring-gray-200 transition-transform duration-300 group-open:rotate-45">${icon("add", "text-[18px]")}</span>
              </summary>
              <p class="mb-answer mt-3 pr-12 text-[15px] leading-relaxed text-gray-600">${esc(f.answer)}</p>
            </details>`).join("");
  return `
      <section id="perguntas" class="scroll-mt-20 w-full bg-gray-50 py-24 md:py-32">
        <div class="${WRAP} grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div data-motion data-reveal class="lg:col-span-4">
            ${eyebrow("D\xFAvidas")}
            <h2 class="${H2}">Perguntas frequentes</h2>
            <p class="${LEAD}">N\xE3o encontrou a resposta? Escreva para <a href="mailto:${esc(PLATFORM_CONTACT_EMAIL)}" class="font-semibold underline decoration-2 underline-offset-4" style="color:${ACCENT_INK}">${esc(PLATFORM_CONTACT_EMAIL)}</a>.</p>
          </div>
          <div class="lg:col-span-8">${items}
          </div>
        </div>
      </section>`;
}
function landingHtml() {
  return `
  ${glowCardStyleTag()}
  <style id="${LANDING_STYLE_ID}">${LANDING_CSS}</style>
  <div class="min-h-screen flex flex-col bg-white font-sans text-gray-900">
    ${platformNavHtml({
    brandHtml: `<a href="/" id="brand" class="flex items-center gap-2" aria-label="M\xF4Bisno, in\xEDcio">
          <img id="brand-logo" src="/logo-header.png" alt="M\xF4Bisno" class="w-auto object-contain" style="height:24px" />
        </a>`,
    actionsHtml: landingNavActions(false)
  })}

    <main class="flex-grow flex flex-col">${heroSection()}${partnersStrip()}${stepsSection()}${featuresSection()}${paymentsSection()}${pricingSection()}${faqSection()}
    </main>

    ${platformFooterHtml()}
  </div>`;
}

// web/ssr/entry.ts
function locationFor(req) {
  const host = String(req.host || "").trim();
  const hostname = host.toLowerCase().split(":")[0] ?? "";
  const port = host.includes(":") ? host.split(":")[1] ?? "" : "";
  const pathname = req.path && req.path.startsWith("/") ? req.path : `/${req.path ?? ""}`;
  const search = req.search && req.search !== "?" ? req.search : "";
  const origin = `https://${host}`;
  const href = `${origin}${pathname}${search}`;
  return {
    protocol: "https:",
    host,
    hostname,
    port,
    origin,
    pathname,
    search,
    hash: "",
    href,
    toString: () => href,
    assign: () => void 0,
    replace: () => void 0,
    reload: () => void 0
  };
}
function withLocation(req, fn) {
  return withGlobal("location", locationFor(req), fn);
}
function safeDecode(v) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
function storePage(html, view, custom, hideExcept) {
  const look2 = storeLook(view, custom);
  const styles = [...look2.styles];
  if (hideExcept !== void 0) styles.push(categoryHideStyle(hideExcept));
  return {
    html: look2.markIconTextButtons ? markIconTextButtonsHtml(html) : html,
    hash: fnv1a(html),
    appAttrs: lookAppAttrs(look2),
    headHtml: lookHeadHtml(styles)
  };
}
function renderStorePage(req) {
  return withLocation(req, () => {
    const loaded = storefrontFromRows(req.rows);
    if (!loaded || loaded.view.kind !== "render") return null;
    const { view, custom } = loaded;
    const prod = /^\/produto\/(.+)$/.exec(req.rest);
    if (prod) {
      const product = findProduct(view, safeDecode(prod[1]));
      if (!product) return { kind: "product_not_found" };
      const html = productPageHtml(view, product, custom, req.identifier);
      return {
        kind: "product",
        productId: product.id,
        canonicalPath: `/produto/${productSlugPath(product)}`,
        ...storePage(html, view, custom)
      };
    }
    const cat = /^\/categoria\/(.+)$/.exec(req.rest);
    if (cat) {
      const resolved = resolveCategory(view, safeDecode(cat[1]));
      if (!resolved.known) return { kind: "category_not_found" };
      const html = categoryPageHtml(view, resolved.label, custom);
      const hide = html.includes("data-cat-filter-bar") && !isAllListingLabel(resolved.label) ? resolved.label : void 0;
      return {
        kind: "category",
        label: resolved.label,
        canonicalPath: `/categoria/${categorySlug(categoryCanonicalLabel(resolved.label))}`,
        itemIds: filterForCategoryPage(view, resolved.label).map((p) => p.id),
        indexable: resolved.hasItems,
        ...storePage(html, view, custom, hide)
      };
    }
    return { kind: "home", ...storePage(storeHomeHtml(view, custom), view, custom) };
  });
}
function renderLandingPage(req) {
  return withLocation(req, () => {
    const html = landingHtml();
    return { html, hash: fnv1a(html), appAttrs: "", headHtml: "" };
  });
}
export {
  fnv1a,
  platformFaq,
  renderLandingPage,
  renderStorePage
};

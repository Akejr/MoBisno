/**
 * Seletor de localização com pin arrastável (Leaflet + OpenStreetMap, carregado
 * dinamicamente). Usado no editor para o bloco de localização.
 */
const ACCENT = "#F95901";
let leafletLoading: Promise<void> | null = null;

function loadLeaflet(): Promise<void> {
  if ((window as unknown as { L?: unknown }).L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => resolve();
    js.onerror = () => reject(new Error("Falha a carregar o mapa."));
    document.head.appendChild(js);
  });
  return leafletLoading;
}

export async function openMapPicker(opts: {
  lat?: number;
  lng?: number;
  address?: string;
  onSave: (lat: number, lng: number) => void;
}): Promise<void> {
  await loadLeaflet();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L = (window as any).L;

  let lat = typeof opts.lat === "number" ? opts.lat : -8.8390;
  let lng = typeof opts.lng === "number" ? opts.lng : 13.2894;

  if (opts.lat == null && opts.address && opts.address.trim() !== "") {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(opts.address)}`);
      const j = (await r.json()) as { lat: string; lon: string }[];
      if (j[0]) { lat = parseFloat(j[0].lat); lng = parseFloat(j[0].lon); }
    } catch { /* mantém o padrão */ }
  }

  const host = document.createElement("div");
  host.className = "fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4 font-sans";
  host.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h3 class="font-bold text-gray-900">Definir localização</h3>
        <button data-close class="text-gray-400 hover:text-gray-700"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="p-4">
        <p class="text-sm text-gray-500 mb-3 flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">drag_pan</span> Arraste o pin (ou clique no mapa) até à localização certa.</p>
        <div data-map style="height:380px" class="rounded-xl overflow-hidden border border-gray-200"></div>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
        <button data-cancel class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-semibold text-sm">Cancelar</button>
        <button data-save class="px-5 py-2 rounded-lg text-white font-bold text-sm" style="background:${ACCENT}">Guardar localização</button>
      </div>
    </div>`;
  document.body.appendChild(host);

  const mapEl = host.querySelector<HTMLElement>("[data-map]")!;
  const map = L.map(mapEl).setView([lat, lng], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
  marker.on("dragend", () => { const p = marker.getLatLng(); lat = p.lat; lng = p.lng; });
  map.on("click", (e: { latlng: { lat: number; lng: number } }) => { marker.setLatLng(e.latlng); lat = e.latlng.lat; lng = e.latlng.lng; });
  setTimeout(() => map.invalidateSize(), 120);

  const close = (): void => { map.remove(); host.remove(); };
  host.querySelector("[data-close]")!.addEventListener("click", close);
  host.querySelector("[data-cancel]")!.addEventListener("click", close);
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector("[data-save]")!.addEventListener("click", () => { opts.onSave(lat, lng); close(); });
}

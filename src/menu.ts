import "./styles/menu.css";
import { config } from "./services/config";
import type { Flavor, Product } from "./models";

const app = document.querySelector<HTMLDivElement>("#app")!;
const money = (amount: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const groupId = (name: string) => `grupo-${Array.from(name).map((char) => char.codePointAt(0)!.toString(16)).join("-")}`;
const presentationRank: Record<string, number> = { Vaso: 0, Cono: 1, Concha: 2, Tarrina: 3, Barril: 4 };
const usesFlavors = (presentation: string) => /^(vaso|cono|concha|tarrina|barril)$/i.test(presentation) || /helado/i.test(presentation);

async function publicCatalog<T>(path: string): Promise<T[]> {
  if (!config.apiUrl) throw new Error("El menú aún no tiene configurada la conexión con el catálogo.");
  const response = await fetch(`${config.apiUrl}${path}`);
  if (!response.ok) throw new Error("No fue posible cargar el menú en este momento.");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("El catálogo devolvió un formato inesperado.");
  return data as T[];
}

function frame(content: string): void {
  app.innerHTML = `<div class="menu-page" id="inicio">
    <header class="menu-header"><div class="menu-header-inner"><a class="menu-brand" href="#inicio" aria-label="Helados Alaska, ir al inicio"><img src="${import.meta.env.BASE_URL}alaska-logo-white.png" alt="Helados Alaska"></a><span class="menu-header-label">Nuestro menú</span></div></header>
    <main>${content}</main>
    <footer class="menu-footer"><span>Helados Alaska</span><span>Hechos para disfrutar.</span></footer>
  </div>`;
}

function render(products: Product[], flavors: Flavor[]): void {
  const activeProducts = products.filter((product) => product.is_active !== false && Number.isFinite(product.price) && product.price >= 0);
  const activeFlavors = flavors.filter((flavor) => flavor.is_active !== false).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const groups = new Map<string, Product[]>();
  for (const product of activeProducts) {
    const name = [...groups.keys()].find((candidate) => candidate.toLocaleLowerCase("es") === product.presentation.trim().toLocaleLowerCase("es")) ?? product.presentation.trim();
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(product);
  }
  const names = [...groups.keys()].sort((a, b) => (presentationRank[a] ?? 99) - (presentationRank[b] ?? 99) || a.localeCompare(b, "es"));
  const nav = names.map((name) => `<a href="#${groupId(name)}">${escapeHtml(name)}</a>`).join("");
  const sections = names.map((name, index) => {
    const cards = groups.get(name)!.sort((a, b) => a.price - b.price || a.size.localeCompare(b.size, "es")).map((product) => `<article class="menu-product"><div class="menu-product-copy"><span class="menu-product-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(product.size)}</h3>${usesFlavors(name) ? `<p>${product.max_flavors} sabor${product.max_flavors === 1 ? "" : "es"} a elegir</p>` : ""}</div></div><strong>${money(product.price)}</strong></article>`).join("");
    return `<section class="menu-section" id="${groupId(name)}"><div class="menu-section-heading"><span class="menu-section-index">${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(name)}</h2><span class="menu-section-count">${groups.get(name)!.length} presentaci${groups.get(name)!.length === 1 ? "ón" : "ones"}</span></div><div class="menu-product-list">${cards}</div></section>`;
  }).join("");
  frame(`<section class="menu-hero"><div class="menu-hero-inner"><div class="menu-hero-copy"><span class="menu-eyebrow">HELADOS ALASKA · MENÚ</span><h1>Un momento<br><em>más dulce.</em></h1><p>Elige tu presentación, encuentra tus sabores favoritos y descubre el precio antes de pedir.</p><a class="menu-hero-link" href="#productos">Ver productos <span aria-hidden="true">↗</span></a></div><div class="menu-hero-art" aria-hidden="true"><span class="menu-orbit orbit-one"></span><span class="menu-orbit orbit-two"></span><span class="menu-hero-word">Alaska<span>♥</span></span><span class="menu-hero-seal">HECHO<br>CON AMOR</span></div></div></section>
    <div class="menu-content" id="productos"><div class="menu-intro"><span class="menu-eyebrow">LO QUE TENEMOS PARA TI</span><h2>Encuentra tu favorito</h2><p>Precios en pesos colombianos. Los productos y sabores disponibles se actualizan desde nuestro catálogo.</p></div>${names.length ? `<nav class="menu-categories" aria-label="Presentaciones">${nav}</nav>${sections}` : `<div class="menu-empty">Todavía no hay productos disponibles.</div>`}
    <section class="menu-flavors"><div><span class="menu-eyebrow">EL TOQUE FINAL</span><h2>Sabores para elegir</h2><p>Combínalos según la cantidad de sabores de tu presentación.</p></div><div class="menu-flavor-list">${activeFlavors.length ? activeFlavors.map((flavor) => `<span>${escapeHtml(flavor.name)}</span>`).join("") : `<span>Consulta los sabores disponibles en tienda.</span>`}</div></section><p class="menu-note">La disponibilidad de productos y sabores puede variar en el punto de venta.</p></div>`);
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : "No fue posible cargar el menú.";
  frame(`<section class="menu-error"><span class="menu-eyebrow">HELADOS ALASKA</span><h1>El menú no está disponible</h1><p>${escapeHtml(message)}</p><button type="button" id="retry-menu">Intentar de nuevo</button></section>`);
  document.querySelector<HTMLButtonElement>("#retry-menu")?.addEventListener("click", () => load());
}

async function load(): Promise<void> {
  frame(`<section class="menu-loading" role="status">Cargando menú…</section>`);
  try {
    const [products, flavors] = await Promise.all([publicCatalog<Product>("/products"), publicCatalog<Flavor>("/flavors")]);
    render(products, flavors);
  } catch (error) { showError(error); }
}

void load();

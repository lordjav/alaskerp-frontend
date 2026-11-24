import "./styles/menu.css";
import type { Flavor, Product } from "./models";

type Language = "es" | "en";

const app = document.querySelector<HTMLDivElement>("#app")!;
const menuApiUrl = (import.meta.env.VITE_MENU_API_URL as string | undefined)?.replace(/\/$/, "");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const groupId = (name: string) => `grupo-${Array.from(name).map((char) => char.codePointAt(0)!.toString(16)).join("-")}`;
const presentationRank: Record<string, number> = { Vaso: 0, Cono: 1, Concha: 2, Tarrina: 3, Barril: 4 };
const usesFlavors = (presentation: string) => /^(vaso|cono|concha|tarrina|barril|malteada)$/i.test(presentation) || /helado/i.test(presentation);

const presentationEn: Record<string, string> = {
  Vaso: "Cup", Cono: "Cone", Concha: "Concha (wafer shell)",
  "Brownie + helado": "Brownie & ice cream",
  "Ensalada de frutas + helado": "Fruit salad & ice cream",
  Malteada: "Milkshake", Salpicón: "Salpicón (fruit salad drink)",
  "Salpicón + helado": "Salpicón & ice cream",
  Torta: "Cake", "Torta + helado": "Cake & ice cream",
  Agua: "Water", Tarrina: "Ice cream tub", Barril: "Ice cream barrel",
};
const sizeEn: Record<string, string> = {
  Pequeño: "Small", Pequeña: "Small", Mediano: "Medium", Mediana: "Medium",
  Grande: "Large", "16 onzas": "16 oz", "1 litro": "1 liter",
  "1/2 litro": "1/2 liter", "1/4 litro": "1/4 liter",
  "4 litros": "4 liters", "8 litros": "8 liters",
};
const flavorEn: Record<string, string> = {
  Ahuyama: "Pumpkin", Ajonjolí: "Sesame", Arequipe: "Dulce de leche",
  Arroz: "Rice", Berenjena: "Eggplant", Café: "Coffee", Chips: "Chips",
  Chocolate: "Chocolate", Ciruela: "Plum", Coco: "Coconut", Galleta: "Cookie",
  Guanábana: "Soursop", Maíz: "Corn", Maní: "Peanut",
  Maracuyá: "Passion fruit", Níspero: "Níspero", Nutella: "Nutella",
  Ñame: "Yam", Oreo: "Oreo", "Ron con pasas": "Rum raisin",
  Vainilla: "Vanilla", Yuca: "Cassava", Zapote: "Zapote",
};

const copy = {
  es: {
    title: "Menú | Helados Alaska", switchLabel: "English", switchAria: "Cambiar a inglés",
    homeAria: "Helados Alaska, ir al inicio", footerTagline: "Hechos para disfrutar.",
    developer: "Desarrollado por", heroEyebrow: "HELADOS ALASKA · MENÚ",
    heroFirst: "Un momento", heroSecond: "más dulce.",
    heroDescription: "Elige tu presentación, encuentra tus sabores favoritos y descubre el precio antes de pedir.",
    heroLink: "Ver el menú", heroSeal: "HECHO<br>CON AMOR",
    flavorsEyebrow: "ELIGE TU FAVORITO", flavorsTitle: "Sabores para elegir",
    flavorsDescription: "Combínalos según la cantidad de sabores de tu presentación.",
    noFlavors: "Consulta los sabores disponibles en tienda.",
    productsEyebrow: "LO QUE TENEMOS PARA TI", productsTitle: "Encuentra tu favorito",
    productsDescription: "Precios en pesos colombianos. Los productos y sabores disponibles se actualizan desde nuestro catálogo.",
    presentations: "Presentaciones", option: "presentación", options: "presentaciones",
    flavor: "sabor a elegir", flavors: "sabores a elegir",
    takeawayEyebrow: "PARA COMPARTIR O GUARDAR", takeawayTitle: "Para llevar...",
    empty: "Todavía no hay productos disponibles.",
    note: "La disponibilidad de productos y sabores puede variar en el punto de venta.",
    loading: "Cargando menú…", errorTitle: "El menú no está disponible",
    errorMessage: "No fue posible cargar el menú en este momento.",
    missingApi: "El menú aún no tiene configurada la conexión con el catálogo.",
    invalidCatalog: "El catálogo devolvió un formato inesperado.",
    retry: "Intentar de nuevo",
  },
  en: {
    title: "Menu | Helados Alaska", switchLabel: "Español", switchAria: "Switch to Spanish",
    homeAria: "Helados Alaska, back to top", footerTagline: "Made to be enjoyed.",
    developer: "Developed by", heroEyebrow: "HELADOS ALASKA · MENU",
    heroFirst: "A sweeter", heroSecond: "moment.",
    heroDescription: "Choose how you'd like it served, pick your favorite flavors, and check the price before you order.",
    heroLink: "View the menu", heroSeal: "MADE<br>WITH LOVE",
    flavorsEyebrow: "PICK YOUR FAVORITE", flavorsTitle: "Choose your flavors",
    flavorsDescription: "Mix and match according to how many flavors your serving includes.",
    noFlavors: "Ask about the flavors available in store.",
    productsEyebrow: "WHAT WE HAVE FOR YOU", productsTitle: "Find your favorite",
    productsDescription: "Prices are in Colombian pesos. Products and flavors are updated from our catalog.",
    presentations: "Servings", option: "option", options: "options",
    flavor: "flavor to choose", flavors: "flavors to choose",
    takeawayEyebrow: "TO SHARE OR SAVE FOR LATER", takeawayTitle: "Take it home...",
    empty: "No products are available yet.",
    note: "Product and flavor availability may vary in store.",
    loading: "Loading menu…", errorTitle: "The menu is unavailable",
    errorMessage: "We couldn't load the menu right now.",
    missingApi: "The menu is not connected to the catalog yet.",
    invalidCatalog: "The catalog returned an unexpected format.",
    retry: "Try again",
  },
} as const;

let language: Language = new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "es";
let catalog: { products: Product[]; flavors: Flavor[] } | null = null;
let lastError: unknown = null;
const t = (key: keyof typeof copy.es): string => copy[language][key];
const displayName = (name: string, translations: Record<string, string>) => language === "en" ? translations[name] ?? name : name;
const money = (amount: number) => language === "en"
  ? `COP ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`
  : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);

async function publicCatalog<T>(path: string): Promise<T[]> {
  if (!menuApiUrl) throw new Error("missingApi");
  const response = await fetch(`${menuApiUrl}${path}`);
  if (!response.ok) throw new Error("errorMessage");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("invalidCatalog");
  return data as T[];
}

function restorePosition(anchorId: string, fallbackY: number): void {
  const previousBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  const anchor = anchorId ? document.getElementById(anchorId) : null;
  if (anchor) anchor.scrollIntoView();
  else window.scrollTo(0, fallbackY);
  document.documentElement.style.scrollBehavior = previousBehavior;
}

function switchLanguage(): void {
  const previousScrollY = window.scrollY;
  const anchorId = window.location.hash.slice(1);
  language = language === "es" ? "en" : "es";
  const url = new URL(window.location.href);
  if (language === "en") url.searchParams.set("lang", "en");
  else url.searchParams.delete("lang");
  window.history.replaceState(window.history.state, "", url.toString());
  if (catalog) render(catalog.products, catalog.flavors);
  else if (lastError) showError(lastError);
  else frame(`<section class="menu-loading" role="status">${t("loading")}</section>`);
  restorePosition(anchorId, previousScrollY);
  document.querySelector<HTMLButtonElement>("#menu-language-switch")?.focus({ preventScroll: true });
}

function frame(content: string): void {
  document.documentElement.lang = language;
  document.title = t("title");
  app.innerHTML = `<div class="menu-page" id="inicio">
    <header class="menu-header"><div class="menu-header-inner"><a class="menu-brand" href="#inicio" aria-label="${t("homeAria")}"><img src="${import.meta.env.BASE_URL}alaska-logo-white.png" alt="Helados Alaska"></a><button class="menu-language-switch" id="menu-language-switch" type="button" aria-label="${t("switchAria")}"><span class="menu-language-code">${language === "es" ? "EN" : "ES"}</span><span>${t("switchLabel")}</span></button></div></header>
    <main>${content}</main>
    <footer class="menu-footer"><div class="menu-footer-main"><span>Helados Alaska</span><span>${t("footerTagline")}</span></div><small class="menu-developer-credit">${t("developer")} <a href="https://javiermeza.dev" target="_blank" rel="noreferrer">javiermeza.dev</a></small></footer>
  </div>`;
  document.querySelector<HTMLButtonElement>("#menu-language-switch")?.addEventListener("click", switchLanguage);
}

function render(products: Product[], flavors: Flavor[]): void {
  const activeProducts = products.filter((product) => product.is_active !== false && Number.isFinite(product.price) && product.price >= 0);
  const activeFlavors = flavors.filter((flavor) => flavor.is_active !== false).sort((a, b) =>
    displayName(a.name, flavorEn).localeCompare(displayName(b.name, flavorEn), language));
  const groups = new Map<string, Product[]>();
  for (const product of activeProducts) {
    const name = [...groups.keys()].find((candidate) => candidate.toLocaleLowerCase("es") === product.presentation.trim().toLocaleLowerCase("es")) ?? product.presentation.trim();
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(product);
  }
  const names = [...groups.keys()].sort((a, b) => (presentationRank[a] ?? 99) - (presentationRank[b] ?? 99) || a.localeCompare(b, "es"));
  const forTakeaway = (name: string) => /^(tarrina|barril)$/i.test(name);
  const isWater = (name: string) => name.toLocaleLowerCase("es") === "agua";
  const regularNames = [...names.filter((name) => !forTakeaway(name) && !isWater(name)), ...names.filter(isWater)];
  const takeawayNames = names.filter(forTakeaway);
  const nav = regularNames.map((name) => `<a href="#${groupId(name)}">${escapeHtml(displayName(name, presentationEn))}</a>`).join("");
  const renderSection = (name: string, index: number) => {
    const cards = groups.get(name)!.sort((a, b) => a.price - b.price || a.size.localeCompare(b.size, "es")).map((product) => {
      const flavorCount = product.max_flavors;
      const flavorText = `${flavorCount} ${flavorCount === 1 ? t("flavor") : t("flavors")}`;
      return `<article class="menu-product"><div class="menu-product-copy"><span class="menu-product-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(displayName(product.size, sizeEn))}</h3>${usesFlavors(name) ? `<p>${flavorText}</p>` : ""}</div></div><strong>${money(product.price)}</strong></article>`;
    }).join("");
    const count = groups.get(name)!.length;
    return `<section class="menu-section" id="${groupId(name)}"><div class="menu-section-heading"><span class="menu-section-index">${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(displayName(name, presentationEn))}</h2><span class="menu-section-count">${count} ${count === 1 ? t("option") : t("options")}</span></div><div class="menu-product-list">${cards}</div></section>`;
  };
  const sections = regularNames.map(renderSection).join("");
  const takeaway = takeawayNames.length ? `<section class="menu-takeaway" aria-labelledby="menu-takeaway-title"><div class="menu-takeaway-heading"><span class="menu-eyebrow">${t("takeawayEyebrow")}</span><h2 id="menu-takeaway-title">${t("takeawayTitle")}</h2></div>${takeawayNames.map((name, index) => renderSection(name, regularNames.length + index)).join("")}</section>` : "";
  frame(`<section class="menu-hero"><div class="menu-hero-inner"><div class="menu-hero-copy"><span class="menu-eyebrow">${t("heroEyebrow")}</span><h1>${t("heroFirst")}<br><em>${t("heroSecond")}</em></h1><p>${t("heroDescription")}</p><a class="menu-hero-link" href="#sabores">${t("heroLink")} <span aria-hidden="true">↗</span></a></div><div class="menu-hero-art" aria-hidden="true"><span class="menu-orbit orbit-one"></span><span class="menu-orbit orbit-two"></span><span class="menu-hero-word">Alaska<span>♥</span></span><span class="menu-hero-seal">${t("heroSeal")}</span></div></div></section>
    <div class="menu-content"><section class="menu-flavors" id="sabores"><div><span class="menu-eyebrow">${t("flavorsEyebrow")}</span><h2>${t("flavorsTitle")}</h2><p>${t("flavorsDescription")}</p></div><div class="menu-flavor-list">${activeFlavors.length ? activeFlavors.map((flavor) => `<span>${escapeHtml(displayName(flavor.name, flavorEn))}</span>`).join("") : `<span>${t("noFlavors")}</span>`}</div></section>
    <div class="menu-intro" id="productos"><span class="menu-eyebrow">${t("productsEyebrow")}</span><h2>${t("productsTitle")}</h2><p>${t("productsDescription")}</p></div>${names.length ? `${regularNames.length ? `<nav class="menu-categories" aria-label="${t("presentations")}">${nav}</nav>` : ""}${sections}${takeaway}` : `<div class="menu-empty">${t("empty")}</div>`}<p class="menu-note">${t("note")}</p></div>`);
}

function showError(error: unknown): void {
  lastError = error;
  const code = error instanceof Error ? error.message : "";
  const key = code === "missingApi" || code === "invalidCatalog" ? code : "errorMessage";
  frame(`<section class="menu-error"><span class="menu-eyebrow">HELADOS ALASKA</span><h1>${t("errorTitle")}</h1><p>${t(key)}</p><button type="button" id="retry-menu">${t("retry")}</button></section>`);
  document.querySelector<HTMLButtonElement>("#retry-menu")?.addEventListener("click", () => void load());
}

async function load(): Promise<void> {
  lastError = null;
  frame(`<section class="menu-loading" role="status">${t("loading")}</section>`);
  try {
    const [products, flavors] = await Promise.all([publicCatalog<Product>("/products"), publicCatalog<Flavor>("/flavors")]);
    catalog = { products, flavors };
    render(products, flavors);
    if (window.location.hash) restorePosition(window.location.hash.slice(1), window.scrollY);
  } catch (error) { showError(error); }
}

void load();

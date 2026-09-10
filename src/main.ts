import { showReceipt, showPrinterSettings, manualDrawer } from "./components/receipts";
import "./styles/main.css";
import { api } from "./services/api";
import { acceptCallback, isAuthenticated, login, logout, roles, username } from "./services/auth";
import { authConfigured } from "./services/config";
import type { CartItem, Flavor, Metrics, Page, Product, Role, Sale } from "./models";

const app = document.querySelector<HTMLDivElement>("#app")!;
let products: Product[] = [];
let flavors: Flavor[] = [];
let cart: CartItem[] = [];
let chosenProduct: Product | null = null;
let chosenFlavors: string[] = [];
let selectedPayment = "cash";
let cashReceived = "";
let saleBusy = false;
let pendingSale: { key: string; payload: string } | null = null;
let lastSale: Sale | null = null;
let posModal: "products" | "flavors" | "quantity" | null = null;

const labels: Record<Page, string> = { pos: "Registrar venta", sales: "Listado de ventas", metrics: "Métricas", settings: "Configuración" };
const paymentLabels: Record<string, string> = { cash: "Efectivo", nequi: "Nequi", bancolombia: "Bancolombia", credit_card: "Tarjeta", other: "Otro" };
const allowed: Record<Page, Role[]> = { pos: ["seller", "manager", "admin"], sales: ["manager", "observer", "admin"], metrics: ["manager", "admin"], settings: ["admin"] };
const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const capitalize = (value: string) => (value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : value);
const presentationRank: Record<string, number> = { Vaso: 0, Cono: 1, Concha: 2, Tarrina: 3, Barril: 4 };
const byPresentation = (a: Product, b: Product) => (presentationRank[a.presentation] ?? 99) - (presentationRank[b.presentation] ?? 99) || a.price - b.price;
const bogotaDate = (offsetDays = 0) => {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const today = () => bogotaDate();
const route = (): Page => (location.hash.replace("#/", "") || "pos") as Page;
const has = (page: Page) => roles().some((role) => allowed[page].includes(role));

function shell(content: string, page: Page): void {
  const nav = (Object.keys(labels) as Page[]).filter(has).map((item) => `<button class="${page === item ? "active" : ""}" data-nav="${item}">${labels[item]}</button>`).join("");
  const printerTools = has("pos") ? `<div class="side-tools"><button data-printer-settings>Tiquetes e impresora</button><button data-open-drawer>Abrir cajón</button></div>` : "";
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand">alaska<small>Helados · ERP</small></div><nav class="nav">${nav}</nav>${printerTools}<footer class="side-user"><div class="user-card"><span class="user-avatar">${(username()[0] ?? "?").toUpperCase()}</span><span class="user-name" title="${username()}">${capitalize(username())}</span></div><button class="logout" data-logout><svg class="logout-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Cerrar sesión</button></footer></aside><main class="page ${page === "pos" ? "pos-page" : ""}">${content}</main></div>`;
  document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((button) => button.onclick = () => { location.hash = `#/${button.dataset.nav}`; });
  document.querySelector<HTMLButtonElement>("[data-printer-settings]")?.addEventListener("click", showPrinterSettings);
  document.querySelector<HTMLButtonElement>("[data-open-drawer]")?.addEventListener("click", event => void manualDrawer(event.currentTarget as HTMLButtonElement));
  document.querySelector<HTMLButtonElement>("[data-logout]")?.addEventListener("click", logout);
}

function title(name: string, subtitle: string, action = ""): string { return `<div class="heading"><div><h1>${name}</h1><p>${subtitle}</p></div>${action}</div>`; }
function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
  app.innerHTML = `<div class="login"><div class="login-card"><div class="brand">alaska<small>Helados · ERP</small></div><p>${message}</p><div class="notice">Verifica que estés usando un navegador actualizado y vuelve a intentarlo.</div><button class="primary" id="retry-login">Intentar nuevamente</button></div></div>`;
  document.querySelector<HTMLButtonElement>("#retry-login")?.addEventListener("click", () => bootstrap().catch(showError));
}

function askConfirmation(titleText: string, message: string, confirmText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML = `<section class="modal confirm-modal" role="dialog" aria-modal="true"><p class="step-label">Confirma la acción</p><h2>${titleText}</h2><p>${message}</p><div class="confirm-actions"><button class="outline" data-confirm-no>Cancelar</button><button class="primary" data-confirm-yes>${confirmText}</button></div></section>`;
    const close = (result: boolean) => { overlay.remove(); resolve(result); };
    overlay.querySelector<HTMLButtonElement>("[data-confirm-no]")!.onclick = () => close(false);
    overlay.querySelector<HTMLButtonElement>("[data-confirm-yes]")!.onclick = () => close(true);
    document.body.append(overlay);
  });
}

function notify(titleText: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML = `<section class="modal confirm-modal" role="dialog" aria-modal="true"><p class="step-label">Listo</p><h2>${titleText}</h2><p>${message}</p><div class="confirm-actions single"><button class="primary" data-ok>Entendido</button></div></section>`;
    const close = () => { overlay.remove(); resolve(); };
    const button = overlay.querySelector<HTMLButtonElement>("[data-ok]")!;
    button.onclick = close;
    document.body.append(overlay);
    button.focus();
  });
}

function askText(titleText: string, label: string, opts: { value?: string; placeholder?: string; confirmText?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML = `<section class="modal confirm-modal" role="dialog" aria-modal="true"><p class="step-label">Datos</p><h2>${titleText}</h2><label class="field">${label}<input class="modal-input" maxlength="120" placeholder="${opts.placeholder ?? ""}"></label><div class="confirm-actions"><button class="outline" data-cancel>Cancelar</button><button class="primary" data-confirm>${opts.confirmText ?? "Guardar"}</button></div></section>`;
    const input = overlay.querySelector<HTMLInputElement>(".modal-input")!;
    input.value = opts.value ?? "";
    const close = (result: string | null) => { overlay.remove(); resolve(result); };
    const confirm = () => { const value = input.value.trim(); if (!value) { input.focus(); return; } close(value); };
    overlay.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = () => close(null);
    overlay.querySelector<HTMLButtonElement>("[data-confirm]")!.onclick = confirm;
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") confirm(); if (event.key === "Escape") close(null); });
    document.body.append(overlay);
    input.focus();
    input.select();
  });
}

function askForm(titleText: string, fields: Array<{ name: string; label: string; value?: string; type?: string; min?: number; max?: number; options?: Array<[string, string]> }>, confirmText = "Guardar"): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    const controls = fields.map((field) => {
      if (field.type === "select") { const options = (field.options ?? []).map(([value, label]) => `<option value="${value}">${label}</option>`).join(""); return `<label class="field">${field.label}<select data-name="${field.name}">${options}</select></label>`; }
      return `<label class="field">${field.label}<input data-name="${field.name}" type="${field.type ?? "text"}"${field.min !== undefined ? ` min="${field.min}"` : ""}${field.max !== undefined ? ` max="${field.max}"` : ""} maxlength="120"></label>`;
    }).join("");
    overlay.innerHTML = `<section class="modal confirm-modal form-modal" role="dialog" aria-modal="true"><p class="step-label">Datos</p><h2>${titleText}</h2><div class="form-grid">${controls}</div><div class="confirm-actions"><button class="outline" data-cancel>Cancelar</button><button class="primary" data-confirm>${confirmText}</button></div></section>`;
    const elements = Array.from(overlay.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-name]"));
    fields.forEach((field, index) => { if (field.value !== undefined) elements[index].value = field.value; });
    const close = (result: Record<string, string> | null) => { overlay.remove(); resolve(result); };
    overlay.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = () => close(null);
    overlay.querySelector<HTMLButtonElement>("[data-confirm]")!.onclick = () => { const output: Record<string, string> = {}; for (const element of elements) output[element.dataset.name!] = element.value.trim(); close(output); };
    document.body.append(overlay);
    (elements[0] as HTMLElement | undefined)?.focus();
  });
}

function buildModal(inner: string): { overlay: HTMLDivElement; close: () => void } {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `<section class="modal confirm-modal entity-modal" role="dialog" aria-modal="true">${inner}</section>`;
  const close = () => overlay.remove();
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  document.body.append(overlay);
  return { overlay, close };
}

function editFlavorEntity(flavor: Flavor, usage: number): void {
  const { overlay, close } = buildModal(`<p class="step-label">Sabor</p><h2>${flavor.name}</h2><div class="entity-usage"><span>Pedido</span><strong>${scoops(usage)}</strong><small>últimos 30 días</small></div><label class="field">Nombre<input class="modal-input" maxlength="60"></label><div class="confirm-actions triple"><button class="outline danger" data-delete>Eliminar</button><button class="outline" data-cancel>Cancelar</button><button class="primary" data-confirm>Actualizar</button></div>`);
  const input = overlay.querySelector<HTMLInputElement>(".modal-input")!;
  input.value = flavor.name;
  overlay.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = close;
  overlay.querySelector<HTMLButtonElement>("[data-confirm]")!.onclick = async () => { const name = input.value.trim(); if (!name) { input.focus(); return; } await api.updateFlavor(flavor.id, name); close(); await renderSettings(); };
  overlay.querySelector<HTMLButtonElement>("[data-delete]")!.onclick = async () => { if (await askConfirmation("¿Eliminar sabor?", `${flavor.name} dejará de estar disponible para nuevas ventas.`, "Eliminar")) { await api.deleteFlavor(flavor.id); close(); await renderSettings(); } };
  input.focus(); input.select();
}

function editProductEntity(product: Product, usage: number): void {
  const { overlay, close } = buildModal(`<p class="step-label">Producto</p><h2>${product.presentation} · ${product.size}</h2><div class="entity-usage"><span>Ventas</span><strong>${money(usage)}</strong><small>últimos 30 días</small></div><div class="form-grid"><label class="field">Presentación<input data-name="presentation" maxlength="40"></label><label class="field">Tamaño<input data-name="size" maxlength="40"></label><label class="field">Máx. sabores<input data-name="max_flavors" type="number" min="1" max="6"></label><label class="field">Precio COP<input data-name="price" type="number" min="0"></label></div><div class="confirm-actions triple"><button class="outline danger" data-delete>Eliminar</button><button class="outline" data-cancel>Cancelar</button><button class="primary" data-confirm>Actualizar</button></div>`);
  const field = (name: string) => overlay.querySelector<HTMLInputElement>(`[data-name="${name}"]`)!;
  field("presentation").value = product.presentation; field("size").value = product.size; field("max_flavors").value = String(product.max_flavors); field("price").value = String(product.price);
  overlay.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = close;
  overlay.querySelector<HTMLButtonElement>("[data-confirm]")!.onclick = async () => { const presentation = field("presentation").value.trim(); const size = field("size").value.trim(); const max_flavors = Number(field("max_flavors").value); const price = Number(field("price").value); if (!presentation || !size || !Number.isInteger(max_flavors) || !Number.isInteger(price)) return; await api.updateProduct(product.id, { presentation, size, max_flavors, price }); close(); await renderSettings(); };
  overlay.querySelector<HTMLButtonElement>("[data-delete]")!.onclick = async () => { if (await askConfirmation("¿Eliminar producto?", `${product.presentation} · ${product.size} dejará de estar disponible para nuevas ventas.`, "Eliminar")) { await api.deleteProduct(product.id); close(); await renderSettings(); } };
}

function editUserEntity(user: { username: string; email: string; enabled: boolean; status: string; role: string | null }, usage: number): void {
  const toggleLabel = user.enabled ? "Deshabilitar" : "Habilitar";
  const isAdmin = user.role === "admin";
  const roleLabels: Record<string, string> = { seller: "Vendedor", manager: "Manager", observer: "Observador", admin: "Admin" };
  const toggleButton = isAdmin ? "" : `<button class="outline ${user.enabled ? "danger" : "primary-ghost"}" data-toggle>${toggleLabel}</button>`;
  const { overlay, close } = buildModal(`<p class="step-label">Usuario</p><h2>${capitalize(user.username)}</h2><div class="entity-usage"><span>Ventas</span><strong>${money(usage)}</strong><small>últimos 30 días</small></div><dl class="entity-details"><div><dt>Correo</dt><dd>${user.email}</dd></div><div><dt>Perfil</dt><dd>${user.role ? roleLabels[user.role] ?? user.role : "—"}</dd></div><div><dt>Estado</dt><dd>${user.enabled ? "Activo" : "Inactivo"}</dd></div></dl><div class="confirm-actions${toggleButton ? "" : " single"}"><button class="outline" data-cancel>Cerrar</button>${toggleButton}</div>`);
  overlay.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = close;
  overlay.querySelector<HTMLButtonElement>("[data-toggle]")?.addEventListener("click", async () => { const enabled = !user.enabled; if (await askConfirmation(`${toggleLabel} usuario`, `¿Deseas ${toggleLabel.toLowerCase()} a ${capitalize(user.username)}?`, toggleLabel)) { await api.setUserEnabled(user.username, enabled); close(); await renderSettings(); } });
}

async function renderPos(): Promise<void> {
  if (!products.length) [products, flavors] = await Promise.all([api.products(), api.flavors()]);
  const productButtons = [...products].sort(byPresentation).map((p) => `<button class="choice ${chosenProduct?.id === p.id ? "selected" : ""}" data-product="${p.id}"><strong>${p.presentation} · ${p.size}</strong><span>${p.max_flavors} sabor${p.max_flavors > 1 ? "es" : ""} · ${money(p.price)}</span></button>`).join("");
  const flavorButtons = [...[...flavors].sort((a, b) => a.name.localeCompare(b.name, "es")).map((f) => f.name), "Otro"].map((flavor) => { const count = chosenFlavors.filter((value) => value === flavor).length; return `<button class="choice flavor-choice ${count ? "selected" : ""}" data-flavor="${flavor}">${count ? `<b class="flavor-count">${count}</b>` : ""}${flavor}</button>`; }).join("");
  const cartItems = cart.length ? cart.map((item, index) => `<div class="cart-item"><div><strong>${item.product.presentation} · ${item.product.size}</strong><br><small>${item.flavors.join(", ")} · Cantidad ${item.quantity}</small></div><div><strong>${money(item.product.price * item.quantity)}</strong><br><button class="outline" data-remove="${index}">Quitar</button></div></div>`).join("") : `<div class="empty">Elige un producto para comenzar.</div>`;
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const paymentOptions = [["cash", "Efectivo"], ["nequi", "Nequi"], ["bancolombia", "Bancolombia"], ["credit_card", "Tarjeta"], ["other", "Otro"]] as const;
  const paymentButtons = paymentOptions.map(([value, label]) => `<button class="payment-option ${selectedPayment === value ? "selected" : ""}" data-payment="${value}">${label}</button>`).join("");
  const received = Number(cashReceived);
  const cashSummary = selectedPayment === "cash" ? `<div class="cash-payment"><label class="field">Pago recibido<input id="cash-received" type="number" inputmode="numeric" min="0" step="1" placeholder="Ingresa el valor recibido" value="${cashReceived}"></label><div class="cash-change ${cashReceived && (!Number.isInteger(received) || received < total) ? "invalid" : ""}"><span>Devolución</span><strong id="cash-change-value">${cashReceived && Number.isInteger(received) && received >= total ? money(received - total) : "—"}</strong></div><p class="cash-help" id="cash-help">${cashReceived && received < total ? `Faltan ${money(total - received)} para completar el pago.` : "La devolución se calcula al ingresar el efectivo recibido."}</p></div>` : "";
  const productModal = posModal === "products" ? `<div class="modal-backdrop"><section class="modal pos-modal" role="dialog" aria-modal="true"><div class="modal-heading"><div><p class="step-label">Paso 1 de 3</p><h2>Elige un producto</h2></div><button class="modal-close" data-close-products aria-label="Cerrar">×</button></div><div class="grid product-grid modal-products">${productButtons || "<div class=empty>No hay productos activos.</div>"}</div></section></div>` : "";
  const flavorModal = posModal === "flavors" && chosenProduct ? `<div class="modal-backdrop"><section class="modal pos-modal" role="dialog" aria-modal="true"><div class="modal-heading"><div><p class="step-label">Paso 2 de 3</p><h2>Elige ${chosenProduct.max_flavors} sabor${chosenProduct.max_flavors > 1 ? "es" : ""}</h2><p>${chosenProduct.presentation} · ${chosenProduct.size} · ${money(chosenProduct.price)}</p></div><button class="modal-close" data-close-modal aria-label="Cancelar selección">×</button></div><div class="flavor-progress"><span>${chosenFlavors.length} de ${chosenProduct.max_flavors} seleccionados</span><div><i style="width:${(chosenFlavors.length / chosenProduct.max_flavors) * 100}%"></i></div></div><div class="grid flavors modal-flavors">${flavorButtons}</div><button class="outline modal-cancel" data-close-modal>Cancelar</button></section></div>` : "";
  const quantityModal = posModal === "quantity" && chosenProduct ? `<div class="modal-backdrop"><section class="modal pos-modal quantity-modal" role="dialog" aria-modal="true"><div class="modal-heading"><div><p class="step-label">Paso 3 de 3</p><h2>¿Cuántos deseas?</h2><p>${chosenProduct.presentation} · ${chosenProduct.size} · ${chosenFlavors.join(", ")}</p></div><button class="modal-close" data-close-modal aria-label="Cancelar selección">×</button></div><div class="quantity-control modal-quantity"><button class="quantity-button" data-quantity-delta="-1" aria-label="Disminuir cantidad">−</button><output id="quantity">1</output><button class="quantity-button" data-quantity-delta="1" aria-label="Aumentar cantidad">+</button></div><button class="primary modal-add" id="add-cart">Agregar al carrito · ${money(chosenProduct.price)}</button><button class="outline modal-cancel" data-back-to-flavors>Volver a sabores</button></section></div>` : "";
  shell(`${title("Registrar venta", "Toca el botón para elegir un producto.")}<div class="pos-screen"><div class="pos"><div class="pos-left"><section class="panel catalog-panel"><div><p class="step-label">Paso 1 de 3</p><h2 class="section-title">Producto</h2><button class="primary catalog-launch" data-open-products>Elegir producto</button></div><div class="pos-tools"><button class="outline" id="printer-settings">Tiquetes e impresora</button><button class="outline" id="open-drawer">Abrir cajón</button><button class="outline" id="last-receipt" ${lastSale ? "" : "disabled"}>Último tiquete</button></div><div class="catalog-hint">Elige la presentación y el tamaño. Después seleccionarás los sabores y la cantidad.</div></section><section class="panel payment-panel"><h2 class="section-title">Método de pago</h2><div class="payment-options">${paymentButtons}</div>${cashSummary}${selectedPayment === "other" ? `<label class="field payment-comment">Comentario para Otro<input id="payment-comment" maxlength="300" placeholder="Describe el método de pago"></label>` : ""}</section></div><aside class="panel cart"><h2 class="section-title">Venta actual</h2><div class="cart-items">${cartItems}</div><div class="total"><span>Total</span><span>${money(total)}</span></div><button class="primary checkout-action" id="confirm-sale" ${!cart.length ? "disabled" : ""}>Confirmar venta</button></aside></div></div>${productModal}${flavorModal}${quantityModal}`, "pos");
  document.querySelector<HTMLButtonElement>("#printer-settings")!.onclick = showPrinterSettings;
  document.querySelector<HTMLButtonElement>("#open-drawer")!.onclick = event => void manualDrawer(event.currentTarget as HTMLButtonElement);
  document.querySelector<HTMLButtonElement>("#last-receipt")!.onclick = () => { if (lastSale) showReceipt(lastSale, { canPrint: true }); };
  document.querySelector<HTMLButtonElement>("[data-open-products]")?.addEventListener("click", () => { posModal = "products"; renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-product]").forEach((button) => button.onclick = () => { chosenProduct = products.find((p) => p.id === button.dataset.product)!; chosenFlavors = []; posModal = "flavors"; renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-flavor]").forEach((button) => button.onclick = () => { const flavor = button.dataset.flavor!; if (chosenFlavors.length < (chosenProduct?.max_flavors ?? 0)) chosenFlavors = [...chosenFlavors, flavor]; if (chosenProduct && chosenFlavors.length === chosenProduct.max_flavors) posModal = "quantity"; renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((button) => button.onclick = () => { cart.splice(Number(button.dataset.remove), 1); renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-payment]").forEach((button) => button.onclick = () => { selectedPayment = button.dataset.payment!; renderPos().catch(showError); });
  document.querySelector<HTMLInputElement>("#cash-received")?.addEventListener("input", (event) => {
    cashReceived = (event.currentTarget as HTMLInputElement).value;
    const receivedAmount = Number(cashReceived);
    const change = document.querySelector<HTMLElement>("#cash-change-value")!;
    const help = document.querySelector<HTMLElement>("#cash-help")!;
    const container = document.querySelector<HTMLElement>(".cash-change")!;
    const valid = Number.isInteger(receivedAmount) && receivedAmount >= total;
    change.textContent = cashReceived && valid ? money(receivedAmount - total) : "—";
    help.textContent = cashReceived && receivedAmount < total ? `Faltan ${money(total - receivedAmount)} para completar el pago.` : "La devolución se calcula al ingresar el efectivo recibido.";
    container.classList.toggle("invalid", Boolean(cashReceived) && !valid);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-quantity-delta]").forEach((button) => button.onclick = () => { const output = document.querySelector<HTMLOutputElement>("#quantity")!; output.value = String(Math.min(50, Math.max(1, Number(output.value) + Number(button.dataset.quantityDelta)))); const addCart = document.querySelector<HTMLButtonElement>("#add-cart"); if (addCart && chosenProduct) addCart.textContent = `Agregar al carrito · ${money(chosenProduct.price * Number(output.value))}`; });
  document.querySelectorAll<HTMLButtonElement>("[data-close-modal]").forEach((button) => button.onclick = () => { posModal = null; chosenProduct = null; chosenFlavors = []; renderPos().catch(showError); });
  document.querySelector<HTMLButtonElement>("[data-close-products]")?.addEventListener("click", () => { posModal = null; renderPos().catch(showError); });
  document.querySelector<HTMLButtonElement>("[data-back-to-flavors]")?.addEventListener("click", () => { posModal = "flavors"; renderPos().catch(showError); });
  document.querySelector<HTMLButtonElement>("#add-cart")?.addEventListener("click", () => { const quantity = Number(document.querySelector<HTMLOutputElement>("#quantity")!.value); if (chosenProduct && quantity > 0) { cart.push({ product: chosenProduct, flavors: chosenFlavors, quantity }); chosenProduct = null; chosenFlavors = []; posModal = null; renderPos().catch(showError); } });
  document.querySelector<HTMLButtonElement>("#confirm-sale")?.addEventListener("click", () => confirmSale().catch(showError));
}

async function confirmSale(): Promise<void> {
  if (saleBusy || !cart.length) return;
  saleBusy = true;
  let saving: HTMLDivElement | undefined;
  let registered = false;
  const button = document.querySelector<HTMLButtonElement>("#confirm-sale");
  if (button) button.disabled = true;
  try {
    const payment = selectedPayment;
    const paymentComment = document.querySelector<HTMLInputElement>("#payment-comment")?.value.trim() ?? "";
    if (payment === "other" && !paymentComment) { await notify("Falta el método de pago", "Escribe un comentario para el pago Otro."); return; }
    const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const received = Number(cashReceived);
    if (payment === "cash" && (!Number.isInteger(received) || received < total)) {
      await notify("Pago insuficiente", `Recibe como mínimo ${money(total)} para confirmar la venta.`);
      return;
    }
    const payload = JSON.stringify({ items: cart.map(item => ({ product_id: item.product.id, flavors: item.flavors, quantity: item.quantity })), payment_type: payment, payment_comment: paymentComment || undefined });
    if (!await askConfirmation("¿Confirmar venta?", `Registrarás una venta por ${money(total)}.${payment === "cash" ? ` Devolución: ${money(received - total)}.` : ""}`, "Confirmar venta")) return;
    if (!pendingSale || pendingSale.payload !== payload) pendingSale = { key: crypto.randomUUID(), payload };
    saving = document.createElement("div"); saving.className = "modal-backdrop";
    saving.innerHTML = '<section class="modal" role="status" aria-live="polite">Registrando venta…</section>';
    document.body.append(saving);
    const { sale } = await api.createSale(JSON.parse(payload), pendingSale.key);
    registered = true;
    saving.remove(); saving = undefined;
    lastSale = sale; pendingSale = null; cart = [];
    cashReceived = "";
    await renderPos();
    showReceipt(sale, { newSale: true, canPrint: true });
  } catch (error) {
    saving?.remove(); saving = undefined;
    await notify(registered ? "Venta registrada; no se pudo mostrar el tiquete" : "No se recibió confirmación de la venta", registered ? "La venta está guardada. Recupera el comprobante desde Último tiquete." : error instanceof Error ? error.message : "Vuelve a intentarlo con el mismo carrito.");
  } finally { saving?.remove(); saleBusy = false; if (button?.isConnected) button.disabled = !cart.length; }
}

function salesRows(sales: Sale[]): string {
  return sales.length ? sales.map((sale, index) => `<tr class="${sale.status === "cancelled" ? "row-cancelled" : ""}"><td>${new Date(sale.created_at).toLocaleString("es-CO")}</td><td>${capitalize(sale.seller.username)}</td><td>${sale.items.map((item) => `${item.presentation} ${item.size}`).join(", ")}</td><td>${money(sale.total_sale)}</td><td><span class="status ${sale.status === "cancelled" ? "cancelled" : ""}">${sale.status === "cancelled" ? "Anulada" : "Activa"}</span></td><td><button class="outline" data-receipt="${index}">Tiquete</button>${sale.status === "active" && has("sales") && !roles().includes("observer") ? `<button class="outline icon-btn" data-cancel="${sale.created_at}" title="Anular venta" aria-label="Anular venta">×</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="6" class="empty">No hay ventas en el rango seleccionado.</td></tr>`;
}

function exportSalesCsv(sales: Sale[], from: string, to: string): void {
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = ["Fecha", "Vendedor", "Productos", "Método de pago", "Total", "Estado", "Motivo anulación"];
  const lines = sales.map((sale) => [
    new Date(sale.created_at).toLocaleString("es-CO"),
    capitalize(sale.seller.username),
    sale.items.map((item) => `${item.presentation} ${item.size} (${item.flavors.join("/")}) x${item.quantity}`).join(" | "),
    paymentLabels[sale.payment_type] ?? sale.payment_type,
    sale.total_sale,
    sale.status === "cancelled" ? "Anulada" : "Activa",
    sale.cancellation_reason ?? "",
  ].map(cell).join(","));
  const csv = "\ufeff" + [header.map(cell).join(","), ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ventas_${from}_${to}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function showShiftClosure(date: string, sales: Sale[]): void {
  const activeSales = sales.filter((sale) => sale.status === "active");
  const totals = activeSales.reduce<Record<string, number>>((result, sale) => {
    result[sale.payment_type] = (result[sale.payment_type] ?? 0) + sale.total_sale;
    return result;
  }, {});
  const total = activeSales.reduce((sum, sale) => sum + sale.total_sale, 0);
  const rows = Object.entries(totals).sort(([a], [b]) => (paymentLabels[a] ?? a).localeCompare(paymentLabels[b] ?? b, "es"));
  const { overlay, close } = buildModal(`<p class="step-label">Cierre de turno</p><h2>${date}</h2><p class="closure-caption">Consolidado de ventas activas del día.</p><div class="closure-total"><span>Total del turno</span><strong>${money(total)}</strong><small>${activeSales.length} venta${activeSales.length === 1 ? "" : "s"}</small></div><div class="closure-breakdown">${rows.length ? rows.map(([method, amount]) => `<div><span>${paymentLabels[method] ?? method}</span><strong>${money(amount)}</strong></div>`).join("") : "<p class=empty>No hay ventas activas hoy.</p>"}</div><div class="confirm-actions single"><button class="primary" data-close>Cerrar</button></div>`);
  overlay.querySelector<HTMLButtonElement>("[data-close]")!.onclick = close;
}

async function paintSales(sales: Sale[], start: string, end: string): Promise<void> {
  shell(`${title("Listado de ventas", "Consulta hasta 30 días de ventas. Las anuladas permanecen visibles.")}<div class="panel"><div class="actions" style="margin-bottom:18px"><label class="field">Desde<input id="sales-start" type="date" value="${start}"></label><label class="field">Hasta<input id="sales-end" type="date" value="${end}"></label><button class="secondary" id="search-sales">Consultar</button><button class="outline" id="export-sales" ${sales.length ? "" : "disabled"}>Exportar</button><button class="primary" id="shift-closure">Cierre de turno</button></div><table class="table"><thead><tr><th>Fecha</th><th>Vendedor</th><th>Productos</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>${salesRows(sales)}</tbody></table></div>`, "sales");
  document.querySelectorAll<HTMLButtonElement>("[data-receipt]").forEach(button => button.onclick = () => showReceipt(sales[Number(button.dataset.receipt)], { canPrint: has("pos") }));
  const range = () => ({ from: document.querySelector<HTMLInputElement>("#sales-start")!.value, to: document.querySelector<HTMLInputElement>("#sales-end")!.value });
  document.querySelector<HTMLButtonElement>("#search-sales")?.addEventListener("click", async () => { const { from, to } = range(); if (!from || !to) return; await paintSales(await api.sales(from, to, true), from, to); });
  document.querySelector<HTMLButtonElement>("#export-sales")?.addEventListener("click", () => { const { from, to } = range(); exportSalesCsv(sales, from, to); });
  document.querySelector<HTMLButtonElement>("#shift-closure")?.addEventListener("click", async () => { const date = today(); showShiftClosure(date, await api.sales(date, date, true)); });
  document.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((button) => button.onclick = async () => { const reason = await askText("Anular venta", "Motivo de anulación", { confirmText: "Anular venta" }); if (!reason?.trim()) return; await api.cancelSale(button.dataset.cancel!, reason); const { from, to } = range(); await paintSales(await api.sales(from, to, true), from, to); });
}

async function renderSales(): Promise<void> {
  const start = today();
  await paintSales(await api.sales(start, start, true), start, start);
}

const scoops = (value: number) => `${value} bola${value === 1 ? "" : "s"}`;
function breakdown(titleText: string, values: Record<string, number>, format: (key: string) => string = (key) => key, formatValue: (value: number) => string = money): string { return `<div class="panel"><h2 class="section-title">${titleText}</h2><ul>${Object.entries(values).sort((a, b) => b[1] - a[1]).map(([name, value]) => `<li><span>${format(name)}</span><strong>${formatValue(value)}</strong></li>`).join("") || "<li>Sin datos</li>"}</ul></div>`; }
async function renderMetrics(): Promise<void> {
  const end = today(); const start = bogotaDate(-6);
  const data: Metrics = await api.metrics(start, end);
  shell(`${title("Métricas", `${start} a ${end} · ventas netas, sin anulaciones.`)}<section class="metrics"><div class="metric"><span>Ventas netas</span><b>${money(data.net_sales)}</b></div><div class="metric"><span>Número de ventas</span><b>${data.sale_count}</b></div><div class="metric"><span>Promedio por venta</span><b>${money(data.sale_count ? Math.round(data.net_sales / data.sale_count) : 0)}</b></div><div class="metric"><span>Días con ventas</span><b>${Object.keys(data.daily).length}</b></div></section><section class="breakdown">${breakdown("Por método de pago", data.payment_types, (key) => paymentLabels[key] ?? key)}${breakdown("Por producto", data.products)}${breakdown("Por vendedor", data.sellers, capitalize)}${breakdown("Por sabor", data.flavors, (key) => key, scoops)}</section>`, "metrics");
}

async function renderSettings(): Promise<void> {
  const [productList, flavorList, userList] = await Promise.all([api.products(), api.flavors(), api.users()]);
  const end = today();
  const start = bogotaDate(-29);
  let usage: Metrics | null = null;
  try { usage = await api.metrics(start, end); } catch { usage = null; }
  const flavorUse = (name: string) => usage?.flavors[name] ?? 0;
  const productUse = (product: Product) => usage?.products[`${product.presentation} · ${product.size}`] ?? 0;
  const sellerUse = (name: string) => usage?.sellers[name] ?? 0;

  const orderedFlavors = [...flavorList].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const orderedProducts = [...productList].sort(byPresentation);

  const flavorRows = orderedFlavors.map((flavor) => `<button class="config-item" data-flavor="${flavor.id}"><span class="config-item-main"><span class="config-item-title">${flavor.name}</span><span class="config-item-sub">${scoops(flavorUse(flavor.name))} · 30 días</span></span><span class="config-chevron">›</span></button>`).join("") || `<div class="empty">Sin sabores.</div>`;
  const productRows = orderedProducts.map((product) => `<button class="config-item" data-product="${product.id}"><span class="config-item-main"><span class="config-item-title">${product.presentation} · ${product.size}</span><span class="config-item-sub">${product.max_flavors} sabor${product.max_flavors > 1 ? "es" : ""} · ${money(product.price)}</span></span><span class="config-chevron">›</span></button>`).join("") || `<div class="empty">Sin productos.</div>`;
  const userRows = userList.map((user) => `<button class="config-item" data-user="${user.username}"><span class="config-item-main"><span class="config-item-title">${capitalize(user.username)}</span><span class="config-item-sub">${user.email} · ${user.enabled ? "Activo" : "Inactivo"}</span></span><span class="config-chevron">›</span></button>`).join("") || `<div class="empty">Sin usuarios.</div>`;

  shell(`${title("Configuración", "Toca una fila para ver el detalle y editarlo.")}<section class="breakdown config-grid"><div class="panel config-panel"><div class="config-head"><h2 class="section-title">Sabores</h2><button class="secondary config-add" id="add-flavor" title="Nuevo sabor" aria-label="Nuevo sabor">+</button></div><div class="config-list">${flavorRows}</div></div><div class="panel config-panel"><div class="config-head"><h2 class="section-title">Productos</h2><button class="secondary config-add" id="add-product" title="Nuevo producto" aria-label="Nuevo producto">+</button></div><div class="config-list">${productRows}</div></div><div class="panel config-panel"><div class="config-head"><h2 class="section-title">Usuarios</h2><button class="secondary config-add" id="add-user" title="Nuevo usuario" aria-label="Nuevo usuario">+</button></div><div class="config-list">${userRows}</div></div></section>`, "settings");

  document.querySelector<HTMLButtonElement>("#add-flavor")!.onclick = async () => { const name = await askText("Nuevo sabor", "Nombre del sabor", { confirmText: "Agregar" }); if (name) { await api.createFlavor(name); await renderSettings(); } };
  document.querySelector<HTMLButtonElement>("#add-product")!.onclick = async () => {
    const result = await askForm("Nuevo producto", [{ name: "presentation", label: "Presentación" }, { name: "size", label: "Tamaño" }, { name: "max_flavors", label: "Máx. sabores", value: "1", type: "number", min: 1, max: 6 }, { name: "price", label: "Precio COP", type: "number", min: 0 }], "Agregar");
    if (!result) return;
    const max_flavors = Number(result.max_flavors); const price = Number(result.price);
    if (!result.presentation || !result.size || !Number.isInteger(max_flavors) || !Number.isInteger(price)) { await notify("Datos incompletos", "Completa todos los campos del producto."); return; }
    await api.createProduct({ presentation: result.presentation, size: result.size, max_flavors, price }); await renderSettings();
  };
  document.querySelector<HTMLButtonElement>("#add-user")!.onclick = async () => {
    const result = await askForm("Nuevo usuario", [{ name: "username", label: "Usuario" }, { name: "email", label: "Correo", type: "email" }, { name: "role", label: "Perfil", type: "select", value: "seller", options: [["seller", "Vendedor"], ["manager", "Manager"], ["observer", "Observador"], ["admin", "Admin"]] }], "Crear");
    if (!result) return;
    if (!result.username || !result.email) { await notify("Datos incompletos", "Completa el usuario y el correo."); return; }
    await api.createUser({ username: result.username, email: result.email, role: result.role });
    await notify("Usuario creado", "Cognito enviará la contraseña temporal por correo."); await renderSettings();
  };

  document.querySelectorAll<HTMLButtonElement>("[data-flavor]").forEach((button) => button.onclick = () => { const flavor = flavorList.find((item) => item.id === button.dataset.flavor)!; editFlavorEntity(flavor, flavorUse(flavor.name)); });
  document.querySelectorAll<HTMLButtonElement>("[data-product]").forEach((button) => button.onclick = () => { const product = productList.find((item) => item.id === button.dataset.product)!; editProductEntity(product, productUse(product)); });
  document.querySelectorAll<HTMLButtonElement>("[data-user]").forEach((button) => button.onclick = () => { const user = userList.find((item) => item.username === button.dataset.user)!; editUserEntity(user, sellerUse(user.username)); });
}

async function render(): Promise<void> {
  const page = route();
  if (!has(page)) { location.hash = has("pos") ? "#/pos" : "#/sales"; return; }
  try {
    if (page === "pos") await renderPos();
    if (page === "sales") await renderSales();
    if (page === "metrics") await renderMetrics();
    if (page === "settings") await renderSettings();
  } catch (error) { showError(error); }
}

async function bootstrap(): Promise<void> {
  if (!authConfigured) {
    app.innerHTML = `<div class="login"><div class="login-card"><div class="brand">alaska<small>Helados · ERP</small></div><p>La interfaz está lista, pero aún no tiene configurado un entorno Cognito/API. Crea <code>.env.local</code> a partir de <code>.env.example</code> y completa las variables del entorno dev cuando se despliegue.</p><div class="notice">Para verla localmente usa <strong>http://127.0.0.1:5173/</strong>, no abras <code>index.html</code> con <code>file://</code>.</div></div></div>`;
    return;
  }
  try { await acceptCallback(); } catch (error) { showError(error); return; }
  if (!isAuthenticated()) { await login(); return; }
  await render();
}

addEventListener("hashchange", () => render().catch(showError));
bootstrap().catch(showError);

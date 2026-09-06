import "./styles/main.css";
import { api } from "./services/api";
import { acceptCallback, isAuthenticated, login, logout, roles } from "./services/auth";
import { authConfigured } from "./services/config";
import type { CartItem, Flavor, Metrics, Page, Product, Role, Sale } from "./models";

const app = document.querySelector<HTMLDivElement>("#app")!;
let products: Product[] = [];
let flavors: Flavor[] = [];
let cart: CartItem[] = [];
let chosenProduct: Product | null = null;
let chosenFlavors: string[] = [];
let selectedPayment = "cash";
let posModal: "products" | "flavors" | "quantity" | null = null;

const labels: Record<Page, string> = { pos: "Registrar venta", sales: "Listado de ventas", metrics: "Métricas", settings: "Configuración" };
const allowed: Record<Page, Role[]> = { pos: ["seller", "manager", "admin"], sales: ["manager", "observer", "admin"], metrics: ["manager", "admin"], settings: ["admin"] };
const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const today = () => new Date().toISOString().slice(0, 10);
const route = (): Page => (location.hash.replace("#/", "") || "pos") as Page;
const has = (page: Page) => roles().some((role) => allowed[page].includes(role));

function shell(content: string, page: Page): void {
  const nav = (Object.keys(labels) as Page[]).filter(has).map((item) => `<button class="${page === item ? "active" : ""}" data-nav="${item}">${labels[item]}</button>`).join("");
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand">alaska<small>Helados · ERP</small></div><nav class="nav">${nav}</nav><footer><strong>${roles().join(" · ")}</strong><br><button data-logout>Cerrar sesión</button></footer></aside><main class="page ${page === "pos" ? "pos-page" : ""}">${content}</main></div>`;
  document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((button) => button.onclick = () => { location.hash = `#/${button.dataset.nav}`; });
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

async function renderPos(): Promise<void> {
  if (!products.length) [products, flavors] = await Promise.all([api.products(), api.flavors()]);
  const productButtons = products.map((p) => `<button class="choice ${chosenProduct?.id === p.id ? "selected" : ""}" data-product="${p.id}"><strong>${p.presentation} · ${p.size}</strong><span>${p.max_flavors} sabor${p.max_flavors > 1 ? "es" : ""} · ${money(p.price)}</span></button>`).join("");
  const flavorButtons = [...flavors.map((f) => f.name), "Otro"].map((flavor) => { const count = chosenFlavors.filter((value) => value === flavor).length; return `<button class="choice flavor-choice ${count ? "selected" : ""}" data-flavor="${flavor}">${count ? `<b class="flavor-count">${count}</b>` : ""}${flavor}</button>`; }).join("");
  const cartItems = cart.length ? cart.map((item, index) => `<div class="cart-item"><div><strong>${item.product.presentation} · ${item.product.size}</strong><br><small>${item.flavors.join(", ")} · Cantidad ${item.quantity}</small></div><div><strong>${money(item.product.price * item.quantity)}</strong><br><button class="outline" data-remove="${index}">Quitar</button></div></div>`).join("") : `<div class="empty">Elige un producto para comenzar.</div>`;
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const paymentOptions = [["cash", "Efectivo"], ["nequi", "Nequi"], ["bancolombia", "Bancolombia"], ["credit_card", "Tarjeta"], ["other", "Otro"]] as const;
  const paymentButtons = paymentOptions.map(([value, label]) => `<button class="payment-option ${selectedPayment === value ? "selected" : ""}" data-payment="${value}">${label}</button>`).join("");
  const productModal = posModal === "products" ? `<div class="modal-backdrop"><section class="modal pos-modal" role="dialog" aria-modal="true"><div class="modal-heading"><div><p class="step-label">Paso 1 de 3</p><h2>Elige un producto</h2></div><button class="modal-close" data-close-products aria-label="Cerrar">×</button></div><div class="grid product-grid modal-products">${productButtons || "<div class=empty>No hay productos activos.</div>"}</div></section></div>` : "";
  const flavorModal = posModal === "flavors" && chosenProduct ? `<div class="modal-backdrop"><section class="modal pos-modal" role="dialog" aria-modal="true"><div class="modal-heading"><div><p class="step-label">Paso 2 de 3</p><h2>Elige ${chosenProduct.max_flavors} sabor${chosenProduct.max_flavors > 1 ? "es" : ""}</h2><p>${chosenProduct.presentation} · ${chosenProduct.size} · ${money(chosenProduct.price)}</p></div><button class="modal-close" data-close-modal aria-label="Cancelar selección">×</button></div><div class="flavor-progress"><span>${chosenFlavors.length} de ${chosenProduct.max_flavors} seleccionados</span><div><i style="width:${(chosenFlavors.length / chosenProduct.max_flavors) * 100}%"></i></div></div><div class="grid flavors modal-flavors">${flavorButtons}</div><button class="outline modal-cancel" data-close-modal>Cancelar</button></section></div>` : "";
  const quantityModal = posModal === "quantity" && chosenProduct ? `<div class="modal-backdrop"><section class="modal pos-modal quantity-modal" role="dialog" aria-modal="true"><div class="modal-heading"><div><p class="step-label">Paso 3 de 3</p><h2>¿Cuántos deseas?</h2><p>${chosenProduct.presentation} · ${chosenProduct.size} · ${chosenFlavors.join(", ")}</p></div><button class="modal-close" data-close-modal aria-label="Cancelar selección">×</button></div><div class="quantity-control modal-quantity"><button class="quantity-button" data-quantity-delta="-1" aria-label="Disminuir cantidad">−</button><output id="quantity">1</output><button class="quantity-button" data-quantity-delta="1" aria-label="Aumentar cantidad">+</button></div><button class="primary modal-add" id="add-cart">Agregar al carrito · ${money(chosenProduct.price)}</button><button class="outline modal-cancel" data-back-to-flavors>Volver a sabores</button></section></div>` : "";
  shell(`${title("Registrar venta", "Toca el botón para elegir un producto.")}<div class="pos-screen"><div class="pos"><section class="panel catalog-panel"><div><p class="step-label">Paso 1 de 3</p><h2 class="section-title">Producto</h2><button class="primary catalog-launch" data-open-products>Elegir producto</button></div><div class="catalog-hint">Elige cono o vaso y su tamaño. Después seleccionarás los sabores y la cantidad.</div></section><aside class="panel cart"><h2 class="section-title">Venta actual</h2><div class="cart-items">${cartItems}</div><div class="total"><span>Total</span><span>${money(total)}</span></div><section class="payment-section"><h2 class="section-title">Método de pago</h2><div class="payment-options">${paymentButtons}</div></section>${selectedPayment === "other" ? `<label class="field payment-comment">Comentario para Otro<input id="payment-comment" maxlength="300" placeholder="Describe el método de pago"></label>` : ""}<button class="primary checkout-action" id="confirm-sale" ${!cart.length ? "disabled" : ""}>Confirmar venta</button></aside></div></div>${productModal}${flavorModal}${quantityModal}`, "pos");
  document.querySelector<HTMLButtonElement>("[data-open-products]")?.addEventListener("click", () => { posModal = "products"; renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-product]").forEach((button) => button.onclick = () => { chosenProduct = products.find((p) => p.id === button.dataset.product)!; chosenFlavors = []; posModal = "flavors"; renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-flavor]").forEach((button) => button.onclick = () => { const flavor = button.dataset.flavor!; if (chosenFlavors.length < (chosenProduct?.max_flavors ?? 0)) chosenFlavors = [...chosenFlavors, flavor]; if (chosenProduct && chosenFlavors.length === chosenProduct.max_flavors) posModal = "quantity"; renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((button) => button.onclick = () => { cart.splice(Number(button.dataset.remove), 1); renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-payment]").forEach((button) => button.onclick = () => { selectedPayment = button.dataset.payment!; renderPos().catch(showError); });
  document.querySelectorAll<HTMLButtonElement>("[data-quantity-delta]").forEach((button) => button.onclick = () => { const output = document.querySelector<HTMLOutputElement>("#quantity")!; output.value = String(Math.min(50, Math.max(1, Number(output.value) + Number(button.dataset.quantityDelta)))); });
  document.querySelectorAll<HTMLButtonElement>("[data-close-modal]").forEach((button) => button.onclick = () => { posModal = null; chosenProduct = null; chosenFlavors = []; renderPos().catch(showError); });
  document.querySelector<HTMLButtonElement>("[data-close-products]")?.addEventListener("click", () => { posModal = null; renderPos().catch(showError); });
  document.querySelector<HTMLButtonElement>("[data-back-to-flavors]")?.addEventListener("click", () => { posModal = "flavors"; renderPos().catch(showError); });
  document.querySelector<HTMLButtonElement>("#add-cart")?.addEventListener("click", () => { const quantity = Number(document.querySelector<HTMLOutputElement>("#quantity")!.value); if (chosenProduct && quantity > 0) { cart.push({ product: chosenProduct, flavors: chosenFlavors, quantity }); chosenProduct = null; chosenFlavors = []; posModal = null; renderPos().catch(showError); } });
  document.querySelector<HTMLButtonElement>("#confirm-sale")?.addEventListener("click", () => confirmSale().catch(showError));
}

async function confirmSale(): Promise<void> {
  const payment = selectedPayment;
  const paymentComment = document.querySelector<HTMLInputElement>("#payment-comment")?.value.trim() ?? "";
  if (payment === "other" && !paymentComment) throw new Error("Escribe un comentario para el pago Otro.");
  if (!await askConfirmation("¿Confirmar venta?", `Registrarás una venta por ${money(cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0))}.`, "Confirmar venta")) return;
  const key = crypto.randomUUID();
  await api.createSale({ items: cart.map((item) => ({ product_id: item.product.id, flavors: item.flavors, quantity: item.quantity })), payment_type: payment, payment_comment: paymentComment || undefined }, key);
  cart = []; alert("Venta registrada correctamente."); await renderPos();
}

async function renderSales(): Promise<void> {
  const start = today();
  const sales = await api.sales(start, start);
  const rows = sales.length ? sales.map((sale) => `<tr><td>${new Date(sale.created_at).toLocaleString("es-CO")}</td><td>${sale.seller.username}</td><td>${sale.items.map((item) => `${item.presentation} ${item.size}`).join(", ")}</td><td>${money(sale.total_sale)}</td><td><span class="status ${sale.status === "cancelled" ? "cancelled" : ""}">${sale.status === "cancelled" ? "Anulada" : "Activa"}</span></td><td>${sale.status === "active" && has("sales") && !roles().includes("observer") ? `<button class="outline" data-cancel="${sale.created_at}">Anular</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="6" class="empty">No hay ventas en el rango seleccionado.</td></tr>`;
  shell(`${title("Listado de ventas", "Consulta hasta 30 días de ventas. Incluye anuladas solo cuando lo requieras.")}<div class="panel"><div class="actions" style="margin-bottom:18px"><label class="field">Desde<input id="sales-start" type="date" value="${start}"></label><label class="field">Hasta<input id="sales-end" type="date" value="${start}"></label><button class="secondary" id="search-sales">Consultar</button></div><table class="table"><thead><tr><th>Fecha</th><th>Vendedor</th><th>Productos</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`, "sales");
  document.querySelector<HTMLButtonElement>("#search-sales")?.addEventListener("click", async () => { const from = document.querySelector<HTMLInputElement>("#sales-start")!.value; const to = document.querySelector<HTMLInputElement>("#sales-end")!.value; if (!from || !to) return; const result = await api.sales(from, to); renderSalesWith(result, from, to); });
  document.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((button) => button.onclick = async () => { const reason = prompt("Motivo de anulación:"); if (!reason?.trim()) return; await api.cancelSale(button.dataset.cancel!, reason); await renderSales(); });
}

function renderSalesWith(sales: Sale[], start: string, end: string): void {
  const rows = sales.length ? sales.map((sale) => `<tr><td>${new Date(sale.created_at).toLocaleString("es-CO")}</td><td>${sale.seller.username}</td><td>${sale.items.map((item) => `${item.presentation} ${item.size}`).join(", ")}</td><td>${money(sale.total_sale)}</td><td>${sale.status}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">No hay ventas.</td></tr>`;
  shell(`${title("Listado de ventas", `${start} a ${end}`)}<div class="panel"><button class="outline" id="back-sales">Nueva consulta</button><table class="table"><thead><tr><th>Fecha</th><th>Vendedor</th><th>Productos</th><th>Total</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>`, "sales");
  document.querySelector<HTMLButtonElement>("#back-sales")!.onclick = () => renderSales().catch(showError);
}

function breakdown(titleText: string, values: Record<string, number>): string { return `<div class="panel"><h2 class="section-title">${titleText}</h2><ul>${Object.entries(values).sort((a, b) => b[1] - a[1]).map(([name, value]) => `<li><span>${name}</span><strong>${money(value)}</strong></li>`).join("") || "<li>Sin datos</li>"}</ul></div>`; }
async function renderMetrics(): Promise<void> {
  const end = today(); const startDate = new Date(); startDate.setDate(startDate.getDate() - 6); const start = startDate.toISOString().slice(0, 10);
  const data: Metrics = await api.metrics(start, end);
  shell(`${title("Métricas", `${start} a ${end} · ventas netas, sin anulaciones.`)}<section class="metrics"><div class="metric"><span>Ventas netas</span><b>${money(data.net_sales)}</b></div><div class="metric"><span>Número de ventas</span><b>${data.sale_count}</b></div><div class="metric"><span>Promedio por venta</span><b>${money(data.sale_count ? Math.round(data.net_sales / data.sale_count) : 0)}</b></div><div class="metric"><span>Días con ventas</span><b>${Object.keys(data.daily).length}</b></div></section><section class="breakdown">${breakdown("Por método de pago", data.payment_types)}${breakdown("Por producto", data.products)}${breakdown("Por vendedor", data.sellers)}${breakdown("Por sabor", data.flavors)}</section>`, "metrics");
}

async function renderSettings(): Promise<void> {
  const [productList, flavorList, userList] = await Promise.all([api.products(), api.flavors(), api.users()]);
  const flavorRows = flavorList.map((flavor) => `<li class="config-row"><span>${flavor.name}</span><div><button class="outline" data-edit-flavor="${flavor.id}">Editar</button><button class="outline danger" data-delete-flavor="${flavor.id}">Eliminar</button></div></li>`).join("");
  const productRows = productList.map((product) => `<li class="config-row"><span>${product.presentation} · ${product.size} · ${product.max_flavors} sabor(es) · ${money(product.price)}</span><div><button class="outline" data-edit-product="${product.id}">Editar</button><button class="outline danger" data-delete-product="${product.id}">Eliminar</button></div></li>`).join("");
  const userRows = userList.map((user) => `<li class="config-row"><span>${user.username} · ${user.email} · ${user.enabled ? "Activo" : "Inactivo"}</span><button class="outline ${user.enabled ? "danger" : ""}" data-user-status="${user.username}" data-enabled="${user.enabled}">${user.enabled ? "Deshabilitar" : "Habilitar"}</button></li>`).join("");
  shell(`${title("Configuración", "Administra el catálogo y los usuarios.")}<section class="breakdown"><div class="panel"><h2 class="section-title">Nuevo sabor</h2><label class="field">Nombre<input id="flavor-name" maxlength="60"></label><button class="primary" id="new-flavor">Agregar sabor</button><hr><h2 class="section-title">Sabores activos</h2><ul>${flavorRows}</ul></div><div class="panel"><h2 class="section-title">Nuevo producto</h2><div class="form-grid"><label class="field">Presentación<input id="product-presentation"></label><label class="field">Tamaño<input id="product-size"></label><label class="field">Máx. sabores<input id="product-flavors" type="number" min="1" max="6" value="1"></label><label class="field">Precio COP<input id="product-price" type="number" min="0"></label></div><button class="primary" id="new-product">Agregar producto</button><hr><h2 class="section-title">Productos activos</h2><ul>${productRows}</ul></div><div class="panel"><h2 class="section-title">Crear usuario</h2><div class="form-grid"><label class="field">Usuario<input id="user-username" minlength="3"></label><label class="field">Correo<input id="user-email" type="email"></label><label class="field">Perfil<select id="user-role"><option value="seller">Vendedor</option><option value="manager">Manager</option><option value="observer">Observador</option><option value="admin">Admin</option></select></label></div><button class="primary" id="new-user">Crear y enviar contraseña temporal</button><hr><h2 class="section-title">Usuarios</h2><ul>${userRows}</ul></div></section>`, "settings");
  document.querySelector<HTMLButtonElement>("#new-flavor")!.onclick = async () => { const name = document.querySelector<HTMLInputElement>("#flavor-name")!.value.trim(); if (!name) return; await api.createFlavor(name); await renderSettings(); };
  document.querySelector<HTMLButtonElement>("#new-product")!.onclick = async () => { const presentation = document.querySelector<HTMLInputElement>("#product-presentation")!.value.trim(); const size = document.querySelector<HTMLInputElement>("#product-size")!.value.trim(); const max_flavors = Number(document.querySelector<HTMLInputElement>("#product-flavors")!.value); const price = Number(document.querySelector<HTMLInputElement>("#product-price")!.value); if (!presentation || !size || !Number.isInteger(price)) throw new Error("Completa los datos del producto."); await api.createProduct({ presentation, size, max_flavors, price }); await renderSettings(); };
  document.querySelector<HTMLButtonElement>("#new-user")!.onclick = async () => { const username = document.querySelector<HTMLInputElement>("#user-username")!.value.trim(); const email = document.querySelector<HTMLInputElement>("#user-email")!.value.trim(); const role = document.querySelector<HTMLSelectElement>("#user-role")!.value; if (!username || !email) throw new Error("Completa el usuario y correo."); await api.createUser({ username, email, role }); alert("Usuario creado. Cognito enviará la contraseña temporal por correo."); await renderSettings(); };
  document.querySelectorAll<HTMLButtonElement>("[data-user-status]").forEach((button) => button.onclick = async () => { const enabled = button.dataset.enabled !== "true"; if (await askConfirmation(`${enabled ? "Habilitar" : "Deshabilitar"} usuario`, `¿Deseas ${enabled ? "habilitar" : "deshabilitar"} a ${button.dataset.userStatus}?`, enabled ? "Habilitar" : "Deshabilitar")) { await api.setUserEnabled(button.dataset.userStatus!, enabled); await renderSettings(); } });
  document.querySelectorAll<HTMLButtonElement>("[data-edit-flavor]").forEach((button) => button.onclick = async () => { const flavor = flavorList.find((item) => item.id === button.dataset.editFlavor)!; const name = prompt("Nombre del sabor:", flavor.name)?.trim(); if (name) { await api.updateFlavor(flavor.id, name); await renderSettings(); } });
  document.querySelectorAll<HTMLButtonElement>("[data-delete-flavor]").forEach((button) => button.onclick = async () => { const flavor = flavorList.find((item) => item.id === button.dataset.deleteFlavor)!; if (await askConfirmation("¿Eliminar sabor?", `${flavor.name} dejará de estar disponible para nuevas ventas.`, "Eliminar")) { await api.deleteFlavor(flavor.id); await renderSettings(); } });
  document.querySelectorAll<HTMLButtonElement>("[data-edit-product]").forEach((button) => button.onclick = async () => { const product = productList.find((item) => item.id === button.dataset.editProduct)!; const presentation = prompt("Presentación:", product.presentation)?.trim(); const size = prompt("Tamaño:", product.size)?.trim(); const max_flavors = Number(prompt("Máximo de sabores:", String(product.max_flavors))); const price = Number(prompt("Precio COP:", String(product.price))); if (presentation && size && Number.isInteger(max_flavors) && Number.isInteger(price)) { await api.updateProduct(product.id, { presentation, size, max_flavors, price }); await renderSettings(); } });
  document.querySelectorAll<HTMLButtonElement>("[data-delete-product]").forEach((button) => button.onclick = async () => { const product = productList.find((item) => item.id === button.dataset.deleteProduct)!; if (await askConfirmation("¿Eliminar producto?", `${product.presentation} · ${product.size} dejará de estar disponible para nuevas ventas.`, "Eliminar")) { await api.deleteProduct(product.id); await renderSettings(); } });
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

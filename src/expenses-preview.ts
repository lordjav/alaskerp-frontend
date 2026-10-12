import type { Page } from "./models";

type Shell = (content: string, page: Page) => void;
type Preset = { id: string; name: string; category: string; amount: number | null; payment: string };
type Expense = { id: string; name: string; category: string; amount: number; payment: string; date: string; note: string; username?: string };

const presetKey = "alaskerp.preview.expense-presets";
const entryKey = "alaskerp.preview.expenses";
const categoryKey = "alaskerp.preview.expense-categories";
const legacyDefaultCategories = ["Insumos", "Servicios", "Arriendo", "Transporte", "Mantenimiento", "Otros"];
const categoryMigrationKey = "alaskerp.preview.expense-categories.user-only";
const payments = ["Efectivo", "Nequi", "Bancolombia", "Tarjeta", "Otro"];
const validPayment = (value: string) => value === "Transferencia" ? "Otro" : value;
let settingsTab: "products" | "users" | "expenses" = "expenses";
let transactionsTab: "sales" | "expenses" = "sales";
let expenseRange: { from: string; to: string } | null = null;
export const selectExpenseSettingsTab = () => { settingsTab = "expenses"; };
export const selectExpenseTransactionsTab = () => { transactionsTab = "expenses"; };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const load = <T>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const categories = () => {
  const stored = load<string[]>(categoryKey, []);
  if (localStorage.getItem(categoryMigrationKey) === "1") return stored;
  const custom = stored.filter((name) => !legacyDefaultCategories.includes(name));
  save(categoryKey, custom);
  localStorage.setItem(categoryMigrationKey, "1");
  return custom;
};
const presets = () => load<Preset[]>(presetKey, [])
  .filter((item) => !item.id.startsWith("sample-") && categories().includes(item.category))
  .map((item) => ({ ...item, payment: validPayment(item.payment) }));
const entries = () => load<Expense[]>(entryKey, []).map((item) => ({ ...item, payment: validPayment(item.payment) }));
const optionList = (values: string[]) => values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
const banner = `<div class="expense-preview-banner"><strong>Vista previa local</strong><span>Prueba el recorrido. Estos datos se guardan únicamente en este navegador.</span></div>`;
let quickDismissController: AbortController | null = null;

export function renderExpensesPreview(shell: Shell, money: (value: number) => string, today: () => string, responsibleUsername = "Usuario de prueba"): void {
  quickDismissController?.abort();
  const list = presets();
  const options = list.map((item) => `<button class="expense-quick-item" type="button" data-preset="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small></span><b>${item.amount === null ? "Valor por ingresar" : money(item.amount)}</b></button>`).join("");
  const categoryList = categories();
  shell(`<div class="expense-registration">${banner}<section class="panel expense-form-panel"><div class="expense-register-head"><div><p class="step-label">Registrar gasto</p><h1>Nuevo registro</h1><p>Completa el detalle del gasto. Puedes usar un frecuente para llenar el formulario.</p></div><div class="expense-quick"><button class="outline expense-quick-toggle" id="expense-quick-toggle" type="button" aria-expanded="false" aria-controls="expense-quick-menu">Acceso rápido <span aria-hidden="true">▾</span></button><div class="expense-quick-menu" id="expense-quick-menu" hidden>${options || `<div class="expense-empty">No hay gastos frecuentes configurados.</div>`}</div></div></div><form id="expense-form"><label class="field">Concepto<input name="name" maxlength="120" placeholder="Ej. Compra de vasos" required></label><div class="expense-form-grid"><label class="field">Valor (COP)<input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="0" required></label><label class="field">Fecha<input name="date" type="date" value="${today()}" required></label><label class="field">Categoría<select name="category" required>${optionList(categoryList)}</select></label><label class="field">Medio de pago<select name="payment">${optionList(payments)}</select></label></div><label class="field">Nota <span class="expense-optional">opcional · máximo 1000 caracteres</span><textarea name="note" maxlength="1000" rows="3" placeholder="Agrega un detalle si lo necesitas"></textarea></label><p class="expense-feedback" id="expense-feedback" role="status">${categoryList.length ? "" : "Crea una categoría en Configuración para registrar gastos."}</p><button class="primary expense-submit" type="submit" ${categoryList.length ? "" : "disabled"}>Registrar gasto</button></form></section></div>`, "expenses");
  const form = document.querySelector<HTMLFormElement>("#expense-form")!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const toggle = document.querySelector<HTMLButtonElement>("#expense-quick-toggle")!;
  const menu = document.querySelector<HTMLDivElement>("#expense-quick-menu")!;
  const quick = document.querySelector<HTMLDivElement>(".expense-quick")!;
  const closeMenu = () => { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
  toggle.onclick = () => { menu.hidden = !menu.hidden; toggle.setAttribute("aria-expanded", String(!menu.hidden)); };
  menu.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeMenu(); toggle.focus(); } });
  quickDismissController = new AbortController();
  document.addEventListener("pointerdown", (event) => {
    if (!quick.isConnected) { quickDismissController?.abort(); return; }
    if (!quick.contains(event.target as Node)) closeMenu();
  }, { signal: quickDismissController.signal });
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => button.onclick = () => {
    const item = list.find((preset) => preset.id === button.dataset.preset);
    if (!item) return;
    field("name").value = item.name;
    field("category").value = item.category;
    field("payment").value = item.payment;
    field("amount").value = item.amount === null ? "" : String(item.amount);
    closeMenu();
    document.querySelector<HTMLElement>("#expense-feedback")!.textContent = `${item.name} listo para registrar.`;
    field(item.amount === null ? "amount" : "note").focus();
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    const amount = Number(field("amount").value);
    if (!Number.isSafeInteger(amount) || amount <= 0) { field("amount").focus(); return; }
    const item: Expense = { id: crypto.randomUUID(), name: field("name").value.trim(), category: field("category").value, amount, payment: field("payment").value, date: field("date").value, note: field("note").value.trim(), username: responsibleUsername };
    if (!item.name) { field("name").focus(); return; }
    save(entryKey, [item, ...entries()]);
    transactionsTab = "expenses";
    renderExpensesPreview(shell, money, today, responsibleUsername);
    document.querySelector<HTMLElement>("#expense-feedback")!.textContent = `Gasto de ${money(amount)} agregado a la vista previa.`;
  };
}

function presetEditor(existing: Preset | null, render: () => void): void {
  if (!categories().length) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `<section class="modal expense-editor" role="dialog" aria-modal="true" aria-label="${existing ? "Editar" : "Crear"} gasto frecuente"><div class="expense-section-head"><div><p class="step-label">Configuración</p><h2>${existing ? "Editar gasto frecuente" : "Nuevo gasto frecuente"}</h2></div><button class="modal-close" type="button" data-close aria-label="Cerrar">×</button></div><p class="expense-help">Define los datos que se completarán al elegirlo en Registrar gasto.</p><form id="preset-form"><label class="field">Nombre<input name="name" maxlength="120" placeholder="Ej. Compra de insumos" required></label><div class="expense-form-grid"><label class="field">Categoría<select name="category">${optionList(categories())}</select></label><label class="field">Medio de pago<select name="payment">${optionList(payments)}</select></label></div><label class="field">Valor sugerido (COP) <span class="expense-optional">opcional</span><input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="Se ingresa al registrar"></label><div class="expense-editor-actions">${existing ? `<button class="outline danger" type="button" data-delete>Eliminar</button>` : ""}<button class="primary" type="submit">Guardar frecuente</button></div></form></section>`;
  document.body.append(overlay);
  const form = overlay.querySelector<HTMLFormElement>("#preset-form")!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  if (existing) { field("name").value = existing.name; field("category").value = existing.category; field("payment").value = existing.payment; field("amount").value = existing.amount === null ? "" : String(existing.amount); }
  const close = () => overlay.remove();
  overlay.querySelector<HTMLButtonElement>("[data-close]")!.onclick = close;
  overlay.onclick = (event) => { if (event.target === overlay) close(); };
  overlay.querySelector<HTMLButtonElement>("[data-delete]")?.addEventListener("click", () => { if (!existing || !confirm(`¿Eliminar “${existing.name}” de gastos frecuentes?`)) return; save(presetKey, presets().filter((item) => item.id !== existing.id)); close(); render(); });
  form.onsubmit = (event) => {
    event.preventDefault();
    const amountText = field("amount").value.trim();
    const amount = amountText ? Number(amountText) : null;
    if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0)) { field("amount").focus(); return; }
    const item: Preset = { id: existing?.id ?? crypto.randomUUID(), name: field("name").value.trim(), category: field("category").value, payment: field("payment").value, amount };
    if (!item.name) { field("name").focus(); return; }
    save(presetKey, existing ? presets().map((preset) => preset.id === existing.id ? item : preset) : [...presets(), item]);
    close(); render();
  };
  field("name").focus();
}

function categoryEditor(existing: string | null, render: () => void): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `<section class="modal expense-editor" role="dialog" aria-modal="true" aria-label="${existing ? "Editar" : "Crear"} categoría"><div class="expense-section-head"><div><p class="step-label">Configuración</p><h2>${existing ? "Editar categoría" : "Nueva categoría"}</h2></div><button class="modal-close" type="button" data-close aria-label="Cerrar">×</button></div><form id="category-form"><label class="field">Nombre<input name="name" maxlength="80" placeholder="Ej. Limpieza" required></label><p class="expense-form-error" role="alert"></p><div class="expense-editor-actions">${existing ? `<button class="outline danger" type="button" data-delete>Eliminar</button>` : ""}<button class="primary" type="submit">Guardar categoría</button></div></form></section>`;
  document.body.append(overlay);
  const form = overlay.querySelector<HTMLFormElement>("#category-form")!;
  const input = form.elements.namedItem("name") as HTMLInputElement;
  const error = overlay.querySelector<HTMLElement>(".expense-form-error")!;
  input.value = existing ?? "";
  const close = () => overlay.remove();
  overlay.querySelector<HTMLButtonElement>("[data-close]")!.onclick = close;
  overlay.onclick = (event) => { if (event.target === overlay) close(); };
  overlay.querySelector<HTMLButtonElement>("[data-delete]")?.addEventListener("click", () => {
    if (!existing) return;
    if (presets().some((item) => item.category === existing)) { error.textContent = "Esta categoría está en uso por un frecuente."; return; }
    if (!confirm(`¿Eliminar la categoría “${existing}”?`)) return;
    save(categoryKey, categories().filter((name) => name !== existing)); close(); render();
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    if (categories().some((item) => item.toLocaleLowerCase("es") === name.toLocaleLowerCase("es") && item !== existing)) { error.textContent = "Ya existe una categoría con ese nombre."; return; }
    const currentPresets = presets();
    save(categoryKey, existing ? categories().map((item) => item === existing ? name : item) : [...categories(), name]);
    if (existing && existing !== name) {
      save(presetKey, currentPresets.map((item) => item.category === existing ? { ...item, category: name } : item));
    }
    close(); render();
  };
  input.focus();
}

const tabs = (items: Array<[string, string]>, current: string) => `<div class="expense-tabs" role="tablist">${items.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === current}" class="${id === current ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</div>`;

export function renderExpenseSettingsPreview(shell: Shell, money: (value: number) => string, today: () => string, realTabs?: { products: () => void; users: () => void }): void {
  const list = presets();
  const categoryList = categories();
  const expenseContent = `<div class="expense-settings-grid"><section class="panel expense-settings-panel"><div class="expense-section-head"><div><p class="step-label">Accesos rápidos</p><h2 class="section-title">Gastos frecuentes</h2><p>Completa el formulario de registro con un toque.</p></div><button class="primary" id="add-expense-preset" type="button" ${categoryList.length ? "" : "disabled"}>+ Nuevo frecuente</button></div><div class="expense-settings-list">${list.map((item) => `<button class="config-item" data-edit-preset="${escapeHtml(item.id)}"><span class="config-item-main"><span class="config-item-title">${escapeHtml(item.name)}</span><span class="config-item-sub">${escapeHtml(item.category)} · ${item.amount === null ? "Valor al registrar" : money(item.amount)} · ${escapeHtml(item.payment)}</span></span><span class="config-chevron">›</span></button>`).join("") || `<div class="expense-empty">Aún no hay gastos frecuentes.</div>`}</div></section><section class="panel expense-settings-panel"><div class="expense-section-head"><div><p class="step-label">Clasificación</p><h2 class="section-title">Categorías</h2><p>Organiza los gastos para consultarlos después.</p></div><button class="primary" id="add-expense-category" type="button">+ Nueva categoría</button></div><div class="expense-settings-list">${categoryList.map((name) => `<button class="config-item" data-edit-category="${escapeHtml(name)}"><span class="config-item-main"><span class="config-item-title">${escapeHtml(name)}</span><span class="config-item-sub">${presets().filter((item) => item.category === name).length} frecuentes</span></span><span class="config-chevron">›</span></button>`).join("") || `<div class="expense-empty">Aún no hay categorías.</div>`}</div></section></div>`;
  const productContent = `<div class="expense-settings-grid"><section class="panel"><h2 class="section-title">Sabores</h2><p class="expense-help">Aquí permanece la administración actual de sabores.</p></section><section class="panel"><h2 class="section-title">Productos</h2><p class="expense-help">Aquí permanece la administración actual de productos.</p></section></div>`;
  const userContent = `<section class="panel expense-settings-panel"><h2 class="section-title">Usuarios</h2><p class="expense-help">Aquí permanece la administración actual de usuarios. Solo el perfil admin puede acceder a Configuración.</p></section>`;
  shell(`<div class="expense-heading"><div><p class="step-label">Administración</p><h1>Configuración</h1><p>Administra el catálogo, los usuarios y los gastos.</p></div></div>${banner}${tabs([["products", "Productos"], ["users", "Usuarios"], ["expenses", "Gastos"]], settingsTab)}${settingsTab === "expenses" ? expenseContent : settingsTab === "products" ? productContent : userContent}`, "settings");
  const render = () => renderExpenseSettingsPreview(shell, money, today, realTabs);
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => button.onclick = () => {
    settingsTab = button.dataset.tab as typeof settingsTab;
    if (realTabs && settingsTab !== "expenses") realTabs[settingsTab](); else render();
  });
  document.querySelector<HTMLButtonElement>("#add-expense-preset")?.addEventListener("click", () => presetEditor(null, render));
  document.querySelectorAll<HTMLButtonElement>("[data-edit-preset]").forEach((button) => button.onclick = () => presetEditor(list.find((item) => item.id === button.dataset.editPreset) ?? null, render));
  document.querySelector<HTMLButtonElement>("#add-expense-category")?.addEventListener("click", () => categoryEditor(null, render));
  document.querySelectorAll<HTMLButtonElement>("[data-edit-category]").forEach((button) => button.onclick = () => categoryEditor(categoryList.find((name) => name === button.dataset.editCategory) ?? null, render));
}

export function renderTransactionsPreview(shell: Shell, money: (value: number) => string, today: () => string, realSales?: () => void): void {
  const currentDay = today();
  const monthStart = `${currentDay.slice(0, 7)}-01`;
  expenseRange ??= { from: monthStart, to: currentDay };
  const { from, to } = expenseRange;
  const monthlyRange = from === monthStart && to === currentDay;
  const month = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" }).format(new Date(`${from}T12:00:00Z`));
  const rangeCaption = monthlyRange ? `${month.charAt(0).toUpperCase()}${month.slice(1)}` : `${from} a ${to}`;
  const list = entries().filter((item) => item.date >= from && item.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const expenseRows = list.map((item) => `<tr><td data-label="Fecha">${escapeHtml(item.date)}</td><td data-label="Responsable">${escapeHtml(item.username || "Usuario de prueba")}</td><td data-label="Concepto">${escapeHtml(item.name)}${item.note ? `<small class="expense-table-note">${escapeHtml(item.note)}</small>` : ""}</td><td data-label="Categoría">${escapeHtml(item.category)}</td><td data-label="Medio de pago">${escapeHtml(item.payment)}</td><td data-label="Valor">${money(item.amount)}</td></tr>`).join("");
  const expenseContent = `<div class="panel expense-table-panel"><form class="actions expense-range" id="expense-range-form"><label class="field">Desde<input id="expense-start" type="date" value="${escapeHtml(from)}" required></label><label class="field">Hasta<input id="expense-end" type="date" value="${escapeHtml(to)}" required></label><button class="secondary" type="submit">Consultar</button></form><div class="expense-transaction-summary"><span>${monthlyRange ? "Gastos de este mes" : "Gastos del período"}</span><strong>${money(list.reduce((sum, item) => sum + item.amount, 0))}</strong><small>${list.length} registro${list.length === 1 ? "" : "s"} · ${escapeHtml(rangeCaption)}</small></div><table class="table"><thead><tr><th>Fecha</th><th>Responsable</th><th>Concepto</th><th>Categoría</th><th>Medio de pago</th><th>Valor</th></tr></thead><tbody>${expenseRows || `<tr><td colspan="6" class="empty">No hay gastos en el rango seleccionado.</td></tr>`}</tbody></table></div>`;
  const salesContent = `<section class="panel"><div class="actions" style="margin-bottom:18px"><label class="field">Desde<input type="date" value="${today()}"></label><label class="field">Hasta<input type="date" value="${today()}"></label><button class="secondary" type="button" disabled>Consultar</button><button class="outline" type="button" disabled>Exportar</button><button class="primary" type="button" disabled>Cierre de turno</button></div><table class="table"><thead><tr><th>Fecha</th><th>Vendedor</th><th>Productos</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody><tr><td colspan="6" class="empty">Las ventas actuales aparecerán aquí en la app con sesión iniciada.</td></tr></tbody></table></section>`;
  shell(`<div class="expense-heading"><div><h1>Transacciones</h1><p>Consulta las ventas y los gastos desde un mismo lugar.</p></div></div>${banner}${tabs([["sales", "Ventas"], ["expenses", "Gastos"]], transactionsTab)}${transactionsTab === "expenses" ? expenseContent : salesContent}`, "sales");
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => button.onclick = () => { transactionsTab = button.dataset.tab as typeof transactionsTab; if (realSales && transactionsTab === "sales") realSales(); else renderTransactionsPreview(shell, money, today, realSales); });
  document.querySelector<HTMLFormElement>("#expense-range-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const start = document.querySelector<HTMLInputElement>("#expense-start")!;
    const end = document.querySelector<HTMLInputElement>("#expense-end")!;
    if (!start.value || !end.value) return;
    end.setCustomValidity(start.value > end.value ? "La fecha final debe ser igual o posterior a la inicial." : "");
    if (!end.reportValidity()) return;
    expenseRange = { from: start.value, to: end.value };
    renderTransactionsPreview(shell, money, today, realSales);
  });
}

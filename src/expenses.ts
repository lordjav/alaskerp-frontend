import { api } from "./services/api";
import type { ExpenseCategory, ExpensePayment, ExpensePreset, Page } from "./models";

type Shell = (content: string, page: Page) => void;
type Money = (value: number) => string;
type Today = () => string;
const payments: Array<[ExpensePayment, string]> = [["cash", "Efectivo"], ["nequi", "Nequi"], ["bancolombia", "Bancolombia"], ["credit_card", "Tarjeta"], ["other", "Otro"]];
const paymentName = (value: ExpensePayment) => payments.find(([code]) => code === value)?.[1] ?? value;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const errorText = (error: unknown) => error instanceof Error ? error.message : "No se pudo completar la operación.";
const categoryOptions = (categories: ExpenseCategory[]) => categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("");
const paymentOptions = () => payments.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
let quickDismissController: AbortController | null = null;
let expenseRange: { from: string; to: string } | null = null;
let pendingExpense: { key: string; payload: string } | null = null;

export async function renderExpenseRegistration(shell: Shell, money: Money, today: Today): Promise<void> {
  quickDismissController?.abort();
  const [categories, presets] = await Promise.all([api.expenseCategories(), api.expensePresets()]);
  const options = presets.map((item) => `<button class="expense-quick-item" type="button" data-preset="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category_name)}</small></span><b>${item.suggested_amount === null ? "Valor por ingresar" : money(item.suggested_amount)}</b></button>`).join("");
  shell(`<div class="expense-registration"><section class="panel expense-form-panel"><div class="expense-register-head"><div><p class="step-label">Registrar gasto</p><h1>Nuevo registro</h1><p>Completa el detalle del gasto. Puedes usar un frecuente para llenar el formulario.</p></div><div class="expense-quick"><button class="outline expense-quick-toggle" id="expense-quick-toggle" type="button" aria-expanded="false" aria-controls="expense-quick-menu">Acceso rápido <span aria-hidden="true">▾</span></button><div class="expense-quick-menu" id="expense-quick-menu" hidden>${options || `<div class="expense-empty">No hay gastos frecuentes configurados.</div>`}</div></div></div><form id="expense-form"><label class="field">Concepto<input name="name" maxlength="120" placeholder="Ej. Compra de vasos" required></label><div class="expense-form-grid"><label class="field">Valor (COP)<input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="0" required></label><label class="field">Fecha<input name="date" type="date" value="${today()}" required></label><label class="field">Categoría<select name="category" required>${categoryOptions(categories)}</select></label><label class="field">Medio de pago<select name="payment">${paymentOptions()}</select></label></div><label class="field">Nota <span class="expense-optional">opcional · máximo 1000 caracteres</span><textarea name="note" maxlength="1000" rows="3" placeholder="Agrega un detalle si lo necesitas"></textarea></label><p class="expense-feedback" id="expense-feedback" role="status">${categories.length ? "" : "Primero configura al menos una categoría de gastos."}</p><button class="primary expense-submit" type="submit" ${categories.length ? "" : "disabled"}>Registrar gasto</button></form></section></div>`, "expenses");
  const form = document.querySelector<HTMLFormElement>("#expense-form")!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const toggle = document.querySelector<HTMLButtonElement>("#expense-quick-toggle")!;
  const menu = document.querySelector<HTMLDivElement>("#expense-quick-menu")!;
  const quick = document.querySelector<HTMLDivElement>(".expense-quick")!;
  const feedback = document.querySelector<HTMLElement>("#expense-feedback")!;
  let selectedPreset: string | null = null;
  const closeMenu = () => { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
  toggle.onclick = () => { menu.hidden = !menu.hidden; toggle.setAttribute("aria-expanded", String(!menu.hidden)); };
  menu.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeMenu(); toggle.focus(); } });
  quickDismissController = new AbortController();
  document.addEventListener("pointerdown", (event) => {
    if (!quick.isConnected) { quickDismissController?.abort(); return; }
    if (!quick.contains(event.target as Node)) closeMenu();
  }, { signal: quickDismissController.signal });
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => button.onclick = () => {
    const item = presets.find((preset) => preset.id === button.dataset.preset);
    if (!item) return;
    selectedPreset = item.id;
    field("name").value = item.name;
    field("category").value = item.category_id;
    field("payment").value = item.payment_type;
    field("amount").value = item.suggested_amount === null ? "" : String(item.suggested_amount);
    closeMenu();
    feedback.textContent = `${item.name} listo para registrar.`;
    field(item.suggested_amount === null ? "amount" : "note").focus();
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const amount = Number(field("amount").value);
    if (!Number.isSafeInteger(amount) || amount <= 0) { field("amount").focus(); return; }
    const data = { name: field("name").value.trim(), amount, expense_date: field("date").value, category_id: field("category").value, payment_type: field("payment").value, note: field("note").value.trim(), preset_id: selectedPreset };
    if (!data.name || data.note.length > 1000) { feedback.textContent = "Revisa el concepto y la nota del gasto."; return; }
    const payload = JSON.stringify(data);
    if (!pendingExpense || pendingExpense.payload !== payload) pendingExpense = { key: crypto.randomUUID(), payload };
    const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    button.disabled = true;
    feedback.textContent = "Registrando gasto…";
    let result: { created: boolean };
    try {
      result = await api.createExpense(data, pendingExpense.key);
    } catch (error) {
      feedback.textContent = errorText(error);
      button.disabled = false;
      return;
    }
    pendingExpense = null;
    try {
      await renderExpenseRegistration(shell, money, today);
      document.querySelector<HTMLElement>("#expense-feedback")!.textContent = `${result.created ? "Gasto registrado" : "Gasto ya registrado"} por ${money(amount)}.`;
    } catch {
      feedback.textContent = `Gasto registrado por ${money(amount)}. Actualiza la pantalla para cargar de nuevo las categorías.`;
    }
  };
}

function openEditor(heading: string, body: string): { overlay: HTMLDivElement; close: () => void; error: HTMLElement } {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `<section class="modal expense-editor" role="dialog" aria-modal="true" aria-label="${escapeHtml(heading)}"><div class="expense-section-head"><div><p class="step-label">Configuración</p><h2>${escapeHtml(heading)}</h2></div><button class="modal-close" type="button" data-close aria-label="Cerrar">×</button></div>${body}</section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector<HTMLButtonElement>("[data-close]")!.onclick = close;
  overlay.onclick = (event) => { if (event.target === overlay) close(); };
  return { overlay, close, error: overlay.querySelector<HTMLElement>("[role=alert]")! };
}

function presetEditor(existing: ExpensePreset | null, categories: ExpenseCategory[], refresh: () => Promise<void>): void {
  const { overlay, close, error } = openEditor(existing ? "Editar gasto frecuente" : "Nuevo gasto frecuente", `<p class="expense-help">Define los datos que se completarán al elegirlo en Registrar gasto.</p><form id="preset-form"><label class="field">Nombre<input name="name" maxlength="120" placeholder="Ej. Compra de insumos" required></label><div class="expense-form-grid"><label class="field">Categoría<select name="category" required>${categoryOptions(categories)}</select></label><label class="field">Medio de pago<select name="payment">${paymentOptions()}</select></label></div><label class="field">Valor sugerido (COP) <span class="expense-optional">opcional</span><input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="Se ingresa al registrar"></label><p class="expense-form-error" role="alert"></p><div class="expense-editor-actions">${existing ? `<button class="outline danger" type="button" data-delete>Eliminar</button>` : ""}<button class="primary" type="submit">Guardar frecuente</button></div></form>`);
  const form = overlay.querySelector<HTMLFormElement>("#preset-form")!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  if (existing) { field("name").value = existing.name; field("category").value = existing.category_id; field("payment").value = existing.payment_type; field("amount").value = existing.suggested_amount === null ? "" : String(existing.suggested_amount); }
  overlay.querySelector<HTMLButtonElement>("[data-delete]")?.addEventListener("click", async () => {
    if (!existing || !confirm(`¿Eliminar “${existing.name}” de gastos frecuentes?`)) return;
    try { await api.deleteExpensePreset(existing.id); close(); await refresh(); } catch (cause) { error.textContent = errorText(cause); }
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const amountText = field("amount").value.trim();
    const amount = amountText ? Number(amountText) : null;
    if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0)) { field("amount").focus(); return; }
    const data = { name: field("name").value.trim(), category_id: field("category").value, payment_type: field("payment").value, suggested_amount: amount };
    const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    button.disabled = true;
    try {
      if (existing) await api.updateExpensePreset(existing.id, data); else await api.createExpensePreset(data);
      close(); await refresh();
    } catch (cause) { error.textContent = errorText(cause); button.disabled = false; }
  };
  field("name").focus();
}

function categoryEditor(existing: ExpenseCategory | null, refresh: () => Promise<void>): void {
  const { overlay, close, error } = openEditor(existing ? "Editar categoría" : "Nueva categoría", `<form id="category-form"><label class="field">Nombre<input name="name" maxlength="80" placeholder="Ej. Limpieza" required></label><p class="expense-form-error" role="alert"></p><div class="expense-editor-actions">${existing ? `<button class="outline danger" type="button" data-delete>Eliminar</button>` : ""}<button class="primary" type="submit">Guardar categoría</button></div></form>`);
  const form = overlay.querySelector<HTMLFormElement>("#category-form")!;
  const input = form.elements.namedItem("name") as HTMLInputElement;
  input.value = existing?.name ?? "";
  overlay.querySelector<HTMLButtonElement>("[data-delete]")?.addEventListener("click", async () => {
    if (!existing || !confirm(`¿Eliminar la categoría “${existing.name}”?`)) return;
    try { await api.deleteExpenseCategory(existing.id); close(); await refresh(); } catch (cause) { error.textContent = errorText(cause); }
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    button.disabled = true;
    try {
      if (existing) await api.updateExpenseCategory(existing.id, input.value.trim()); else await api.createExpenseCategory(input.value.trim());
      close(); await refresh();
    } catch (cause) { error.textContent = errorText(cause); button.disabled = false; }
  };
  input.focus();
}

export async function renderExpenseSettings(shell: Shell, money: Money, realTabs: { products: () => void; users: () => void }): Promise<void> {
  const [categories, presets] = await Promise.all([api.expenseCategories(), api.expensePresets()]);
  const presetList = presets.map((item) => `<button class="config-item" data-edit-preset="${escapeHtml(item.id)}"><span class="config-item-main"><span class="config-item-title">${escapeHtml(item.name)}</span><span class="config-item-sub">${escapeHtml(item.category_name)} · ${item.suggested_amount === null ? "Valor al registrar" : money(item.suggested_amount)} · ${paymentName(item.payment_type)}</span></span><span class="config-chevron">›</span></button>`).join("");
  const categoryList = categories.map((item) => `<button class="config-item" data-edit-category="${escapeHtml(item.id)}"><span class="config-item-main"><span class="config-item-title">${escapeHtml(item.name)}</span><span class="config-item-sub">${presets.filter((preset) => preset.category_id === item.id).length} frecuentes</span></span><span class="config-chevron">›</span></button>`).join("");
  shell(`<div class="expense-heading"><div><p class="step-label">Administración</p><h1>Configuración</h1><p>Administra el catálogo, los usuarios y los gastos.</p></div></div><div class="expense-tabs" role="tablist"><button type="button" role="tab" aria-selected="false" data-tab="products">Productos</button><button type="button" role="tab" aria-selected="false" data-tab="users">Usuarios</button><button type="button" role="tab" aria-selected="true" class="active">Gastos</button></div><div class="expense-settings-grid"><section class="panel expense-settings-panel"><div class="expense-section-head"><div><p class="step-label">Accesos rápidos</p><h2 class="section-title">Gastos frecuentes</h2><p>Completa el formulario de registro con un toque.</p></div><button class="primary" id="add-expense-preset" type="button" ${categories.length ? "" : "disabled"}>+ Nuevo frecuente</button></div><div class="expense-settings-list">${presetList || `<div class="expense-empty">Aún no hay gastos frecuentes.</div>`}</div></section><section class="panel expense-settings-panel"><div class="expense-section-head"><div><p class="step-label">Clasificación</p><h2 class="section-title">Categorías</h2><p>Organiza los gastos para consultarlos después.</p></div><button class="primary" id="add-expense-category" type="button">+ Nueva categoría</button></div><div class="expense-settings-list">${categoryList || `<div class="expense-empty">Aún no hay categorías.</div>`}</div></section></div>`, "settings");
  const refresh = () => renderExpenseSettings(shell, money, realTabs);
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => button.onclick = () => realTabs[button.dataset.tab as "products" | "users"]());
  document.querySelector<HTMLButtonElement>("#add-expense-preset")?.addEventListener("click", () => presetEditor(null, categories, refresh));
  document.querySelectorAll<HTMLButtonElement>("[data-edit-preset]").forEach((button) => button.onclick = () => presetEditor(presets.find((item) => item.id === button.dataset.editPreset) ?? null, categories, refresh));
  document.querySelector<HTMLButtonElement>("#add-expense-category")?.addEventListener("click", () => categoryEditor(null, refresh));
  document.querySelectorAll<HTMLButtonElement>("[data-edit-category]").forEach((button) => button.onclick = () => categoryEditor(categories.find((item) => item.id === button.dataset.editCategory) ?? null, refresh));
}

export async function renderExpenseTransactions(shell: Shell, money: Money, today: Today, showSales: () => void): Promise<void> {
  const currentDay = today();
  const monthStart = `${currentDay.slice(0, 7)}-01`;
  expenseRange ??= { from: monthStart, to: currentDay };
  const { from, to } = expenseRange;
  const result = await api.expenses(from, to);
  const monthlyRange = from === monthStart && to === currentDay;
  const month = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" }).format(new Date(`${from}T12:00:00Z`));
  const caption = monthlyRange ? `${month.charAt(0).toUpperCase()}${month.slice(1)}` : `${from} a ${to}`;
  const rows = result.items.map((item) => `<tr><td data-label="Fecha">${escapeHtml(item.expense_date)}</td><td data-label="Responsable">${escapeHtml(item.responsible.username)}</td><td data-label="Concepto">${escapeHtml(item.name)}${item.note ? `<small class="expense-table-note">${escapeHtml(item.note)}</small>` : ""}</td><td data-label="Categoría">${escapeHtml(item.category_name)}</td><td data-label="Medio de pago">${paymentName(item.payment_type)}</td><td data-label="Valor">${money(item.amount)}</td></tr>`).join("");
  shell(`<div class="expense-heading"><div><h1>Transacciones</h1><p>Consulta las ventas y los gastos desde un mismo lugar.</p></div></div><div class="expense-tabs" role="tablist"><button type="button" role="tab" aria-selected="false" id="transactions-sales">Ventas</button><button type="button" role="tab" aria-selected="true" class="active">Gastos</button></div><div class="panel expense-table-panel"><form class="actions expense-range" id="expense-range-form"><label class="field">Desde<input id="expense-start" type="date" value="${escapeHtml(from)}" required></label><label class="field">Hasta<input id="expense-end" type="date" value="${escapeHtml(to)}" required></label><button class="secondary" type="submit">Consultar</button></form><p class="expense-form-error" id="expense-range-error" role="alert"></p><div class="expense-transaction-summary"><span>${monthlyRange ? "Gastos de este mes" : "Gastos del período"}</span><strong>${money(result.total_amount)}</strong><small>${result.count} registro${result.count === 1 ? "" : "s"} · ${escapeHtml(caption)}</small></div><table class="table"><thead><tr><th>Fecha</th><th>Responsable</th><th>Concepto</th><th>Categoría</th><th>Medio de pago</th><th>Valor</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">No hay gastos en el rango seleccionado.</td></tr>`}</tbody></table></div>`, "sales");
  document.querySelector<HTMLButtonElement>("#transactions-sales")!.onclick = showSales;
  document.querySelector<HTMLFormElement>("#expense-range-form")!.onsubmit = async (event) => {
    event.preventDefault();
    const start = document.querySelector<HTMLInputElement>("#expense-start")!;
    const end = document.querySelector<HTMLInputElement>("#expense-end")!;
    end.setCustomValidity(start.value > end.value ? "La fecha final debe ser igual o posterior a la inicial." : "");
    if (!end.reportValidity()) return;
    const previous = expenseRange;
    expenseRange = { from: start.value, to: end.value };
    try { await renderExpenseTransactions(shell, money, today, showSales); }
    catch (error) { expenseRange = previous; document.querySelector<HTMLElement>("#expense-range-error")!.textContent = errorText(error); }
  };
}

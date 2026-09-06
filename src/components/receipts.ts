import type { Sale } from "../models";
import { loadReceiptSettings, saveReceiptSettings, receiptLines, sampleSale } from "../services/receipt";
import { openDrawer, printerRequest, printReceipt } from "../services/printer";

function dialog(heading: string): { overlay: HTMLDivElement; content: HTMLElement; close: () => void } {
  const previous = document.activeElement as HTMLElement | null;
  const overlay = document.createElement("div"); overlay.className = "modal-backdrop receipt-overlay";
  overlay.innerHTML = `<section class="modal receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-heading"><div class="modal-heading"><h2 id="receipt-heading"></h2><button class="modal-close" aria-label="Cerrar tiquete">×</button></div><div data-content></div></section>`;
  overlay.querySelector("h2")!.textContent = heading;
  const close = () => { overlay.remove(); previous?.focus(); };
  overlay.querySelector<HTMLButtonElement>(".modal-close")!.onclick = close;
  overlay.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.querySelector("button:disabled")) close();
    if (event.key === "Tab") {
      const controls = Array.from(overlay.querySelectorAll<HTMLElement>("button:not(:disabled),input,select"));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  document.body.append(overlay); overlay.querySelector<HTMLButtonElement>(".modal-close")!.focus();
  return { overlay, content: overlay.querySelector<HTMLElement>("[data-content]")!, close };
}
export function showReceipt(sale: Sale, options: { newSale?: boolean; canPrint: boolean } ): void {
  const { overlay, content, close } = dialog(options.newSale ? "Venta registrada" : "Tiquete de venta");
  content.innerHTML = `<p>Conserva este comprobante. Puedes volver a imprimirlo sin registrar otra venta.</p><pre class="receipt-paper" aria-label="Vista previa del tiquete"></pre><p class="receipt-status" role="status" aria-live="polite"></p><div class="actions"><button class="primary" data-print ${options.canPrint ? "" : "disabled"}>Imprimir tiquete</button><button class="outline" data-done>Continuar</button></div>`;
  let copy = !options.newSale;
  const settings = loadReceiptSettings();
  const preview = content.querySelector("pre")!;
  const status = content.querySelector<HTMLElement>("[role=status]")!;
  const button = content.querySelector<HTMLButtonElement>("[data-print]")!;
  const paint = () => { preview.textContent = receiptLines(sale, settings, copy).join("\n"); };
  paint(); content.querySelector<HTMLButtonElement>("[data-done]")!.onclick = close;
  const send = async (automatic: boolean) => {
    overlay.querySelectorAll<HTMLButtonElement>("button").forEach(el => el.disabled = true);
    status.textContent = "Enviando a SAT15TUS…";
    // Only the initial automatic cash print may pulse the drawer; copies never do.
    const pulse = automatic && sale.payment_type === "cash" && sale.status === "active" && settings.openCashDrawer;
    try {
      const result = await printReceipt(receiptLines(sale, settings, copy), pulse, crypto.randomUUID());
      status.textContent = `${result.message} Comprueba la salida del papel${pulse ? " y la apertura del cajón" : ""}.`;
      copy = true; button.textContent = "Imprimir copia";
    } catch (error) {
      status.textContent = `La venta está registrada. ${error instanceof Error ? error.message : "No se pudo imprimir."}`;
      // Delivery can be uncertain: any deliberate next attempt is visibly a copy.
      copy = true; button.textContent = "Volver a imprimir copia";
    } finally { overlay.querySelectorAll<HTMLButtonElement>("button").forEach(el => el.disabled = false); paint(); }
  };
  button.onclick = () => void send(false);
  if (options.newSale && options.canPrint && settings.autoPrint) void send(true);
}
export function showPrinterSettings(): void {
  const { content } = dialog("Tiquetes e impresora");
  const settings = loadReceiptSettings();
  content.innerHTML = `<div class="receipt-settings-grid"><form class="receipt-form"><p>Configuración guardada en este navegador.</p><label class="field">Nombre del negocio<input name="business" maxlength="80" required></label><label class="field">Dirección<input name="address" maxlength="120"></label><label class="field">Teléfono<input name="phone" maxlength="60"></label><label class="field">Mensaje final<input name="footer" maxlength="160"></label><label class="field">Ancho del tiquete<select name="columns"><option value="32">58 mm · 32 caracteres</option><option value="42">80 mm · 42 caracteres</option></select></label><label class="receipt-check"><input type="checkbox" name="autoPrint">Imprimir al registrar la venta</label><label class="receipt-check"><input type="checkbox" name="openCashDrawer">Abrir cajón con la impresión automática en efectivo</label><label class="field">Clave del conector local<input name="token" type="password" autocomplete="off" maxlength="128" placeholder="Pega la clave del conector"></label><p class="receipt-help">Abre Alaska Caja y pulsa Copiar clave para la web. La aplicación se inicia con tu sesión de Windows. SAT15TUS debe estar encendida. Si el navegador pide acceso al equipo o a la red local, permítelo para conectar la impresora.</p><button class="primary" type="submit">Guardar configuración</button></form><div><p class="step-label">Vista previa · Ejemplo</p><pre class="receipt-paper" aria-label="Tiquete de ejemplo"></pre></div></div><p class="receipt-status" role="status" aria-live="polite"></p><div class="actions"><button class="outline" data-check>Comprobar conexión</button><button class="outline" data-test>Imprimir prueba</button><button class="outline" data-drawer>Abrir cajón</button></div>`;
  const form = content.querySelector("form")!;
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  for (const name of ["business", "address", "phone", "footer", "token"] as const) input(name).value = settings[name];
  input("columns").value = String(settings.columns);
  input("autoPrint").checked = settings.autoPrint; input("openCashDrawer").checked = settings.openCashDrawer;
  const current = () => ({ business: input("business").value.trim() || "HELADOS ALASKA", address: input("address").value.trim(), phone: input("phone").value.trim(), footer: input("footer").value.trim(), token: input("token").value.trim(), columns: Number(input("columns").value) as 32 | 42, autoPrint: input("autoPrint").checked, openCashDrawer: input("openCashDrawer").checked });
  const paint = () => content.querySelector("pre")!.textContent = receiptLines(sampleSale, current()).join("\n"); paint();
  form.addEventListener("input", paint);
  const status = content.querySelector<HTMLElement>("[role=status]")!;
  form.onsubmit = event => { event.preventDefault(); saveReceiptSettings(current()); status.textContent = "Configuración guardada en este navegador."; };
  const run = async (action: () => Promise<{ message: string }>) => {
    const buttons = content.querySelectorAll<HTMLButtonElement>("button"); buttons.forEach(b => b.disabled = true);
    try { saveReceiptSettings(current()); status.textContent = "Conectando…"; status.textContent = (await action()).message; }
    catch (error) { status.textContent = error instanceof Error ? error.message : "No se pudo completar la prueba."; }
    finally { buttons.forEach(b => b.disabled = false); }
  };
  content.querySelector<HTMLButtonElement>("[data-check]")!.onclick = () => void run(() => printerRequest("/health"));
  content.querySelector<HTMLButtonElement>("[data-test]")!.onclick = () => void run(() => printReceipt(["*** PRUEBA - NO ES UNA VENTA ***", ...receiptLines(sampleSale, current())], false, crypto.randomUUID()));
  content.querySelector<HTMLButtonElement>("[data-drawer]")!.onclick = () => void run(openDrawer);
}
export async function manualDrawer(button: HTMLButtonElement): Promise<void> {
  if (button.disabled) return;
  button.disabled = true;
  try { const result = await openDrawer(); button.textContent = result.message; }
  catch (error) { button.textContent = error instanceof Error ? error.message : "No se pudo abrir el cajón"; }
  finally { button.disabled = false; }
}

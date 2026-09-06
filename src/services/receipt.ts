import type { Sale } from "../models";

export interface ReceiptSettings {
  business: string; address: string; phone: string; footer: string;
  columns: 32 | 42; autoPrint: boolean; openCashDrawer: boolean; token: string;
}
export const defaultReceiptSettings: ReceiptSettings = {
  business: "HELADOS ALASKA", address: "", phone: "", footer: "Gracias por tu compra. Vuelve pronto!",
  columns: 32, autoPrint: true, openCashDrawer: true, token: "",
};
export function loadReceiptSettings(): ReceiptSettings {
  const settings = { ...defaultReceiptSettings };
  try {
    const saved = JSON.parse(localStorage.getItem("alaskerp.receipt.v1") || "{}");
    if (!saved || typeof saved !== "object") return settings;
    for (const name of ["business", "address", "phone", "footer", "token"] as const) {
      if (typeof saved[name] === "string") settings[name] = saved[name].slice(0, 160);
    }
    for (const name of ["autoPrint", "openCashDrawer"] as const) {
      if (typeof saved[name] === "boolean") settings[name] = saved[name];
    }
    settings.columns = saved.columns === 42 ? 42 : 32;
    return settings;
  } catch { return settings; }
}
export function saveReceiptSettings(settings: ReceiptSettings): void {
  localStorage.setItem("alaskerp.receipt.v1", JSON.stringify(settings));
}
// ASCII is deliberate: no dependency on the printer's configured code page.
export const printable = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, " ").replace(/ +/g, " ").trim();
export function wrap(value: string, columns: number): string[] {
  const result: string[] = []; let line = "";
  for (let word of printable(value).split(" ")) {
    if (line && line.length + 1 + word.length > columns) { result.push(line); line = ""; }
    while (word.length > columns) { result.push(word.slice(0, columns)); word = word.slice(columns); }
    if (word) line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result;
}
export function receiptLines(sale: Sale, settings: ReceiptSettings, copy = false): string[] {
  const width = settings.columns === 42 ? 42 : 32;
  const lines: string[] = [];
  const add = (text: string) => lines.push(...wrap(text, width));
  const center = (text: string) => wrap(text, width).forEach(line => lines.push(" ".repeat(Math.floor((width - line.length) / 2)) + line));
  const rule = () => lines.push("-".repeat(width));
  const amount = (value: number) => "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
  const pair = (left: string, right: string) => {
    left = printable(left); right = printable(right);
    if (left.length + right.length + 1 > width) { add(left); lines.push(...wrap(right, width).map(line => line.padStart(width))); }
    else lines.push(left + " ".repeat(width - left.length - right.length) + right);
  };
  center(settings.business); if (settings.address) center(settings.address); if (settings.phone) center(settings.phone);
  rule(); center("COMPROBANTE DE VENTA"); if (copy) center("COPIA");
  if (sale.status === "cancelled") center("*** VENTA ANULADA ***");
  add(new Date(sale.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: false }));
  add(`Vendedor: ${sale.seller.username}`); add(`Referencia: ${sale.created_at}`); rule();
  for (const item of sale.items) {
    add(`${item.presentation} ${item.size}`); if (item.flavors.length) add(item.flavors.join(", "));
    pair(`${item.quantity} x ${amount(item.unit_price)}`, amount(item.total)); lines.push("");
  }
  rule(); pair("TOTAL COP", amount(sale.total_sale));
  const payments: Record<string, string> = { cash: "Efectivo", nequi: "Nequi", bancolombia: "Bancolombia", credit_card: "Tarjeta", other: "Otro" };
  add(`Pago: ${payments[sale.payment_type] ?? sale.payment_type}`);
  if (sale.payment_comment) add(sale.payment_comment);
  if (sale.cancellation_reason) add(`Anulacion: ${sale.cancellation_reason}`);
  rule(); center(settings.footer); center("No es factura electronica.");
  return lines;
}
export const sampleSale: Sale = {
  created_at: "2026-09-06T20:30:00.000Z", seller: { username: "Alaska", seller_id: "sample" },
  total_sale: 18000, payment_type: "cash", status: "active",
  items: [
    { product_id: "sample-1", presentation: "Vaso", size: "Mediano", flavors: ["Chocolate", "Fresa"], quantity: 2, unit_price: 6000, total: 12000 },
    { product_id: "sample-2", presentation: "Cono", size: "Grande", flavors: ["Vainilla", "Arequipe", "Mora"], quantity: 1, unit_price: 6000, total: 6000 },
  ],
};

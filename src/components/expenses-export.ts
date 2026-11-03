import type { Expense, ExpensePayment } from "../models";

export function expenseCsv(items: Expense[], paymentName: (payment: ExpensePayment) => string): string {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ["Fecha", "Responsable", "Concepto", "Categoría", "Medio de pago", "Valor (COP)", "Nota"];
  const rows = items.map((item) => [
    item.expense_date, item.responsible.username, item.name, item.category_name,
    paymentName(item.payment_type), item.amount, item.note,
  ].map(cell).join(","));
  return "\ufeff" + [header.map(cell).join(","), ...rows].join("\r\n");
}

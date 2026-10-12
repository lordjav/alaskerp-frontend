export type Role = "seller" | "manager" | "observer" | "admin";
export type Page = "pos" | "sales" | "metrics" | "settings" | "expenses";

export interface Product {
  id: string;
  presentation: string;
  size: string;
  max_flavors: number;
  price: number;
  is_active: boolean;
}

export interface Flavor { id: string; name: string; is_active: boolean; }
export interface CartItem { product: Product; flavors: string[]; quantity: number; }
export interface SaleItem { product_id: string; presentation: string; size: string; flavors: string[]; quantity: number; unit_price: number; total: number; }
export interface Sale { created_at: string; total_sale: number; items: SaleItem[]; seller: { username: string; seller_id: string }; payment_type: string; payment_comment?: string; status: "active" | "cancelled"; cancellation_reason?: string; }
export type ExpensePayment = "cash" | "nequi" | "bancolombia" | "credit_card" | "other";
export interface ExpenseCategory { id: string; name: string; is_active: boolean; }
export interface ExpensePreset { id: string; name: string; category_id: string; category_name: string; payment_type: ExpensePayment; suggested_amount: number | null; is_active: boolean; }
export interface Expense { id: string; expense_date: string; created_at: string; name: string; amount: number; category_id: string; category_name: string; payment_type: ExpensePayment; note: string; responsible: { username: string; user_id: string }; preset_id: string | null; }
export interface ExpenseList { items: Expense[]; total_amount: number; count: number; }
export interface Metrics { net_sales: number; sale_count: number; daily: Record<string, number>; payment_types: Record<string, number>; products: Record<string, number>; sellers: Record<string, number>; flavors: Record<string, number>; }

import type { Flavor, Metrics, Product, Sale } from "../models";
import { accessToken, logout, refreshSession } from "./auth";
import { config } from "./config";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Alaskerp-Token", accessToken() ?? "");
  if (init.body) headers.set("Content-Type", "application/json");
  let response = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  if (response.status === 401 && await refreshSession()) {
    headers.set("X-Alaskerp-Token", accessToken() ?? "");
    response = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  }
  if (response.status === 401) { logout(); throw new Error("Sesión vencida."); }
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.detail ?? "No se pudo completar la operación."); }
  return response.json() as Promise<T>;
}

export const api = {
  products: () => request<Product[]>("/products"),
  flavors: () => request<Flavor[]>("/flavors"),
  createSale: (data: unknown, key: string) => request<{ sale: Sale }>("/sales", { method: "POST", body: JSON.stringify(data), headers: { "Idempotency-Key": key } }),
  sales: (start: string, end: string, cancelled = false) => request<Sale[]>(`/sales?start=${start}T00%3A00%3A00.000Z&end=${end}T23%3A59%3A59.999Z&include_cancelled=${cancelled}`),
  metrics: (start: string, end: string) => request<Metrics>(`/metrics?start=${start}&end=${end}`),
  cancelSale: (createdAt: string, reason: string) => request<Sale>(`/sales/${encodeURIComponent(createdAt)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  createFlavor: (name: string) => request<Flavor>("/flavors", { method: "POST", body: JSON.stringify({ name }) }),
  createProduct: (data: unknown) => request<Product>("/products", { method: "POST", body: JSON.stringify(data) }),
  users: () => request<Array<{ username: string; email: string; enabled: boolean; status: string }>>("/users"),
  createUser: (data: unknown) => request<{ username: string }>("/users", { method: "POST", body: JSON.stringify(data) }),
};

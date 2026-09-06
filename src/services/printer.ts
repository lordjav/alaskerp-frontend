import { loadReceiptSettings } from "./receipt";
const bridgeUrl = "http://127.0.0.1:19151";
export async function printerRequest(path: string, body?: unknown): Promise<{ message: string; job_id?: number }> {
  const { token } = loadReceiptSettings();
  if (!token) throw new Error("Conecta la impresora desde Tiquetes e impresora antes de imprimir.");
  let response: Response;
  try {
    response = await fetch(`${bridgeUrl}${path}`, {
      method: body ? "POST" : "GET", headers: { "X-Alaskerp-Print-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error("No se recibió confirmación del conector. Revisa Alaska Caja y el permiso de acceso local del navegador. Comprueba el papel antes de volver a imprimir."); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "No se pudo enviar la orden a SAT15TUS.");
  return result;
}
export const printReceipt = (lines: string[], openDrawer: boolean, requestId: string) => printerRequest("/print", { lines, open_drawer: openDrawer, request_id: requestId });
export const openDrawer = () => printerRequest("/drawer", { request_id: crypto.randomUUID() });

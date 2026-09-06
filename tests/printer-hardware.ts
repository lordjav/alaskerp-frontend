import '../src/styles/main.css';
import { receiptLines, sampleSale, defaultReceiptSettings } from '../src/services/receipt';
const lines = ['*** PRUEBA DESDE EL NAVEGADOR ***', ...receiptLines(sampleSale, defaultReceiptSettings)];
document.querySelector('#preview')!.textContent = lines.join('\n');
async function send(path: string, body?: object) {
  const status = document.querySelector('#status')!;
  status.textContent = 'Enviando…';
  document.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = true);
  try {
    const response = await fetch('http://127.0.0.1:19151' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Alaskerp-Print-Token': document.querySelector<HTMLInputElement>('#token')!.value.trim(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    status.textContent = result.message + (result.job_id ? ' Trabajo ' + result.job_id + '.' : '');
  } catch { status.textContent = 'No se confirmó la orden. Revisa Alaska Caja y el permiso de acceso local del navegador antes de repetir.'; }
  finally { document.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = false); }
}
document.querySelector<HTMLButtonElement>('#connect')!.onclick = () => void send('/health');
document.querySelector<HTMLButtonElement>('#print')!.onclick = () => void send('/print', { request_id: crypto.randomUUID(), lines, open_drawer: false });
document.querySelector<HTMLButtonElement>('#drawer')!.onclick = () => void send('/drawer', { request_id: crypto.randomUUID() });

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiptLines, sampleSale, defaultReceiptSettings, wrap } from '../src/services/receipt.ts';

test('58mm and 80mm receipts wrap every line including long tokens and totals', () => {
  for (const columns of [32,42]) {
    const sale = structuredClone(sampleSale);
    sale.items[0].presentation = 'Producto'.repeat(20);
    sale.items[0].flavors = ['Maracuyá', 'Chocólate'.repeat(20)];
    sale.payment_comment = '<script>\x1bp\nTexto';
    const lines = receiptLines(sale, {...defaultReceiptSettings,columns});
    assert.ok(lines.every(line => line.length <= columns));
    assert.ok(lines.every(line => /^[\x20-\x7e]*$/.test(line)));
    assert.ok(lines.some(line => line.includes('$18.000')));
    assert.ok(lines.some(line => line.includes('Vendedor: Alaska')));
    assert.ok(lines.some(line => line.includes('15:30')));
  }
});
test('historical unit prices and totals are used without catalog lookup', () => {
  const text=receiptLines(sampleSale,defaultReceiptSettings).join('\n');
  assert.match(text,/2 x \$6.000\s+\$12.000/);
  assert.match(text,/Pago: Efectivo/);
  assert.doesNotMatch(text,/COPIA/);
});
test('reprints and cancelled sales are clearly marked', () => {
  const text=receiptLines({...sampleSale,status:'cancelled',cancellation_reason:'Error de pago'},defaultReceiptSettings,true).join('\n');
  assert.match(text,/COPIA/); assert.match(text,/VENTA ANULADA/); assert.match(text,/Error de pago/);
});
test('long words and accents cannot create control bytes', () => {
  assert.deepEqual(wrap('áéíóú\x1b'+'x'.repeat(50),32), ['aeiou', 'x'.repeat(32), 'x'.repeat(18)]);
});

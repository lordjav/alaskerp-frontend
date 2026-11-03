import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseCsv } from '../src/components/expenses-export.ts';

test('expense CSV includes the queried records and escapes quotes, commas and line breaks', () => {
  const csv = expenseCsv([{
    expense_date: '2026-11-02', responsible: { username: 'Judith' },
    name: 'Vasos, "grandes"', category_name: 'Insumos', payment_type: 'other',
    amount: 12000, note: 'Primera línea\nSegunda línea',
  }], (payment) => payment === 'other' ? 'Otro' : payment);
  assert.ok(csv.startsWith('\ufeff"Fecha","Responsable","Concepto"'));
  assert.match(csv, /"2026-11-02","Judith","Vasos, ""grandes""","Insumos","Otro","12000","Primera línea\nSegunda línea"/);
  assert.equal(expenseCsv([], () => 'Otro').split('\r\n').length, 1);
});

test('expense CSV treats a formula-like concept as text', () => {
  const csv = expenseCsv([{
    expense_date: '2026-11-02', responsible: { username: 'Judith' },
    name: '=SUM(1,2)', category_name: 'Insumos', payment_type: 'cash',
    amount: 1000, note: '',
  }], () => 'Efectivo');
  assert.match(csv, /"'=SUM\(1,2\)"/);
});

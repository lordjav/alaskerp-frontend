import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyExpenseCategories, renderExpenseCategoryChart, renderHourlySalesChart, renderTreemap, treemapTiles, weeklySeries } from '../src/components/metrics-charts.ts';

test('monthly lines group calendar weeks and stop the current week today', () => {
  const weeks = weeklySeries('2026-10-01', '2026-10-12', {
    '2026-10-01': 30000,
    '2026-10-04': 130000,
    '2026-10-11': 1500000,
    '2026-10-12': 35000,
  });
  assert.equal(weeks.length, 3);
  assert.deepEqual(weeks.map((week) => week.total), [160000, 1500000, 35000]);
  assert.deepEqual(weeks[0].points.map((point) => point?.date ?? null), [null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.deepEqual(weeks[2].points.map((point) => point?.date ?? null), ['2026-10-12', null, null, null, null, null, null]);
});

test('treemap tiles cover the chart without overlap and preserve proportions', () => {
  const values = { A: 70, B: 20, C: 7, D: 3 };
  const tiles = treemapTiles(values);
  assert.equal(tiles.length, 4);
  for (const tile of tiles) {
    assert.ok(tile.x >= 0 && tile.y >= 0 && tile.x + tile.width <= 100.000001 && tile.y + tile.height <= 100.000001);
    assert.ok(Math.abs(tile.width * tile.height - values[tile.name] * 100) < 0.0001);
    for (const other of tiles) {
      if (other === tile) continue;
      const overlapWidth = Math.min(tile.x + tile.width, other.x + other.width) - Math.max(tile.x, other.x);
      const overlapHeight = Math.min(tile.y + tile.height, other.y + other.height) - Math.max(tile.y, other.y);
      assert.ok(overlapWidth <= 0.000001 || overlapHeight <= 0.000001);
    }
  }
});

test('treemap shows shares beside totals and preserves tiny tile details in tooltips', () => {
  const chart = renderTreemap('Por producto', { Principal: 90, Intermedio: 9.5, Mínimo: 0.5 }, (value) => `$ ${value}`, 'Ventas');
  assert.match(chart, /<span>\$ 90<\/span><span class="metrics-treemap-percent">90 %<\/span>/);
  assert.match(chart, /Intermedio: \$ 9\.5 · 9,5 %/);
  assert.match(chart, /class="metrics-treemap-tile tiny"[^>]*aria-label="Mínimo: \$ 0\.5 · 0,5 %"[^>]*><\/div>/);
});

test('expense chart keeps six calendar months and stacks amounts by category', () => {
  const expenses = [
    { expense_date: '2026-04-30', category_id: 'a', category_name: 'Insumos', amount: 999 },
    { expense_date: '2026-05-01', category_id: 'a', category_name: 'Insumos', amount: 100 },
    { expense_date: '2026-10-02', category_id: 'a', category_name: 'Insumos', amount: 200 },
    { expense_date: '2026-10-03', category_id: 'b', category_name: 'Servicios', amount: 300 },
  ];
  const { months } = monthlyExpenseCategories(expenses, '2026-10-12');
  assert.deepEqual(months.map((month) => month.key), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(months.map((month) => month.total), [100, 0, 0, 0, 0, 500]);
  assert.deepEqual(months.at(-1).categories, { a: 200, b: 300 });
  const chart = renderExpenseCategoryChart(expenses, '2026-10-12', (value) => `$ ${value}`);
  assert.match(chart, /Gastos por categoría/);
  assert.match(chart, /Servicios · oct\.: \$ 300/);
});

test('hourly chart shows narrow bars from 07 through midnight in calendar order', () => {
  const chart = renderHourlySalesChart({ '0': 100, '6': 999, '7': 200, '12': 300 }, (value) => `$ ${value}`);
  assert.equal((chart.match(/class="metrics-data-point metrics-hour-point"/g) ?? []).length, 18);
  assert.ok(chart.indexOf('data-label="07:00"') < chart.indexOf('data-label="12:00"'));
  assert.ok(chart.indexOf('data-label="12:00"') < chart.indexOf('data-label="00:00"'));
  assert.match(chart, /data-label="00:00" data-value="\$ 100"/);
  assert.doesNotMatch(chart, /\$ 999/);
});

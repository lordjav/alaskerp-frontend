import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsPeriod, shiftMonth } from '../src/components/metrics-period.ts';

test('month arrows cross year boundaries without changing the day', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('selected month uses today only for the current month and its full final day for history', () => {
  assert.deepEqual(metricsPeriod('2026-11', '2026-11-02'), {
    start: '2026-11-01', end: '2026-11-02', historyStart: '2026-06-01', historyEnd: '2026-11-02',
  });
  assert.deepEqual(metricsPeriod('2024-02', '2026-11-02'), {
    start: '2024-02-01', end: '2024-02-29', historyStart: '2026-06-01', historyEnd: '2026-11-02',
  });
  assert.deepEqual(metricsPeriod('2026-10', '2026-11-02'), {
    start: '2026-10-01', end: '2026-10-31', historyStart: '2026-06-01', historyEnd: '2026-11-02',
  });
});

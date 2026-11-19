// Система: «Смещение сроков» — проверка входных параметров (db/TaskShiftRepository.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockServerModule } from './helpers/http.mjs';

mockServerModule('config/db.js', { pool: { query: async () => ({ rows: [] }) } });
mockServerModule('db/TaskRepository.js', { TaskRepository: {} });
const { parseShift } = await import('../db/TaskShiftRepository.js');

test('корректные параметры разбираются в числа', () => {
  assert.deepEqual(parseShift({ roadmapId: '5', fromDate: '2026-11-01', days: '-3' }),
    { roadmapId: 5, fromDate: '2026-11-01', days: -3 });
});

test('нет roadmapId → 400', () => {
  assert.throws(() => parseShift({ roadmapId: 'x', fromDate: '2026-11-01', days: 1 }), /^Error: 400/);
});

test('неверный формат или несуществующая дата → 400', () => {
  assert.throws(() => parseShift({ roadmapId: 1, fromDate: '01.11.2026', days: 1 }), /400/);
  assert.throws(() => parseShift({ roadmapId: 1, fromDate: '2026-13-45', days: 1 }), /400/);
});

test('0 дней, дробное число и слишком большой срок → 400', () => {
  for (const days of [0, 1.5, 'abc', 3651, -3651])
    assert.throws(() => parseShift({ roadmapId: 1, fromDate: '2026-11-01', days }), /400/);
});

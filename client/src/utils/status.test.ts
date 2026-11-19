// Система: статусы задач и фильтры RoadMap
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, TASK_STATUSES, filtersActive, matchesFilters, statusById, textOn } from './status';
import type { Task } from '../types';

const task = (over: Partial<Task> = {}) =>
  ({ id: 1, status_id: 2, tags: [{ id: 7 }], start_date: '2026-11-10T00:00:00Z', end_date: '2026-11-20T00:00:00Z', ...over }) as unknown as Task;

describe('статусы', () => {
  it('цвета статусов совпадают с утверждённой палитрой', () => {
    const colors = Object.fromEntries(TASK_STATUSES.map((s) => [s.code, s.color]));
    expect(colors).toEqual({
      DONE: '#2f9e5b', IN_PROGRESS: '#d9a21b', PLANNED: '#4a8fd6',
      OVERDUE: '#e0483e', FROZEN: '#7fb7c9', INACTIVE: '#8a8a8a',
    });
  });

  it('statusById: неизвестный id → «В плане»', () => {
    expect(statusById(1).code).toBe('DONE');
    expect(statusById(999).code).toBe('PLANNED');
  });
});

describe('textOn', () => {
  it('на тёмном фоне — белый текст, на светлом — тёмный', () => {
    expect(textOn('#000000')).toBe('#fff');
    expect(textOn('#ffffff')).toBe('#141414');
  });
  it('некорректный цвет → белый', () => {
    expect(textOn('red')).toBe('#fff');
  });
});

describe('фильтры', () => {
  it('filtersActive: пустые фильтры неактивны', () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
    expect(filtersActive({ ...EMPTY_FILTERS, from: '2026-11-01' })).toBe(true);
    expect(filtersActive({ ...EMPTY_FILTERS, tagIds: [1] })).toBe(true);
  });

  it('по статусу', () => {
    expect(matchesFilters(task(), { ...EMPTY_FILTERS, statusIds: [2] })).toBe(true);
    expect(matchesFilters(task(), { ...EMPTY_FILTERS, statusIds: [1] })).toBe(false);
  });

  it('по тегу — «любой из»', () => {
    expect(matchesFilters(task(), { ...EMPTY_FILTERS, tagIds: [3, 7] })).toBe(true);
    expect(matchesFilters(task(), { ...EMPTY_FILTERS, tagIds: [3] })).toBe(false);
  });

  it('по датам — пересечение периодов', () => {
    expect(matchesFilters(task(), { ...EMPTY_FILTERS, from: '2026-11-15', to: '2026-12-01' })).toBe(true);
    expect(matchesFilters(task(), { ...EMPTY_FILTERS, from: '2026-11-25' })).toBe(false);
    expect(matchesFilters(task(), { ...EMPTY_FILTERS, to: '2026-11-05' })).toBe(false);
  });
});

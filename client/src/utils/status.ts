import type { Task, TaskStatus } from '../types';

/**
 * Справочник статусов задач. id и коды совпадают с таблицей task_status
 * (миграция 003), поэтому клиенту не нужен отдельный запрос за названиями.
 * Актуальный список с сервера тоже доступен: api.tasks.statuses().
 */
export const TASK_STATUSES: (TaskStatus & { color: string })[] = [
  { id: 1, code: 'DONE', name: 'Выполнено', color: '#2f9e5b' },
  { id: 2, code: 'IN_PROGRESS', name: 'В процессе', color: '#d9a21b' },
  { id: 3, code: 'PLANNED', name: 'В плане', color: '#4a8fd6' },
  { id: 4, code: 'OVERDUE', name: 'Просрочено', color: '#e0483e' },
  { id: 5, code: 'FROZEN', name: 'Заморожено', color: '#7fb7c9' },
  { id: 6, code: 'INACTIVE', name: 'Неактивно', color: '#8a8a8a' },
];

export const statusById = (id: number) => TASK_STATUSES.find((s) => s.id === id) ?? TASK_STATUSES[2];

export interface TaskFilters {
  tagIds: number[];
  statusIds: number[];
  /** 'YYYY-MM-DD' или '' */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: TaskFilters = { tagIds: [], statusIds: [], from: '', to: '' };

export const filtersActive = (f: TaskFilters) =>
  f.tagIds.length > 0 || f.statusIds.length > 0 || !!f.from || !!f.to;

/** Те же правила, что у GET /api/tasks/projects/:id/search (теги — «любой из», даты — пересечение) */
export function matchesFilters(task: Task, f: TaskFilters): boolean {
  if (f.statusIds.length > 0 && !f.statusIds.includes(task.status_id)) return false;
  if (f.tagIds.length > 0 && !task.tags.some((t) => f.tagIds.includes(t.id))) return false;
  if (f.from && task.end_date && task.end_date.slice(0, 10) < f.from) return false;
  if (f.to && task.start_date && task.start_date.slice(0, 10) > f.to) return false;
  return true;
}

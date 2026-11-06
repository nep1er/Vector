import type { ExtPermission } from '../types';

/** Человеческие названия прав расширений (показываются перед выдачей) */
export const PERMISSION_INFO: Record<ExtPermission, { label: string; hint: string; risk: 'low' | 'mid' | 'high' }> = {
  'tasks:read': { label: 'Читать задачи', hint: 'Названия, даты, статусы, теги этапов и ToDo — только те, что видит запустивший пользователь', risk: 'low' },
  'tasks:write': { label: 'Менять задачи', hint: 'Сдвигать сроки и менять статусы — в рамках прав самого пользователя', risk: 'high' },
  'kanban:read': { label: 'Читать доски Kanban', hint: 'Колонки и карточки, их исполнители и теги', risk: 'low' },
  'kanban:write': { label: 'Двигать карточки', hint: 'Переносить карточки между колонками', risk: 'high' },
  'members:read': { label: 'Видеть участников', hint: 'Имена, аватарки и роли участников проекта', risk: 'mid' },
  'storage:read': { label: 'Видеть хранилища', hint: 'Названия разделов и файлов (без скачивания содержимого)', risk: 'mid' },
  'data:read': { label: 'Читать свои данные', hint: 'Читать то, что расширение само сохранило в этом проекте (основные таблицы проекта недоступны)', risk: 'low' },
  'data:write': { label: 'Хранить свои данные', hint: 'Сохранять собственные данные расширения в проекте; запись доступна только руководителям', risk: 'mid' },
  'guard:task-status': { label: 'Запрещать смену статусов', hint: 'Правила расширения могут не давать начать или завершить задачу/карточку (например, пока не выполнена предшествующая)', risk: 'high' },
  'ui:view': { label: 'Свои страницы в проекте', hint: 'Отдельные экраны расширения внутри проекта', risk: 'low' },
  'ui:task-panel': { label: 'Панель в карточке задачи', hint: 'Встроенный блок в окне задачи', risk: 'low' },
};

export const RISK_LABEL = { low: 'безопасно', mid: 'личные данные', high: 'изменяет данные' } as const;

export const ACTION_LABEL: Record<string, string> = {
  VERSION_APPROVE: 'Версия одобрена',
  VERSION_REJECT: 'Версия отклонена',
  EXTENSION_REMOVE: 'Расширение удалено',
  EXTENSION_RESTORE: 'Расширение восстановлено',
  AUTHOR_BAN: 'Автор забанен',
  AUTHOR_UNBAN: 'Бан снят',
  REPORT_RESOLVE: 'Жалоба закрыта',
  MODERATOR_ADD: 'Назначен модератор',
  MODERATOR_REMOVE: 'Модератор снят',
};

export const STATUS_LABEL = { PENDING: 'На проверке', APPROVED: 'Одобрена', REJECTED: 'Отклонена' } as const;
export const UNUSABLE_LABEL = {
  REMOVED: 'Удалено модератором',
  BANNED: 'Автор заблокирован',
  NOT_APPROVED: 'Нет одобренной версии',
} as const;

export const fmtSize = (n: number) => (n < 1024 ? `${n} Б` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`);

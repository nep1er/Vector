// Все даты задач считаем в UTC: так день не «съезжает» из-за часовых поясов.
export const DAY = 86_400_000;

/** Номер дня (количество суток с 1970 года) для ISO-даты с сервера */
export const dayIndex = (iso: string | Date): number => Math.floor(new Date(iso).getTime() / DAY);

/** Сегодняшний день по календарю пользователя */
export const todayIndex = (): number => {
  const n = new Date();
  return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY);
};

/** 'YYYY-MM-DD' для <input type="date"> */
export const dayToInput = (idx: number): string => new Date(idx * DAY).toISOString().slice(0, 10);
export const isoToInput = (iso: string): string => new Date(iso).toISOString().slice(0, 10);
export const inputToDay = (value: string): number => Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY);

/** Начало и конец выбранного дня в формате, который ждёт сервер */
export const startIso = (input: string) => `${input}T00:00:00.000Z`;
export const endIso = (input: string) => `${input}T23:59:59.000Z`;

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const formatDay = (idx: number) => dayFmt.format(new Date(idx * DAY));
export const dayOfMonth = (idx: number) => new Date(idx * DAY).getUTCDate();
export const monthLabel = (idx: number) => {
  const s = monthFmt.format(new Date(idx * DAY));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
/** Первый день следующего месяца */
export const nextMonthStart = (idx: number) => {
  const d = new Date(idx * DAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY;
};

/** «29.10» — день и месяц для подписей шкалы в крупном масштабе */
export const dayMonth = (idx: number) => {
  const d = new Date(idx * DAY);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Система: даты RoadMap (всё считается в UTC)
import { describe, expect, it } from 'vitest';
import { DAY, dayIndex, dayMonth, dayToInput, endIso, inputToDay, isoToInput, monthLabel, nextMonthStart, startIso } from './dates';

describe('даты', () => {
  it('inputToDay и dayToInput — обратные операции', () => {
    const idx = inputToDay('2026-11-19');
    expect(dayToInput(idx)).toBe('2026-11-19');
    expect(dayIndex('2026-11-19T15:30:00Z')).toBe(idx);
  });

  it('isoToInput отбрасывает время', () => {
    expect(isoToInput('2026-02-03T23:59:59.000Z')).toBe('2026-02-03');
  });

  it('startIso / endIso — границы дня для сервера', () => {
    expect(startIso('2026-11-19')).toBe('2026-11-19T00:00:00.000Z');
    expect(endIso('2026-11-19')).toBe('2026-11-19T23:59:59.000Z');
  });

  it('nextMonthStart переходит через границу года', () => {
    expect(dayToInput(nextMonthStart(inputToDay('2026-12-15')))).toBe('2027-01-01');
  });

  it('dayMonth даёт «дд.мм»', () => {
    expect(dayMonth(inputToDay('2026-03-05'))).toBe('05.03');
  });

  it('monthLabel начинается с заглавной буквы', () => {
    const label = monthLabel(inputToDay('2026-11-19'));
    expect(label[0]).toBe(label[0].toUpperCase());
    expect(label).toContain('2026');
  });

  it('DAY — сутки в миллисекундах', () => {
    expect(DAY).toBe(24 * 60 * 60 * 1000);
  });
});

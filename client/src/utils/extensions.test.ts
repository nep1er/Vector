// Система: расширения — справочник прав и подписи
import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, PERMISSION_INFO, RISK_LABEL, fmtSize } from './extensions';

describe('права расширений', () => {
  it('у каждого права есть название, описание и уровень риска', () => {
    for (const [perm, info] of Object.entries(PERMISSION_INFO)) {
      expect(info.label, perm).not.toBe('');
      expect(info.hint, perm).not.toBe('');
      expect(Object.keys(RISK_LABEL)).toContain(info.risk);
    }
  });

  it('изменяющие данные права помечены как «high»', () => {
    for (const p of ['tasks:write', 'kanban:write', 'guard:task-status'] as const)
      expect(PERMISSION_INFO[p].risk).toBe('high');
  });

  it('все действия модерации имеют русскую подпись', () => {
    expect(ACTION_LABEL.VERSION_APPROVE).toBe('Версия одобрена');
    expect(Object.values(ACTION_LABEL).every(Boolean)).toBe(true);
  });
});

describe('fmtSize', () => {
  it('выбирает единицу по размеру', () => {
    expect(fmtSize(10)).toBe('10 Б');
    expect(fmtSize(2048)).toBe('2.0 КБ');
    expect(fmtSize(3 * 1024 * 1024)).toBe('3.0 МБ');
  });
});

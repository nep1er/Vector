// Система: хранилище файлов — подписи размеров и лимит загрузки
import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_MB, formatSize, tooBig } from './format';

describe('formatSize', () => {
  it('пустое значение → пустая строка', () => {
    expect(formatSize(null)).toBe('');
    expect(formatSize(undefined)).toBe('');
  });
  it('байты, КБ, МБ, ГБ', () => {
    expect(formatSize(512)).toBe('512 Б');
    expect(formatSize(1536)).toBe('1,5 КБ');
    expect(formatSize(5 * 1024 * 1024)).toBe('5,0 МБ');
    expect(formatSize(3 * 1024 ** 3)).toBe('3,0 ГБ');
  });
});

describe('tooBig', () => {
  it('сравнивает размер файла с лимитом', () => {
    expect(tooBig({ size: MAX_UPLOAD_MB * 1024 * 1024 } as File)).toBe(false);
    expect(tooBig({ size: MAX_UPLOAD_MB * 1024 * 1024 + 1 } as File)).toBe(true);
  });
});

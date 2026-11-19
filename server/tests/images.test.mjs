// Система: загрузка картинок (utils/images.js) — проверка по сигнатуре, а не по Content-Type
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_SIGNATURES, IMAGE_EXT } from '../utils/images.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(2)]);

test('настоящие PNG / JPEG / WEBP проходят проверку', () => {
  assert.ok(IMAGE_SIGNATURES['image/png'](png));
  assert.ok(IMAGE_SIGNATURES['image/jpeg'](jpg));
  assert.ok(IMAGE_SIGNATURES['image/webp'](webp));
});

test('текст под видом картинки отклоняется', () => {
  const fake = Buffer.from('<script>alert(1)</script>');
  for (const check of Object.values(IMAGE_SIGNATURES)) assert.equal(check(fake), false);
});

test('у каждого типа есть расширение', () => {
  assert.deepEqual(Object.keys(IMAGE_EXT).sort(), Object.keys(IMAGE_SIGNATURES).sort());
});

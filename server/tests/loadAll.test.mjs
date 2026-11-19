// Дымовой тест: каждый модуль сервера должен загружаться без ошибок.
// Заодно все файлы попадают в отчёт покрытия — процент считается от ВСЕГО кода, а не только от протестированного.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockServerModule } from './helpers/http.mjs';

mockServerModule('config/db.js', { pool: { query: async () => ({ rows: [] }), connect: async () => ({}) } });

const root = new URL('../', import.meta.url);
const list = (dir) =>
  fs.readdirSync(fileURLToPath(new URL(dir, root))).filter((f) => f.endsWith('.js')).sort();

for (const dir of ['utils/', 'db/', 'middleware/']) {
  for (const file of list(dir)) {
    test(`${dir}${file} загружается`, async () => {
      assert.ok(await import(new URL(`${dir}${file}`, root).href));
    });
  }
}

// Маршруты требуют express/bcrypt/jsonwebtoken — если зависимости не установлены, тест пропускается
const hasDeps = await Promise.all(['express', 'bcrypt', 'jsonwebtoken'].map((m) => import(m).then(() => true, () => false)))
  .then((r) => r.every(Boolean));

for (const file of list('routes/')) {
  test(`routes/${file} загружается`, { skip: !hasDeps && 'не установлены зависимости сервера' }, async () => {
    const mod = await import(new URL(`routes/${file}`, root).href);
    assert.ok(mod.default, 'маршрутизатор должен экспортироваться по умолчанию');
  });
}

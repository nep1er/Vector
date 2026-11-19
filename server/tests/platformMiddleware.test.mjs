// Система: глобальные роли платформы (middleware/platformMiddleware.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockServerModule, run } from './helpers/http.mjs';

let role = 'USER';
let fail = false;
mockServerModule('db/PlatformRepository.js', {
  PlatformRepository: { getRole: async () => { if (fail) throw new Error('db'); return role; } },
});
const { requirePlatformRole } = await import('../middleware/platformMiddleware.js');
const req = () => ({ user: { id: 1 } });

test('обычный пользователь не проходит ни проверку MODERATOR, ни ADMIN', async () => {
  role = 'USER';
  assert.equal((await run(requirePlatformRole('MODERATOR'), req())).res.statusCode, 403);
  assert.equal((await run(requirePlatformRole('ADMIN'), req())).res.statusCode, 403);
});

test('MODERATOR проходит проверку MODERATOR, но не ADMIN', async () => {
  role = 'MODERATOR';
  assert.equal((await run(requirePlatformRole('MODERATOR'), req())).nextCalled, true);
  assert.equal((await run(requirePlatformRole('ADMIN'), req())).res.statusCode, 403);
});

test('ADMIN проходит всё и записывается в req.platformRole', async () => {
  role = 'ADMIN';
  const r = req();
  assert.equal((await run(requirePlatformRole('ADMIN'), r)).nextCalled, true);
  assert.equal(r.platformRole, 'ADMIN');
});

test('сбой БД → 500', async () => {
  fail = true;
  const orig = console.error; console.error = () => {};
  try {
    assert.equal((await run(requirePlatformRole('ADMIN'), req())).res.statusCode, 500);
  } finally { console.error = orig; fail = false; }
});

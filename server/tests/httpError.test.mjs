// Система: обработка ошибок API (utils/httpError.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sendError } from '../utils/httpError.js';
import { fakeRes } from './helpers/http.mjs';

const silent = (fn) => {
  const orig = console.error;
  console.error = () => {};
  try { return fn(); } finally { console.error = orig; }
};

test('Error("409: текст") превращается в HTTP 409 с этим текстом', () => {
  const res = fakeRes();
  sendError(res, new Error('409: Уже есть'));
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { message: 'Уже есть' });
});

test('нарушение уникальности email → 409 с понятным сообщением', () => {
  const res = fakeRes();
  sendError(res, { code: '23505', constraint: 'users_email_key' });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /email/);
});

test('неизвестное ограничение уникальности → общее сообщение', () => {
  const res = fakeRes();
  sendError(res, { code: '23505', constraint: 'something_else' });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, 'Такая запись уже существует');
});

for (const code of ['23503', '23514', '23502', '22P02', '22007', '22008']) {
  test(`код PostgreSQL ${code} → 400`, () => {
    const res = fakeRes();
    sendError(res, { code });
    assert.equal(res.statusCode, 400);
  });
}

test('неизвестная ошибка → 500 и своё сообщение', () => {
  const res = fakeRes();
  silent(() => sendError(res, new Error('boom'), 'Не удалось'));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, 'Не удалось');
});

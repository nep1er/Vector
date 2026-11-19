// Система: авторизация по JWT (middleware/authMiddleware.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authMiddleware, generateToken } from '../middleware/authMiddleware.js';
import { run } from './helpers/http.mjs';

const quiet = async (fn) => {
  const orig = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = orig; }
};

test('OPTIONS (CORS preflight) пропускается без токена', async () => {
  const { nextCalled } = await run(authMiddleware, { method: 'OPTIONS', headers: {} });
  assert.equal(nextCalled, true);
});

test('без заголовка Authorization → 401', async () => {
  const { res, nextCalled } = await run(authMiddleware, { method: 'GET', headers: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('заголовок без токена → 401', async () => {
  const { res } = await run(authMiddleware, { method: 'GET', headers: { authorization: 'Bearer' } });
  assert.equal(res.statusCode, 401);
});

test('мусорный токен → 401', async () => {
  const { res, nextCalled } = await quiet(() =>
    run(authMiddleware, { method: 'GET', headers: { authorization: 'Bearer abc.def.ghi' } }));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('токен, подписанный чужим ключом → 401', async () => {
  const bad = jwt.sign({ id: 1 }, 'other-secret');
  const { res } = await quiet(() =>
    run(authMiddleware, { method: 'GET', headers: { authorization: `Bearer ${bad}` } }));
  assert.equal(res.statusCode, 401);
});

test('просроченный токен → 401', async () => {
  const secret = process.env.JWT_SECRET || 'fallback_secret_key';
  const old = jwt.sign({ id: 1 }, secret, { expiresIn: -10 });
  const { res } = await quiet(() =>
    run(authMiddleware, { method: 'GET', headers: { authorization: `Bearer ${old}` } }));
  assert.equal(res.statusCode, 401);
});

test('верный токен: req.user заполнен, next() вызван', async () => {
  const token = generateToken(42, 'a@b.c');
  const req = { method: 'GET', headers: { authorization: `Bearer ${token}` } };
  const { nextCalled } = await run(authMiddleware, req);
  assert.equal(nextCalled, true);
  assert.equal(req.user.id, 42);
  assert.equal(req.user.email, 'a@b.c');
});

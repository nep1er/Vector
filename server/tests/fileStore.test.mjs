// Система: файловое хранилище проектов (utils/fileStore.js)
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vector-store-'));
process.env.STORAGE_DIR = dir;
const store = await import('../utils/fileStore.js');
after(() => fs.rm(dir, { recursive: true, force: true }));

test('readUploadName: убирает путь и управляющие символы', () => {
  const req = { headers: { 'x-file-name': encodeURIComponent('..\\..\\evil/план\u0001.txt') } };
  assert.equal(store.readUploadName(req), 'план.txt');
});

test('readUploadName: пустое имя → file', () => {
  assert.equal(store.readUploadName({ headers: {} }), 'file');
});

test('saveFile / fileSize / removeFile: полный цикл', async () => {
  const key = await store.saveFile('p1', 'Doc.PDF', Buffer.from('hello'));
  assert.match(key, /^p1\/[0-9a-f-]{36}\.pdf$/);
  assert.equal(await store.fileSize(key), 5);
  await store.removeFile(key);
  assert.equal(await store.fileSize(key), null);
});

test('resolveKey: выход за пределы хранилища запрещён', () => {
  assert.throws(() => store.resolveKey('../secret.txt'), /400/);
});

test('requireBody: пустое тело → 400', () => {
  assert.throws(() => store.requireBody({ body: Buffer.alloc(0) }), /400/);
  assert.throws(() => store.requireBody({ body: 'text' }), /400/);
  assert.equal(store.requireBody({ body: Buffer.from('x') }).length, 1);
});

test('removeProjectDir удаляет папку проекта', async () => {
  const key = await store.saveFile('p7', 'a.txt', Buffer.from('1'));
  await store.removeProjectDir(7);
  assert.equal(await store.fileSize(key), null);
});

// Общие помощники тестов: поддельные req/res и подмена модулей (без БД и без сети).
import { mock } from 'node:test';

/** Поддельный Express-ответ: запоминает код и тело */
export function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; return res; },
  };
  return res;
}

/** Запускает middleware и сообщает, вызван ли next() */
export async function run(mw, req) {
  const res = fakeRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

/** Подменяет модуль проекта (путь — относительно server/) именованными экспортами */
export function mockServerModule(relPath, namedExports) {
  return mock.module(new URL(`../../${relPath}`, import.meta.url).href, { namedExports });
}

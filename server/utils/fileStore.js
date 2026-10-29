import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Папка с загруженными файлами проектов (вложения карточек и «Хранилище»).
 * Она НЕ раздаётся статикой: скачать файл можно только через API с проверкой прав.
 * Путь можно переопределить переменной окружения STORAGE_DIR.
 */
export const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage'));

export const MAX_UPLOAD_MB = 25;

/** Имя файла из заголовка X-File-Name (URL-encoded): без путей и управляющих символов */
export function readUploadName(req) {
  let raw = String(req.headers['x-file-name'] ?? '');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* оставляем как есть */
  }
  const name = path.basename(raw.replace(/\\/g, '/')).replace(/[\u0000-\u001f]/g, '').trim();
  return name.slice(0, 200) || 'file';
}

/** Сохраняет буфер и возвращает ключ вида `<подпапка>/<uuid>.<расширение>` */
export async function saveFile(subdir, originalName, buffer) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 11);
  const key = `${subdir}/${randomUUID()}${ext}`;
  const abs = resolveKey(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return key;
}

/** Абсолютный путь по ключу; ключ не может выйти за пределы STORAGE_ROOT */
export function resolveKey(key) {
  const abs = path.resolve(STORAGE_ROOT, key);
  if (!abs.startsWith(STORAGE_ROOT + path.sep)) throw new Error('400: Некорректный путь к файлу');
  return abs;
}

export async function removeFile(key) {
  if (!key) return;
  try {
    await fs.unlink(resolveKey(key));
  } catch {
    /* файла уже нет — не страшно */
  }
}

export async function fileSize(key) {
  try {
    return (await fs.stat(resolveKey(key))).size;
  } catch {
    return null;
  }
}

/** Проверяет тело запроса, пришедшее из express.raw */
export function requireBody(req) {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) throw new Error('400: Файл не передан или пуст');
  return body;
}

/** Удаляет все файлы проекта (при удалении проекта) */
export async function removeProjectDir(projectId) {
  try {
    await fs.rm(resolveKey(`p${Number(projectId)}`), { recursive: true, force: true });
  } catch {
    /* ничего страшного */
  }
}

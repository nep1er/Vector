import fs from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_ROOT } from './fileStore.js';
import { FILE_TYPES, extOf } from './extensionPackage.js';

/** Файлы расширений лежат вне веб-корня: отдаются только маршрутом /ext/... с проверкой статуса и жёсткой CSP */
export const EXT_ROOT = path.join(STORAGE_ROOT, 'extensions');

const versionDir = (versionId) => path.join(EXT_ROOT, String(Number(versionId)));

export async function saveVersionFiles(versionId, contents) {
  const dir = versionDir(versionId);
  await fs.mkdir(dir, { recursive: true });
  for (const [rel, buf] of contents) {
    const abs = path.resolve(dir, rel);
    if (!abs.startsWith(dir + path.sep)) throw new Error('400: Недопустимый путь в пакете');
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf, { flag: 'wx' });
  }
}

export async function removeVersionFiles(versionId) {
  await fs.rm(versionDir(versionId), { recursive: true, force: true }).catch(() => {});
}

/** Абсолютный путь файла версии или null, если путь недопустим / тип не разрешён */
export function resolveVersionFile(versionId, rel) {
  const clean = String(rel ?? '');
  if (!clean || clean.includes('\0') || clean.includes('\\') || clean.split('/').some((p) => p === '' || p.startsWith('.'))) return null;
  if (!FILE_TYPES[extOf(clean)]) return null;
  const dir = versionDir(versionId);
  const abs = path.resolve(dir, clean);
  return abs.startsWith(dir + path.sep) ? abs : null;
}

export async function readVersionText(versionId, rel, maxBytes = 200 * 1024) {
  const abs = resolveVersionFile(versionId, rel);
  if (!abs) throw new Error('400: Недопустимый путь');
  const st = await fs.stat(abs).catch(() => null);
  if (!st || !st.isFile()) throw new Error('404: Файл не найден');
  if (st.size > maxBytes) throw new Error('400: Файл слишком большой для просмотра');
  return fs.readFile(abs, 'utf8');
}

/** Рекурсивный список файлов версии: [{path, size}] */
export async function listVersionFiles(versionId) {
  const root = versionDir(versionId);
  const out = [];
  async function walk(dir, prefix) {
    for (const ent of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(path.join(dir, ent.name), rel);
      else if (ent.isFile()) out.push({ path: rel, size: (await fs.stat(path.join(dir, ent.name))).size });
    }
  }
  await walk(root, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

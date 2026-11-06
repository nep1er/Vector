import { createHash } from 'node:crypto';
import path from 'node:path';
import yauzl from 'yauzl';

/** Права, которые расширение может запросить. Администратор проекта подтверждает их при установке. */
export const PERMISSIONS = {
  'tasks:read': 'Читать дерево задач проекта (названия, даты, статусы, теги)',
  'tasks:write': 'Менять даты и статусы задач',
  'kanban:read': 'Читать Канбан-доски ToDo (колонки, карточки)',
  'kanban:write': 'Перемещать карточки между колонками',
  'members:read': 'Видеть участников проекта и их роли',
  'storage:read': 'Видеть список файлов и ссылок хранилища проекта',
  'ui:view': 'Добавлять свою страницу (вкладку) в проект',
  'ui:task-panel': 'Добавлять свой блок в панель задачи',
};

export const LIMITS = {
  maxZipBytes: 10 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
  maxFiles: 300,
  maxDepth: 6,
  maxNameLength: 200,
  maxManifestBytes: 64 * 1024,
  maxRatio: 100,
};

/** Разрешённые типы файлов -> Content-Type при раздаче */
export const FILE_TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
};
const TEXT_TYPES = new Set(['html', 'js', 'mjs', 'css', 'json', 'txt', 'md', 'svg']);

const SIGNATURES = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG',
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.length > 6 && b.toString('ascii', 0, 3) === 'GIF',
  webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  woff: (b) => b.length > 4 && b.toString('ascii', 0, 4) === 'wOFF',
  woff2: (b) => b.length > 4 && b.toString('ascii', 0, 4) === 'wOF2',
};

const SLUG = /^[a-z][a-z0-9-]{2,47}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SUB_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const NAME_CHARS = /^[A-Za-z0-9._\-/]+$/;

export const extOf = (name) => path.posix.extname(name).slice(1).toLowerCase();

export function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

const yauzlOpen = (buffer) =>
  new Promise((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (err, zip) =>
      err ? reject(err) : resolve(zip)
    )
  );

/**
 * Безопасно читает zip в память. Ошибки пакета возвращаются списком, а не бросаются:
 * zip-slip, символические ссылки, шифрование, «бомбы», лишние типы файлов, чужие подпапки и т.д.
 */
export async function readZip(buffer) {
  const errors = [];
  const files = new Map();
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { files, errors: ['Пустой файл'] };
  if (buffer.length > LIMITS.maxZipBytes) return { files, errors: [`Архив больше ${LIMITS.maxZipBytes / 1024 / 1024} МБ`] };
  if (buffer.readUInt32LE(0) !== 0x04034b50) return { files, errors: ['Это не zip-архив'] };

  let zip;
  try {
    zip = await yauzlOpen(buffer);
  } catch (e) {
    return { files, errors: [`Архив повреждён или имеет недопустимую структуру: ${e.message}`] };
  }
  if (zip.entryCount > LIMITS.maxFiles + 100) {
    zip.close();
    return { files, errors: [`Слишком много записей в архиве (больше ${LIMITS.maxFiles} файлов)`] };
  }

  const seen = new Set();
  let total = 0;
  await new Promise((resolve) => {
    const fail = (msg) => {
      errors.push(msg);
      zip.close();
      resolve();
    };
    zip.on('error', (e) => fail(`Ошибка чтения архива: ${e.message}`));
    zip.on('end', resolve);
    zip.on('entry', (entry) => {
      const name = entry.fileName;
      if (name.endsWith('/')) return zip.readEntry(); // папка
      if (name.startsWith('__MACOSX/') || name.endsWith('.DS_Store') || name.endsWith('Thumbs.db')) return zip.readEntry();

      if (files.size >= LIMITS.maxFiles) return fail(`Больше ${LIMITS.maxFiles} файлов в архиве`);
      if (name.length > LIMITS.maxNameLength || !NAME_CHARS.test(name)) {
        errors.push(`Недопустимое имя файла «${name.slice(0, 80)}»: только латиница, цифры, . _ - и /`);
        return zip.readEntry();
      }
      const parts = name.split('/');
      if (parts.length > LIMITS.maxDepth || parts.some((p) => p === '' || p.startsWith('.'))) {
        errors.push(`Недопустимый путь «${name}»: скрытые файлы и слишком глубокие папки запрещены`);
        return zip.readEntry();
      }
      if (seen.has(name.toLowerCase())) {
        errors.push(`Повторяющееся имя файла «${name}»`);
        return zip.readEntry();
      }
      seen.add(name.toLowerCase());

      const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
      if ((mode & 0o170000) === 0o120000) {
        errors.push(`Символические ссылки запрещены («${name}»)`);
        return zip.readEntry();
      }
      if (entry.isEncrypted()) {
        errors.push(`Зашифрованные файлы запрещены («${name}»)`);
        return zip.readEntry();
      }
      const type = extOf(name);
      if (!FILE_TYPES[type]) {
        errors.push(`Тип файла «${name}» не разрешён (разрешены: ${Object.keys(FILE_TYPES).join(', ')})`);
        return zip.readEntry();
      }
      if (entry.uncompressedSize > LIMITS.maxFileBytes) {
        errors.push(`Файл «${name}» больше ${LIMITS.maxFileBytes / 1024 / 1024} МБ`);
        return zip.readEntry();
      }
      if (entry.compressedSize > 0 && entry.uncompressedSize > 1024 * 1024 && entry.uncompressedSize / entry.compressedSize > LIMITS.maxRatio) {
        errors.push(`Подозрительная степень сжатия файла «${name}» (похоже на zip-бомбу)`);
        return zip.readEntry();
      }
      total += entry.uncompressedSize;
      if (total > LIMITS.maxTotalBytes) return fail(`Распакованный размер больше ${LIMITS.maxTotalBytes / 1024 / 1024} МБ`);

      zip.openReadStream(entry, (err, stream) => {
        if (err) return fail(`Не удалось прочитать «${name}»: ${err.message}`);
        const chunks = [];
        let got = 0;
        stream.on('data', (c) => {
          got += c.length;
          if (got > LIMITS.maxFileBytes) {
            stream.destroy();
            fail(`Файл «${name}» при распаковке превышает лимит`);
          } else chunks.push(c);
        });
        stream.on('error', (e) => fail(`Ошибка распаковки «${name}»: ${e.message}`));
        stream.on('end', () => {
          files.set(name, Buffer.concat(chunks));
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
  return { files, errors };
}

const EXTERNAL = /(?:https?:)?\/\/[a-z0-9.-]+/i;
const JS_WARN = [
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\b/, 'new Function()'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bimportScripts\b|\bnew\s+(?:Shared)?Worker\b/, 'Worker / importScripts'],
  [/\bdocument\.cookie\b/, 'document.cookie'],
  [/\b(?:window\.)?(?:top|parent)\.location\b|\bwindow\.open\b/, 'переход/открытие окон'],
  [/\batob\s*\(/, 'atob() (возможна обфускация)'],
];

function strictUtf8(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/** Полная проверка пакета: структура, манифест, содержимое. */
export async function analyzePackage(buffer) {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const { files, errors } = await readZip(buffer);
  const warnings = [];
  const result = {
    ok: false,
    errors,
    warnings,
    manifest: null,
    sha256,
    size: buffer.length,
    files: [...files.entries()].map(([p, b]) => ({ path: p, size: b.length })),
    contents: files,
  };
  if (errors.length && files.size === 0) return result;

  // --- содержимое файлов
  const texts = new Map();
  for (const [name, buf] of files) {
    const type = extOf(name);
    if (SIGNATURES[type] && !SIGNATURES[type](buf)) errors.push(`Содержимое «${name}» не соответствует типу .${type}`);
    if (TEXT_TYPES.has(type)) {
      const text = strictUtf8(buf);
      if (text === null || text.includes('\u0000')) {
        errors.push(`«${name}» должен быть текстом в кодировке UTF-8`);
        continue;
      }
      texts.set(name, text);
    }
  }
  for (const [name, text] of texts) {
    const type = extOf(name);
    if (type === 'json') {
      try {
        JSON.parse(text);
      } catch {
        errors.push(`«${name}»: некорректный JSON`);
      }
    } else if (type === 'html') {
      for (const m of text.matchAll(/<script\b([^>]*)>/gi)) {
        const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(m[1]);
        if (!src) errors.push(`«${name}»: встроенные скрипты запрещены — вынесите код в .js файл (<script src="app.js">)`);
        else if (EXTERNAL.test(src[1])) errors.push(`«${name}»: внешний скрипт «${src[1]}» запрещён — положите файл в пакет`);
      }
      if (/<(iframe|frame|object|embed|form|base)\b/i.test(text)) errors.push(`«${name}»: теги iframe, object, embed, form и base запрещены`);
      if (/<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(text)) errors.push(`«${name}»: автоматический переход (meta refresh) запрещён`);
      if (/\son[a-z]+\s*=/i.test(text)) errors.push(`«${name}»: атрибуты-обработчики событий (onclick и т.п.) запрещены — используйте addEventListener в .js файле`);
      if (/javascript\s*:/i.test(text)) errors.push(`«${name}»: ссылки javascript: запрещены`);
      for (const m of text.matchAll(/\b(?:src|href|action|poster|data)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi)) {
        errors.push(`«${name}»: внешний ресурс «${m[1].slice(0, 80)}» запрещён`);
      }
    } else if (type === 'css') {
      if (/@import|url\(\s*["']?\s*(?:https?:)?\/\//i.test(text)) errors.push(`«${name}»: внешние ресурсы в CSS запрещены`);
    } else if (type === 'svg') {
      if (/<script|<foreignObject|\son[a-z]+\s*=|javascript\s*:|<iframe|<use[^>]+href\s*=\s*["']?(?:https?:)?\/\//i.test(text)) {
        errors.push(`«${name}»: SVG содержит запрещённые элементы (скрипты, foreignObject, обработчики, внешние ссылки)`);
      }
    } else if (type === 'js' || type === 'mjs') {
      const hits = JS_WARN.filter(([re]) => re.test(text)).map(([, label]) => label);
      if (hits.length) warnings.push(`«${name}»: ${hits.join(', ')} — проверьте вручную (в песочнице сетевые запросы всё равно заблокированы)`);
      if (/\bimport\s*\(\s*["'`]?\s*(?:https?:)?\/\//.test(text) || /\bfrom\s+["']\s*(?:https?:)?\/\//.test(text)) {
        errors.push(`«${name}»: импорт модулей по внешним ссылкам запрещён`);
      }
    }
  }

  // --- манифест
  if (!files.has('manifest.json')) {
    errors.push('В корне архива нет manifest.json (файлы должны лежать в корне zip, а не внутри папки)');
  } else if (files.get('manifest.json').length > LIMITS.maxManifestBytes) {
    errors.push('manifest.json слишком большой');
  } else {
    let raw = null;
    try {
      raw = JSON.parse(texts.get('manifest.json') ?? '');
    } catch {
      errors.push('manifest.json: некорректный JSON');
    }
    if (raw) {
      const v = validateManifest(raw, files);
      errors.push(...v.errors);
      warnings.push(...v.warnings);
      result.manifest = v.manifest;
    }
  }
  result.ok = errors.length === 0;
  return result;
}

/** Проверка manifest.json. files — Map путь -> Buffer, чтобы убедиться, что точки входа существуют. */
export function validateManifest(m, files) {
  const errors = [];
  const warnings = [];
  const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return { errors: ['manifest.json должен быть объектом'], warnings, manifest: null };

  const known = new Set(['apiVersion', 'id', 'name', 'version', 'description', 'author', 'icon', 'permissions', 'views', 'taskPanels']);
  for (const k of Object.keys(m)) if (!known.has(k)) warnings.push(`manifest.json: неизвестное поле «${k}» будет проигнорировано`);

  if (m.apiVersion !== 1) errors.push('manifest.json: apiVersion должен быть равен 1');
  if (!str(m.id, 48) || !SLUG.test(m.id)) errors.push('manifest.json: id — строчные латинские буквы, цифры и «-», 3–48 символов, начинается с буквы');
  if (!str(m.name, 80)) errors.push('manifest.json: name — строка до 80 символов');
  if (!str(m.version, 32) || !SEMVER.test(m.version)) errors.push('manifest.json: version в формате 1.2.3');
  if (m.description !== undefined && (typeof m.description !== 'string' || m.description.length > 300)) errors.push('manifest.json: description — строка до 300 символов');
  if (m.author !== undefined && (typeof m.author !== 'string' || m.author.length > 80)) errors.push('manifest.json: author — строка до 80 символов');

  if (m.icon !== undefined) {
    if (typeof m.icon !== 'string' || !files.has(m.icon) || !['png', 'svg', 'jpg', 'jpeg', 'webp'].includes(extOf(m.icon))) {
      errors.push('manifest.json: icon должен указывать на png, svg, jpg или webp файл из пакета');
    }
  }

  const permissions = Array.isArray(m.permissions) ? m.permissions : m.permissions === undefined ? [] : null;
  if (permissions === null) errors.push('manifest.json: permissions — массив строк');
  else {
    if (permissions.length > 20) errors.push('manifest.json: слишком много прав');
    for (const p of permissions) if (!(p in PERMISSIONS)) errors.push(`manifest.json: неизвестное право «${String(p).slice(0, 40)}»`);
    if (new Set(permissions).size !== permissions.length) errors.push('manifest.json: права в permissions повторяются');
  }

  const checkList = (key, max, perm) => {
    const list = m[key] === undefined ? [] : m[key];
    if (!Array.isArray(list) || list.length > max) {
      errors.push(`manifest.json: ${key} — массив не длиннее ${max}`);
      return [];
    }
    const ids = new Set();
    const out = [];
    for (const it of list) {
      if (typeof it !== 'object' || it === null || !SUB_ID.test(String(it.id ?? '')) || !str(it.title, 40) || typeof it.entry !== 'string') {
        errors.push(`manifest.json: ${key} — у каждого элемента нужны id (a-z, 0-9, -), title до 40 символов и entry`);
        continue;
      }
      if (ids.has(it.id)) errors.push(`manifest.json: ${key}: повторяется id «${it.id}»`);
      ids.add(it.id);
      if (!files.has(it.entry) || extOf(it.entry) !== 'html') errors.push(`manifest.json: ${key}: entry «${it.entry}» — должен быть .html файл из пакета`);
      const item = { id: it.id, title: it.title.trim(), entry: it.entry };
      if (key === 'taskPanels') {
        const h = it.height === undefined ? 200 : it.height;
        if (!Number.isInteger(h) || h < 80 || h > 600) errors.push('manifest.json: taskPanels.height — целое от 80 до 600');
        else item.height = h;
      }
      out.push(item);
    }
    if (out.length && permissions && !permissions.includes(perm)) errors.push(`manifest.json: для ${key} нужно право «${perm}»`);
    return out;
  };
  const views = checkList('views', 10, 'ui:view');
  const taskPanels = checkList('taskPanels', 3, 'ui:task-panel');
  if (views.length === 0 && taskPanels.length === 0) errors.push('manifest.json: расширение должно добавлять хотя бы одну страницу (views) или блок задачи (taskPanels)');

  const manifest = {
    apiVersion: 1,
    id: m.id,
    name: typeof m.name === 'string' ? m.name.trim() : m.name,
    version: m.version,
    description: typeof m.description === 'string' ? m.description.trim() : '',
    author: typeof m.author === 'string' ? m.author.trim() : '',
    icon: typeof m.icon === 'string' ? m.icon : null,
    permissions: Array.isArray(permissions) ? permissions : [],
    views,
    taskPanels,
  };
  return { errors, warnings, manifest };
}

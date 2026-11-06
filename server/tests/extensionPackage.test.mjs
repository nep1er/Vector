// Запуск: npm test  (node --test). Проверяем, что валидатор пакетов пропускает хороший архив и отклоняет вредоносные.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import { analyzePackage } from '../utils/extensionPackage.js';

/** Минимальный .zip-писатель (в тестах нужен контроль над именами, режимами и сжатием, чего нет у обычных архиваторов) */
function makeZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf8');
    const comp = e.deflate ? zlib.deflateRawSync(raw, { level: 9 }) : raw;
    const crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(e.deflate ? 8 : 0, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(e.deflate ? 8 : 0, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const manifest = (o = {}) => JSON.stringify({
  apiVersion: 1, id: 'demo-ext', name: 'Demo', version: '1.0.0', description: 'd', permissions: ['tasks:read', 'ui:view'],
  views: [{ id: 'main', title: 'Main', entry: 'index.html' }], ...o,
});
const HTML = '<!doctype html><html><body><script src="app.js"></script></body></html>';
const base = () => [
  { name: 'manifest.json', data: manifest() },
  { name: 'index.html', data: HTML },
  { name: 'app.js', data: 'console.log(1)' },
];
const bad = async (name, entries, re) => {
  const r = await analyzePackage(Array.isArray(entries) ? makeZip(entries) : entries);
  assert.equal(r.ok, false, `${name}: пакет должен быть отклонён`);
  if (re) assert.match(r.errors.join('\n'), re, name);
};

test('хороший пакет проходит', async () => {
  const r = await analyzePackage(makeZip(base()));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.manifest.id, 'demo-ext');
  assert.equal(r.sha256.length, 64);
});

test('пример task-timeline проходит без предупреждений', async () => {
  const r = await analyzePackage(fs.readFileSync(new URL('../../extensions/examples/task-timeline.zip', import.meta.url)));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(r.warnings, []);
});

test('zip-slip: ../ в имени', () => bad('slip', [...base(), { name: '../evil.js', data: 'x' }]));
test('абсолютный путь', () => bad('abs', [...base(), { name: '/etc/evil.js', data: 'x' }]));
test('Windows-путь с обратным слэшем', () => bad('backslash', [...base(), { name: 'a\\..\\evil.js', data: 'x' }]));
test('исполняемый файл', () => bad('exe', [...base(), { name: 'run.exe', data: 'MZ' }]));
test('скрытый файл', () => bad('hidden', [...base(), { name: '.env', data: 'SECRET=1' }]));
test('нет manifest.json', () => bad('nomanifest', [{ name: 'index.html', data: HTML }]));
test('вложенная папка вместо корня', () => bad('nested', base().map((e) => ({ ...e, name: `ext/${e.name}` }))));
test('дубликаты имён без учёта регистра', () => bad('dup', [...base(), { name: 'APP.js', data: 'x' }]));
test('символическая ссылка', () => bad('symlink', [...base(), { name: 'link.js', data: '/etc/passwd', mode: 0o120777 }]));
test('не zip', () => bad('notzip', Buffer.from('это не архив')));
test('inline-скрипт в HTML', () => bad('inline', [{ name: 'manifest.json', data: manifest() }, { name: 'index.html', data: '<script>alert(1)</script>' }]));
test('внешний скрипт', () => bad('external', [{ name: 'manifest.json', data: manifest() }, { name: 'index.html', data: '<script src="https://evil.example/x.js"></script>' }]));
test('обработчик on*', () => bad('onerror', [{ name: 'manifest.json', data: manifest() }, { name: 'index.html', data: '<img src="a.png" onerror="alert(1)">' }]));
test('javascript: URL', () => bad('jsurl', [{ name: 'manifest.json', data: manifest() }, { name: 'index.html', data: '<a href="javascript:alert(1)">x</a>' }]));
test('iframe / form / base / meta refresh', async () => {
  for (const frag of ['<iframe src="x.html"></iframe>', '<form action="/x"></form>', '<base href="//evil/">', '<meta http-equiv="refresh" content="0;url=//evil">', '<object data="x"></object>', '<embed src="x">']) {
    await bad(frag, [{ name: 'manifest.json', data: manifest() }, { name: 'index.html', data: `<!doctype html><body>${frag}</body>` }]);
  }
});
test('опасный SVG (script / onload / foreignObject)', async () => {
  for (const svg of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>']) {
    await bad(svg, [...base(), { name: 'i.svg', data: svg }]);
  }
});
test('несуществующее право', () => bad('badperm', [{ name: 'manifest.json', data: manifest({ permissions: ['db:drop'] }) }, ...base().slice(1)]));
test('view без права ui:view', () => bad('noui', [{ name: 'manifest.json', data: manifest({ permissions: ['tasks:read'] }) }, ...base().slice(1)]));
test('некорректный id и версия', async () => {
  await bad('id', [{ name: 'manifest.json', data: manifest({ id: 'A' }) }, ...base().slice(1)]);
  await bad('ver', [{ name: 'manifest.json', data: manifest({ version: '1.0' }) }, ...base().slice(1)]);
});
test('entry указывает на несуществующий файл', () => bad('entry', [{ name: 'manifest.json', data: manifest({ views: [{ id: 'm', title: 'M', entry: 'nope.html' }] }) }, ...base().slice(1)]));
test('подделка PNG (расширение не совпадает с содержимым)', () => bad('fakepng', [...base(), { name: 'a.png', data: 'not a png at all' }]));
test('файл больше 5 МБ', () => bad('big', [...base(), { name: 'big.txt', data: Buffer.alloc(6 * 1024 * 1024, 97), deflate: true }]));
test('zip-бомба (огромная степень сжатия)', () => bad('bomb', [...base(), { name: 'z.txt', data: Buffer.alloc(4 * 1024 * 1024, 0), deflate: true }]));
test('слишком много файлов', () => bad('many', [...base(), ...Array.from({ length: 320 }, (_, i) => ({ name: `f${i}.txt`, data: 'x' }))]));
test('слишком глубокая вложенность', () => bad('deep', [...base(), { name: 'a/b/c/d/e/f/g/h.txt', data: 'x' }]));

test('eval/fetch в JS — только предупреждение', async () => {
  const r = await analyzePackage(makeZip([...base().slice(0, 2), { name: 'app.js', data: 'eval("1"); fetch("/x")' }]));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.ok(r.warnings.length > 0);
});

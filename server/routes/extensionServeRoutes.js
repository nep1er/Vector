import fs from 'node:fs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { ExtensionRepository } from '../db/ExtensionRepository.js';
import { FILE_TYPES, extOf } from '../utils/extensionPackage.js';
import { resolveVersionFile } from '../utils/extensionStore.js';

/**
 * Раздача файлов расширений. В продакшене этот роутер должен быть доступен с ОТДЕЛЬНОГО origin
 * (например ext.vector.example), чтобы код расширений никогда не делил origin с приложением.
 *   GET /ext/:versionId/*path             — публично, пока версия одобрена, расширение активно и автор не забанен
 *   GET /extp/:token/:versionId/*path     — предпросмотр для автора/модератора по короткоживущему токену
 */
const router = Router();

function setHeaders(res, type) {
  const origin = process.env.CLIENT_ORIGIN || '*';
  res.set({
    'Content-Type': type,
    'Content-Security-Policy':
      `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; ` +
      `connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${origin === '*' ? '*' : origin}`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
}

function send(res, versionId, rel) {
  const abs = resolveVersionFile(versionId, rel);
  if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return res.status(404).send('Not found');
  setHeaders(res, FILE_TYPES[extOf(rel)]);
  // Скачивание SVG/HTML как документа верхнего уровня не нужно: запрещаем исполнение вне iframe-песочницы
  res.set('Content-Disposition', 'inline');
  fs.createReadStream(abs).pipe(res);
}

const relOf = (p) => (Array.isArray(p) ? p.join('/') : String(p ?? ''));

router.get('/ext/:versionId/*path', async (req, res) => {
  try {
    const vid = Number(req.params.versionId);
    if (!Number.isInteger(vid) || !(await ExtensionRepository.servableVersion(vid))) return res.status(404).send('Not found');
    send(res, vid, relOf(req.params.path));
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

router.get('/extp/:token/:versionId/*path', async (req, res) => {
  try {
    const vid = Number(req.params.versionId);
    const t = jwt.verify(req.params.token, process.env.JWT_SECRET || 'fallback_secret_key');
    if (t.typ !== 'extpreview' || t.vid !== vid) return res.status(403).send('Forbidden');
    send(res, vid, relOf(req.params.path));
  } catch {
    res.status(403).send('Forbidden');
  }
});

export default router;

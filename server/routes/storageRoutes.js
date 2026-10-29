import express, { Router } from 'express';
import { StorageRepository } from '../db/StorageRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  checkProjectAccess,
  checkStorageAccess,
  checkStorageFileAccess,
} from '../middleware/rbacMiddleware.js';
import { MAX_UPLOAD_MB, readUploadName, requireBody, resolveKey, saveFile, removeFile } from '../utils/fileStore.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Storage
 *   description: "Общее хранилище проекта: разделы (папки) и их содержимое - загруженные файлы (FILE) и внешние ссылки (LINK: GitHub, Figma...)"
 */

/**
 * @swagger
 * /api/storage/project/{projectId}:
 *   get:
 *     summary: Все разделы проекта вместе с файлами и ссылками — право READ
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "Массив разделов, у каждого поле files" }
 *   post:
 *     summary: Создать раздел — право EXECUTE (руководитель)
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Репозитории" }
 *               description: { type: string }
 *     responses:
 *       201: { description: Раздел создан }
 *       409: { description: Раздел с таким названием уже есть }
 */
router.get('/project/:projectId', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    res.json(
      await StorageRepository.listByProject(req.params.projectId, {
        userId: req.user.id,
        seeAll: req.userPermissions.includes('ADMIN'),
      })
    );
  } catch (e) {
    sendError(res, e, 'Ошибка получения хранилища');
  }
});

router.post('/project/:projectId', authMiddleware, checkProjectAccess('EXECUTE'), async (req, res) => {
  try {
    const { name, description, roleIds } = req.body;
    res.status(201).json(
      await StorageRepository.createFolder(req.params.projectId, name, description, Array.isArray(roleIds) ? roleIds.map(Number) : [])
    );
  } catch (e) {
    sendError(res, e, 'Ошибка создания раздела');
  }
});

/**
 * @swagger
 * /api/storage/files/{fileId}:
 *   patch:
 *     summary: Переименовать файл/ссылку или изменить путь/URL — право EXECUTE (руководитель)
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: fileId, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               resourcePath: { type: string }
 *     responses:
 *       200: { description: Запись обновлена }
 *   delete:
 *     summary: Удалить файл/ссылку — право EXECUTE (руководитель)
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: fileId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Запись удалена }
 */
const rawFile = express.raw({ type: () => true, limit: `${MAX_UPLOAD_MB}mb` });

/**
 * @swagger
 * /api/storage/files/{fileId}/download:
 *   get:
 *     summary: Скачать загруженный файл (право READ). Для ссылок (LINK) — 400, они открываются по URL
 *     tags: [Storage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: fileId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Содержимое файла }
 * /api/storage/{storageId}/upload:
 *   post:
 *     summary: "Загрузить файл в раздел (право EXECUTE — руководитель). Тело запроса — сам файл (Content-Type любой, до 25 МБ), имя — в заголовке X-File-Name (URL-encoded)"
 *     tags: [Storage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: storageId, required: true, schema: { type: integer } }
 *       - { in: header, name: X-File-Name, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema: { type: string, format: binary }
 *     responses:
 *       201: { description: Файл сохранён на сервере и добавлен в раздел }
 */
router.get('/files/:fileId/download', authMiddleware, checkStorageFileAccess('READ'), async (req, res) => {
  try {
    const file = await StorageRepository.findFile(req.params.fileId);
    if (!file) return res.status(404).json({ message: 'Файл не найден' });
    if (file.resource_type !== 'FILE') return res.status(400).json({ message: 'Это ссылка — откройте её по адресу' });
    res.download(resolveKey(file.resource_path), file.name, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Файл не найден на сервере' });
    });
  } catch (e) {
    sendError(res, e, 'Ошибка скачивания файла');
  }
});

router.post('/:storageId/upload', authMiddleware, checkStorageAccess('EXECUTE'), rawFile, async (req, res) => {
  let key;
  try {
    const body = requireBody(req);
    const name = readUploadName(req);
    key = await saveFile(`p${req.projectId}/storage`, name, body);
    res.status(201).json(await StorageRepository.addUploadedFile(req.params.storageId, name, key, req.user.id));
  } catch (e) {
    await removeFile(key);
    sendError(res, e, 'Ошибка загрузки файла');
  }
});

/**
 * @swagger
 * /api/storage/{storageId}/visibility:
 *   get:
 *     summary: Роли, которым видно хранилище (пустой массив = все участники проекта). Право READ
 *     tags: [Storage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: storageId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "[{id, name}]" }
 *   put:
 *     summary: Заменить список ролей, которым видно хранилище (пустой массив = все). Право EXECUTE (руководитель)
 *     tags: [Storage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: storageId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleIds]
 *             properties:
 *               roleIds: { type: array, items: { type: integer }, example: [2, 3] }
 *     responses:
 *       200: { description: Итоговый список ролей }
 */
router.get('/:storageId/visibility', authMiddleware, checkStorageAccess('READ'), async (req, res) => {
  try {
    res.json(await StorageRepository.getRoles(req.params.storageId));
  } catch (e) {
    sendError(res, e, 'Ошибка получения видимости хранилища');
  }
});

router.put('/:storageId/visibility', authMiddleware, checkStorageAccess('EXECUTE'), async (req, res) => {
  try {
    res.json(await StorageRepository.setRoles(req.params.storageId, req.body?.roleIds));
  } catch (e) {
    sendError(res, e, 'Ошибка изменения видимости хранилища');
  }
});

// Маршруты /files/... идут ДО '/:storageId', чтобы слово "files" не приняли за id раздела
router.patch('/files/:fileId', authMiddleware, checkStorageFileAccess('EXECUTE'), async (req, res) => {
  try {
    const { name, resourcePath } = req.body;
    const updated = await StorageRepository.updateFile(req.params.fileId, { name, resourcePath });
    if (!updated) return res.status(404).json({ message: 'Файл не найден' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления файла');
  }
});

router.delete('/files/:fileId', authMiddleware, checkStorageFileAccess('EXECUTE'), async (req, res) => {
  try {
    const removed = await StorageRepository.deleteFile(req.params.fileId);
    if (!removed) return res.status(404).json({ message: 'Файл не найден' });
    res.json({ message: 'Файл удалён', id: removed.id });
  } catch (e) {
    sendError(res, e, 'Ошибка удаления файла');
  }
});

/**
 * @swagger
 * /api/storage/{storageId}:
 *   patch:
 *     summary: Переименовать раздел / изменить описание — право EXECUTE (руководитель)
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: storageId, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       200: { description: Раздел обновлён }
 *   delete:
 *     summary: Удалить раздел вместе со всем содержимым — право EXECUTE
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: storageId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Раздел удалён }
 */
router.patch('/:storageId', authMiddleware, checkStorageAccess('EXECUTE'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const updated = await StorageRepository.updateFolder(req.params.storageId, { name, description });
    if (!updated) return res.status(404).json({ message: 'Раздел не найден' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления раздела');
  }
});

router.delete('/:storageId', authMiddleware, checkStorageAccess('EXECUTE'), async (req, res) => {
  try {
    const removed = await StorageRepository.deleteFolder(req.params.storageId);
    if (!removed) return res.status(404).json({ message: 'Раздел не найден' });
    res.json({ message: 'Раздел удалён', id: removed.id });
  } catch (e) {
    sendError(res, e, 'Ошибка удаления раздела');
  }
});

/**
 * @swagger
 * /api/storage/{storageId}/files:
 *   post:
 *     summary: Добавить в раздел внешнюю ссылку (LINK, URL); файлы — через /upload — право EXECUTE (руководитель)
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: storageId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceType, name, resourcePath]
 *             properties:
 *               resourceType: { type: string, enum: [FILE, LINK], example: "LINK" }
 *               name: { type: string, example: "Репозиторий backend" }
 *               resourcePath: { type: string, example: "https://github.com/nep1er/Vector" }
 *     responses:
 *       201: { description: Запись добавлена }
 *       400: { description: Неверный тип ресурса или ссылка не http(s) }
 */
router.post('/:storageId/files', authMiddleware, checkStorageAccess('EXECUTE'), async (req, res) => {
  try {
    const { resourceType, name, resourcePath } = req.body;
    const file = await StorageRepository.addFile(
      req.params.storageId,
      { resourceType, name, resourcePath },
      req.user.id
    );
    res.status(201).json(file);
  } catch (e) {
    sendError(res, e, 'Ошибка добавления в хранилище');
  }
});

export default router;

import express, { Router } from 'express';
import { KanbanRepository } from '../db/KanbanRepository.js';
import { CommentRepository } from '../db/CommentRepository.js';
import { FileRepository } from '../db/FileRepository.js';
import { MAX_UPLOAD_MB, readUploadName, removeFile, requireBody, resolveKey, saveFile } from '../utils/fileStore.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  checkCardAccess,
  checkColumnAccess,
  checkCommentAccess,
  checkTaskAccess,
} from '../middleware/rbacMiddleware.js';
import { pool } from '../config/db.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/*
 * Права: просмотр доски и карточек — READ; любые изменения (колонки, карточки, перемещение,
 * исполнители, теги, файлы, комментарии) — WRITE. Если ToDo-задача скрыта от ролей
 * пользователя (видимость задачи), её доска для него недоступна (404), кроме ADMIN.
 */

const wrap = (message, handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (e) {
    sendError(res, e, message);
  }
};

/**
 * @swagger
 * /api/kanban/todo/{taskId}/board:
 *   get:
 *     summary: Доска ToDo-задачи — колонки по порядку, в каждой карточки по порядку (с тегами, исполнителями, счётчиками)
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: taskId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "[{column_id, column_title, position, cards:[{id,title,description,status_id,work_date,position,tags,participants,comments_count,files_count}]}]" }
 */
router.get(
  '/todo/:taskId/board',
  authMiddleware,
  checkTaskAccess('READ'),
  wrap('Ошибка загрузки канбан-доски', async (req, res, next) => {
    const t = await pool.query(`SELECT type FROM task WHERE id = $1;`, [req.params.taskId]);
    if (t.rows[0]?.type !== 'TODO') return res.status(400).json({ message: 'Это не ToDo-задача — у неё нет доски' });
    res.json(await KanbanRepository.getBoardByTodoId(req.params.taskId));
  })
);

/**
 * @swagger
 * /api/kanban/columns:
 *   post:
 *     summary: Создать колонку (без position — в конец; position с 1 — вставка на это место). Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [todoTaskId, title]
 *             properties:
 *               todoTaskId: { type: integer }
 *               title: { type: string, example: На проверке }
 *               position: { type: integer, example: 2 }
 *     responses:
 *       201: { description: Колонка создана }
 */
router.post(
  '/columns',
  authMiddleware,
  checkTaskAccess('WRITE', (req) => req.body?.todoTaskId),
  wrap('Ошибка создания колонки', async (req, res) => {
    const t = await pool.query(`SELECT type FROM task WHERE id = $1;`, [req.body.todoTaskId]);
    if (t.rows[0]?.type !== 'TODO') return res.status(400).json({ message: 'Это не ToDo-задача — у неё нет доски' });
    res.status(201).json(await KanbanRepository.createColumn(req.body.todoTaskId, req.body.title, req.body.position));
  })
);

/**
 * @swagger
 * /api/kanban/columns/{columnId}:
 *   patch:
 *     summary: Переименовать и/или переместить колонку (position — новое место с 1). Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: columnId, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               position: { type: integer }
 *     responses:
 *       200: { description: Колонка обновлена }
 *   delete:
 *     summary: "Удалить колонку. Если в ней есть карточки: ?moveTo=<id колонки> переносит их, ?withCards=true удаляет вместе с ними, иначе 409. Право WRITE"
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: columnId, required: true, schema: { type: integer } }
 *       - { in: query, name: moveTo, schema: { type: integer } }
 *       - { in: query, name: withCards, schema: { type: boolean } }
 *     responses:
 *       200: { description: Колонка удалена }
 *       409: { description: В колонке есть карточки }
 */
router.patch(
  '/columns/:columnId',
  authMiddleware,
  checkColumnAccess('WRITE'),
  wrap('Ошибка обновления колонки', async (req, res) => {
    res.json(await KanbanRepository.updateColumn(req.params.columnId, req.body ?? {}));
  })
);

router.delete(
  '/columns/:columnId',
  authMiddleware,
  checkColumnAccess('WRITE'),
  wrap('Ошибка удаления колонки', async (req, res) => {
    const moveTo = req.query.moveTo != null ? Number(req.query.moveTo) : null;
    if (moveTo !== null && !Number.isInteger(moveTo)) return res.status(400).json({ message: 'Некорректный moveTo' });
    res.json(
      await KanbanRepository.deleteColumn(req.params.columnId, { moveToColumnId: moveTo, withCards: req.query.withCards === 'true' })
    );
  })
);

/**
 * @swagger
 * /api/kanban/cards:
 *   post:
 *     summary: Создать карточку в конце колонки (теги и исполнители — необязательно). Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [columnId, title]
 *             properties:
 *               columnId: { type: integer }
 *               title: { type: string }
 *               description: { type: string }
 *               workDate: { type: string, format: date-time }
 *               tagIds: { type: array, items: { type: integer } }
 *               participantIds: { type: array, items: { type: integer }, description: id из project_participants }
 *     responses:
 *       201: { description: Карточка создана }
 */
router.post(
  '/cards',
  authMiddleware,
  (req, res, next) => {
    req.params.columnId = req.body?.columnId;
    checkColumnAccess('WRITE')(req, res, next);
  },
  wrap('Ошибка создания карточки', async (req, res) => {
    const { columnId, ...rest } = req.body;
    res.status(201).json(await KanbanRepository.createCard(columnId, rest));
  })
);

/**
 * @swagger
 * /api/kanban/cards/{cardId}/move:
 *   patch:
 *     summary: Переместить карточку в колонку targetColumnId на место index (с 0; без index — в конец). Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetColumnId]
 *             properties:
 *               targetColumnId: { type: integer }
 *               index: { type: integer }
 *               newStatusId: { type: integer, description: необязательно }
 *     responses:
 *       200: { description: Карточка перемещена }
 */
router.patch(
  '/cards/:cardId/move',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка перемещения карточки', async (req, res) => {
    const { targetColumnId, index, newStatusId } = req.body ?? {};
    if (!Number.isInteger(Number(targetColumnId))) return res.status(400).json({ message: 'Укажите targetColumnId' });
    res.json(await KanbanRepository.moveCard(req.params.cardId, targetColumnId, index, newStatusId));
  })
);

/**
 * @swagger
 * /api/kanban/cards/{cardId}/details:
 *   patch:
 *     summary: Изменить название, описание, дату (description и workDate можно очистить, передав null). Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string, nullable: true }
 *               workDate: { type: string, format: date-time, nullable: true }
 *     responses:
 *       200: { description: Карточка обновлена }
 * /api/kanban/cards/{cardId}/status:
 *   patch:
 *     summary: "Отметить карточку выполненной / невыполненной (card_status_id). Право WRITE"
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cardStatusId]
 *             properties:
 *               cardStatusId: { type: integer, example: 1 }
 *     responses:
 *       200: { description: Статус обновлён }
 * /api/kanban/cards/{cardId}:
 *   delete:
 *     summary: Удалить карточку. Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Карточка удалена }
 */
router.patch(
  '/cards/:cardId/details',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка обновления карточки', async (req, res) => {
    res.json(await KanbanRepository.updateCardDetails(req.params.cardId, req.body ?? {}));
  })
);

router.patch(
  '/cards/:cardId/status',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка смены статуса карточки', async (req, res) => {
    res.json(await KanbanRepository.updateCardStatus(req.params.cardId, req.body?.cardStatusId));
  })
);

router.delete(
  '/cards/:cardId',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка удаления карточки', async (req, res) => {
    const deleted = await KanbanRepository.deleteCard(req.params.cardId);
    if (!deleted) return res.status(404).json({ message: 'Карточка не найдена' });
    res.json({ message: 'Карточка удалена', id: deleted.id });
  })
);

/**
 * @swagger
 * /api/kanban/cards/{cardId}/participants:
 *   post:
 *     summary: Назначить исполнителя карточки (projectParticipantId из GET /participants → participant_id). Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectParticipantId]
 *             properties:
 *               projectParticipantId: { type: integer }
 *     responses:
 *       201: { description: Исполнитель назначен }
 *   delete:
 *     summary: Снять исполнителя с карточки. Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectParticipantId]
 *             properties:
 *               projectParticipantId: { type: integer }
 *     responses:
 *       200: { description: Исполнитель снят }
 * /api/kanban/cards/{cardId}/tags/{tagId}:
 *   post:
 *     summary: Повесить тег Канбана на карточку (тег должен быть из того же проекта). Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *       - { in: path, name: tagId, required: true, schema: { type: integer } }
 *     responses:
 *       201: { description: Тег добавлен }
 *   delete:
 *     summary: Снять тег с карточки. Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *       - { in: path, name: tagId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Тег снят }
 */
router.post(
  '/cards/:cardId/participants',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка добавления исполнителя', async (req, res) => {
    res.status(201).json(await KanbanRepository.addCardParticipant(req.params.cardId, req.body?.projectParticipantId));
  })
);

router.delete(
  '/cards/:cardId/participants',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка снятия исполнителя', async (req, res) => {
    await KanbanRepository.removeCardParticipant(req.params.cardId, req.body?.projectParticipantId);
    res.json({ message: 'Исполнитель снят' });
  })
);

router.post(
  '/cards/:cardId/tags/:tagId',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка добавления тега', async (req, res) => {
    res.status(201).json(await KanbanRepository.applyTag(req.params.cardId, req.params.tagId));
  })
);

router.delete(
  '/cards/:cardId/tags/:tagId',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка снятия тега', async (req, res) => {
    await KanbanRepository.removeTag(req.params.cardId, req.params.tagId);
    res.json({ message: 'Тег снят' });
  })
);

/**
 * @swagger
 * /api/kanban/cards/{cardId}/files:
 *   get:
 *     summary: Файлы карточки. Право READ
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Список файлов }
 *   post:
 *     summary: Прикрепить внешнюю ссылку к карточке (файлы — через /files/upload). Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, example: "https://figma.com/file/..." }
 *     responses:
 *       201: { description: Файл добавлен }
 * /api/kanban/cards/{cardId}/files/upload:
 *   post:
 *     summary: "Загрузить файл на сервер и прикрепить к карточке (WRITE). Тело — сам файл до 25 МБ, имя — в заголовке X-File-Name (URL-encoded)"
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *       - { in: header, name: X-File-Name, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema: { type: string, format: binary }
 *     responses:
 *       201: { description: Файл сохранён }
 * /api/kanban/files/{fileId}/download:
 *   get:
 *     summary: Скачать вложение (READ)
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: fileId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Содержимое файла }
 * /api/kanban/files/{fileId}:
 *   delete:
 *     summary: Удалить файл карточки. Право WRITE
 *     tags: [Kanban]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: fileId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Файл удалён }
 */
router.get(
  '/cards/:cardId/files',
  authMiddleware,
  checkCardAccess('READ'),
  wrap('Ошибка получения файлов', async (req, res) => {
    res.json(await FileRepository.getCardFiles(req.params.cardId));
  })
);

const rawFile = express.raw({ type: () => true, limit: `${MAX_UPLOAD_MB}mb` });

router.post(
  '/cards/:cardId/files',
  authMiddleware,
  checkCardAccess('WRITE'),
  wrap('Ошибка добавления ссылки', async (req, res) => {
    const url = String(req.body?.url ?? req.body?.filePath ?? '').trim();
    if (!url) return res.status(400).json({ message: 'Укажите ссылку' });
    if (url.length > 512) return res.status(400).json({ message: 'Ссылка — не длиннее 512 символов' });
    res.status(201).json(await FileRepository.addLinkToCard(req.params.cardId, url));
  })
);

router.post(
  '/cards/:cardId/files/upload',
  authMiddleware,
  checkCardAccess('WRITE'),
  rawFile,
  async (req, res) => {
    let key;
    try {
      const body = requireBody(req);
      const name = readUploadName(req);
      key = await saveFile(`p${req.projectId}/cards`, name, body);
      res.status(201).json(await FileRepository.addUploadToCard(req.params.cardId, key, name));
    } catch (e) {
      await removeFile(key);
      sendError(res, e, 'Ошибка загрузки файла');
    }
  }
);

/** Файл по id вложения: проверяем права на карточку, к которой он относится */
const withFileCard = (permission, handler) => async (req, res) => {
  try {
    const file = await FileRepository.findById(req.params.fileId);
    if (!file) return res.status(404).json({ message: 'Файл не найден' });
    req.params.cardId = file.kanban_card_id;
    checkCardAccess(permission)(req, res, async () => {
      try {
        await handler(req, res, file);
      } catch (e) {
        sendError(res, e, 'Ошибка обработки файла');
      }
    });
  } catch (e) {
    sendError(res, e, 'Ошибка обработки файла');
  }
};

router.get(
  '/files/:fileId/download',
  authMiddleware,
  withFileCard('READ', async (req, res, file) => {
    if (file.kind !== 'upload') return res.status(400).json({ message: 'Это ссылка — откройте её по адресу' });
    res.download(resolveKey(file.key), file.name, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Файл не найден на сервере' });
    });
  })
);

router.delete(
  '/files/:fileId',
  authMiddleware,
  withFileCard('WRITE', async (req, res) => {
    await FileRepository.deleteFile(req.params.fileId);
    res.json({ message: 'Файл удалён' });
  })
);

// ---------------------------------------------------------------------------
// КОММЕНТАРИИ К КАРТОЧКАМ (card_comments)
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/kanban/cards/{cardId}/comments:
 *   get:
 *     summary: Комментарии карточки по порядку создания (право READ)
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "Массив {id, content, author_id, author_name, created_at, updated_at}" }
 *   post:
 *     summary: Добавить комментарий (право WRITE). Участники карточки получают уведомление CARD_COMMENT
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: cardId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, example: "Готово, посмотрите PR" }
 *     responses:
 *       201: { description: Комментарий добавлен }
 */
router.get('/cards/:cardId/comments', authMiddleware, checkCardAccess('READ'), async (req, res) => {
  try {
    res.json(await CommentRepository.listByCard(req.params.cardId));
  } catch (e) {
    sendError(res, e, 'Ошибка получения комментариев');
  }
});

router.post('/cards/:cardId/comments', authMiddleware, checkCardAccess('WRITE'), async (req, res) => {
  try {
    const comment = await CommentRepository.create(req.params.cardId, req.user.id, req.body.content);
    res.status(201).json(comment);
  } catch (e) {
    sendError(res, e, 'Ошибка добавления комментария');
  }
});

/**
 * @swagger
 * /api/kanban/comments/{commentId}:
 *   patch:
 *     summary: Изменить свой комментарий (только автор)
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: commentId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *     responses:
 *       200: { description: Комментарий изменён }
 *       403: { description: Можно изменять только свои комментарии }
 *   delete:
 *     summary: Удалить комментарий (автор или администратор проекта)
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: commentId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Комментарий удалён }
 *       403: { description: Недостаточно прав }
 */
router.patch('/comments/:commentId', authMiddleware, checkCommentAccess('WRITE'), async (req, res) => {
  try {
    const comment = await CommentRepository.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Комментарий не найден' });
    if (comment.author_id !== req.user.id) {
      return res.status(403).json({ message: 'Можно изменять только свои комментарии' });
    }
    res.json(await CommentRepository.update(req.params.commentId, req.body.content));
  } catch (e) {
    sendError(res, e, 'Ошибка изменения комментария');
  }
});

router.delete('/comments/:commentId', authMiddleware, checkCommentAccess('WRITE'), async (req, res) => {
  try {
    const comment = await CommentRepository.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Комментарий не найден' });
    const isAdmin = req.userPermissions.includes('ADMIN');
    if (comment.author_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ message: 'Удалить чужой комментарий может только администратор' });
    }
    await CommentRepository.remove(req.params.commentId);
    res.json({ message: 'Комментарий удалён', id: comment.id });
  } catch (e) {
    sendError(res, e, 'Ошибка удаления комментария');
  }
});

export default router;

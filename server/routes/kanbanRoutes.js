import { Router } from 'express';
import { KanbanRepository } from '../db/KanbanRepository.js';
import { CommentRepository } from '../db/CommentRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkCardAccess, checkCommentAccess } from '../middleware/rbacMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Kanban
 *   description: Оперативная работа с карточками и колонками Канбана
 */

/**
 * @swagger
 * /api/kanban/todo/{todoTaskId}/board:
 *   get:
 *     summary: Получить Канбан-доску с колонками и карточками для ToDo задачи
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: todoTaskId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Данные доски
 */
router.get('/todo/:todoTaskId/board', authMiddleware, async (req, res) => {
  try {
    const board = await KanbanRepository.getBoardByTodoId(req.params.todoTaskId);
    res.json(board);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка загрузки канбан-доски' });
  }
});

/**
 * @swagger
 * /api/kanban/cards/{cardId}/move:
 *   patch:
 *     summary: Переместить карточку между колонками (Drag-and-Drop)
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetColumnId
 *               - newStatusId
 *             properties:
 *               targetColumnId:
 *                 type: integer
 *                 example: 2
 *               newStatusId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Карточка успешно перемещена
 */
router.patch('/cards/:cardId/move', authMiddleware, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { targetColumnId, newStatusId } = req.body;
    const updatedCard = await KanbanRepository.moveCard(cardId, targetColumnId, newStatusId);
    res.json(updatedCard);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка перемещения карточки' });
  }
});

import { FileRepository } from '../db/FileRepository.js';

/**
 * @swagger
 * /api/kanban/cards/{cardId}:
 *   delete:
 *     summary: Удалить карточку Канбана
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Карточка удалена
 */
router.delete('/cards/:cardId', authMiddleware, async (req, res) => {
  try {
    const deleted = await KanbanRepository.deleteCard(req.params.cardId);
    if (!deleted) return res.status(404).json({ message: 'Карточка не найдена' });
    res.json({ message: 'Карточка успешно удалена', id: req.params.cardId });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка удаления карточки' });
  }
});

/**
 * @swagger
 * /api/kanban/columns/{columnId}:
 *   delete:
 *     summary: Удалить колонку Канбана вместе с ее карточками
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: columnId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Колонка удалена
 */
router.delete('/columns/:columnId', authMiddleware, async (req, res) => {
  try {
    const deleted = await KanbanRepository.deleteColumn(req.params.columnId);
    if (!deleted) return res.status(404).json({ message: 'Колонка не найдена' });
    res.json({ message: 'Колонка успешно удалена', id: req.params.columnId });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка удаления колонки' });
  }
});

/**
 * @swagger
 * /api/kanban/files/{fileId}:
 *   delete:
 *     summary: Открепить/удалить файл от карточки
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Файл удален
 */
router.delete('/files/:fileId', authMiddleware, async (req, res) => {
  try {
    const deleted = await FileRepository.deleteFile(req.params.fileId);
    if (!deleted) return res.status(404).json({ message: 'Файл не найден' });
    res.json({ message: 'Файл успешно удален', id: req.params.fileId });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка удаления файла' });
  }
});

/**
 * @swagger
 * /api/kanban/columns:
 *   post:
 *     summary: Создать новую колонку в Канбан-доске ToDo задачи
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - todoTaskId
 *               - title
 *             properties:
 *               todoTaskId:
 *                 type: integer
 *                 example: 2
 *               title:
 *                 type: string
 *                 example: На проверке QA
 *               position:
 *                 type: integer
 *                 example: 3
 *     responses:
 *       201:
 *         description: Колонка создана
 */
router.post('/columns', authMiddleware, async (req, res) => {
  try {
    const { todoTaskId, title, position } = req.body;
    const col = await KanbanRepository.createColumn(todoTaskId, title, position || 0);
    res.status(201).json(col);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка создания колонки' });
  }
});

/**
 * @swagger
 * /api/kanban/cards:
 *   post:
 *     summary: Создать новую карточку в колонке
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - columnId
 *               - title
 *             properties:
 *               columnId:
 *                 type: integer
 *                 example: 1
 *               title:
 *                 type: string
 *                 example: Написать тесты контроллеров
 *               description:
 *                 type: string
 *                 example: Покрыть unit-тестами роуты Auth и Projects
 *     responses:
 *       201:
 *         description: Карточка создана
 */
router.post('/cards', authMiddleware, async (req, res) => {
  try {
    const { columnId, title, description, cardStatusId, position } = req.body;
    const card = await KanbanRepository.createCard(columnId, title, description, cardStatusId, position);
    res.status(201).json(card);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка создания карточки' });
  }
});

/**
 * @swagger
 * /api/kanban/cards/{cardId}/files:
 *   post:
 *     summary: Прикрепить файл (ссылку/путь) к карточке
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - filePath
 *             properties:
 *               filePath:
 *                 type: string
 *                 example: /uploads/specs/architecture.pdf
 *     responses:
 *       201:
 *         description: Файл успешно прикреплен к карточке
 */
router.post('/cards/:cardId/files', authMiddleware, async (req, res) => {
  try {
    const { filePath } = req.body;
    const file = await FileRepository.addFileToCard(req.params.cardId, filePath);
    res.status(201).json(file);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка прикрепления файла' });
  }
});

/**
 * @swagger
 * /api/kanban/columns/{columnId}:
 *   patch:
 *     summary: Изменить название и/или позицию колонки Канбана
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: columnId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, example: "На проверке (Review)" }
 *               position: { type: integer, example: 3 }
 *     responses:
 *       200: { description: Колонка обновлена }
 */
router.patch('/columns/:columnId', authMiddleware, async (req, res) => {
  try {
    const { title, position } = req.body;
    const updated = await KanbanRepository.updateColumnDetails(req.params.columnId, title, position);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления колонки' });
  }
});

/**
 * @swagger
 * /api/kanban/cards/{cardId}/details:
 *   patch:
 *     summary: Изменить название, описание и/или work_date у карточки Канбана
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, example: "Новое название карточки" }
 *               description: { type: string, example: "Новое подробное описание" }
 *               workDate: { type: string, example: "2026-10-15T12:00:00Z" }
 *     responses:
 *       200: { description: Детали карточки обновлены }
 */
router.patch('/cards/:cardId/details', authMiddleware, async (req, res) => {
  try {
    const { title, description, workDate } = req.body;
    const updated = await KanbanRepository.updateCardDetails(req.params.cardId, { title, description, workDate });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления карточки' });
  }
});

/**
 * @swagger
 * /api/kanban/cards/{cardId}/status:
 *   patch:
 *     summary: Изменить статус карточки (0 = Не выполнена, 1 = Выполнена)
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema: { type: integer }
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
 *       200: { description: Статус карточки обновлен }
 */
router.patch('/cards/:cardId/status', authMiddleware, async (req, res) => {
  try {
    const { cardStatusId } = req.body;
    const updated = await KanbanRepository.updateCardStatus(req.params.cardId, cardStatusId);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка смены статуса карточки' });
  }
});

/**
 * @swagger
 * /api/kanban/cards/{cardId}/participants:
 *   post:
 *     summary: Назначить участника проекта на карточку Канбана
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectParticipantId]
 *             properties:
 *               projectParticipantId: { type: integer, example: 1 }
 *     responses:
 *       201: { description: Участник назначен на карточку }
 *   delete:
 *     summary: Снять участника с карточки Канбана
 *     tags: [Kanban]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectParticipantId]
 *             properties:
 *               projectParticipantId: { type: integer, example: 1 }
 *     responses:
 *       200: { description: Участник снят с карточки }
 */
router.post('/cards/:cardId/participants', authMiddleware, async (req, res) => {
  try {
    const { projectParticipantId } = req.body;
    const added = await KanbanRepository.addCardParticipant(req.params.cardId, projectParticipantId);
    res.status(201).json(added);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка добавления участника карточки' });
  }
});

router.delete('/cards/:cardId/participants', authMiddleware, async (req, res) => {
  try {
    const { projectParticipantId } = req.body;
    const removed = await KanbanRepository.removeCardParticipant(req.params.cardId, projectParticipantId);
    res.json(removed);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка удаления участника с карточки' });
  }
});

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
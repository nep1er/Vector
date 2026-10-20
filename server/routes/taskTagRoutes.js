import { Router } from 'express';
import { TaskTagRepository } from '../db/TaskTagRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  checkProjectAccess,
  checkTaskAccess,
  checkTaskTagAccess,
} from '../middleware/rbacMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Task Tags
 *   description: Теги ЗАДАЧ RoadMap/ToDo ("Программирование", "Арт"...), таблицы task_tag / task_tag_applies. Не связаны с тегами Канбана. Одна задача — много тегов.
 */

/**
 * @swagger
 * /api/task-tags/project/{projectId}:
 *   get:
 *     summary: Теги задач проекта (с количеством помеченных задач) — право READ
 *     tags: [Task Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Массив тегов }
 *   post:
 *     summary: Создать тег задач — право EXECUTE
 *     tags: [Task Tags]
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
 *               name: { type: string, example: "Программирование" }
 *               color: { type: string, example: "#4A90D9" }
 *     responses:
 *       201: { description: Тег создан }
 *       409: { description: Тег с таким названием уже есть в проекте }
 */
router.get('/project/:projectId', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    res.json(await TaskTagRepository.listByProject(req.params.projectId));
  } catch (e) {
    sendError(res, e, 'Ошибка получения тегов задач');
  }
});

router.post('/project/:projectId', authMiddleware, checkProjectAccess('EXECUTE'), async (req, res) => {
  try {
    const { name, color } = req.body;
    const tag = await TaskTagRepository.create(req.params.projectId, name, color);
    res.status(201).json(tag);
  } catch (e) {
    sendError(res, e, 'Ошибка создания тега задач');
  }
});

/**
 * @swagger
 * /api/task-tags/tasks/{taskId}:
 *   get:
 *     summary: Теги конкретной задачи — право READ
 *     tags: [Task Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: taskId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Массив тегов задачи }
 *   put:
 *     summary: Полностью заменить набор тегов задачи (атомарно) — право EXECUTE
 *     tags: [Task Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: taskId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tagIds]
 *             properties:
 *               tagIds: { type: array, items: { type: integer }, example: [1, 2] }
 *     responses:
 *       200: { description: Итоговый набор тегов задачи }
 *       400: { description: Тег не найден или относится к другому проекту }
 */
router.get('/tasks/:taskId', authMiddleware, checkTaskAccess('READ'), async (req, res) => {
  try {
    res.json(await TaskTagRepository.getTaskTags(req.params.taskId));
  } catch (e) {
    sendError(res, e, 'Ошибка получения тегов задачи');
  }
});

router.put('/tasks/:taskId', authMiddleware, checkTaskAccess('EXECUTE'), async (req, res) => {
  try {
    res.json(await TaskTagRepository.setTaskTags(req.params.taskId, req.body.tagIds));
  } catch (e) {
    sendError(res, e, 'Ошибка обновления тегов задачи');
  }
});

/**
 * @swagger
 * /api/task-tags/tasks/{taskId}/tags/{tagId}:
 *   post:
 *     summary: Добавить один тег к задаче — право EXECUTE
 *     tags: [Task Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: taskId, required: true, schema: { type: integer } }
 *       - { in: path, name: tagId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Итоговый набор тегов задачи }
 *   delete:
 *     summary: Снять один тег с задачи — право EXECUTE
 *     tags: [Task Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: taskId, required: true, schema: { type: integer } }
 *       - { in: path, name: tagId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Итоговый набор тегов задачи }
 */
router.post('/tasks/:taskId/tags/:tagId', authMiddleware, checkTaskAccess('EXECUTE'), async (req, res) => {
  try {
    res.json(await TaskTagRepository.applyToTask(req.params.taskId, req.params.tagId));
  } catch (e) {
    sendError(res, e, 'Ошибка добавления тега к задаче');
  }
});

router.delete('/tasks/:taskId/tags/:tagId', authMiddleware, checkTaskAccess('EXECUTE'), async (req, res) => {
  try {
    res.json(await TaskTagRepository.removeFromTask(req.params.taskId, req.params.tagId));
  } catch (e) {
    sendError(res, e, 'Ошибка снятия тега с задачи');
  }
});

/**
 * @swagger
 * /api/task-tags/{tagId}:
 *   patch:
 *     summary: Изменить название и/или цвет тега — право EXECUTE
 *     tags: [Task Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: tagId, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "Арт" }
 *               colorCode: { type: string, example: "#E85D75" }
 *     responses:
 *       200: { description: Тег обновлён }
 *   delete:
 *     summary: Удалить тег (он снимется со всех задач) — право EXECUTE
 *     tags: [Task Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: tagId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Тег удалён }
 */
router.patch('/:tagId', authMiddleware, checkTaskTagAccess('EXECUTE'), async (req, res) => {
  try {
    const { name, colorCode } = req.body;
    const updated = await TaskTagRepository.update(req.params.tagId, { name, colorCode });
    if (!updated) return res.status(404).json({ message: 'Тег не найден' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления тега задач');
  }
});

router.delete('/:tagId', authMiddleware, checkTaskTagAccess('EXECUTE'), async (req, res) => {
  try {
    const removed = await TaskTagRepository.remove(req.params.tagId);
    if (!removed) return res.status(404).json({ message: 'Тег не найден' });
    res.json({ message: 'Тег удалён', id: removed.id });
  } catch (e) {
    sendError(res, e, 'Ошибка удаления тега задач');
  }
});

export default router;

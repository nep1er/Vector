import { Router } from 'express';
import { RoadmapRepository } from '../db/RoadmapRepository.js';
import { TodoRepository } from '../db/TodoRepository.js';
import { TaskRepository } from '../db/TaskRepository.js';
import { UserRepository } from '../db/UserRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkProjectAccess, checkTaskAccess } from '../middleware/rbacMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Tasks
 *   description: Иерархические задачи (RoadMap и ToDo по паттерну CTI)
 */

/**
 * @swagger
 * /api/tasks/projects/{projectId}/roadmap:
 *   post:
 *     summary: Создать под-этап RoadMap (если parentRoadmapId не указан — внутри корневой RoadMap)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
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
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: Этап 1. Проектирование БД
 *               startDate:
 *                 type: string
 *                 example: "2026-02-01"
 *               endDate:
 *                 type: string
 *                 example: "2026-03-01"
 *               parentRoadmapId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Этап создан
 *       400:
 *         description: Ошибка валидации (иерархия, даты)
 *       404:
 *         description: Проект или родитель не найден
 */
router.post('/projects/:projectId/roadmap', authMiddleware, checkProjectAccess('EXECUTE'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, startDate, endDate, parentRoadmapId } = req.body;
    const stage = await RoadmapRepository.createRoadmapStage(
      projectId, title, startDate, endDate, parentRoadmapId
    );
    res.status(201).json(stage);
  } catch (error) {
    sendError(res, error, 'Ошибка создания этапа RoadMap');
  }
});

/**
 * @swagger
 * /api/tasks/projects/{projectId}/todo:
 *   post:
 *     summary: Создать оперативную ToDo-задачу (с автоматической генерацией Канбан-колонок)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
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
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: Разработка REST API роутов
 *               parentRoadmapId:
 *                 type: integer
 *                 description: Если не указан — задача попадёт в корневую RoadMap
 *                 example: 1
 *               startDate:
 *                 type: string
 *                 example: "2026-02-01T00:00:00.000Z"
 *               endDate:
 *                 type: string
 *                 example: "2026-02-14T23:59:59.000Z"
 *     responses:
 *       201:
 *         description: Задача ToDo создана
 */
router.post('/projects/:projectId/todo', authMiddleware, checkProjectAccess('WRITE'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, parentRoadmapId, startDate, endDate } = req.body;
    const todo = await TodoRepository.createTodoTask(projectId, title, parentRoadmapId, startDate, endDate);
    res.status(201).json(todo);
  } catch (error) {
    sendError(res, error, 'Ошибка создания ToDo задачи');
  }
});

/**
 * @swagger
 * /api/tasks/projects/{projectId}/tree:
 *   get:
 *     summary: Получить дерево всех задач проекта (массив корней, у каждого узла поле children)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Иерархическое дерево задач
 */
router.get('/projects/:projectId/tree', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    const tree = await TaskRepository.getProjectTree(req.params.projectId);
    res.json(tree);
  } catch (error) {
    sendError(res, error, 'Ошибка получения дерева задач');
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   delete:
 *     summary: Удалить задачу (RoadMap или ToDo) вместе с дочерними. Корневую RoadMap удалить нельзя.
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Задача удалена
 *       400:
 *         description: Попытка удалить корневую RoadMap
 *       404:
 *         description: Задача не найдена
 */
router.delete('/:taskId', authMiddleware, checkTaskAccess('EXECUTE'), async (req, res) => {
  try {
    const deleted = await TaskRepository.deleteTask(req.params.taskId);
    if (!deleted) {
      return res.status(404).json({ message: 'Задача не найдена' });
    }
    res.json({ message: 'Задача успешно удалена', id: req.params.taskId });
  } catch (error) {
    sendError(res, error, 'Ошибка удаления задачи');
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}/title:
 *   patch:
 *     summary: Изменить название задачи (обновляется и task, и подтип)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string, example: "Обновленный заголовок задачи" }
 *     responses:
 *       200: { description: Название изменено }
 *       404: { description: Задача не найдена }
 */
router.patch('/:taskId/title', authMiddleware, checkTaskAccess('EXECUTE'), async (req, res) => {
  try {
    const updated = await TaskRepository.updateTaskTitle(req.params.taskId, req.body.title);
    if (!updated) return res.status(404).json({ message: 'Задача не найдена' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления названия задачи');
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}/subtype-title:
 *   patch:
 *     summary: Изменить отдельно название подтипа ToDo или RoadMap
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title]
 *             properties:
 *               type: { type: string, enum: [ROADMAP, TODO], example: "TODO" }
 *               title: { type: string, example: "Кастомный заголовок субтипа" }
 *     responses:
 *       200: { description: Название субтипа изменено }
 *       404: { description: Задача не найдена }
 */
router.patch('/:taskId/subtype-title', authMiddleware, checkTaskAccess('EXECUTE'), async (req, res) => {
  try {
    const { type, title } = req.body;
    const updated = await TaskRepository.updateSubtypeTitle(req.params.taskId, type, title);
    if (!updated) return res.status(404).json({ message: 'Задача не найдена' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления названия подтипа');
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}/dates:
 *   patch:
 *     summary: Изменить временные рамки (start_date / end_date) с проверкой границ родителя и дочерних задач
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate: { type: string, example: "2026-03-01T00:00:00Z" }
 *               endDate: { type: string, example: "2026-06-01T00:00:00Z" }
 *     responses:
 *       200: { description: Даты задачи обновлены }
 *       400: { description: Даты нарушают границы иерархии }
 *       404: { description: Задача не найдена }
 */
router.patch('/:taskId/dates', authMiddleware, checkTaskAccess('EXECUTE'), async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const updated = await TaskRepository.updateTaskDates(req.params.taskId, startDate, endDate);
    if (!updated) return res.status(404).json({ message: 'Задача не найдена' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления дат задачи');
  }
});

/**
 * @swagger
 * /api/tasks/statuses:
 *   get:
 *     summary: Справочник статусов задач (Выполнено, В процессе, В плане, Просрочено, Заморожено, Неактивно)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Массив {id, code, name}"
 */
router.get('/statuses', authMiddleware, async (req, res) => {
  try {
    res.json(await TaskRepository.getStatuses());
  } catch (e) {
    sendError(res, e, 'Ошибка получения статусов');
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}/status:
 *   patch:
 *     summary: Выставить статус задачи (только руководитель — право EXECUTE). Остальные участники проекта получают уведомление.
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [statusId]
 *             properties:
 *               statusId: { type: integer, example: 2 }
 *     responses:
 *       200: { description: Статус изменён }
 *       400: { description: Такого статуса не существует }
 *       403: { description: Недостаточно прав }
 *       404: { description: Задача не найдена }
 */
router.patch('/:taskId/status', authMiddleware, checkTaskAccess('EXECUTE'), async (req, res) => {
  try {
    const updated = await TaskRepository.updateStatus(req.params.taskId, req.body.statusId);
    if (!updated) return res.status(404).json({ message: 'Задача не найдена' });
    // Уведомление — побочный эффект: его сбой не должен отменять смену статуса
    try {
      const actor = await UserRepository.findById(req.user.id);
      await TaskRepository.notifyStatusChange(updated, actor);
    } catch (notifyError) {
      console.error('Не удалось создать уведомления о смене статуса:', notifyError);
    }
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка смены статуса задачи');
  }
});

/**
 * @swagger
 * /api/tasks/projects/{projectId}/search:
 *   get:
 *     summary: Плоский список задач проекта с фильтрами по тегам, статусам и времени
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *       - { in: query, name: tagIds, schema: { type: string, example: "1,2" }, description: "ID тегов задач через запятую" }
 *       - { in: query, name: tagMode, schema: { type: string, enum: [any, all], default: any }, description: "any — есть хотя бы один тег, all — все перечисленные" }
 *       - { in: query, name: statusIds, schema: { type: string, example: "2,4" }, description: "ID статусов через запятую" }
 *       - { in: query, name: from, schema: { type: string, example: "2026-03-01" }, description: "Задачи, заканчивающиеся не раньше этой даты" }
 *       - { in: query, name: to, schema: { type: string, example: "2026-06-30" }, description: "Задачи, начинающиеся не позже этой даты" }
 *     responses:
 *       200: { description: "Массив задач с полями status_id и tags" }
 */
router.get('/projects/:projectId/search', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    const ids = (value) =>
      String(value ?? '')
        .split(',')
        .filter((x) => x.trim() !== '')
        .map(Number);
    const tagIds = ids(req.query.tagIds);
    const statusIds = ids(req.query.statusIds);
    if ([...tagIds, ...statusIds].some((n) => !Number.isInteger(n))) {
      return res.status(400).json({ message: 'tagIds и statusIds — целые числа через запятую' });
    }
    const tasks = await TaskRepository.searchTasks(req.params.projectId, {
      tagIds,
      tagMode: req.query.tagMode === 'all' ? 'all' : 'any',
      statusIds,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(tasks);
  } catch (e) {
    sendError(res, e, 'Ошибка поиска задач');
  }
});

export default router;

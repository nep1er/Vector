import { Router } from 'express';
import { RoadmapRepository } from '../db/RoadmapRepository.js';
import { TodoRepository } from '../db/TodoRepository.js';
import { TaskRepository } from '../db/TaskRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

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
 *     summary: Создать под-этап RoadMap
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
 */
router.post('/projects/:projectId/roadmap', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, startDate, endDate, parentRoadmapId } = req.body;
    const stage = await RoadmapRepository.createRoadmapStage(
      projectId, title, startDate, endDate, parentRoadmapId
    );
    res.status(201).json(stage);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка создания этапа RoadMap' });
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
 *               - parentRoadmapId
 *             properties:
 *               title:
 *                 type: string
 *                 example: Разработка REST API роутов
 *               parentRoadmapId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Задача ToDo создана
 */
router.post('/projects/:projectId/todo', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, parentRoadmapId } = req.body;
    const todo = await TodoRepository.createTodoTask(projectId, title, parentRoadmapId);
    res.status(201).json(todo);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка создания ToDo задачи' });
  }
});

/**
 * @swagger
 * /api/tasks/projects/{projectId}/tree:
 *   get:
 *     summary: Получить дерево всех задач проекта (Рекурсивная выборка)
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
router.get('/projects/:projectId/tree', authMiddleware, async (req, res) => {
  try {
    const tree = await TaskRepository.getProjectTree(req.params.projectId);
    res.json(tree);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения дерева задач' });
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   delete:
 *     summary: Удалить задачу (RoadMap или ToDo) по ID
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
 */
router.delete('/:taskId', authMiddleware, async (req, res) => {
  try {
    const deleted = await TaskRepository.deleteTask(req.params.taskId);
    if (!deleted) {
      return res.status(404).json({ message: 'Задача не найдена' });
    }
    res.json({ message: 'Задача успешно удалена', id: req.params.taskId });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка удаления задачи' });
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}/title:
 *   patch:
 *     summary: Изменить название базовой задачи Task
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
 *       200: { description: Название Task изменено }
 */
router.patch('/:taskId/title', authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    const updated = await TaskRepository.updateTaskTitle(req.params.taskId, title);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления названия задачи' });
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
 */
router.patch('/:taskId/subtype-title', authMiddleware, async (req, res) => {
  try {
    const { type, title } = req.body;
    const updated = await TaskRepository.updateSubtypeTitle(req.params.taskId, type, title);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления названия подтипа' });
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}/dates:
 *   patch:
 *     summary: Изменить временные рамки (start_date / end_date) у задачи
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
 */
router.patch('/:taskId/dates', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const updated = await TaskRepository.updateTaskDates(req.params.taskId, startDate, endDate);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления дат задачи' });
  }
});

export default router;
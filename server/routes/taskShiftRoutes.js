import { Router } from 'express';
import { TaskShiftRepository, parseShift } from '../db/TaskShiftRepository.js';
import { TaskVisibilityRepository } from '../db/TaskVisibilityRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkProjectAccess, checkShiftAccess } from '../middleware/rbacMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();
const viewer = (req) => ({ userId: req.user.id, seeAll: req.userPermissions.includes('ADMIN') });

/**
 * @swagger
 * tags:
 *   name: Task Shifts
 *   description: "«Смещение сроков» на RoadMap и история смещений"
 * /api/task-shifts/projects/{projectId}/preview:
 *   post:
 *     summary: "Предпросмотр смещения (ничего не меняет). Нужно право EXECUTE"
 *     tags: [Task Shifts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roadmapId, fromDate, days]
 *             properties:
 *               roadmapId: { type: integer, description: "RoadMap, на уровне которой выполняется смещение" }
 *               fromDate: { type: string, format: date, description: "С какой даты" }
 *               days: { type: integer, description: "На сколько дней (отрицательное — раньше)" }
 *     responses:
 *       200:
 *         description: "{scope:{id,title}, items:[{id,title,type,old_start,old_end,new_start,new_end}], containers:[...]}"
 * /api/task-shifts/projects/{projectId}/apply:
 *   post:
 *     summary: "Выполнить смещение и записать его в историю (EXECUTE). Тело как у preview + comment"
 *     tags: [Task Shifts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     responses:
 *       201:
 *         description: Запись истории
 * /api/task-shifts/projects/{projectId}:
 *   get:
 *     summary: История смещений проекта (READ)
 *     tags: [Task Shifts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Список смещений, новые сверху
 * /api/task-shifts/{shiftId}:
 *   get:
 *     summary: Детали смещения — какие задачи и как изменились (READ)
 *     tags: [Task Shifts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: shiftId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: "{shift, items}"
 * /api/task-shifts/{shiftId}/undo:
 *   post:
 *     summary: "Отменить смещение (EXECUTE). Возвращает даты тем задачам, которые не менялись после смещения"
 *     tags: [Task Shifts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: shiftId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: "{id, restored, skipped}"
 */
router.post('/projects/:projectId/preview', authMiddleware, checkProjectAccess('EXECUTE'), async (req, res) => {
  try {
    const params = parseShift(req.body ?? {});
    res.json(await TaskShiftRepository.plan(Number(req.params.projectId), params, viewer(req)));
  } catch (e) {
    sendError(res, e, 'Ошибка расчёта смещения');
  }
});

router.post('/projects/:projectId/apply', authMiddleware, checkProjectAccess('EXECUTE'), async (req, res) => {
  try {
    const params = parseShift(req.body ?? {});
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.slice(0, 1000) : '';
    res.status(201).json(
      await TaskShiftRepository.apply(Number(req.params.projectId), params, { ...viewer(req), comment })
    );
  } catch (e) {
    sendError(res, e, 'Ошибка смещения сроков');
  }
});

router.get('/projects/:projectId', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    res.json(await TaskShiftRepository.history(Number(req.params.projectId)));
  } catch (e) {
    sendError(res, e, 'Ошибка получения истории');
  }
});

router.get('/:shiftId', authMiddleware, checkShiftAccess('READ'), async (req, res) => {
  try {
    const shift = await TaskShiftRepository.findShift(Number(req.params.shiftId));
    let items = await TaskShiftRepository.items(shift.id);
    if (!req.userPermissions.includes('ADMIN')) {
      // скрытые от пользователя задачи в деталях не показываем
      const keep = [];
      for (const it of items) {
        if (it.task_id === null || (await TaskVisibilityRepository.canSee(it.task_id, req.user.id))) keep.push(it);
      }
      items = keep;
    }
    res.json({ shift, items });
  } catch (e) {
    sendError(res, e, 'Ошибка получения смещения');
  }
});

router.post('/:shiftId/undo', authMiddleware, checkShiftAccess('EXECUTE'), async (req, res) => {
  try {
    res.json(await TaskShiftRepository.undo(Number(req.params.shiftId), req.user.id));
  } catch (e) {
    sendError(res, e, 'Ошибка отмены смещения');
  }
});

export default router;

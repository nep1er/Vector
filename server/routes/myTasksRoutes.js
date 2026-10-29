import { Router } from 'express';
import { MyTasksRepository } from '../db/MyTasksRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: My Tasks
 *   description: Вкладка «Задачи» — задачи и карточки текущего пользователя по проектам
 * /api/my-tasks:
 *   get:
 *     summary: "Мои задачи по проектам. Каждый элемент уже отнесён к группе bucket: soon (срок на подходе), current (текущие), overdue (просрочено)"
 *     tags: [My Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: soonDays, schema: { type: integer, default: 3 }, description: "За сколько дней до конца срока задача попадает в «Сроки на подходе»" }
 *     responses:
 *       200:
 *         description: "[{project:{id,title}, items:[{kind:'task'|'card', id, task_id, type, title, status_id, due_date, bucket, mine, targeted}]}]"
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const soonDays = Math.min(30, Math.max(1, Number(req.query.soonDays) || 3));
    res.json(await MyTasksRepository.forUser(req.user.id, { soonDays }));
  } catch (e) {
    sendError(res, e, 'Ошибка получения задач');
  }
});

export default router;

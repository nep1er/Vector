import { pool } from '../config/db.js';
import { RoleRepository } from '../db/RoleRepository.js';
import { TaskRepository } from '../db/TaskRepository.js';
import { sendError } from '../utils/httpError.js';

/**
 * Проверяет, что у пользователя есть право `requiredPermission` в проекте.
 * Право ADMIN даёт доступ ко всему. Права складываются в req.userPermissions.
 */
async function authorize(req, res, next, projectId, requiredPermission) {
  try {
    const id = Number(projectId);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: 'Некорректный ID проекта' });
    }

    const permissions = await RoleRepository.getUserPermissionsInProject(req.user.id, id);

    if (!permissions.includes(requiredPermission) && !permissions.includes('ADMIN')) {
      return res.status(403).json({
        message:
          permissions.length === 0
            ? 'Нет доступа к проекту'
            : `Недостаточно прав. Требуется право: ${requiredPermission}`,
      });
    }

    req.userPermissions = permissions;
    req.projectId = id;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка проверки прав доступа' });
  }
}

/** Для маршрутов вида /projects/:projectId/... */
export const checkProjectAccess = (requiredPermission) => (req, res, next) =>
  authorize(req, res, next, req.params.projectId ?? req.body?.projectId, requiredPermission);

/** Для маршрутов вида /tasks/:taskId/... — проект определяется по задаче */
export const checkTaskAccess = (requiredPermission) => async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ message: 'Некорректный ID задачи' });
    }
    const task = await TaskRepository.findById(taskId);
    if (!task) return res.status(404).json({ message: 'Задача не найдена' });
    return authorize(req, res, next, task.project_id, requiredPermission);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка проверки прав доступа' });
  }
};

/**
 * Фабрика для маршрутов, где в URL лежит id вложенного объекта (роль, карточка, папка...).
 * `sql` должен вернуть одну строку с колонкой project_id по параметру $1.
 */
const accessByParam = (paramName, sql, notFoundMessage, label) => (requiredPermission) =>
  async (req, res, next) => {
    try {
      const id = Number(req.params[paramName]);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ message: `Некорректный ID: ${label}` });
      }
      const result = await pool.query(sql, [id]);
      if (result.rows.length === 0) return res.status(404).json({ message: notFoundMessage });
      return authorize(req, res, next, result.rows[0].project_id, requiredPermission);
    } catch (error) {
      sendError(res, error, 'Ошибка проверки прав доступа');
    }
  };

/** /roles/:roleId/... */
export const checkRoleAccess = accessByParam(
  'roleId',
  'SELECT project_id FROM project_roles WHERE id = $1',
  'Роль не найдена',
  'роли'
);

/** /task-tags/:tagId */
export const checkTaskTagAccess = accessByParam(
  'tagId',
  'SELECT project_id FROM task_tag WHERE id = $1',
  'Тег не найден',
  'тега'
);

/** Проект карточки Канбана: карточка -> колонка -> ToDo-задача -> проект */
const CARD_PROJECT_JOIN = `
  FROM kanban_card c
  JOIN kanban_column col ON col.id = c.kanban_column_id
  JOIN task t ON t.id = col.todo_task_id`;

/** /kanban/cards/:cardId/... */
export const checkCardAccess = accessByParam(
  'cardId',
  `SELECT t.project_id ${CARD_PROJECT_JOIN} WHERE c.id = $1`,
  'Карточка не найдена',
  'карточки'
);

/** /kanban/comments/:commentId */
export const checkCommentAccess = accessByParam(
  'commentId',
  `SELECT t.project_id ${CARD_PROJECT_JOIN}
   JOIN card_comments cc ON cc.kanban_card_id = c.id
   WHERE cc.id = $1`,
  'Комментарий не найден',
  'комментария'
);

/** /storage/:storageId/... */
export const checkStorageAccess = accessByParam(
  'storageId',
  'SELECT project_id FROM project_storage WHERE id = $1',
  'Раздел хранилища не найден',
  'раздела'
);

/** /storage/files/:fileId */
export const checkStorageFileAccess = accessByParam(
  'fileId',
  `SELECT ps.project_id
   FROM storage_files sf
   JOIN project_storage ps ON ps.id = sf.project_storage_id
   WHERE sf.id = $1`,
  'Файл не найден',
  'файла'
);

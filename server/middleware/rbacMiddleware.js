import { pool } from '../config/db.js';
import { RoleRepository } from '../db/RoleRepository.js';
import { StorageRepository } from '../db/StorageRepository.js';
import { TaskRepository } from '../db/TaskRepository.js';
import { TaskVisibilityRepository } from '../db/TaskVisibilityRepository.js';
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
export const checkTaskAccess = (requiredPermission, idFrom = (req) => req.params.taskId) => async (req, res, next) => {
  try {
    const taskId = Number(idFrom(req));
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ message: 'Некорректный ID задачи' });
    }
    const task = await TaskRepository.findById(taskId);
    if (!task) return res.status(404).json({ message: 'Задача не найдена' });
    // Задача, скрытая от ролей пользователя, для него «не существует» (кроме ADMIN проекта)
    const afterAuth = async () => {
      try {
        if (!req.userPermissions.includes('ADMIN') &&
            !(await TaskVisibilityRepository.canSee(taskId, req.user.id))) {
          return res.status(404).json({ message: 'Задача не найдена' });
        }
        next();
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка проверки прав доступа' });
      }
    };
    return authorize(req, res, afterAuth, task.project_id, requiredPermission);
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

/** /task-shifts/:shiftId */
export const checkShiftAccess = accessByParam(
  'shiftId',
  'SELECT project_id FROM task_shift WHERE id = $1',
  'Смещение не найдено',
  'смещения'
);

/** Проект карточки Канбана: карточка -> колонка -> ToDo-задача -> проект */
const CARD_PROJECT_JOIN = `
  FROM kanban_card c
  JOIN kanban_column col ON col.id = c.kanban_column_id
  JOIN task t ON t.id = col.todo_task_id`;

/**
 * Как accessByParam, но SQL возвращает ещё и task_id (ToDo-задача): если ToDo скрыта
 * от ролей пользователя, объекты на её доске для него «не существуют» (кроме ADMIN).
 */
const accessByParamInTodo = (
  paramName,
  sql,
  notFoundMessage,
  label,
  canSee = (objectId, userId) => TaskVisibilityRepository.canSee(objectId, userId)
) => (requiredPermission) =>
  async (req, res, next) => {
    try {
      const id = Number(req.params[paramName]);
      if (!Number.isInteger(id)) return res.status(400).json({ message: `Некорректный ID: ${label}` });
      const found = await pool.query(sql, [id]);
      if (found.rows.length === 0) return res.status(404).json({ message: notFoundMessage });
      const { project_id: projectId, task_id: taskId } = found.rows[0];
      const afterAuth = async () => {
        try {
          if (!req.userPermissions.includes('ADMIN') && !(await canSee(taskId, req.user.id))) {
            return res.status(404).json({ message: notFoundMessage });
          }
          next();
        } catch (error) {
          sendError(res, error, 'Ошибка проверки прав доступа');
        }
      };
      return authorize(req, res, afterAuth, projectId, requiredPermission);
    } catch (error) {
      sendError(res, error, 'Ошибка проверки прав доступа');
    }
  };

/** /kanban/cards/:cardId/... */
export const checkCardAccess = accessByParamInTodo(
  'cardId',
  `SELECT t.project_id, t.id AS task_id ${CARD_PROJECT_JOIN} WHERE c.id = $1`,
  'Карточка не найдена',
  'карточки'
);

/** /kanban/columns/:columnId/... */
export const checkColumnAccess = accessByParamInTodo(
  'columnId',
  `SELECT t.project_id, t.id AS task_id FROM kanban_column col JOIN task t ON t.id = col.todo_task_id WHERE col.id = $1`,
  'Колонка не найдена',
  'колонки'
);

/** /kanban-tags/:tagId */
export const checkKanbanTagAccess = accessByParam(
  'tagId',
  'SELECT project_id FROM kanban_tag WHERE id = $1',
  'Тег не найден',
  'тега'
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

/** /storage/:storageId/... — хранилище, закрытое от ролей пользователя, для него «не существует» (кроме ADMIN) */
export const checkStorageAccess = accessByParamInTodo(
  'storageId',
  'SELECT project_id, id AS task_id FROM project_storage WHERE id = $1',
  'Раздел хранилища не найден',
  'раздела',
  (id, userId) => StorageRepository.canSee(id, userId)
);

/** /storage/files/:fileId */
export const checkStorageFileAccess = accessByParamInTodo(
  'fileId',
  `SELECT ps.project_id, ps.id AS task_id
   FROM storage_files sf
   JOIN project_storage ps ON ps.id = sf.project_storage_id
   WHERE sf.id = $1`,
  'Файл не найден',
  'файла',
  (id, userId) => StorageRepository.canSee(id, userId)
);

/**
 * api.ts — единый справочник REST API сервера Vector.
 *
 * Здесь описаны ВСЕ эндпоинты серверной части (auth, projects, tasks, kanban, roles, tags).
 * Страницы сайта не вызывают fetch напрямую — они только используют объект `api`.
 * Те же пути и тела запросов подходят для Desktop и Mobile клиентов.
 */
import type {
  AuthResponse,
  CardComment,
  CardFile,
  StorageFile,
  StorageFolder,
  KanbanColumn,
  Project,
  ProjectDetails,
  ProjectRole,
  KanbanTag,
  AccessRight,
  AppNotification,
  Invitation,
  Participant,
  TaskStatus,
  TaskTag,
  Task,
  TaskNode,
  User,
} from './types';

// В разработке пусто: запросы идут на тот же адрес, а Vite проксирует /api на сервер.
// В продакшене можно задать VITE_API_URL=https://api.example.com в .env
const BASE_URL: string = import.meta.env.VITE_API_URL ?? '';

// ---------------------------------------------------------------------------
// Токен
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'vector_token';

export const tokenStorage = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Путь вида /uploads/... превращает в полный адрес (для картинок, лежащих на сервере) */
export function assetUrl(path?: string | null): string | null {
  if (!path) return null;
  return /^https?:\/\//i.test(path) ? path : BASE_URL + path;
}

// ---------------------------------------------------------------------------
// Ошибки и базовый запрос
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Вызывается, когда сервер ответил 401 — AuthContext подписывается и разлогинивает. */
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const headers: Record<string, string> = { ...extraHeaders };
  const isBlob = body instanceof Blob; // файл отправляем как есть, остальное — как JSON
  if (isBlob) headers['Content-Type'] = (body as Blob).type || 'application/octet-stream';
  else if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = tokenStorage.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: isBlob ? (body as Blob) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте, что он запущен.');
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedHandler?.();
    throw new ApiError(res.status, data?.message ?? `Ошибка сервера (${res.status})`);
  }
  return data as T;
}

/** Заголовок с именем файла для загрузки (кириллица кодируется) */
const uploadHeaders = (file: File) => ({ 'X-File-Name': encodeURIComponent(file.name) });

/** Скачивание с авторизацией: тянем файл как blob и отдаём браузеру */
async function download(path: string, fileName: string): Promise<void> {
  const token = tokenStorage.get();
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте, что он запущен.');
  }
  if (!res.ok) {
    let message = `Ошибка сервера (${res.status})`;
    try {
      message = (await res.json()).message ?? message;
    } catch {
      /* не JSON */
    }
    throw new ApiError(res.status, message);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// AUTH  /api/auth
// ---------------------------------------------------------------------------
const auth = {
  register: (username: string, email: string, password: string) =>
    request<AuthResponse>('POST', '/api/auth/register', { username, email, password }),

  login: (email: string, password: string) =>
    request<AuthResponse>('POST', '/api/auth/login', { email, password }),

  me: () => request<User>('GET', '/api/auth/me'),

  updateUsername: (username: string) =>
    request<User>('PATCH', '/api/auth/profile/username', { username }),

  updateEmail: (email: string) => request<User>('PATCH', '/api/auth/profile/email', { email }),

  updatePassword: (oldPassword: string, newPassword: string) =>
    request<{ message: string }>('PATCH', '/api/auth/profile/password', { oldPassword, newPassword }),

  updateAvatar: (avatarUrl: string) =>
    request<User>('PATCH', '/api/auth/profile/avatar', { avatarUrl }),

  /** Загрузка картинки аватара (PNG/JPEG/WebP до 2 МБ) */
  uploadAvatar: (image: Blob) => request<User>('POST', '/api/auth/profile/avatar/upload', image),

  deleteAccount: () => request<{ message: string }>('DELETE', '/api/auth/account'),
};

// ---------------------------------------------------------------------------
// PROJECTS  /api/projects
// ---------------------------------------------------------------------------
const projects = {
  list: () => request<Project[]>('GET', '/api/projects'),

  get: (projectId: number) => request<ProjectDetails>('GET', `/api/projects/${projectId}`),

  create: (title: string, description?: string) =>
    request<Project>('POST', '/api/projects', { title, description }),

  update: (projectId: number, data: { title?: string; description?: string }) =>
    request<Project>('PATCH', `/api/projects/${projectId}`, data),

  remove: (projectId: number) =>
    request<{ message: string; id: string }>('DELETE', `/api/projects/${projectId}`),

  addParticipant: (projectId: number, userId: number) =>
    request<unknown>('POST', `/api/projects/${projectId}/participants`, { userId }),

  /** Участники с аватарами и ролями */
  participants: (projectId: number) =>
    request<Participant[]>('GET', `/api/projects/${projectId}/participants`),

  /** Сменить роль участника (делает её единственной), право ADMIN */
  addParticipantRole: (projectId: number, userId: number, roleId: number) =>
    request<{ id: number; name: string }[]>('POST', `/api/projects/${projectId}/participants/${userId}/roles`, {
      roleId,
    }),
  removeParticipantRole: (projectId: number, userId: number, roleId: number) =>
    request<{ id: number; name: string }[]>(
      'DELETE',
      `/api/projects/${projectId}/participants/${userId}/roles/${roleId}`
    ),
  setParticipantRole: (projectId: number, userId: number, roleId: number) =>
    request<unknown>('PATCH', `/api/projects/${projectId}/participants/${userId}/role`, { roleId }),

  /** Пригласить по e-mail / имени пользователя. Участник появится после принятия (роль «Наблюдатель») */
  invite: (projectId: number, identifier: string) =>
    request<Invitation>('POST', `/api/projects/${projectId}/invitations`, { identifier }),

  invitations: (projectId: number) =>
    request<Invitation[]>('GET', `/api/projects/${projectId}/invitations`),

  cancelInvitation: (projectId: number, invitationId: number) =>
    request<{ message: string }>('DELETE', `/api/projects/${projectId}/invitations/${invitationId}`),

  removeParticipant: (projectId: number, userId: number) =>
    request<{ message: string }>('DELETE', `/api/projects/${projectId}/participants/${userId}`),
};

// ---------------------------------------------------------------------------
// TASKS  /api/tasks   (RoadMap и ToDo)
// ---------------------------------------------------------------------------
const tasks = {
  /** Дерево всех задач проекта */
  tree: (projectId: number) => request<TaskNode[]>('GET', `/api/tasks/projects/${projectId}/tree`),

  createRoadmapStage: (
    projectId: number,
    data: { title: string; startDate?: string; endDate?: string; parentRoadmapId?: number | null },
  ) => request<Task>('POST', `/api/tasks/projects/${projectId}/roadmap`, data),

  createTodo: (
    projectId: number,
    title: string,
    parentRoadmapId: number,
    startDate?: string,
    endDate?: string,
  ) =>
    request<Task>('POST', `/api/tasks/projects/${projectId}/todo`, {
      title,
      parentRoadmapId,
      startDate,
      endDate,
    }),

  remove: (taskId: number) => request<{ message: string }>('DELETE', `/api/tasks/${taskId}`),

  updateTitle: (taskId: number, title: string) =>
    request<Task>('PATCH', `/api/tasks/${taskId}/title`, { title }),

  updateSubtypeTitle: (taskId: number, type: 'ROADMAP' | 'TODO', title: string) =>
    request<unknown>('PATCH', `/api/tasks/${taskId}/subtype-title`, { type, title }),

  updateDates: (taskId: number, startDate?: string, endDate?: string) =>
    request<Task>('PATCH', `/api/tasks/${taskId}/dates`, { startDate, endDate }),

  /** Роли, которым видна задача (пусто = все) */
  visibility: (taskId: number) =>
    request<{ id: number; name: string }[]>('GET', `/api/tasks/${taskId}/visibility`),

  /** Задать видимость: roleIds = [] означает «Все» (право EXECUTE) */
  setVisibility: (taskId: number, roleIds: number[]) =>
    request<{ id: number; name: string }[]>('PUT', `/api/tasks/${taskId}/visibility`, { roleIds }),

  /** Справочник статусов (Выполнено, В процессе, ...) */
  statuses: () => request<TaskStatus[]>('GET', '/api/tasks/statuses'),

  /** Сменить статус — только руководитель (право EXECUTE) */
  setStatus: (taskId: number, statusId: number) =>
    request<Task>('PATCH', `/api/tasks/${taskId}/status`, { statusId }),
};

// ---------------------------------------------------------------------------
// KANBAN  /api/kanban
// ---------------------------------------------------------------------------
const kanban = {
  getBoard: (todoTaskId: number) => request<KanbanColumn[]>('GET', `/api/kanban/todo/${todoTaskId}/board`),

  createColumn: (todoTaskId: number, title: string, position?: number) =>
    request<{ id: number }>('POST', '/api/kanban/columns', { todoTaskId, title, position }),

  /** title — переименование, position (с 1) — новое место колонки */
  updateColumn: (columnId: number, data: { title?: string; position?: number }) =>
    request<unknown>('PATCH', `/api/kanban/columns/${columnId}`, data),

  /** Если в колонке есть карточки: moveTo — перенести их в другую колонку, withCards — удалить вместе с ними */
  deleteColumn: (columnId: number, opts: { moveTo?: number; withCards?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.moveTo != null) q.set('moveTo', String(opts.moveTo));
    if (opts.withCards) q.set('withCards', 'true');
    const qs = q.toString();
    return request<unknown>('DELETE', `/api/kanban/columns/${columnId}${qs ? `?${qs}` : ''}`);
  },

  createCard: (data: {
    columnId: number;
    title: string;
    description?: string;
    workDate?: string | null;
    tagIds?: number[];
    participantIds?: number[];
  }) => request<{ id: number }>('POST', '/api/kanban/cards', data),

  /** index — место в колонке (с 0) */
  moveCard: (cardId: number, targetColumnId: number, index?: number) =>
    request<unknown>('PATCH', `/api/kanban/cards/${cardId}/move`, { targetColumnId, index }),

  updateCardDetails: (
    cardId: number,
    data: { title?: string; description?: string | null; workDate?: string | null },
  ) => request<unknown>('PATCH', `/api/kanban/cards/${cardId}/details`, data),

  updateCardStatus: (cardId: number, cardStatusId: number) =>
    request<unknown>('PATCH', `/api/kanban/cards/${cardId}/status`, { cardStatusId }),

  deleteCard: (cardId: number) => request<{ message: string }>('DELETE', `/api/kanban/cards/${cardId}`),

  cardFiles: (cardId: number) => request<CardFile[]>('GET', `/api/kanban/cards/${cardId}/files`),

  /** Загрузка файла на сервер и прикрепление к карточке */
  uploadCardFile: (cardId: number, file: File) =>
    request<CardFile>('POST', `/api/kanban/cards/${cardId}/files/upload`, file, uploadHeaders(file)),

  /** Внешняя ссылка (GitHub, Figma…) */
  addCardLink: (cardId: number, url: string) =>
    request<CardFile>('POST', `/api/kanban/cards/${cardId}/files`, { url }),

  downloadCardFile: (fileId: number, name: string) => download(`/api/kanban/files/${fileId}/download`, name),

  deleteFile: (fileId: number) => request<{ message: string }>('DELETE', `/api/kanban/files/${fileId}`),

  addCardParticipant: (cardId: number, projectParticipantId: number) =>
    request<unknown>('POST', `/api/kanban/cards/${cardId}/participants`, { projectParticipantId }),

  removeCardParticipant: (cardId: number, projectParticipantId: number) =>
    request<unknown>('DELETE', `/api/kanban/cards/${cardId}/participants`, { projectParticipantId }),

  addCardTag: (cardId: number, tagId: number) => request<unknown>('POST', `/api/kanban/cards/${cardId}/tags/${tagId}`),

  removeCardTag: (cardId: number, tagId: number) =>
    request<unknown>('DELETE', `/api/kanban/cards/${cardId}/tags/${tagId}`),

  comments: (cardId: number) => request<CardComment[]>('GET', `/api/kanban/cards/${cardId}/comments`),

  addComment: (cardId: number, content: string) =>
    request<CardComment>('POST', `/api/kanban/cards/${cardId}/comments`, { content }),

  updateComment: (commentId: number, content: string) =>
    request<CardComment>('PATCH', `/api/kanban/comments/${commentId}`, { content }),

  deleteComment: (commentId: number) => request<unknown>('DELETE', `/api/kanban/comments/${commentId}`),
};

// ---------------------------------------------------------------------------
// ROLES (RBAC)  /api/roles
// ---------------------------------------------------------------------------
const roles = {
  listByProject: (projectId: number) =>
    request<ProjectRole[]>('GET', `/api/roles/project/${projectId}`),

  create: (projectId: number, name: string) =>
    request<ProjectRole>('POST', `/api/roles/project/${projectId}`, { name }),

  rename: (roleId: number, name: string) =>
    request<ProjectRole>('PATCH', `/api/roles/${roleId}/name`, { name }),

  /** accessRightId: 1 = READ, 2 = WRITE, 3 = EXECUTE, 4 = ADMIN */
  addRight: (roleId: number, accessRightId: number) =>
    request<unknown>('POST', `/api/roles/${roleId}/rights`, { accessRightId }),

  removeRight: (roleId: number, accessRightId: number) =>
    request<unknown>('DELETE', `/api/roles/${roleId}/rights`, { accessRightId }),

  remove: (roleId: number) => request<{ message: string }>('DELETE', `/api/roles/${roleId}`),

  accessRights: () => request<AccessRight[]>('GET', '/api/roles/access-rights'),

  assignToParticipant: (participantId: number, roleId: number) =>
    request<unknown>('POST', '/api/roles/assign-to-participant', { participantId, roleId }),
};

// ---------------------------------------------------------------------------
// KANBAN TAGS  /api/kanban-tags   (теги карточек Канбана)
// ---------------------------------------------------------------------------
const kanbanTags = {
  listByProject: (projectId: number) =>
    request<KanbanTag[]>('GET', `/api/kanban-tags/project/${projectId}`),

  create: (projectId: number, name: string, color?: string) =>
    request<KanbanTag>('POST', `/api/kanban-tags/project/${projectId}`, { name, color }),

  update: (tagId: number, data: { name?: string; colorCode?: string }) =>
    request<KanbanTag>('PATCH', `/api/kanban-tags/${tagId}/details`, data),

  remove: (tagId: number) => request<{ message: string }>('DELETE', `/api/kanban-tags/${tagId}`),

  applyToCard: (cardId: number, tagId: number) =>
    request<unknown>('POST', '/api/kanban-tags/apply', { cardId, tagId }),

  removeFromCard: (cardId: number, tagId: number) =>
    request<unknown>('DELETE', '/api/kanban-tags/remove-from-card', { cardId, tagId }),
};

// ---------------------------------------------------------------------------
// TASK TAGS  /api/task-tags   (теги задач RoadMap; одна задача — много тегов)
// ---------------------------------------------------------------------------
const taskTags = {
  listByProject: (projectId: number) =>
    request<TaskTag[]>('GET', `/api/task-tags/project/${projectId}`),

  create: (projectId: number, name: string, color?: string) =>
    request<TaskTag>('POST', `/api/task-tags/project/${projectId}`, { name, color }),

  update: (tagId: number, data: { name?: string; colorCode?: string }) =>
    request<TaskTag>('PATCH', `/api/task-tags/${tagId}`, data),

  remove: (tagId: number) => request<{ message: string }>('DELETE', `/api/task-tags/${tagId}`),

  forTask: (taskId: number) => request<TaskTag[]>('GET', `/api/task-tags/tasks/${taskId}`),

  /** Полностью заменяет набор тегов задачи */
  setForTask: (taskId: number, tagIds: number[]) =>
    request<TaskTag[]>('PUT', `/api/task-tags/tasks/${taskId}`, { tagIds }),
};

// ---------------------------------------------------------------------------
// NOTIFICATIONS  /api/notifications,  INVITATIONS  /api/invitations
// ---------------------------------------------------------------------------
const notifications = {
  list: () => request<AppNotification[]>('GET', '/api/notifications'),
  unreadCount: () => request<{ count: number }>('GET', '/api/notifications/unread-count'),
  markRead: (id: number) => request<unknown>('PATCH', `/api/notifications/${id}/read`),
  readAll: () => request<unknown>('POST', '/api/notifications/read-all'),
  remove: (id: number) => request<unknown>('DELETE', `/api/notifications/${id}`),
};

const invitations = {
  /** Принять приглашение → пользователь становится участником с ролью «Наблюдатель» */
  accept: (invitationId: number) =>
    request<unknown>('POST', `/api/invitations/${invitationId}/accept`),
  decline: (invitationId: number) =>
    request<unknown>('POST', `/api/invitations/${invitationId}/decline`),
};

const friends = {
  accept: (friendId: number) => request<unknown>('POST', `/api/friends/${friendId}/accept`),
  remove: (friendId: number) => request<unknown>('DELETE', `/api/friends/${friendId}`),
};

// ---------------------------------------------------------------------------
// STORAGE  /api/storage   (хранилища проекта: файлы на сервере и ссылки)
// ---------------------------------------------------------------------------
const storage = {
  list: (projectId: number) => request<StorageFolder[]>('GET', `/api/storage/project/${projectId}`),

  createFolder: (projectId: number, name: string, description?: string) =>
    request<StorageFolder>('POST', `/api/storage/project/${projectId}`, { name, description }),

  updateFolder: (storageId: number, data: { name?: string; description?: string }) =>
    request<StorageFolder>('PATCH', `/api/storage/${storageId}`, data),

  deleteFolder: (storageId: number) => request<unknown>('DELETE', `/api/storage/${storageId}`),

  uploadFile: (storageId: number, file: File) =>
    request<StorageFile>('POST', `/api/storage/${storageId}/upload`, file, uploadHeaders(file)),

  addLink: (storageId: number, name: string, url: string) =>
    request<StorageFile>('POST', `/api/storage/${storageId}/files`, { resourceType: 'LINK', name, resourcePath: url }),

  updateFile: (fileId: number, data: { name?: string; resourcePath?: string }) =>
    request<StorageFile>('PATCH', `/api/storage/files/${fileId}`, data),

  deleteFile: (fileId: number) => request<unknown>('DELETE', `/api/storage/files/${fileId}`),

  download: (fileId: number, name: string) => download(`/api/storage/files/${fileId}/download`, name),
};

export const api = {
  auth,
  projects,
  tasks,
  kanban,
  roles,
  kanbanTags,
  taskTags,
  notifications,
  invitations,
  friends,
  storage,
};

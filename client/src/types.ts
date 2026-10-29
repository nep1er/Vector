// Типы описывают то, что возвращает сервер (поля в snake_case — как в PostgreSQL).

export interface User {
  id: number;
  username: string;
  email: string;
  avatar_url?: string | null;
  created_at?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Project {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  /** картинка проекта (NULL — показываем первую букву названия) */
  avatar_url?: string | null;
  /** id участника в project_participants (приходит только в списке проектов) */
  participant_id?: number;
}

/** Проект + права текущего пользователя в нём (READ, WRITE, EXECUTE, ADMIN) */
export interface ProjectDetails extends Project {
  permissions: string[];
}

export type TaskType = 'ROADMAP' | 'TODO';

export interface Task {
  id: number;
  project_id: number;
  type: TaskType;
  title: string;
  description?: string | null;
  start_date: string | null;
  end_date: string | null;
  parent_roadmap_id: number | null;
  created_at?: string;
  /** Статус из справочника task_status (1..6), выставляет руководитель */
  status_id: number;
  /** Теги задач (task_tag) */
  tags: TaskTag[];
  /** Роли, которым видна задача; пустой массив = видна всем */
  visible_roles: { id: number; name: string }[];
}

/** Узел дерева задач: /api/tasks/projects/:id/tree возвращает массив корней */
export interface TaskNode extends Task {
  children: TaskNode[];
}

export interface KanbanCardTag {
  id: number;
  name: string;
  color_code: string;
}

export interface KanbanCardPerson {
  participant_id: number;
  user_id: number;
  username: string;
  avatar_url: string | null;
}

export interface KanbanCard {
  id: number;
  kanban_column_id: number;
  title: string;
  description: string | null;
  /** 0 = не выполнена, 1 = выполнена */
  status_id: number;
  work_date: string | null;
  position: number;
  created_at: string;
  tags: KanbanCardTag[];
  participants: KanbanCardPerson[];
  comments_count: number;
  files_count: number;
}

export interface KanbanColumn {
  column_id: number;
  column_title: string;
  /** цвет шапки #RRGGBB или null (по умолчанию) */
  column_color: string | null;
  position: number;
  cards: KanbanCard[];
}

export interface CardComment {
  id: number;
  kanban_card_id: number;
  content: string;
  created_at: string;
  updated_at: string | null;
  author_id: number | null;
  author_name: string | null;
  author_avatar_url: string | null;
}

export interface CardFile {
  id: number;
  kanban_card_id: number;
  uploaded_at: string;
  /** upload — файл на сервере, link — ссылка, path — устаревший путь */
  kind: 'upload' | 'link' | 'path';
  name: string;
  url: string | null;
  size: number | null;
}

/** Запись раздела хранилища: загруженный файл (FILE) или ссылка (LINK) */
export interface StorageFile {
  id: number;
  name: string;
  resource_type: 'FILE' | 'LINK';
  /** только у LINK — адрес; у FILE путь на диске наружу не отдаётся */
  resource_path?: string;
  size?: number | null;
  uploaded_by: number | null;
  uploader_name?: string | null;
  created_at: string;
}

export interface StorageFolder {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  created_at: string;
  /** Роли, которым видно хранилище; пустой список — видно всем */
  visible_roles: { id: number; name: string }[];
  files: StorageFile[];
}

export interface ProjectRole {
  id: number;
  project_id: number;
  name: string;
  rights: string[] | null;
}

/** Тег карточек Канбана (kanban_tag) */
export interface KanbanTag {
  id: number;
  project_id: number;
  name: string;
  color_code: string;
}

/** Тег задач RoadMap/ToDo (task_tag) — независим от тегов Канбана */
export interface TaskTag {
  id: number;
  project_id?: number;
  name: string;
  color_code: string;
  /** сколько задач использует тег (только в списке тегов проекта) */
  tasks_count?: number;
}

export interface TaskStatus {
  id: number;
  code: 'DONE' | 'IN_PROGRESS' | 'PLANNED' | 'OVERDUE' | 'FROZEN' | 'INACTIVE';
  name: string;
}

export interface AccessRight {
  id: number;
  name: string;
}

export interface Participant {
  participant_id: number;
  user_id: number;
  username: string;
  email: string;
  avatar_url: string | null;
  roles: { id: number; name: string }[];
}

export interface Invitation {
  id: number;
  created_at: string;
  invitee: string;
  invitee_email: string;
  invitee_avatar_url: string | null;
  inviter_name: string;
}

export type NotificationType =
  | 'PROJECT_INVITATION'
  | 'CARD_COMMENT'
  | 'TASK_STATUS_CHANGED'
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED';

export interface AppNotification {
  id: number;
  type: NotificationType;
  payload: Record<string, any>;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  /** только для PROJECT_INVITATION: PENDING / ACCEPTED / DECLINED ... */
  invitation_status: string | null;
  category: NotificationCategory;
  hidden: boolean;
  /** только для FRIEND_REQUEST: актуальное состояние заявки */
  friend_state: 'PENDING' | 'ACCEPTED' | 'GONE' | null;
}

/** INVITES — приглашения; ROADMAP — изменения на доске; TODO — изменения в ToDo; CARD — карточки, где вы исполнитель */
export type NotificationCategory = 'INVITES' | 'ROADMAP' | 'TODO' | 'CARD';
export interface NotificationSetting {
  category: NotificationCategory;
  hidden: boolean;
}

/** Элемент вкладки «Задачи» (GET /api/my-tasks) */
export type MyTaskBucket = 'soon' | 'current' | 'overdue';

export interface MyTaskItem {
  kind: 'task' | 'card';
  id: number;
  /** id ToDo/RoadMap-задачи; для карточки — id её ToDo */
  task_id: number;
  type: 'ROADMAP' | 'TODO' | 'CARD';
  title: string;
  status_id: number | null;
  due_date: string | null;
  bucket: MyTaskBucket;
  /** Вы — исполнитель карточки */
  mine: boolean;
  /** Задача открыта именно вашим ролям */
  targeted: boolean;
  parent_title?: string;
  column_title?: string;
}

export interface MyTasksProject {
  project: { id: number; title: string };
  items: MyTaskItem[];
}

// ---- Смещение сроков ----
export interface ShiftItem {
  id: number;
  task_id: number | null;
  task_title: string;
  task_type: string;
  is_container: boolean;
  old_start: string | null;
  old_end: string | null;
  new_start: string | null;
  new_end: string | null;
}

export interface ShiftPlanItem {
  id: number;
  title: string;
  type: string;
  old_start: string | null;
  old_end: string | null;
  new_start: string | null;
  new_end: string | null;
  is_container: boolean;
}

export interface ShiftPlan {
  scope: { id: number; title: string };
  items: ShiftPlanItem[];
  containers: ShiftPlanItem[];
}

export interface ShiftRecord {
  id: number;
  roadmap_id: number | null;
  roadmap_title: string;
  from_date: string;
  shift_days: number;
  tasks_count: number;
  comment: string | null;
  created_at: string;
  created_by_name: string | null;
  reverted_at: string | null;
  reverted_by_name: string | null;
}

// ---- Друзья ----
export interface FriendRow {
  id: number;
  status: 'PENDING' | 'ACCEPTED';
  direction: 'INCOMING' | 'OUTGOING';
  created_at: string;
  accepted_at: string | null;
  user_id: number;
  username: string;
  email: string;
  avatar_url: string | null;
}

// ---- Дашборд руководителя ----
export interface DashTask {
  id: number;
  title: string;
  type: 'ROADMAP' | 'TODO';
  status_id: number;
  end_date: string | null;
  parent_roadmap_id: number | null;
  days_late?: number;
}
export interface DashboardData {
  generated_at: string;
  tasks: { total: number; roadmaps: number; todos: number; done: number; overdue: number; no_dates: number; by_status: Record<string, number> };
  overdue_list: DashTask[];
  soon_list: DashTask[];
  weeks: { start: string; done: number; open: number }[];
  cards: { total: number; done: number; overdue: number; unassigned: number };
  people: { id: number; user_id: number; username: string; avatar_url: string | null; assigned: number; done: number; overdue: number }[];
  todo_progress: (DashTask & { cards_total: number; cards_done: number })[];
  shifts: { count: number; days: number; tasks: number; last_at: string | null };
}

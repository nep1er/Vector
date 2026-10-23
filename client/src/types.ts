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

export interface KanbanCard {
  id: number;
  title: string;
  description: string | null;
  status_id: number; // 0 = не выполнена, 1 = выполнена
  created_at: string;
}

export interface KanbanColumn {
  column_id: number;
  column_title: string;
  position: number;
  cards: KanbanCard[] | null;
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
}

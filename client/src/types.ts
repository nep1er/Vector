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

export interface ProjectTag {
  id: number;
  project_id: number;
  name: string;
  color_code: string;
}

-- ============================================================================
-- Vector: миграция 004 (PostgreSQL)
-- Видимость задач по ролям проекта.
--   Нет строк в task_role_visibility  -> задача видна ВСЕМ участникам проекта.
--   Есть строки                       -> задачу видят только участники с одной из этих ролей
--                                        (и администраторы проекта — право ADMIN).
-- Скрытая RoadMap-задача скрывает и все вложенные задачи (проверяется в приложении).
-- Скрипт идемпотентный. Требует 003 (uk_task_id_project).
-- Запуск: pgAdmin 4 -> Query Tool -> F5.
-- ============================================================================

BEGIN;

-- Цель для составного FK: роль и задача обязаны быть из одного проекта
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'project_roles'::regclass AND conname = 'uk_project_roles_id_project'
    ) THEN
        ALTER TABLE project_roles ADD CONSTRAINT uk_project_roles_id_project UNIQUE (id, project_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'task'::regclass AND conname = 'uk_task_id_project'
    ) THEN
        ALTER TABLE task ADD CONSTRAINT uk_task_id_project UNIQUE (id, project_id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_role_visibility (
    task_id         bigint NOT NULL,
    project_role_id bigint NOT NULL,
    project_id      bigint NOT NULL,                       -- проект задачи и роли
    PRIMARY KEY (task_id, project_role_id),
    FOREIGN KEY (task_id, project_id)
        REFERENCES task(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (project_role_id, project_id)
        REFERENCES project_roles(id, project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_role_visibility_role ON task_role_visibility (project_role_id);

COMMIT;

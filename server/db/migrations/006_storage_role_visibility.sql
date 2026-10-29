-- ============================================================================
-- Vector: миграция 006 (PostgreSQL)
-- Видимость хранилищ по ролям проекта.
--   Нет строк в storage_role_visibility -> хранилище видно ВСЕМ участникам проекта.
--   Есть строки                         -> видно только участникам с одной из этих ролей
--                                          (ролей у участника может быть несколько) и администраторам.
-- Скрипт идемпотентный. Запуск: pgAdmin 4 -> Query Tool -> F5.
-- ============================================================================

BEGIN;

-- Цель для составного FK: хранилище и роль обязаны быть из одного проекта
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'project_storage'::regclass AND conname = 'uk_project_storage_id_project'
    ) THEN
        ALTER TABLE project_storage ADD CONSTRAINT uk_project_storage_id_project UNIQUE (id, project_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'project_roles'::regclass AND conname = 'uk_project_roles_id_project'
    ) THEN
        ALTER TABLE project_roles ADD CONSTRAINT uk_project_roles_id_project UNIQUE (id, project_id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS storage_role_visibility (
    project_storage_id bigint NOT NULL,
    project_role_id    bigint NOT NULL,
    project_id         bigint NOT NULL,                    -- проект хранилища и роли
    PRIMARY KEY (project_storage_id, project_role_id),
    FOREIGN KEY (project_storage_id, project_id)
        REFERENCES project_storage(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (project_role_id, project_id)
        REFERENCES project_roles(id, project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storage_role_visibility_role ON storage_role_visibility (project_role_id);

COMMENT ON TABLE storage_role_visibility IS 'Роли, которым видно хранилище. Нет строк — видно всем участникам проекта.';

COMMIT;

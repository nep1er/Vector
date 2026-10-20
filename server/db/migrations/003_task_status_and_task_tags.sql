-- ============================================================================
-- Vector: миграция 003 (PostgreSQL)
-- Статусы задач RoadMap + теги задач (независимы от тегов Канбана).
--
-- Скрипт идемпотентный: его можно запускать повторно, и он работает как после
-- 002_extended_schema.sql (где task_tag уже создан), так и без неё.
-- Запуск: pgAdmin 4 -> Query Tool -> вставить -> F5.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. СПРАВОЧНИК СТАТУСОВ ЗАДАЧ
-- Статус выставляет руководитель (право EXECUTE), контролируется на сервере.
-- id фиксированы, порядок id = порядок в выпадающем списке.
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_status (
    id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code varchar(20) NOT NULL UNIQUE,   -- стабильный код для клиентов (цвета, фильтры)
    name varchar(30) NOT NULL UNIQUE    -- название для интерфейса
);

INSERT INTO task_status (id, code, name) OVERRIDING SYSTEM VALUE
VALUES (1, 'DONE',        'Выполнено'),
       (2, 'IN_PROGRESS', 'В процессе'),
       (3, 'PLANNED',     'В плане'),
       (4, 'OVERDUE',     'Просрочено'),
       (5, 'FROZEN',      'Заморожено'),
       (6, 'INACTIVE',    'Неактивно')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('task_status', 'id'),
              GREATEST(6, (SELECT max(id) FROM task_status)));


-- ============================================================================
-- 2. task.status_id (FK на справочник)
-- Существующие и новые задачи получают 3 = «В плане».
-- ============================================================================

ALTER TABLE task
    ADD COLUMN IF NOT EXISTS status_id integer NOT NULL DEFAULT 3
        CONSTRAINT task_status_id_fkey REFERENCES task_status(id);

-- Фильтры RoadMap: по статусу и по времени внутри проекта
CREATE INDEX IF NOT EXISTS idx_task_status ON task (project_id, status_id);
CREATE INDEX IF NOT EXISTS idx_task_dates  ON task (project_id, start_date, end_date);


-- ============================================================================
-- 3. ТЕГИ ЗАДАЧ (task_tag) и их применение (task_tag_applies)
-- Одна задача — много тегов. Теги принадлежат проекту; составные FK через
-- project_id не дают повесить тег одного проекта на задачу другого.
-- Не пересекается с kanban_tag / kanban_tags_applies.
-- ============================================================================

-- Цель для составного FK из task_tag_applies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'task'::regclass AND conname = 'uk_task_id_project'
    ) THEN
        ALTER TABLE task ADD CONSTRAINT uk_task_id_project UNIQUE (id, project_id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_tag (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL
               REFERENCES project(id) ON DELETE CASCADE,
    name       varchar(50) NOT NULL,
    color_code varchar(7) NOT NULL DEFAULT '#808080',
    CONSTRAINT uk_task_tag UNIQUE (project_id, name),
    CONSTRAINT uk_task_tag_id_project UNIQUE (id, project_id),
    CONSTRAINT chk_task_tag_color CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE IF NOT EXISTS task_tag_applies (
    task_id     bigint NOT NULL,
    task_tag_id bigint NOT NULL,
    project_id  bigint NOT NULL,                        -- проект задачи и тега
    PRIMARY KEY (task_id, task_tag_id),
    FOREIGN KEY (task_id, project_id)
        REFERENCES task(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (task_tag_id, project_id)
        REFERENCES task_tag(id, project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_tag_applies_tag ON task_tag_applies (task_tag_id);

COMMIT;

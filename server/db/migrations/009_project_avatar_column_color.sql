-- ============================================================================
-- Vector: миграция 009 (PostgreSQL)
--   project.avatar_url   — аватарка проекта (NULL = показываем первую букву названия)
--   kanban_column.color  — цвет шапки колонки ToDo (#RRGGBB, NULL = по умолчанию)
-- Идемпотентно. Запуск: pgAdmin 4 -> Query Tool -> F5.
-- ============================================================================
BEGIN;

ALTER TABLE project ADD COLUMN IF NOT EXISTS avatar_url varchar(512);

ALTER TABLE kanban_column ADD COLUMN IF NOT EXISTS color varchar(7);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_kanban_column_color') THEN
        ALTER TABLE kanban_column
            ADD CONSTRAINT ck_kanban_column_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
    END IF;
END $$;

COMMIT;

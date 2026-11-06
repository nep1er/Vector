-- ============================================================================
-- Vector: миграция 011 (PostgreSQL) — собственное хранилище данных расширений
--   extension_data — пары (коллекция, ключ) -> JSON в пределах «проект + расширение».
--   Расширение не получает доступа к основным таблицам: только к своим строкам.
--   Ограничения (размер значения, число строк) проверяет сервер.
-- Скрипт идемпотентен.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS extension_data (
    project_id   bigint      NOT NULL REFERENCES project(id)   ON DELETE CASCADE,
    extension_id bigint      NOT NULL REFERENCES extension(id) ON DELETE CASCADE,
    collection   varchar(32) NOT NULL,
    key          varchar(64) NOT NULL,
    value        jsonb       NOT NULL,
    updated_by   bigint      REFERENCES users(id) ON DELETE SET NULL,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, extension_id, collection, key),
    CONSTRAINT chk_extension_data_collection CHECK (collection ~ '^[a-z][a-z0-9_]{0,31}$'),
    CONSTRAINT chk_extension_data_key CHECK (key ~ '^[A-Za-z0-9_.:-]{1,64}$')
);

COMMIT;

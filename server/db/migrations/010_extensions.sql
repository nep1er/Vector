-- ============================================================================
-- Vector: миграция 010 (PostgreSQL) — система расширений
--   platform_roles      — глобальные роли платформы (модераторы). Администратор платформы задаётся
--                         переменной окружения PLATFORM_ADMIN_EMAILS и в таблице не хранится.
--   extension           — расширение (slug из манифеста, автор, статус ACTIVE/REMOVED)
--   extension_version   — версия расширения: манифест, хэш пакета, результат проверки, модерация
--   extension_ban       — бан автора ТОЛЬКО в части расширений (аккаунт и проекты не затрагиваются)
--   extension_report    — жалобы пользователей
--   moderation_log      — журнал действий модераторов
--   user_extension      — библиотека расширений пользователя
--   project_extension   — установка в проект: версия, выданные права, включено/выключено
--   extension_audit     — журнал вызовов расширений в проекте (через мост SDK)
-- Идемпотентно. Запуск: pgAdmin 4 -> Query Tool -> F5.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS platform_roles (
    user_id    bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role       varchar(20) NOT NULL CHECK (role IN ('MODERATOR')),
    granted_by bigint REFERENCES users(id) ON DELETE SET NULL,
    granted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extension (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug           varchar(48) NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,47}$'),
    author_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           varchar(80) NOT NULL,
    summary        varchar(300) NOT NULL DEFAULT '',
    status         varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
    removed_by     bigint REFERENCES users(id) ON DELETE SET NULL,
    removed_reason text,
    removed_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extension_version (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    extension_id bigint NOT NULL REFERENCES extension(id) ON DELETE CASCADE,
    version      varchar(32) NOT NULL,
    manifest     jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
    warnings     jsonb NOT NULL DEFAULT '[]'::jsonb,
    sha256       char(64) NOT NULL,
    size_bytes   integer NOT NULL,
    file_count   integer NOT NULL,
    status       varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    uploaded_by  bigint REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by  bigint REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at  timestamptz,
    review_note  text,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_extension_version UNIQUE (extension_id, version)
);

CREATE TABLE IF NOT EXISTS extension_ban (
    user_id   bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reason    text NOT NULL,
    banned_by bigint REFERENCES users(id) ON DELETE SET NULL,
    banned_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extension_report (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    extension_id bigint NOT NULL REFERENCES extension(id) ON DELETE CASCADE,
    reporter_id  bigint REFERENCES users(id) ON DELETE SET NULL,
    reason       text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at  timestamptz,
    resolved_by  bigint REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS moderation_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id    bigint REFERENCES users(id) ON DELETE SET NULL,
    actor_name  varchar(100) NOT NULL,
    action      varchar(40) NOT NULL,
    target_type varchar(20) NOT NULL,
    target_id   bigint,
    target_name varchar(200),
    reason      text,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_extension (
    user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    extension_id bigint NOT NULL REFERENCES extension(id) ON DELETE CASCADE,
    added_at     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, extension_id)
);

CREATE TABLE IF NOT EXISTS project_extension (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id          bigint NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    extension_id        bigint NOT NULL REFERENCES extension(id) ON DELETE CASCADE,
    version_id          bigint NOT NULL REFERENCES extension_version(id) ON DELETE CASCADE,
    granted_permissions text[] NOT NULL DEFAULT '{}',
    enabled             boolean NOT NULL DEFAULT true,
    installed_by        bigint REFERENCES users(id) ON DELETE SET NULL,
    installed_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_project_extension UNIQUE (project_id, extension_id)
);

CREATE TABLE IF NOT EXISTS extension_audit (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id   bigint NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    extension_id bigint NOT NULL REFERENCES extension(id) ON DELETE CASCADE,
    user_id      bigint REFERENCES users(id) ON DELETE SET NULL,
    method       varchar(60) NOT NULL,
    ok           boolean NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_extension_author ON extension (author_id);
CREATE INDEX IF NOT EXISTS idx_extension_version_status ON extension_version (status, created_at);
CREATE INDEX IF NOT EXISTS idx_project_extension_project ON project_extension (project_id);
CREATE INDEX IF NOT EXISTS idx_extension_report_open ON extension_report (created_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_extension_audit_project ON extension_audit (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_created ON moderation_log (created_at DESC);

-- Новые типы уведомлений
INSERT INTO notification_type (type) VALUES ('EXTENSION_DISABLED'), ('EXTENSION_BAN'), ('EXTENSION_REVIEW')
ON CONFLICT DO NOTHING;

-- Пятая категория уведомлений — системные (расширения и модерация)
ALTER TABLE notification_settings DROP CONSTRAINT IF EXISTS notification_settings_category_check;
ALTER TABLE notification_settings
    ADD CONSTRAINT notification_settings_category_check
    CHECK (category IN ('ROADMAP', 'TODO', 'CARD', 'INVITES', 'SYSTEM'));

COMMIT;

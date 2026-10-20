-- ============================================================================
-- Vector: миграция v2 (PostgreSQL 18)
-- Новое: комментарии, хранилище, друзья, приглашения, уведомления, 2 системы тегов
-- Соглашения БД сохранены: bigint/integer GENERATED ALWAYS AS IDENTITY,
-- timestamptz, справочники с UNIQUE name, имена idx_* / uk_*.
-- ============================================================================

BEGIN;

-- Защита от повторного запуска: 002 — разовая миграция (переименования и CREATE TABLE).
DO $$
BEGIN
    IF to_regclass('kanban_tag') IS NOT NULL THEN
        RAISE EXCEPTION 'Миграция 002 уже применена (таблица kanban_tag существует). Пропустите её и запустите 003.';
    END IF;
END $$;

-- ============================================================================
-- 1. ТЕГИ КАНБАНА: переименование project_tag -> kanban_tag,
--    tags_applies -> kanban_tags_applies (вместе с PK/FK/UK/sequence/колонкой)
-- ============================================================================

ALTER TABLE project_tag   RENAME TO kanban_tag;
ALTER TABLE tags_applies  RENAME TO kanban_tags_applies;

ALTER SEQUENCE project_tag_id_seq RENAME TO kanban_tag_id_seq;

ALTER TABLE kanban_tag RENAME CONSTRAINT project_tag_pkey           TO kanban_tag_pkey;
ALTER TABLE kanban_tag RENAME CONSTRAINT uk_project_tag             TO uk_kanban_tag;
ALTER TABLE kanban_tag RENAME CONSTRAINT project_tag_project_id_fkey TO kanban_tag_project_id_fkey;

ALTER TABLE kanban_tags_applies RENAME COLUMN project_tag_id TO kanban_tag_id;
ALTER TABLE kanban_tags_applies RENAME CONSTRAINT tags_applies_pkey               TO kanban_tags_applies_pkey;
ALTER TABLE kanban_tags_applies RENAME CONSTRAINT tags_applies_project_tag_id_fkey TO kanban_tags_applies_kanban_tag_id_fkey;
ALTER TABLE kanban_tags_applies RENAME CONSTRAINT tags_applies_kanban_card_id_fkey TO kanban_tags_applies_kanban_card_id_fkey;

-- PK (kanban_tag_id, kanban_card_id) не покрывает поиск "теги карточки"
CREATE INDEX idx_kanban_tags_applies_card ON kanban_tags_applies (kanban_card_id);


-- ============================================================================
-- 2. КОММЕНТАРИИ К КАРТОЧКАМ
-- При удалении карточки комментарии удаляются. При удалении автора комментарий
-- остаётся (author_id = NULL), чтобы не терять историю обсуждения.
-- ============================================================================

CREATE TABLE card_comments (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kanban_card_id  bigint NOT NULL
                    REFERENCES kanban_card(id) ON DELETE CASCADE,
    author_id       bigint
                    REFERENCES users(id) ON DELETE SET NULL,
    content         text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      timestamptz,                       -- NULL = не редактировался
    CONSTRAINT chk_card_comments_content CHECK (length(btrim(content)) > 0)
);

CREATE INDEX idx_card_comments_card   ON card_comments (kanban_card_id, created_at);
CREATE INDEX idx_card_comments_author ON card_comments (author_id);


-- ============================================================================
-- 3. ОБЩЕЕ ХРАНИЛИЩЕ ПРОЕКТА
-- ============================================================================

-- Справочник типов ресурса
CREATE TABLE storage_resource_type (
    type varchar(10) PRIMARY KEY
);
INSERT INTO storage_resource_type (type) VALUES ('FILE'), ('LINK');

-- Логические папки/разделы проекта ("Репозитории", "Диздоки", "Отчеты")
CREATE TABLE project_storage (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  bigint NOT NULL
                REFERENCES project(id) ON DELETE CASCADE,
    name        varchar(100) NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_project_storage UNIQUE (project_id, name)
);

-- Элементы папок: загруженный файл (путь в хранилище) или внешняя ссылка (URL)
CREATE TABLE storage_files (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_storage_id bigint NOT NULL
                     REFERENCES project_storage(id) ON DELETE CASCADE,
    resource_type    varchar(10) NOT NULL
                     REFERENCES storage_resource_type(type),
    name             varchar(255) NOT NULL,
    resource_path    varchar(2048) NOT NULL,           -- FILE: путь; LINK: URL
    uploaded_by      bigint
                     REFERENCES users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- ссылка обязана быть http(s)
    CONSTRAINT chk_storage_files_link_url
        CHECK (resource_type <> 'LINK' OR resource_path ~* '^https?://')
);

CREATE INDEX idx_storage_files_storage  ON storage_files (project_storage_id);
CREATE INDEX idx_storage_files_uploader ON storage_files (uploaded_by);


-- ============================================================================
-- 4. ДРУЗЬЯ
-- Отклонённая заявка = DELETE строки из friends, статус REJECTED не нужен.
-- ============================================================================

CREATE TABLE friend_status (
    id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(30) NOT NULL UNIQUE
);

-- Фиксированные id (1, 2), чтобы использовать DEFAULT 1 в friends
INSERT INTO friend_status (id, name) OVERRIDING SYSTEM VALUE
VALUES (1, 'PENDING'), (2, 'ACCEPTED');
SELECT setval(pg_get_serial_sequence('friend_status', 'id'), 2);

-- Одна строка на пару пользователей. requester_id отправил заявку addressee_id.
CREATE TABLE friends (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requester_id     bigint NOT NULL
                     REFERENCES users(id) ON DELETE CASCADE,
    addressee_id     bigint NOT NULL
                     REFERENCES users(id) ON DELETE CASCADE,
    friend_status_id integer NOT NULL DEFAULT 1        -- 1 = PENDING
                     REFERENCES friend_status(id),
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at      timestamptz,
    CONSTRAINT chk_friends_not_self CHECK (requester_id <> addressee_id)
);

-- Пара уникальна независимо от направления: (1,2) и (2,1) — одна и та же дружба
CREATE UNIQUE INDEX uk_friends_pair
    ON friends (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX idx_friends_addressee ON friends (addressee_id, friend_status_id);
CREATE INDEX idx_friends_requester ON friends (requester_id, friend_status_id);


-- ============================================================================
-- 5. ПРИГЛАШЕНИЯ В ПРОЕКТ
-- ============================================================================

CREATE TABLE invitation_status (
    id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(30) NOT NULL UNIQUE
);

INSERT INTO invitation_status (id, name) OVERRIDING SYSTEM VALUE
VALUES (1, 'PENDING'), (2, 'ACCEPTED'), (3, 'DECLINED'), (4, 'CANCELED');
SELECT setval(pg_get_serial_sequence('invitation_status', 'id'), 4);

-- Адресат: либо существующий пользователь (invitee_user_id), либо email
CREATE TABLE project_invitations (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id         bigint NOT NULL
                       REFERENCES project(id) ON DELETE CASCADE,
    inviter_id         bigint NOT NULL
                       REFERENCES users(id) ON DELETE CASCADE,
    invitee_user_id    bigint
                       REFERENCES users(id) ON DELETE CASCADE,
    invitee_email      varchar(255),
    invitation_status_id integer NOT NULL DEFAULT 1    -- 1 = PENDING
                       REFERENCES invitation_status(id),
    created_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at       timestamptz,
    -- ровно одно из двух: user_id или email
    CONSTRAINT chk_invitation_target
        CHECK (num_nonnulls(invitee_user_id, invitee_email) = 1)
);

-- Не более одного активного (PENDING) приглашения на адресата в проект
CREATE UNIQUE INDEX uk_invitation_pending_user
    ON project_invitations (project_id, invitee_user_id)
    WHERE invitation_status_id = 1 AND invitee_user_id IS NOT NULL;
CREATE UNIQUE INDEX uk_invitation_pending_email
    ON project_invitations (project_id, lower(invitee_email))
    WHERE invitation_status_id = 1 AND invitee_email IS NOT NULL;

CREATE INDEX idx_invitations_invitee_user  ON project_invitations (invitee_user_id);
CREATE INDEX idx_invitations_invitee_email ON project_invitations (lower(invitee_email));
CREATE INDEX idx_invitations_inviter       ON project_invitations (inviter_id);


-- ============================================================================
-- 6. УВЕДОМЛЕНИЯ
-- Одна таблица на все события: type + контекст в payload (jsonb).
-- Пример payload: {"project_id": 5, "card_id": 17, "comment_id": 42, "actor_id": 3}
-- Новый тип события = INSERT в notification_type, без миграции структуры.
-- ============================================================================

CREATE TABLE notification_type (
    type varchar(50) PRIMARY KEY
);
INSERT INTO notification_type (type) VALUES
    ('PROJECT_INVITATION'),
    ('CARD_COMMENT'),
    ('TASK_STATUS_CHANGED'),
    ('FRIEND_REQUEST'),
    ('FRIEND_ACCEPTED');

CREATE TABLE notifications (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint NOT NULL                          -- получатель
               REFERENCES users(id) ON DELETE CASCADE,
    type       varchar(50) NOT NULL
               REFERENCES notification_type(type),
    payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_read    boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at    timestamptz,
    CONSTRAINT chk_notifications_payload CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
-- быстрый счётчик/список непрочитанных
CREATE INDEX idx_notifications_unread
    ON notifications (user_id, created_at DESC) WHERE NOT is_read;


-- ============================================================================
-- 7. ТЕГИ ЗАДАЧ (RoadMap/ToDo) — независимы от kanban_tag
-- Теги принадлежат проекту ("Программирование", "Арт"). Составные FK через
-- project_id гарантируют, что тег проекта A нельзя повесить на задачу проекта B.
-- ============================================================================

-- Цель для составного FK из task_tag_applies
ALTER TABLE task ADD CONSTRAINT uk_task_id_project UNIQUE (id, project_id);

CREATE TABLE task_tag (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL
               REFERENCES project(id) ON DELETE CASCADE,
    name       varchar(50) NOT NULL,
    color_code varchar(7) NOT NULL DEFAULT '#808080',
    CONSTRAINT uk_task_tag UNIQUE (project_id, name),
    CONSTRAINT uk_task_tag_id_project UNIQUE (id, project_id),
    CONSTRAINT chk_task_tag_color CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$')
);

-- Связь M:N. Применяется к task, т.е. и к roadmap_task, и к todo_task.
CREATE TABLE task_tag_applies (
    task_id     bigint NOT NULL,
    task_tag_id bigint NOT NULL,
    project_id  bigint NOT NULL,                        -- проект задачи и тега
    PRIMARY KEY (task_id, task_tag_id),
    FOREIGN KEY (task_id, project_id)
        REFERENCES task(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (task_tag_id, project_id)
        REFERENCES task_tag(id, project_id) ON DELETE CASCADE
);

CREATE INDEX idx_task_tag_applies_tag ON task_tag_applies (task_tag_id);

COMMIT;

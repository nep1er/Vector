-- ============================================================================
-- Vector: миграция 008 (PostgreSQL)
-- Настройки уведомлений: какие категории уходят в «Скрытые» (приходят все, но без значка и шума).
-- Категории: ROADMAP (изменения на доске), TODO (изменения в ToDo), CARD (карточки, где вы исполнитель),
--            INVITES (приглашения в друзья и в проекты).
-- Идемпотентно. Запуск: pgAdmin 4 -> Query Tool -> F5.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS notification_settings (
    user_id  bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category varchar(20) NOT NULL CHECK (category IN ('ROADMAP', 'TODO', 'CARD', 'INVITES')),
    hidden   boolean NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, category)
);

COMMENT ON TABLE notification_settings IS 'Какие категории уведомлений пользователь убирает в «Скрытые»';

COMMIT;

-- ============================================================================
-- Vector: миграция 007 (PostgreSQL)
-- История «смещений сроков» на RoadMap.
--   task_shift      — одно смещение: с какой даты, на сколько дней, кто и когда, комментарий, отмена.
--   task_shift_item — какие задачи затронуты и как изменились их даты (для просмотра и отмены).
-- Скрипт идемпотентный. Запуск: pgAdmin 4 -> Query Tool -> F5.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS task_shift (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id    bigint NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    roadmap_id    bigint REFERENCES task(id) ON DELETE SET NULL,      -- уровень RoadMap, на котором выполнено
    roadmap_title varchar(200) NOT NULL,                              -- название на момент смещения
    from_date     date NOT NULL,                                      -- «с какой даты»
    shift_days    integer NOT NULL CHECK (shift_days <> 0),           -- на сколько дней (минус = раньше)
    tasks_count   integer NOT NULL DEFAULT 0,
    comment       text,
    created_by    bigint REFERENCES users(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reverted_at   timestamptz,                                        -- когда смещение отменили
    reverted_by   bigint REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_shift_item (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shift_id     bigint NOT NULL REFERENCES task_shift(id) ON DELETE CASCADE,
    task_id      bigint REFERENCES task(id) ON DELETE SET NULL,
    task_title   varchar(200) NOT NULL,
    task_type    varchar(10) NOT NULL,
    is_container boolean NOT NULL DEFAULT false,                      -- границы объемлющей RoadMap, растянутые под сдвиг
    old_start    timestamptz,
    old_end      timestamptz,
    new_start    timestamptz,
    new_end      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_task_shift_project ON task_shift (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_shift_item_shift ON task_shift_item (shift_id);

COMMENT ON TABLE task_shift IS 'История смещений сроков на RoadMap (кнопка «Смещение сроков»)';
COMMENT ON TABLE task_shift_item IS 'Задачи, затронутые смещением: старые и новые даты';

COMMIT;

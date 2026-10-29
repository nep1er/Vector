-- Индексы под выборку доски ToDo (колонки и карточки по порядку). Данные не меняются, можно запускать повторно.
CREATE INDEX IF NOT EXISTS idx_kanban_column_todo_pos ON kanban_column (todo_task_id, position);
CREATE INDEX IF NOT EXISTS idx_kanban_card_column_pos ON kanban_card (kanban_column_id, position);
CREATE INDEX IF NOT EXISTS idx_card_participants_card ON card_participants (kanban_card_id);
CREATE INDEX IF NOT EXISTS idx_kanban_card_files_card ON kanban_card_files (kanban_card_id);

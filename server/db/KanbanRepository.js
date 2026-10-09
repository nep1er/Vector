import { pool } from '../config/db.js';

export class KanbanRepository {
    static async createColumn(todoTaskId, title, position = 0) {
    const query = `
      INSERT INTO kanban_column (todo_task_id, title, position)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await pool.query(query, [todoTaskId, title, position]);
    return res.rows[0];
  }

  // Добавить новую карточку в колонку
  static async createCard(columnId, title, description = '', cardStatusId = 0, position = 0) {
    const query = `
      INSERT INTO kanban_card (kanban_column_id, title, description, card_status_id, position)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const res = await pool.query(query, [columnId, title, description, cardStatusId, position]);
    return res.rows[0];
  }


  static async getBoardByTodoId(todoTaskId) {
    const query = `
      SELECT kc.id as column_id, kc.title as column_title, kc.position,
             json_agg(
               json_build_object(
                 'id', card.id,
                 'title', card.title,
                 'description', card.description,
                 'status_id', card.card_status_id,
                 'created_at', card.created_at
               ) ORDER BY card.id
             ) FILTER (WHERE card.id IS NOT NULL) as cards
      FROM kanban_column kc
      LEFT JOIN kanban_card card ON kc.id = card.kanban_column_id
      WHERE kc.todo_task_id = $1
      GROUP BY kc.id
      ORDER BY kc.position;
    `;
    const res = await pool.query(query, [todoTaskId]);
    return res.rows;
  }

  static async moveCard(cardId, targetColumnId, newStatusId) {
    const query = `
      UPDATE kanban_card
      SET kanban_column_id = $1, card_status_id = $2
      WHERE id = $3
      RETURNING *;
    `;
    const res = await pool.query(query, [targetColumnId, newStatusId, cardId]);
    return res.rows[0];
  }

  static async deleteCard(cardId) {
  const query = `DELETE FROM kanban_card WHERE id = $1 RETURNING id;`;
  const res = await pool.query(query, [cardId]);
  return res.rows[0];
}

static async deleteColumn(columnId) {
  const query = `DELETE FROM kanban_column WHERE id = $1 RETURNING id;`;
  const res = await pool.query(query, [columnId]);
  return res.rows[0];
}

// Добавить в KanbanRepository:
static async updateColumnDetails(columnId, title, position) {
  const query = `
    UPDATE kanban_column 
    SET title = COALESCE($1, title), 
        position = COALESCE($2, position)
    WHERE id = $3 
    RETURNING *;
  `;
  const res = await pool.query(query, [title, position, columnId]);
  return res.rows[0];
}

static async updateCardDetails(cardId, { title, description, workDate }) {
  const query = `
    UPDATE kanban_card 
    SET title = COALESCE($1, title), 
        description = COALESCE($2, description),
        work_date = COALESCE($3, work_date)
    WHERE id = $4 
    RETURNING *;
  `;
  const res = await pool.query(query, [title, description, workDate, cardId]);
  return res.rows[0];
}

// Добавить в KanbanRepository:
static async updateCardStatus(cardId, cardStatusId) {
  const query = `
    UPDATE kanban_card SET card_status_id = $1 WHERE id = $2 RETURNING *;
  `;
  const res = await pool.query(query, [cardStatusId, cardId]);
  return res.rows[0];
}

static async addCardParticipant(cardId, projectParticipantId) {
  const query = `
    INSERT INTO card_participants (kanban_card_id, project_participant_id)
    VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *;
  `;
  const res = await pool.query(query, [cardId, projectParticipantId]);
  return res.rows[0];
}

static async removeCardParticipant(cardId, projectParticipantId) {
  const query = `
    DELETE FROM card_participants 
    WHERE kanban_card_id = $1 AND project_participant_id = $2 RETURNING *;
  `;
  const res = await pool.query(query, [cardId, projectParticipantId]);
  return res.rows[0];
}
}
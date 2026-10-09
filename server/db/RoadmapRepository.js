import { pool } from '../config/db.js';
import { TaskRepository } from './TaskRepository.js';

export class RoadmapRepository {
  static async createRoadmapStage(projectId, title, startDate, endDate, parentRoadmapId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Вся валидация (Тип родителя + Даты + Циклы) автоматически 
      // сработает внутри TaskRepository.createBaseTask!
      const baseTask = await TaskRepository.createBaseTask(
        projectId, 
        'ROADMAP', 
        title, 
        parentRoadmapId, 
        startDate, 
        endDate, 
        client
      );

      const querySubtype = `
        INSERT INTO roadmap_task (task_id, type, title)
        VALUES ($1, 'ROADMAP', $2)
        RETURNING task_id;
      `;
      await client.query(querySubtype, [baseTask.id, title]);

      await client.query('COMMIT');
      return baseTask;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error; // Передаем валидационную ошибку в HTTP-контроллер
    } finally {
      client.release();
    }
  }
}
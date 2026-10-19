import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// PostgreSQL отдаёт bigint (тип 20) строкой: id приходили бы как "1", а не 1.
// Все наши id — небольшие числа, поэтому безопасно превращаем их в number.
pg.types.setTypeParser(20, (value) => parseInt(value, 10));

export const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

pool.on('connect', () => {
  console.log('PostgreSQL Pool: Соединение установлено');
});

pool.on('error', (err) => {
  console.error('Ошибка пула PostgreSQL:', err);
});

// Понятные сообщения для нарушений уникальности (имя ограничения -> текст)
const UNIQUE_MESSAGES = {
  users_email_key: 'Этот email уже используется',
  users_username_key: 'Это имя пользователя уже занято',
  uk_kanban_tag: 'Тег Канбана с таким названием уже есть в проекте',
  uk_task_tag: 'Тег задач с таким названием уже есть в проекте',
  uk_project_storage: 'Раздел с таким названием уже есть в проекте',
  uk_friends_pair: 'Заявка или дружба с этим пользователем уже существует',
  uk_invitation_pending_user: 'Этому пользователю приглашение уже отправлено',
  uk_invitation_pending_email: 'На этот email приглашение уже отправлено',
  uk_project_role: 'Роль с таким названием уже есть в проекте',
  uk_project_user: 'Пользователь уже участвует в проекте',
};

/**
 * Превращает ошибку из репозитория в корректный HTTP-ответ.
 *
 * 1) Бизнес-валидаторы бросают Error('400: текст') — берём код и текст оттуда.
 * 2) Типовые ошибки PostgreSQL переводим в понятные 4xx вместо «500».
 * 3) Всё остальное — настоящая внутренняя ошибка: 500 + запись в лог.
 */
export function sendError(res, error, fallbackMessage = 'Внутренняя ошибка сервера') {
  const match = /^(\d{3}):\s*([\s\S]+)$/.exec(error?.message ?? '');
  if (match) {
    return res.status(Number(match[1])).json({ message: match[2] });
  }

  switch (error?.code) {
    case '23505': // unique_violation
      return res
        .status(409)
        .json({ message: UNIQUE_MESSAGES[error.constraint] ?? 'Такая запись уже существует' });
    case '23503': // foreign_key_violation
      return res.status(400).json({ message: 'Связанная запись не найдена' });
    case '23514': // check_violation (например, start_date > end_date)
      return res.status(400).json({ message: 'Данные нарушают ограничение (проверьте даты и формат полей)' });
    case '23502': // not_null_violation
      return res.status(400).json({ message: 'Не заполнено обязательное поле' });
    case '22P02': // invalid_text_representation
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
      return res.status(400).json({ message: 'Некорректный формат данных' });
    default:
      console.error(error);
      return res.status(500).json({ message: fallbackMessage });
  }
}

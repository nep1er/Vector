import Icon from '../components/Icon';

export default function TasksPage() {
  return (
    <>
      <div className="page-head">
        <h1>Задачи</h1>
      </div>
      <div className="empty">
        <Icon name="tasks" size={32} />
        <h2>Нет назначенных задач</h2>
      </div>
    </>
  );
}

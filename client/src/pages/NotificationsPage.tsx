import Icon from '../components/Icon';

export default function NotificationsPage() {
  return (
    <>
      <div className="page-head">
        <h1>Уведомления</h1>
      </div>
      <div className="empty">
        <Icon name="bell" size={32} />
        <h2>Нет уведомлений</h2>
      </div>
    </>
  );
}

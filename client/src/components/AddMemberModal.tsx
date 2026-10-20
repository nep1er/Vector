import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import Modal from './Modal';

interface Props {
  projectId: number;
  onClose: () => void;
  onInvited: () => Promise<void> | void;
}

/** «Добавить участника»: создаёт приглашение, у адресата оно появится в «Уведомлениях». */
export default function AddMemberModal({ projectId, onClose, onInvited }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) return setError('Введите e-mail или имя пользователя');
    setBusy(true);
    setError('');
    setSent('');
    try {
      await api.projects.invite(projectId, value);
      await onInvited();
      setSent(`Приглашение отправлено: ${value}`);
      setIdentifier('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить приглашение');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Добавить участника" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          <span>E-mail или имя пользователя</span>
          <input
            autoFocus
            value={identifier}
            placeholder="name@example.com"
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </label>
        <p className="muted hint">
          Пользователь получит приглашение в «Уведомлениях». После принятия он станет участником
          проекта с ролью «Наблюдатель».
        </p>
        {error && <div className="notice notice-err">{error}</div>}
        {sent && <div className="notice notice-ok">{sent}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Закрыть
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Пригласить
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import type { Invitation, Participant, ProjectRole } from '../../types';
import Avatar from '../Avatar';
import Icon from '../Icon';

interface Props {
  projectId: number;
  currentUserId: number;
  onChanged: () => Promise<void> | void;
}

/** Вкладка «Участники»: приглашение, смена роли, удаление, отзыв приглашений. */
export default function MembersTab({ projectId, currentUserId, onChanged }: Props) {
  const [members, setMembers] = useState<Participant[]>([]);
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, r, i] = await Promise.all([
        api.projects.participants(projectId),
        api.roles.listByProject(projectId),
        api.projects.invitations(projectId),
      ]);
      setMembers(m);
      setRoles(r);
      setInvites(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить участников');
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Операция не выполнена');
    } finally {
      setBusy(false);
    }
  };

  const invite = (e: FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) return;
    run(async () => {
      await api.projects.invite(projectId, value);
      setIdentifier('');
    });
  };

  return (
    <>
      <form className="inline-form" onSubmit={invite}>
        <input
          value={identifier}
          placeholder="E-mail или имя пользователя"
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy || !identifier.trim()}>
          <Icon name="user-plus" size={18} />
          Пригласить
        </button>
      </form>

      {error && <div className="notice notice-err">{error}</div>}

      <h3 className="section-title">Участники ({members.length})</h3>
      <ul className="list">
        {members.map((m) => (
          <li key={m.participant_id} className="list-row">
            <Avatar user={m} size={32} />
            <div className="list-main">
              <strong>{m.username}</strong>
              <span className="muted">{m.email}</span>
            </div>
            <select
              aria-label={`Роль: ${m.username}`}
              value={m.roles[0]?.id ?? ''}
              disabled={busy}
              onChange={(e) =>
                run(() => api.projects.setParticipantRole(projectId, m.user_id, Number(e.target.value)))
              }
            >
              {m.roles.length === 0 && <option value="">Без роли</option>}
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              aria-label={`Удалить участника ${m.username}`}
              title={m.user_id === currentUserId ? 'Выйти из проекта' : 'Удалить из проекта'}
              disabled={busy}
              onClick={() => run(() => api.projects.removeParticipant(projectId, m.user_id))}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h3 className="section-title">Ожидают ответа ({invites.length})</h3>
          <ul className="list">
            {invites.map((inv) => (
              <li key={inv.id} className="list-row">
                <Avatar user={{ username: inv.invitee, avatar_url: inv.invitee_avatar_url }} size={32} />
                <div className="list-main">
                  <strong>{inv.invitee}</strong>
                  <span className="muted">{inv.invitee_email}</span>
                </div>
                <button
                  className="btn btn-quiet"
                  disabled={busy}
                  onClick={() => run(() => api.projects.cancelInvitation(projectId, inv.id))}
                >
                  Отозвать
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

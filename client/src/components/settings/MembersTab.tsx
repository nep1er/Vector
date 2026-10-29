import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import type { Invitation, Participant, ProjectRole } from '../../types';
import Avatar from '../Avatar';
import Dropdown from '../Dropdown';
import Icon from '../Icon';

interface Props {
  projectId: number;
  currentUserId: number;
  onChanged: () => Promise<void> | void;
  /** Только просмотр (для участников без права ADMIN): без приглашений, смены ролей и удаления */
  readOnly?: boolean;
}

/** Вкладка «Участники»: приглашение, роли (у участника их может быть несколько), удаление, отзыв приглашений. */
export default function MembersTab({ projectId, currentUserId, onChanged, readOnly = false }: Props) {
  const [members, setMembers] = useState<Participant[]>([]);
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // Приглашения и список ролей для выдачи нужны только администратору
      const m = await api.projects.participants(projectId);
      setMembers(m);
      if (!readOnly) {
        const [r, i] = await Promise.all([api.roles.listByProject(projectId), api.projects.invitations(projectId)]);
        setRoles(r);
        setInvites(i);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить участников');
    }
  }, [projectId, readOnly]);

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
      {!readOnly && (
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
      )}

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
            <div className="chips role-chips">
              {m.roles.length === 0 && <span className="muted">Без роли</span>}
              {m.roles.map((r) => (
                <span key={r.id} className="fchip on-static">
                  {r.name}
                  {!readOnly && (
                    <button
                      type="button"
                      className="chip-x"
                      aria-label={`Снять роль «${r.name}» с ${m.username}`}
                      title={m.roles.length <= 1 ? 'Нельзя снять последнюю роль' : 'Снять роль'}
                      disabled={busy || m.roles.length <= 1}
                      onClick={() => run(() => api.projects.removeParticipantRole(projectId, m.user_id, r.id))}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {!readOnly && roles.some((r) => !m.roles.some((x) => x.id === r.id)) && (
                <Dropdown
                  buttonClassName="add-chip"
                  ariaLabel={`Добавить роль: ${m.username}`}
                  title="Добавить роль"
                  disabled={busy}
                  button={<Icon name="plus" size={14} />}
                >
                  <div className="pick-list">
                    {roles
                      .filter((r) => !m.roles.some((x) => x.id === r.id))
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="pick-item"
                          onClick={() => run(() => api.projects.addParticipantRole(projectId, m.user_id, r.id))}
                        >
                          <span>{r.name}</span>
                        </button>
                      ))}
                  </div>
                </Dropdown>
              )}
            </div>
            {(!readOnly || m.user_id === currentUserId) && (
            <button
              className="icon-btn"
              aria-label={`Удалить участника ${m.username}`}
              title={m.user_id === currentUserId ? 'Выйти из проекта' : 'Удалить из проекта'}
              disabled={busy}
              onClick={() => run(() => api.projects.removeParticipant(projectId, m.user_id))}
            >
              <Icon name="trash" size={18} />
            </button>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && invites.length > 0 && (
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

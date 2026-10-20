import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import type { AccessRight, ProjectRole } from '../../types';
import Icon from '../Icon';

const RIGHT_LABELS: Record<string, string> = {
  READ: 'Просмотр',
  WRITE: 'Запись',
  EXECUTE: 'Управление',
  ADMIN: 'Админ',
};

/** Вкладка «Роли»: создание, переименование, права, удаление. */
export default function RolesTab({ projectId, onChanged }: { projectId: number; onChanged: () => Promise<void> | void }) {
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [rights, setRights] = useState<AccessRight[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([api.roles.listByProject(projectId), api.roles.accessRights()]);
      setRoles(r);
      setRights(a);
      setNames(Object.fromEntries(r.map((x) => [x.id, x.name])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить роли');
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

  const create = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    run(async () => {
      await api.roles.create(projectId, name);
      setNewName('');
    });
  };

  return (
    <>
      <form className="inline-form" onSubmit={create}>
        <input
          value={newName}
          maxLength={50}
          placeholder="Название новой роли"
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy || !newName.trim()}>
          <Icon name="plus" size={18} />
          Создать
        </button>
      </form>

      {error && <div className="notice notice-err">{error}</div>}

      <ul className="list">
        {roles.map((role) => {
          const name = names[role.id] ?? role.name;
          const has = (rightName: string) => (role.rights ?? []).includes(rightName);
          return (
            <li key={role.id} className="role-card">
              <div className="role-head">
                <input
                  aria-label="Название роли"
                  value={name}
                  maxLength={50}
                  onChange={(e) => setNames({ ...names, [role.id]: e.target.value })}
                  onBlur={() => {
                    const clean = name.trim();
                    if (clean && clean !== role.name) run(() => api.roles.rename(role.id, clean));
                    else setNames({ ...names, [role.id]: role.name });
                  }}
                />
                <button
                  className="icon-btn"
                  aria-label={`Удалить роль ${role.name}`}
                  disabled={busy}
                  onClick={() => run(() => api.roles.remove(role.id))}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <div className="rights">
                {rights.map((r) => (
                  <label key={r.id} className="check">
                    <input
                      type="checkbox"
                      checked={has(r.name)}
                      disabled={busy}
                      onChange={(e) =>
                        run(() =>
                          e.target.checked
                            ? api.roles.addRight(role.id, r.id)
                            : api.roles.removeRight(role.id, r.id),
                        )
                      }
                    />
                    {RIGHT_LABELS[r.name] ?? r.name}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

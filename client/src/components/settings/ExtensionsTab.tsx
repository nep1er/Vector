import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { ExtAuditRow, ExtPermission, LibraryExtension, ProjectExtension } from '../../types';
import { PERMISSION_INFO, UNUSABLE_LABEL } from '../../utils/extensions';
import PermissionPicker from '../extensions/PermissionPicker';
import Icon from '../Icon';

type Mode =
  | { kind: 'install'; ext: LibraryExtension; granted: ExtPermission[] }
  | { kind: 'update'; ext: ProjectExtension; granted: ExtPermission[] }
  | { kind: 'perms'; ext: ProjectExtension; granted: ExtPermission[] }
  | { kind: 'audit'; ext: ProjectExtension; rows: ExtAuditRow[] };

/** Вкладка «Расширения» настроек проекта (ADMIN): подключённые расширения, права, обновления, журнал обращений. */
export default function ExtensionsTab({ projectId, onChanged }: { projectId: number; onChanged: () => Promise<void> | void }) {
  const [installed, setInstalled] = useState<ProjectExtension[]>([]);
  const [library, setLibrary] = useState<LibraryExtension[]>([]);
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.extensions.forProject(projectId), api.extensions.library()]);
      setInstalled(a);
      setLibrary(b);
    } catch (e: any) {
      setError(e.message);
    }
  }, [projectId]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, close = true) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (close) setMode(null);
      await load();
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const available = library.filter((l) => !l.unusable && l.manifest && !installed.some((i) => i.extension_id === l.id));

  if (mode?.kind === 'install') {
    const m = mode.ext.manifest!;
    return (
      <>
        <h3 className="ext-h">Подключить «{mode.ext.name}» v{mode.ext.version}</h3>
        <p className="muted">Расширение запрашивает права ниже. Отметьте то, что разрешаете в этом проекте. Работать оно сможет только в пределах прав самого пользователя, который его открыл.</p>
        <PermissionPicker asked={m.permissions} value={mode.granted} onChange={(granted) => setMode({ ...mode, granted })} />
        {error && <div className="notice notice-err">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-quiet" onClick={() => setMode(null)}>Назад</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.extensions.install(projectId, mode.ext.id, mode.granted))}>Подключить</button>
        </div>
      </>
    );
  }

  if (mode?.kind === 'update') {
    const u = mode.ext.update!;
    return (
      <>
        <h3 className="ext-h">Обновить «{mode.ext.name}» до v{u.version}</h3>
        {u.new_permissions.length > 0 ? (
          <>
            <div className="notice">Новая версия запрашивает дополнительные права. Без вашего согласия обновление невозможно.</div>
            <PermissionPicker asked={u.new_permissions} value={mode.granted} highlight={u.new_permissions} onChange={(granted) => setMode({ ...mode, granted })} />
          </>
        ) : <p className="muted">Новых прав версия не запрашивает.</p>}
        {error && <div className="notice notice-err">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-quiet" onClick={() => setMode(null)}>Назад</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.extensions.updateInstall(projectId, mode.ext.extension_id, mode.granted))}>Обновить</button>
        </div>
      </>
    );
  }

  if (mode?.kind === 'perms') {
    return (
      <>
        <h3 className="ext-h">Права «{mode.ext.name}»</h3>
        <PermissionPicker asked={mode.ext.manifest.permissions} value={mode.granted} onChange={(granted) => setMode({ ...mode, granted })} />
        {error && <div className="notice notice-err">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-quiet" onClick={() => setMode(null)}>Назад</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.extensions.patchInstall(projectId, mode.ext.extension_id, { permissions: mode.granted }))}>Сохранить</button>
        </div>
      </>
    );
  }

  if (mode?.kind === 'audit') {
    return (
      <>
        <h3 className="ext-h">Журнал обращений «{mode.ext.name}»</h3>
        <p className="muted">Последние обращения расширения к данным проекта (через мост хоста).</p>
        {mode.rows.length === 0 ? <p className="empty">Пока ничего</p> : (
          <table className="ext-table">
            <thead><tr><th>Когда</th><th>Кто открыл</th><th>Метод</th><th>Результат</th></tr></thead>
            <tbody>{mode.rows.map((r, i) => <tr key={i}><td>{new Date(r.created_at).toLocaleString('ru-RU')}</td><td>{r.username ?? '—'}</td><td><code>{r.method}</code></td><td>{r.ok ? 'ок' : 'отказ'}</td></tr>)}</tbody>
          </table>
        )}
        <div className="modal-actions"><button className="btn btn-quiet" onClick={() => setMode(null)}>Назад</button></div>
      </>
    );
  }

  return (
    <>
      {error && <div className="notice notice-err">{error}</div>}
      <h3 className="ext-h">Подключено</h3>
      {installed.length === 0 ? <p className="muted">В проекте пока нет расширений.</p> : (
        <ul className="ext-installed">
          {installed.map((x) => (
            <li key={x.id} className="panel">
              <div className="ext-installed-head">
                <span className="ext-ico"><Icon name="puzzle" size={18} /></span>
                <div>
                  <b>{x.name}</b> <small className="muted">v{x.version} · {x.author_name}</small>
                  <div className="ext-state">
                    {x.unusable ? <span className="badge badge-warn">{UNUSABLE_LABEL[x.unusable]}</span> : x.enabled ? <span className="badge ext-st-approved">Работает</span> : <span className="badge">Отключено</span>}
                    {x.update && <span className="badge badge-todo">Доступна v{x.update.version}</span>}
                  </div>
                </div>
              </div>
              <div className="ext-chips">
                {x.granted_permissions.length === 0 && <span className="muted">Права не выданы</span>}
                {x.granted_permissions.map((p) => <span key={p} className={`ext-chip ext-chip-${PERMISSION_INFO[p].risk}`}>{PERMISSION_INFO[p].label}</span>)}
              </div>
              <div className="ext-actions">
                {x.update && <button className="btn btn-primary btn-sm" onClick={() => setMode({ kind: 'update', ext: x, granted: [] })}>Обновить</button>}
                <button className="btn btn-quiet btn-sm" disabled={busy || !!x.unusable} onClick={() => run(() => api.extensions.patchInstall(projectId, x.extension_id, { enabled: !x.enabled }), false)}>{x.enabled ? 'Отключить' : 'Включить'}</button>
                <button className="btn btn-quiet btn-sm" onClick={() => setMode({ kind: 'perms', ext: x, granted: x.granted_permissions })}>Права</button>
                <button className="btn btn-quiet btn-sm" onClick={async () => setMode({ kind: 'audit', ext: x, rows: await api.extensions.audit(projectId, x.extension_id).catch(() => []) })}>Журнал</button>
                <button className="btn btn-danger-ghost btn-sm" disabled={busy} onClick={() => confirm(`Удалить «${x.name}» из проекта?`) && run(() => api.extensions.removeInstall(projectId, x.extension_id), false)}>Удалить</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="ext-h">Из вашей библиотеки</h3>
      {available.length === 0 ? <p className="muted">Нет расширений для подключения. Добавьте их в библиотеку на странице «Расширения».</p> : (
        <ul className="ext-installed">
          {available.map((l) => (
            <li key={l.id} className="panel ext-lib-row">
              <div><b>{l.name}</b> <small className="muted">v{l.version} · {l.author_name}</small><p className="muted">{l.summary}</p></div>
              <button className="btn btn-primary btn-sm" onClick={() => setMode({ kind: 'install', ext: l, granted: [] })}>Подключить</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

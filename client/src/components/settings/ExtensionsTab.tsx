import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { ExtAuditRow, ExtPermission, LibraryExtension, ProjectExtension } from '../../types';
import { UNUSABLE_LABEL } from '../../utils/extensions';
import PermissionPicker from '../extensions/PermissionPicker';
import ExtCover from '../extensions/ExtCover';

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
        <h3 className="xs-sub">Подключить «{mode.ext.name}» v{mode.ext.version}</h3>
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
        <h3 className="xs-sub">Обновить «{mode.ext.name}» до v{u.version}</h3>
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
        <h3 className="xs-sub">Права «{mode.ext.name}»</h3>
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
        <h3 className="xs-sub">Журнал обращений «{mode.ext.name}»</h3>
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
      <h4 className="xs-h">Подключено <b>{installed.length}</b></h4>
      {installed.length === 0 ? (
        <p className="xs-empty">В проекте пока нет расширений. Выберите из библиотеки ниже.</p>
      ) : (
        <ul className="xs-list">
          {installed.map((x) => (
            <li key={x.id} className="xs-item">
              <ExtCover name={x.name} slug={x.slug} compact />
              <div className="xs-main">
                <div className="xs-title">
                  <b>{x.name}</b>
                  <small>v{x.version} · {x.author_name}</small>
                </div>
                <div className="xs-state">
                  {x.unusable ? <span className="badge badge-warn">{UNUSABLE_LABEL[x.unusable]}</span> : null}
                  {x.update && <span className="badge badge-todo">Доступна v{x.update.version}</span>}
                  <span className="xs-perms">Права: {x.granted_permissions.length} из {x.manifest.permissions.length}</span>
                </div>
              </div>
              <div className="xs-actions">
                {x.update && <button className="btn btn-primary btn-sm" onClick={() => setMode({ kind: 'update', ext: x, granted: [] })}>Обновить</button>}
                <button className="xs-link" onClick={() => setMode({ kind: 'perms', ext: x, granted: x.granted_permissions })}>Права</button>
                <button className="xs-link" onClick={async () => setMode({ kind: 'audit', ext: x, rows: await api.extensions.audit(projectId, x.extension_id).catch(() => []) })}>Журнал</button>
                <button className="xs-link xs-danger" disabled={busy} onClick={() => confirm(`Удалить «${x.name}» из проекта?`) && run(() => api.extensions.removeInstall(projectId, x.extension_id), false)}>Удалить</button>
                <label className="switch" title={x.enabled ? 'Отключить' : 'Включить'}>
                  <input type="checkbox" checked={x.enabled && !x.unusable} disabled={busy || !!x.unusable} onChange={() => run(() => api.extensions.patchInstall(projectId, x.extension_id, { enabled: !x.enabled }), false)} />
                  <i />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h4 className="xs-h">Из вашей библиотеки <b>{available.length}</b></h4>
      {available.length === 0 ? (
        <p className="xs-empty">Нет расширений для подключения. Добавьте их в библиотеку на странице «Расширения».</p>
      ) : (
        <ul className="xs-list">
          {available.map((l) => (
            <li key={l.id} className="xs-item">
              <ExtCover name={l.name} slug={l.slug} compact />
              <div className="xs-main">
                <div className="xs-title">
                  <b>{l.name}</b>
                  <small>v{l.version} · {l.author_name}</small>
                </div>
                <p className="xs-sum">{l.summary}</p>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setMode({ kind: 'install', ext: l, granted: [] })}>Подключить</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

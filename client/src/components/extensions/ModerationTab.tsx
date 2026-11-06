import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { ExtBan, ExtReport, ModExtensionRow, ModLogRow, ModQueueItem } from '../../types';
import { ACTION_LABEL, PERMISSION_INFO, fmtSize } from '../../utils/extensions';
import Modal from '../Modal';

type Sub = 'queue' | 'all' | 'reports' | 'bans' | 'log';
const fmt = (s: string) => new Date(s).toLocaleString('ru-RU');

/** Панель модератора: очередь проверки, все расширения, жалобы, баны авторов, журнал. */
export default function ModerationTab({ onOpen }: { onOpen: (id: number) => void }) {
  const [sub, setSub] = useState<Sub>('queue');
  const [queue, setQueue] = useState<ModQueueItem[]>([]);
  const [all, setAll] = useState<ModExtensionRow[]>([]);
  const [reports, setReports] = useState<ExtReport[]>([]);
  const [bans, setBans] = useState<ExtBan[]>([]);
  const [log, setLog] = useState<ModLogRow[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<ModQueueItem | null>(null);
  const [ask, setAsk] = useState<{ title: string; label: string; onOk: (reason: string) => Promise<unknown> } | null>(null);
  const [banId, setBanId] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      if (sub === 'queue') setQueue(await api.moderation.queue());
      if (sub === 'all') setAll(await api.moderation.extensions(q));
      if (sub === 'reports') setReports(await api.moderation.reports());
      if (sub === 'bans') setBans(await api.moderation.bans());
      if (sub === 'log') setLog(await api.moderation.log());
    } catch (e: any) {
      setError(e.message);
    }
  }, [sub, q]);
  useEffect(() => {
    const t = setTimeout(load, sub === 'all' ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, sub]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  };

  const SUBS: [Sub, string, number?][] = [['queue', 'Очередь', queue.length], ['all', 'Все расширения'], ['reports', 'Жалобы'], ['bans', 'Баны авторов'], ['log', 'Журнал']];

  return (
    <>
      <div className="seg" role="tablist">
        {SUBS.map(([id, label, n]) => (
          <button key={id} className={sub === id ? 'on' : ''} onClick={() => setSub(id)}>{label}{n ? ` (${n})` : ''}</button>
        ))}
      </div>
      {error && <div className="notice notice-err">{error}</div>}

      {sub === 'queue' && (queue.length === 0 ? <p className="empty">Очередь пуста</p> : (
        <table className="ext-table">
          <thead><tr><th>Расширение</th><th>Автор</th><th>Права</th><th>Предупр.</th><th>Загружено</th><th /></tr></thead>
          <tbody>
            {queue.map((v) => (
              <tr key={v.id}>
                <td><b>{v.name}</b> <small className="muted">v{v.version}</small></td>
                <td>{v.author_name}</td>
                <td>{v.manifest.permissions.length}</td>
                <td>{v.warnings.length ? <span className="badge badge-warn">{v.warnings.length}</span> : '—'}</td>
                <td>{fmt(v.created_at)}</td>
                <td><button className="btn btn-primary btn-sm" onClick={() => setReview(v)}>Проверить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {sub === 'all' && (
        <>
          <input className="panel-search" type="search" placeholder="Название, id или автор" value={q} onChange={(e) => setQ(e.target.value)} />
          <table className="ext-table">
            <thead><tr><th>Расширение</th><th>Автор</th><th>Библиотеки / проекты</th><th>Статус</th><th /></tr></thead>
            <tbody>
              {all.map((e) => (
                <tr key={e.id}>
                  <td><button className="link-btn" onClick={() => onOpen(e.id)}>{e.name}</button> <small className="muted">{e.slug}</small></td>
                  <td>{e.author_name}{e.author_banned && <span className="badge badge-warn"> бан</span>}</td>
                  <td>{e.library_count} / {e.projects_count}</td>
                  <td>{e.status === 'ACTIVE' ? 'Активно' : <span className="badge badge-warn" title={e.removed_reason ?? ''}>Удалено</span>}</td>
                  <td className="ext-actions">
                    {e.status === 'ACTIVE'
                      ? <button className="btn btn-danger-ghost btn-sm" onClick={() => setAsk({ title: `Удалить «${e.name}»`, label: 'Причина (увидят автор и администраторы проектов)', onOk: (r) => act(() => api.moderation.removeExtension(e.id, r)) })}>Удалить</button>
                      : <button className="btn btn-quiet btn-sm" onClick={() => act(() => api.moderation.restoreExtension(e.id))}>Восстановить</button>}
                    {!e.author_banned && <button className="btn btn-danger-ghost btn-sm" onClick={() => setAsk({ title: `Забанить автора ${e.author_name}`, label: 'Причина бана (только расширения; аккаунт и проекты не затрагиваются)', onOk: (r) => act(() => api.moderation.ban(e.author_name, r)) })}>Бан автора</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {sub === 'reports' && (reports.length === 0 ? <p className="empty">Открытых жалоб нет</p> : (
        <ul className="ext-reports">
          {reports.map((r) => (
            <li key={r.id} className="panel">
              <b><button className="link-btn" onClick={() => onOpen(r.extension_id)}>{r.extension_name}</button></b>
              <small className="muted"> · от {r.reporter_name ?? '—'} · {fmt(r.created_at)}</small>
              <p>{r.reason}</p>
              <button className="btn btn-quiet btn-sm" onClick={() => act(() => api.moderation.resolveReport(r.id))}>Закрыть жалобу</button>
            </li>
          ))}
        </ul>
      ))}

      {sub === 'bans' && (
        <>
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (banId.trim()) setAsk({ title: `Забанить автора ${banId.trim()}`, label: 'Причина бана', onOk: async (r) => { await act(() => api.moderation.ban(banId.trim(), r)); setBanId(''); } }); }}>
            <input value={banId} onChange={(e) => setBanId(e.target.value)} placeholder="Имя или e-mail автора" />
            <button className="btn btn-danger" type="submit">Забанить</button>
          </form>
          {bans.length === 0 ? <p className="empty">Банов нет</p> : (
            <table className="ext-table">
              <thead><tr><th>Автор</th><th>Причина</th><th>Кем / когда</th><th>Расширений</th><th /></tr></thead>
              <tbody>
                {bans.map((b) => (
                  <tr key={b.user_id}>
                    <td><b>{b.username}</b></td><td>{b.reason}</td><td>{b.banned_by_name ?? '—'}, {fmt(b.banned_at)}</td><td>{b.extensions_count}</td>
                    <td><button className="btn btn-quiet btn-sm" onClick={() => act(() => api.moderation.unban(b.user_id))}>Снять бан</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {sub === 'log' && (
        <table className="ext-table">
          <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Причина</th></tr></thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id}><td>{fmt(l.created_at)}</td><td>{l.actor_name}</td><td>{ACTION_LABEL[l.action] ?? l.action}</td><td>{l.target_name ?? '—'}</td><td>{l.reason ?? ''}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {review && <ReviewModal item={review} onClose={() => setReview(null)} onDone={() => { setReview(null); load(); }} />}
      {ask && <ReasonModal {...ask} onClose={() => setAsk(null)} />}
    </>
  );
}

function ReasonModal({ title, label, onOk, onClose }: { title: string; label: string; onOk: (r: string) => Promise<unknown>; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <label className="field"><span>{label}</span><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {err && <div className="notice notice-err">{err}</div>}
      <div className="modal-actions">
        <button className="btn btn-quiet" onClick={onClose}>Отмена</button>
        <button className="btn btn-danger" disabled={busy || reason.trim().length < 5} onClick={async () => { setBusy(true); try { await onOk(reason.trim()); onClose(); } catch (e: any) { setErr(e.message); setBusy(false); } }}>Подтвердить</button>
      </div>
    </Modal>
  );
}

/** Проверка версии: манифест, предупреждения, исходный код файлов; решение — одобрить или отклонить с причиной. */
function ReviewModal({ item, onClose, onDone }: { item: ModQueueItem; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<{ path: string; size: number }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.moderation.files(item.id).then((r) => setFiles(r.files)).catch((e) => setError(e.message));
  }, [item.id]);
  const view = async (path: string) => {
    setOpen(path);
    setText('Загрузка…');
    try {
      setText((await api.moderation.fileText(item.id, path)).text);
    } catch (e: any) {
      setText(`Нельзя показать как текст: ${e.message}`);
    }
  };
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await (approve ? api.moderation.approve(item.id, note.trim() || undefined) : api.moderation.reject(item.id, note.trim()));
      onDone();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`${item.name} ${item.version} — проверка`} onClose={onClose} wide>
      <p className="muted">Автор: {item.author_name} · {fmtSize(item.size_bytes)} · {item.file_count} файлов</p>
      <p>{item.manifest.description}</p>
      <p><b>Права:</b> {item.manifest.permissions.length ? item.manifest.permissions.map((p) => PERMISSION_INFO[p].label).join(', ') : 'нет'}</p>
      {item.warnings.length > 0 && <div className="notice"><b>Предупреждения валидатора:</b><ul>{item.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
      <div className="ext-review">
        <ul className="ext-files">
          {files.map((f) => <li key={f.path}><button className={open === f.path ? 'link-btn active' : 'link-btn'} onClick={() => view(f.path)}>{f.path}</button> <small className="muted">{fmtSize(f.size)}</small></li>)}
        </ul>
        <pre className="ext-code">{open ? text : 'Выберите файл, чтобы прочитать его исходный код. Для полной проверки откройте «Демо» в карточке расширения.'}</pre>
      </div>
      {error && <div className="notice notice-err">{error}</div>}
      <label className="field"><span>Комментарий (при отклонении обязателен)</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="modal-actions">
        <button className="btn btn-quiet" onClick={onClose}>Закрыть</button>
        <button className="btn btn-danger" disabled={busy || note.trim().length < 5} onClick={() => decide(false)}>Отклонить</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>Одобрить</button>
      </div>
    </Modal>
  );
}

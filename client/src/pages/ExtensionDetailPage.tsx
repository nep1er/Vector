import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, extPreviewUrl } from '../api';
import { useAuth } from '../auth/AuthContext';
import ExtCover from '../components/extensions/ExtCover';
import ExtensionFrame from '../components/extensions/ExtensionFrame';
import PermissionPicker from '../components/extensions/PermissionPicker';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import type { ExtensionDetails, PlatformMe } from '../types';
import { STATUS_LABEL, fmtSize } from '../utils/extensions';

type Tab = 'overview' | 'perms' | 'versions';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Страница расширения (как в Figma Community): обложка, кнопка «Добавить», вкладки «Обзор / Права / Версии». */
export default function ExtensionDetailPage() {
  const { extensionId } = useParams();
  const id = Number(extensionId);
  const { user } = useAuth();
  const [d, setD] = useState<ExtensionDetails | null>(null);
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [demo, setDemo] = useState<{ src: string; versionId: number; viewId: string; title: string } | null>(null);

  const load = () => api.extensions.details(id).then(setD).catch((e) => setError(e.message));
  useEffect(() => {
    setD(null);
    setError('');
    load();
    api.extensions.platformMe().then(setMe).catch(() => setMe({ role: null, ban: null, permissions: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startDemo = async (versionId: number, entry: string, viewId: string, title: string) => {
    try {
      const { token } = await api.extensions.previewToken(versionId);
      setDemo({ src: extPreviewUrl(token, versionId, entry), versionId, viewId, title });
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!d || !me || !user) {
    return (
      <div className="wide-page">
        <Link to="/extensions" className="xd-back">← Расширения</Link>
        {error ? <div className="notice notice-err">{error}</div> : <p className="muted">Загрузка…</p>}
      </div>
    );
  }

  const approved = d.versions.find((v) => v.status === 'APPROVED');
  const latest = approved ?? d.versions[0];
  const canPreview = d.author_id === user.id || !!me.role;
  const canAdd = d.status === 'ACTIVE' && !!approved;
  const m = latest?.manifest;
  const view = m?.views[0];

  return (
    <div className="wide-page xd">
      <Link to="/extensions" className="xd-back">← Расширения</Link>

      <section className="xd-hero">
        <ExtCover name={d.name} slug={d.slug} className="xd-cover" />
        <div className="xd-hero-main">
          <h1>{d.name}</h1>
          <p className="xd-by">
            {d.author_name}
            {latest && <> · версия {latest.version}</>}
            {' · '}
            {d.library_count} в библиотеках
          </p>
          <div className="xd-flags">
            {d.author_banned && <span className="badge badge-warn">автор заблокирован</span>}
            {d.status === 'REMOVED' && <span className="badge badge-warn">Удалено: {d.removed_reason}</span>}
          </div>
          <div className="xd-actions">
            {canAdd &&
              (d.in_library ? (
                <button className="btn btn-secondary" disabled={busy} onClick={() => run(() => api.extensions.removeFromLibrary(d.id))}>
                  <Icon name="check" size={16} /> В библиотеке
                </button>
              ) : (
                <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.extensions.addToLibrary(d.id))}>
                  <Icon name="plus" size={16} /> Добавить в библиотеку
                </button>
              ))}
            {canPreview && latest && view && (
              <button className="btn btn-secondary" onClick={() => startDemo(latest.id, view.entry, view.id, view.title)}>
                Демо
              </button>
            )}
            {d.author_id !== user.id && (
              <button className="btn btn-quiet xd-report" onClick={() => setReport('')}>
                Пожаловаться
              </button>
            )}
          </div>
        </div>
      </section>

      {error && <div className="notice notice-err">{error}</div>}

      <div className="xd-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Обзор</button>
        <button role="tab" aria-selected={tab === 'perms'} className={tab === 'perms' ? 'on' : ''} onClick={() => setTab('perms')}>
          Права <b>{m?.permissions.length ?? 0}</b>
        </button>
        <button role="tab" aria-selected={tab === 'versions'} className={tab === 'versions' ? 'on' : ''} onClick={() => setTab('versions')}>
          Версии <b>{d.versions.length}</b>
        </button>
      </div>

      <div className="xd-cols">
        <div className="xd-main">
          {tab === 'overview' && (
            <>
              <p className="xd-lead">{d.summary}</p>
              {m && m.description && m.description !== d.summary && <p className="xd-text">{m.description}</p>}
              {m && (m.views.length > 0 || m.taskPanels.length > 0 || (m.guards?.length ?? 0) > 0) && (
                <>
                  <h3 className="xd-h">Что добавляет в проект</h3>
                  <ul className="xd-feats">
                    {m.views.map((v) => (
                      <li key={v.id}><span className="xd-feat-ico"><Icon name="dashboard" size={18} /></span><div><b>{v.title}</b><small>Отдельная страница внутри проекта</small></div></li>
                    ))}
                    {m.taskPanels.map((v) => (
                      <li key={v.id}><span className="xd-feat-ico"><Icon name="tasks" size={18} /></span><div><b>{v.title}</b><small>Вкладка в окне задачи</small></div></li>
                    ))}
                    {(m.guards ?? []).map((g, i) => (
                      <li key={i}><span className="xd-feat-ico"><Icon name="shift" size={18} /></span><div><b>Правило смены статуса</b><small>Может не давать начать задачу, пока не выполнены связанные</small></div></li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {tab === 'perms' && (
            <>
              <p className="xp-hint">Эти права расширение запрашивает. При подключении администратор проекта решает, какие из них выдать.</p>
              {latest ? <PermissionPicker asked={latest.manifest.permissions} value={latest.manifest.permissions} readOnly /> : <p className="muted">Нет версий.</p>}
            </>
          )}

          {tab === 'versions' && (
            <ul className="xd-versions">
              {d.versions.map((v) => (
                <li key={v.id}>
                  <div className="xd-ver-top">
                    <b>{v.version}</b>
                    <span className={`badge ext-st-${v.status.toLowerCase()}`}>{STATUS_LABEL[v.status]}</span>
                    <span className="muted xd-ver-date">{fmtDate(v.created_at)} · {fmtSize(v.size_bytes)}</span>
                    {canPreview && v.manifest.views[0] && (
                      <button className="btn btn-quiet btn-sm" onClick={() => startDemo(v.id, v.manifest.views[0].entry, v.manifest.views[0].id, v.manifest.views[0].title)}>Демо</button>
                    )}
                  </div>
                  {v.review_note && <p className="muted">{v.review_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="xd-facts">
          <dl>
            <div><dt>Автор</dt><dd>{d.author_name}</dd></div>
            {latest && <div><dt>Версия</dt><dd>{latest.version}</dd></div>}
            {latest && <div><dt>Обновлено</dt><dd>{fmtDate(latest.created_at)}</dd></div>}
            {latest && <div><dt>Размер</dt><dd>{fmtSize(latest.size_bytes)} · {latest.file_count} файл.</dd></div>}
            <div><dt>В библиотеках</dt><dd>{d.library_count}</dd></div>
          </dl>
        </aside>
      </div>

      {demo && (
        <Modal title={`Демо: ${d.name}`} subtitle="Данные вымышленные, ваш проект не затрагивается" onClose={() => setDemo(null)} size="lg">
          <div className="ext-demo">
            <ExtensionFrame
              src={demo.src}
              title={demo.title}
              extensionId={d.id}
              permissions={d.versions.find((x) => x.id === demo.versionId)!.manifest.permissions}
              viewId={demo.viewId}
              demo
            />
          </div>
        </Modal>
      )}

      {report !== null && (
        <Modal title="Пожаловаться на расширение" onClose={() => setReport(null)} size="sm">
          <label className="field">
            <span>Что не так?</span>
            <textarea rows={4} maxLength={1000} placeholder="Опишите проблему — её увидят модераторы" value={report} onChange={(e) => setReport(e.target.value)} autoFocus />
          </label>
          <div className="modal-actions">
            <button className="btn btn-quiet" onClick={() => setReport(null)}>Отмена</button>
            <button
              className="btn btn-primary"
              disabled={busy || report.trim().length < 5}
              onClick={() => run(async () => { await api.extensions.report(d.id, report.trim()); setReport(null); })}
            >
              Отправить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

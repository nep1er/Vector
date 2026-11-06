import { useEffect, useState } from 'react';
import { api, extPreviewUrl } from '../../api';
import type { ExtensionDetails, PlatformRole } from '../../types';
import { STATUS_LABEL, fmtSize } from '../../utils/extensions';
import Modal from '../Modal';
import ExtensionFrame from './ExtensionFrame';
import PermissionPicker from './PermissionPicker';

interface Props {
  extensionId: number;
  me: { id: number; role: PlatformRole };
  onClose: () => void;
  onChanged: () => void;
}

/** Карточка расширения: описание, права, версии, добавление в библиотеку, жалоба, демо-запуск для автора/модератора. */
export default function ExtensionDetailsModal({ extensionId, me, onClose, onChanged }: Props) {
  const [d, setD] = useState<ExtensionDetails | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [demo, setDemo] = useState<{ src: string; versionId: number; viewId: string; title: string } | null>(null);

  const load = () => api.extensions.details(extensionId).then(setD).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensionId]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
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

  if (!d) return <Modal title="Расширение" onClose={onClose}>{error ? <div className="notice notice-err">{error}</div> : <p className="muted">Загрузка…</p>}</Modal>;

  const approved = d.versions.find((v) => v.status === 'APPROVED') ?? d.versions[0];
  const canPreview = d.author_id === me.id || !!me.role;

  if (demo) {
    const v = d.versions.find((x) => x.id === demo.versionId)!;
    return (
      <Modal title={`Демо: ${d.name}`} onClose={() => setDemo(null)} wide>
        <p className="muted">Демо-режим: данные вымышленные, ваш проект не затрагивается. Права: {v.manifest.permissions.join(', ') || 'нет'}.</p>
        <div className="ext-demo">
          <ExtensionFrame src={demo.src} title={demo.title} extensionId={d.id} permissions={v.manifest.permissions} viewId={demo.viewId} demo />
        </div>
        <div className="modal-actions"><button className="btn btn-quiet" onClick={() => setDemo(null)}>Назад</button></div>
      </Modal>
    );
  }

  return (
    <Modal title={d.name} onClose={onClose} wide>
      <div className="ext-meta">
        <span>Автор: <b>{d.author_name}</b>{d.author_banned && <span className="badge badge-warn"> заблокирован</span>}</span>
        <span>В библиотеках: {d.library_count}</span>
        {d.status === 'REMOVED' && <span className="badge badge-warn">Удалено: {d.removed_reason}</span>}
      </div>
      <p>{d.summary}</p>
      {error && <div className="notice notice-err">{error}</div>}

      {approved && (
        <>
          <h3 className="ext-h">Какие права запрашивает ({approved.version})</h3>
          <PermissionPicker asked={approved.manifest.permissions} value={approved.manifest.permissions} readOnly />
        </>
      )}

      <h3 className="ext-h">Версии</h3>
      <ul className="ext-versions">
        {d.versions.map((v) => (
          <li key={v.id}>
            <b>{v.version}</b>
            <span className={`badge ext-st-${v.status.toLowerCase()}`}>{STATUS_LABEL[v.status]}</span>
            <span className="muted">{fmtSize(v.size_bytes)} · {v.file_count} файлов</span>
            {v.review_note && <span className="muted">— {v.review_note}</span>}
            {canPreview && v.manifest.views[0] && (
              <button className="btn btn-quiet btn-sm" onClick={() => startDemo(v.id, v.manifest.views[0].entry, v.manifest.views[0].id, v.manifest.views[0].title)}>Демо</button>
            )}
          </li>
        ))}
      </ul>

      {report !== null && (
        <div className="ext-report">
          <textarea rows={3} maxLength={1000} placeholder="Что не так с этим расширением?" value={report} onChange={(e) => setReport(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || report.trim().length < 5} onClick={() => run(async () => { await api.extensions.report(d.id, report.trim()); setReport(null); })}>Отправить</button>
          <button className="btn btn-quiet" onClick={() => setReport(null)}>Отмена</button>
        </div>
      )}

      <div className="modal-actions">
        {d.status === 'ACTIVE' && d.versions.some((v) => v.status === 'APPROVED') && (
          d.in_library
            ? <button className="btn btn-quiet" disabled={busy} onClick={() => run(() => api.extensions.removeFromLibrary(d.id))}>Убрать из библиотеки</button>
            : <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.extensions.addToLibrary(d.id))}>Добавить в библиотеку</button>
        )}
        {d.author_id !== me.id && report === null && <button className="btn btn-quiet" onClick={() => setReport('')}>Пожаловаться</button>}
        <button className="btn btn-quiet" onClick={onClose}>Закрыть</button>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, extFileUrl } from '../api';
import ExtensionFrame from '../components/extensions/ExtensionFrame';
import type { ProjectExtension } from '../types';

/** Полноэкранная страница расширения внутри проекта: /projects/:projectId/ext/:extensionId/:viewId */
export default function ExtensionViewPage() {
  const { projectId, extensionId, viewId } = useParams();
  const pid = Number(projectId);
  const [ext, setExt] = useState<ProjectExtension | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.extensions.forProject(pid)
      .then((list) => setExt(list.find((x) => x.extension_id === Number(extensionId)) ?? null))
      .catch((e) => setError(e.message));
  }, [pid, extensionId]);

  const view = ext?.manifest.views.find((v) => v.id === viewId);
  const reason = !ext ? 'Расширение не подключено к этому проекту' : !ext.enabled ? 'Расширение отключено администратором проекта' : ext.unusable ? 'Расширение недоступно (удалено модератором, автор заблокирован или нет одобренной версии)' : !ext.granted_permissions.includes('ui:view') ? 'Проект не выдал расширению право показывать страницы' : !view ? 'Такой страницы нет в расширении' : '';

  return (
    <div className="ext-page">
      <header className="ext-page-head">
        <Link to={`/projects/${pid}`} className="btn btn-quiet">← К проекту</Link>
        <b>{view?.title ?? 'Расширение'}</b>
        {ext && <small className="muted">{ext.name} v{ext.version} · автор {ext.author_name}</small>}
      </header>
      {error && <div className="notice notice-err">{error}</div>}
      {ext && reason && <div className="notice notice-err">{reason}</div>}
      {!ext && !error && <p className="muted">Загрузка…</p>}
      {ext && !reason && view && (
        <ExtensionFrame
          src={extFileUrl(ext.version_id, view.entry)}
          title={view.title}
          extensionId={ext.extension_id}
          permissions={ext.granted_permissions}
          projectId={pid}
          viewId={view.id}
        />
      )}
    </div>
  );
}

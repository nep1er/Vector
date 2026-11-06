import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { ProjectExtension } from '../../types';
import Dropdown from '../Dropdown';
import Icon from '../Icon';

/** Кнопка на панели проекта: страницы подключённых расширений (только рабочие, включённые и с правом ui:view). */
export default function ProjectExtensionsMenu({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ProjectExtension[]>([]);
  useEffect(() => {
    api.extensions.forProject(projectId).then((r) => setItems(r.filter((x) => x.usable && x.granted_permissions.includes('ui:view') && x.manifest.views.length))).catch(() => setItems([]));
  }, [projectId]);
  if (items.length === 0) return null;
  return (
    <Dropdown placement="right" buttonClassName="rail-btn" ariaLabel="Расширения проекта" title="Расширения" button={<Icon name="puzzle" />}>
      <div className="ext-menu">
        <strong>Расширения проекта</strong>
        {items.flatMap((x) =>
          x.manifest.views.map((v) => (
            <Link key={`${x.id}-${v.id}`} to={`/projects/${projectId}/ext/${x.extension_id}/${v.id}`} className="ext-menu-link">
              <span>{v.title}</span>
              <small className="muted">{x.name}</small>
            </Link>
          )),
        )}
      </div>
    </Dropdown>
  );
}

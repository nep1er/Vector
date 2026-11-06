import { useEffect, useState } from 'react';
import { api, extFileUrl } from '../../api';
import type { ProjectExtension } from '../../types';
import ExtensionFrame from './ExtensionFrame';

/** Панели расширений внутри окна задачи (право ui:task-panel). Высоту панели задаёт расширение через ui.resize. */
export default function TaskExtensionPanels({ projectId, taskId }: { projectId: number; taskId: number }) {
  const [items, setItems] = useState<ProjectExtension[]>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  useEffect(() => {
    api.extensions.forProject(projectId).then((r) => setItems(r.filter((x) => x.usable && x.granted_permissions.includes('ui:task-panel') && x.manifest.taskPanels.length))).catch(() => setItems([]));
  }, [projectId]);
  if (items.length === 0) return null;
  return (
    <div className="ext-panels">
      {items.flatMap((x) =>
        x.manifest.taskPanels.map((pn) => {
          const key = `${x.id}-${pn.id}`;
          return (
            <section key={key} className="ext-panel-box">
              <h4>{pn.title} <small className="muted">· {x.name}</small></h4>
              <ExtensionFrame
                panel
                src={extFileUrl(x.version_id, pn.entry)}
                title={pn.title}
                extensionId={x.extension_id}
                permissions={x.granted_permissions}
                projectId={projectId}
                viewId={pn.id}
                context={{ taskId }}
                height={heights[key] ?? pn.height ?? 160}
                onHeight={(h) => setHeights((s) => ({ ...s, [key]: h }))}
              />
            </section>
          );
        }),
      )}
    </div>
  );
}

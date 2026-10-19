import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import CreateTaskModal from '../components/CreateTaskModal';
import Icon from '../components/Icon';
import ProjectSettingsModal from '../components/ProjectSettingsModal';
import TaskInspector from '../components/TaskInspector';
import Timeline from '../components/Timeline';
import type { ProjectDetails, TaskNode } from '../types';

/** Путь от корня дерева до узла с нужным id */
function findPath(nodes: TaskNode[], id: number, trail: TaskNode[] = []): TaskNode[] | null {
  for (const node of nodes) {
    const next = [...trail, node];
    if (node.id === id) return next;
    const found = findPath(node.children, id, next);
    if (found) return found;
  }
  return null;
}

export default function ProjectPage() {
  const { projectId, roadmapId } = useParams();
  const pid = Number(projectId);
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [tree, setTree] = useState<TaskNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([api.projects.get(pid), api.tasks.tree(pid)]);
      setProject(p);
      setTree(t);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить проект');
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    load();
  }, [load]);

  if (loading) return <div className="muted">Загрузка…</div>;

  if (error || !project) {
    return (
      <div className="notice notice-err">
        {error || 'Проект не найден'}{' '}
        <Link to="/" className="link-btn">
          К проектам
        </Link>
      </div>
    );
  }

  const can = (permission: string) =>
    project.permissions.includes(permission) || project.permissions.includes('ADMIN');

  const root = tree[0];
  const path = roadmapId ? findPath(tree, Number(roadmapId)) : root ? [root] : null;
  const current = path ? path[path.length - 1] : undefined;

  if (!root || !current || current.type !== 'ROADMAP' || !path) {
    return (
      <div className="notice notice-err">
        Этап не найден{' '}
        <Link to={`/projects/${pid}`} className="link-btn">
          К главной RoadMap
        </Link>
      </div>
    );
  }

  const openRoadmap = (task: TaskNode) => navigate(`/projects/${pid}/roadmap/${task.id}`);
  const selected = current.children.find((t) => t.id === selectedId) ?? null;
  const isRoot = current.id === root.id;

  return (
    <>
      <nav className="crumbs" aria-label="Путь">
        <Link to="/">Проекты</Link>
        <span className="crumb-sep">/</span>
        {isRoot ? (
          <span className="crumb-current">{project.title}</span>
        ) : (
          <Link to={`/projects/${pid}`}>{project.title}</Link>
        )}
        {path.slice(1).map((node, i, arr) => (
          <span key={node.id} className="crumb-group">
            <span className="crumb-sep">/</span>
            {i === arr.length - 1 ? (
              <span className="crumb-current">{node.title}</span>
            ) : (
              <Link to={`/projects/${pid}/roadmap/${node.id}`}>{node.title}</Link>
            )}
          </span>
        ))}
      </nav>

      <div className="page-head">
        <h1>{isRoot ? project.title : current.title}</h1>
        <div className="page-actions">
          {can('ADMIN') && (
            <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
              <Icon name="settings" size={18} />
              Настройки
            </button>
          )}
          {(can('WRITE') || can('EXECUTE')) && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={18} />
              Добавить задачу
            </button>
          )}
        </div>
      </div>

      <div className={selected ? 'roadmap-layout has-inspector' : 'roadmap-layout'}>
        <Timeline
          key={current.id}
          tasks={current.children}
          range={{ start: current.start_date, end: current.end_date }}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpen={openRoadmap}
        />
        {selected && (
          <TaskInspector
            task={selected}
            canEdit={can('EXECUTE')}
            onChanged={load}
            onClose={() => setSelectedId(null)}
            onOpen={openRoadmap}
          />
        )}
      </div>

      {showCreate && (
        <CreateTaskModal
          projectId={pid}
          parent={current}
          canRoadmap={can('EXECUTE')}
          canTodo={can('WRITE')}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            await load();
            setShowCreate(false);
          }}
        />
      )}

      {showSettings && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setShowSettings(false)}
          onSaved={load}
        />
      )}
    </>
  );
}

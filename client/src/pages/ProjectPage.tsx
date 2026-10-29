import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import AddMemberModal from '../components/AddMemberModal';
import CreateTaskModal from '../components/CreateTaskModal';
import Icon from '../components/Icon';
import ProjectSettingsModal from '../components/ProjectSettingsModal';
import type { SettingsTab } from '../components/ProjectSettingsModal';
import ProjectShell from '../components/ProjectShell';
import ShiftModal from '../components/ShiftModal';
import RoadmapFilters from '../components/RoadmapFilters';
import StoragesSection from '../components/StoragesSection';
import TaskInspector from '../components/TaskInspector';
import Timeline from '../components/Timeline';
import type { Participant, ProjectDetails, ProjectRole, TaskNode, TaskTag } from '../types';
import { EMPTY_FILTERS, matchesFilters } from '../utils/status';
import type { TaskFilters } from '../utils/status';

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
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showShift, setShowShift] = useState(false);
  const [dragError, setDragError] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [projectTags, setProjectTags] = useState<TaskTag[]>([]);
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);

  const load = useCallback(async () => {
    try {
      const [p, t, members, tags, roles] = await Promise.all([
        api.projects.get(pid),
        api.tasks.tree(pid),
        api.projects.participants(pid),
        api.taskTags.listByProject(pid),
        api.roles.listByProject(pid),
      ]);
      setProject(p);
      setTree(t);
      setParticipants(members);
      setProjectTags(tags);
      setProjectRoles(roles);
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
    setFilters(EMPTY_FILTERS);
    load();
  }, [load]);

  const filterTasks = useMemo(
    () => (nodes: TaskNode[]) => nodes.filter((t) => matchesFilters(t, filters)),
    [filters],
  );

  if (loading) return <div className="pcontent muted">Загрузка…</div>;

  if (error || !project) {
    return (
      <div className="pcontent">
        <div className="notice notice-err">
          {error || 'Проект не найден'}{' '}
          <Link to="/" className="link-btn">
            К проектам
          </Link>
        </div>
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
      <div className="pcontent">
        <div className="notice notice-err">
          Этап не найден{' '}
          <Link to={`/projects/${pid}`} className="link-btn">
            К главной RoadMap
          </Link>
        </div>
      </div>
    );
  }

  const openRoadmap = (task: TaskNode) =>
    navigate(task.type === 'TODO' ? `/projects/${pid}/todo/${task.id}` : `/projects/${pid}/roadmap/${task.id}`);
  const visible = filterTasks(current.children);
  const selected = current.children.find((t) => t.id === selectedId) ?? null;
  const isRoot = current.id === root.id;

  const crumbs = [
    { label: 'Проекты', to: '/' },
    isRoot
      ? { label: project.title }
      : { label: project.title, to: `/projects/${pid}` },
    ...path.slice(1).map((node, i, arr) => ({
      label: node.title,
      to: i === arr.length - 1 ? undefined : `/projects/${pid}/roadmap/${node.id}`,
    })),
  ];

  return (
    <ProjectShell
      crumbs={crumbs}
      participants={participants}
      canInvite={can('ADMIN')}
      canAddTask={can('WRITE') || can('EXECUTE')}
      canSettings
      canManage={can('ADMIN')}
      onParticipants={() => setSettingsTab('members')}
      onAddMember={() => setShowAddMember(true)}
      onAddTask={() => setShowCreate(true)}
      onSettings={() => setSettingsTab('general')}
      onShift={() => setShowShift(true)}
      onDashboard={can('EXECUTE') ? () => navigate(`/projects/${pid}/dashboard`) : undefined}
      filterSlot={<RoadmapFilters tags={projectTags} value={filters} onChange={setFilters} />}
    >
      <div className={selected ? 'roadmap-layout has-inspector' : 'roadmap-layout'}>
        <Timeline
          key={current.id}
          tasks={visible}
          range={{ start: current.start_date, end: current.end_date }}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpen={openRoadmap}
          canEdit={can('EXECUTE')}
          onChangeDates={async (task, startDate, endDate) => {
            try {
              // вложенные задачи едут вместе с этапом
              await api.tasks.updateDates(task.id, startDate, endDate, true);
              await load();
            } catch (e: any) {
              setDragError(e.message ?? 'Не удалось изменить сроки');
              throw e;
            }
          }}
        />
        {dragError && (
          <div className="notice notice-err drag-error" role="alert" onClick={() => setDragError('')}>
            {dragError}
          </div>
        )}
        {selected && (
          <TaskInspector
            task={selected}
            canEdit={can('EXECUTE')}
            projectTags={projectTags}
            projectRoles={projectRoles}
            onChanged={load}
            onClose={() => setSelectedId(null)}
            onOpen={openRoadmap}
          />
        )}
      </div>

      {/* Хранилища живут только на главной RoadMap проекта */}
      {isRoot && <StoragesSection projectId={pid} canManage={can('EXECUTE')} />}

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

      {showShift && (
        <ShiftModal
          projectId={pid}
          roadmapId={current.id}
          roadmapTitle={current.title}
          canManage={can('EXECUTE')}
          onClose={() => setShowShift(false)}
          onChanged={load}
        />
      )}

      {showAddMember && (
        <AddMemberModal projectId={pid} onClose={() => setShowAddMember(false)} onInvited={load} />
      )}

      {settingsTab && (
        <ProjectSettingsModal
          project={project}
          initialTab={settingsTab}
          canManage={can('ADMIN')}
          onClose={() => setSettingsTab(null)}
          onSaved={load}
        />
      )}
    </ProjectShell>
  );
}

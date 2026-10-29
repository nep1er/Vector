import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import AddMemberModal from '../components/AddMemberModal';
import CardModal from '../components/CardModal';
import KanbanBoard from '../components/KanbanBoard';
import ProjectSettingsModal from '../components/ProjectSettingsModal';
import type { SettingsTab } from '../components/ProjectSettingsModal';
import ProjectShell from '../components/ProjectShell';
import type { KanbanColumn, KanbanTag, Participant, ProjectDetails, TaskNode } from '../types';

function findPath(nodes: TaskNode[], id: number, trail: TaskNode[] = []): TaskNode[] | null {
  for (const node of nodes) {
    const next = [...trail, node];
    if (node.id === id) return next;
    const found = findPath(node.children, id, next);
    if (found) return found;
  }
  return null;
}

/** Экран ToDo-задачи: канбан-доска в том же изолированном окне проекта. */
export default function TodoPage() {
  const { projectId, todoId } = useParams();
  const pid = Number(projectId);
  const tid = Number(todoId);

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [tree, setTree] = useState<TaskNode[]>([]);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tags, setTags] = useState<KanbanTag[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addColumnSignal, setAddColumnSignal] = useState(0);

  const load = useCallback(async () => {
    try {
      const [p, t, members, board, kt] = await Promise.all([
        api.projects.get(pid),
        api.tasks.tree(pid),
        api.projects.participants(pid),
        api.kanban.getBoard(tid),
        api.kanbanTags.listByProject(pid),
      ]);
      setProject(p);
      setTree(t);
      setParticipants(members);
      setColumns(board);
      setTags(kt);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить доску');
    } finally {
      setLoading(false);
    }
  }, [pid, tid]);

  useEffect(() => {
    setLoading(true);
    setOpenCardId(null);
    load();
  }, [load]);

  // Подтягиваем изменения других участников, пока доска открыта и вкладка активна
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && openCardId === null) load();
    }, 15000);
    return () => window.clearInterval(id);
  }, [load, openCardId]);

  if (loading) return <div className="pcontent muted">Загрузка…</div>;

  const path = findPath(tree, tid);
  const todo = path?.[path.length - 1];

  if (error || !project || !path || !todo || todo.type !== 'TODO') {
    return (
      <div className="pcontent">
        <div className="notice notice-err">
          {error || 'Доска не найдена'}{' '}
          <Link to={`/projects/${pid}`} className="link-btn">
            К RoadMap проекта
          </Link>
        </div>
      </div>
    );
  }

  const can = (permission: string) =>
    project.permissions.includes(permission) || project.permissions.includes('ADMIN');
  const canEdit = can('WRITE');

  const openCard = columns.flatMap((c) => c.cards).find((c) => c.id === openCardId) ?? null;

  const crumbs = [
    { label: 'Проекты', to: '/' },
    { label: project.title, to: `/projects/${pid}` },
    ...path.slice(1).map((node, i, arr) => ({
      label: node.title,
      to:
        i === arr.length - 1
          ? undefined
          : `/projects/${pid}/roadmap/${node.id}`,
    })),
  ];

  return (
    <ProjectShell
      crumbs={crumbs}
      participants={participants}
      canInvite={can('ADMIN')}
      canAddTask={canEdit}
      addLabel="Добавить колонку"
      canSettings
      canManage={can('ADMIN')}
      onParticipants={() => setSettingsTab('members')}
      onAddMember={() => setShowAddMember(true)}
      onAddTask={() => setAddColumnSignal((n) => n + 1)}
      onSettings={() => setSettingsTab('general')}
    >
      {actionError && (
        <div className="notice notice-err kboard-error" role="alert">
          {actionError}{' '}
          <button className="link-btn" onClick={() => setActionError('')}>
            Скрыть
          </button>
        </div>
      )}
      <KanbanBoard
        key={addColumnSignal /* кнопка «+» в панели открывает форму новой колонки */}
        todoId={tid}
        columns={columns}
        canEdit={canEdit}
        startAddingColumn={addColumnSignal > 0}
        onReload={load}
        onOpenCard={(c) => setOpenCardId(c.id)}
        onError={setActionError}
      />

      {openCard && (
        <CardModal
          card={openCard}
          projectId={pid}
          columns={columns}
          projectTags={tags}
          participants={participants}
          canEdit={canEdit}
          isAdmin={can('ADMIN')}
          onChanged={load}
          onClose={() => setOpenCardId(null)}
        />
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
      {showAddMember && (
        <AddMemberModal
          projectId={pid}
          onClose={() => setShowAddMember(false)}
          onInvited={async () => {
            await load();
          }}
        />
      )}
    </ProjectShell>
  );
}

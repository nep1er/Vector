import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CreateProjectModal from '../components/CreateProjectModal';
import type { Project } from '../types';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProjects(await api.projects.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить проекты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev]);
    setShowCreate(false);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Мои проекты</h1>
          <p className="muted">Проекты, в которых вы участвуете</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          Создать проект
        </button>
      </div>

      {loading && <div className="muted">Загружаем проекты…</div>}

      {!loading && error && (
        <div className="notice notice-err">
          {error}{' '}
          <button className="link-btn" onClick={load}>
            Повторить
          </button>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="empty">
          <h2>Проектов пока нет</h2>
          <p className="muted">Создайте первый проект — и запланируйте год по месяцам.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Создать проект
          </button>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <ul className="project-grid">
          {projects.map((p) => (
            <li key={p.id} className="project-card">
              <h3>{p.title}</h3>
              <p className={p.description ? 'project-desc' : 'project-desc muted'}>
                {p.description || 'Без описания'}
              </p>
              <div className="project-meta">Создан {formatDate(p.created_at)}</div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </>
  );
}

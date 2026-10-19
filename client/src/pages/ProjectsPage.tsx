import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CreateProjectModal from '../components/CreateProjectModal';
import Icon from '../components/Icon';
import type { Project } from '../types';

const GRADIENTS = 6;

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
        <h1>Проекты</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={18} />
          Создать проект
        </button>
      </div>

      {error && (
        <div className="notice notice-err">
          {error}{' '}
          <button className="link-btn" onClick={load}>
            Повторить
          </button>
        </div>
      )}

      {loading ? (
        <ul className="tiles" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="tile skeleton" />
          ))}
        </ul>
      ) : (
        !error && (
          <ul className="tiles">
            {projects.map((p) => (
              <li key={p.id} className="tile" title={p.description ?? undefined}>
                <div
                  className="tile-cover"
                  style={{ background: `var(--gradient-project-${(p.id % GRADIENTS) + 1})` }}
                />
                <div className="tile-title">{p.title}</div>
              </li>
            ))}
            <li>
              <button className="tile tile-create" onClick={() => setShowCreate(true)}>
                Создать проект
              </button>
            </li>
          </ul>
        )
      )}

      {showCreate && (
        <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </>
  );
}

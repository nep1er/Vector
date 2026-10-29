import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../api';
import CreateProjectModal from '../components/CreateProjectModal';
import Icon from '../components/Icon';
import type { Project } from '../types';

const GRADIENTS = 6;

export default function ProjectsPage() {
  const navigate = useNavigate();
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

  // После создания сразу открываем главную RoadMap нового проекта
  const handleCreated = (project: Project) => {
    setShowCreate(false);
    navigate(`/projects/${project.id}`);
  };

  const [q, setQ] = useState('');
  const shown = projects.filter((p) => `${p.title} ${p.description ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="wide-page">
      <div className="page-head">
        <div>
          <h1>Проекты</h1>
          {!loading && projects.length > 0 && <p className="muted">Всего проектов: {projects.length}</p>}
        </div>
        {projects.length > 0 && (
          <input className="home-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти проект" aria-label="Найти проект" />
        )}
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
        !error &&
        (projects.length === 0 ? (
          <div className="empty">
            <Icon name="folder" size={32} />
            <h2>Проектов пока нет</h2>
          </div>
        ) : (
          <ul className="tiles tiles-big">
            {shown.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="tile tile-big" title={p.description ?? undefined}>
                  <div
                    className="tile-cover"
                    style={{ background: `var(--gradient-project-${(p.id % GRADIENTS) + 1})` }}
                  >
                    {p.avatar_url ? (
                      <img className="tile-img" src={assetUrl(p.avatar_url) ?? ''} alt="" />
                    ) : (
                      <span className="tile-letter">{p.title.trim().charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="tile-body">
                    <div className="tile-title">{p.title}</div>
                    <p className="tile-desc">{p.description || 'Без описания'}</p>
                    <span className="muted tile-date">Создан {new Date(p.created_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                </Link>
              </li>
            ))}
            {shown.length === 0 && <li className="muted">Ничего не найдено.</li>}
          </ul>
        ))
      )}

      {showCreate && (
        <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

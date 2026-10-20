import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Participant } from '../types';
import Avatar from './Avatar';
import Icon from './Icon';
import Logo from './Logo';

export interface Crumb {
  label: string;
  to?: string;
}

interface Props {
  crumbs: Crumb[];
  participants: Participant[];
  canInvite: boolean;
  canAddTask: boolean;
  canSettings: boolean;
  onParticipants: () => void;
  onAddMember: () => void;
  onAddTask: () => void;
  onSettings: () => void;
  children: ReactNode;
}

/**
 * Изолированный экран проекта: без глобального меню «Проекты / Задачи / Уведомления».
 * Слева — тонкая панель (участники, «Добавить задачу», «Настройки»),
 * сверху — хлебные крошки, всё остальное место занимает RoadMap.
 */
export default function ProjectShell(p: Props) {
  return (
    <div className="pshell">
      <aside className="rail" aria-label="Панель проекта">
        <Link to="/" className="rail-logo" title="К списку проектов" aria-label="К списку проектов">
          <Logo height={22} />
        </Link>

        <div className="rail-section">
          <button
            className="rail-btn"
            title="Участники"
            aria-label="Участники проекта"
            onClick={p.onParticipants}
          >
            <Icon name="users" />
          </button>
          <div className="rail-avatars">
            {p.participants.map((m) => (
              <span key={m.participant_id} title={`${m.username}${m.roles[0] ? ` — ${m.roles[0].name}` : ''}`}>
                <Avatar user={m} size={30} />
              </span>
            ))}
          </div>
          {p.canInvite && (
            <button
              className="rail-btn"
              title="Добавить участника"
              aria-label="Добавить участника"
              onClick={p.onAddMember}
            >
              <Icon name="user-plus" />
            </button>
          )}
        </div>

        <div className="rail-section rail-bottom">
          {p.canAddTask && (
            <button className="rail-btn" title="Добавить задачу" aria-label="Добавить задачу" onClick={p.onAddTask}>
              <Icon name="plus" />
            </button>
          )}
          {p.canSettings && (
            <button className="rail-btn" title="Настройки" aria-label="Настройки" onClick={p.onSettings}>
              <Icon name="settings" />
            </button>
          )}
        </div>
      </aside>

      <div className="pmain">
        <nav className="crumbs pcrumbs" aria-label="Путь">
          {p.crumbs.map((c, i) => (
            <span key={`${i}-${c.label}`} className="crumb-group">
              {i > 0 && <span className="crumb-sep">/</span>}
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span className="crumb-current">{c.label}</span>}
            </span>
          ))}
        </nav>
        <div className="pcontent">{p.children}</div>
      </div>
    </div>
  );
}

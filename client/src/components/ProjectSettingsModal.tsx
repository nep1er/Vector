import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { ProjectDetails } from '../types';
import Icon from './Icon';
import type { IconName } from './Icon';
import Modal from './Modal';
import GeneralTab from './settings/GeneralTab';
import MembersTab from './settings/MembersTab';
import RolesTab from './settings/RolesTab';
import TagsTab from './settings/TagsTab';
import ExtensionsTab from './settings/ExtensionsTab';

export type SettingsTab = 'general' | 'members' | 'roles' | 'tags' | 'extensions';

const TABS: { id: SettingsTab; label: string; icon: IconName; hint: string }[] = [
  { id: 'general', label: 'Общие', icon: 'settings', hint: 'Название, описание и аватар проекта.' },
  { id: 'members', label: 'Участники', icon: 'users', hint: 'Кто работает в проекте и какие у него роли.' },
  { id: 'roles', label: 'Роли', icon: 'user', hint: 'Наборы прав доступа для участников.' },
  { id: 'tags', label: 'Теги задач', icon: 'filter', hint: 'Метки для задач RoadMap и ToDo.' },
  { id: 'extensions', label: 'Расширения', icon: 'puzzle', hint: 'Подключённые к проекту расширения и их права.' },
];

interface Props {
  project: ProjectDetails;
  initialTab?: SettingsTab;
  /** Право ADMIN. Без него окно только для просмотра: «Общие» и «Участники», ничего нельзя менять */
  canManage?: boolean;
  onClose: () => void;
  /** Что-то изменилось (название, участники, роли, теги) — страница перезагружает данные */
  onSaved: () => Promise<void> | void;
}

export default function ProjectSettingsModal({ project, initialTab = 'general', canManage = true, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leaveError, setLeaveError] = useState('');
  const leave = async () => {
    if (!window.confirm(`Покинуть проект «${project.title}»? Вернуться можно будет только по новому приглашению.`)) return;
    try {
      await api.projects.leave(project.id);
      navigate('/');
    } catch (e: any) {
      setLeaveError(e.message);
    }
  };
  const tabs = canManage ? TABS : TABS.filter((t) => t.id === 'general' || t.id === 'members');
  const [tab, setTab] = useState<SettingsTab>(tabs.some((t) => t.id === initialTab) ? initialTab : 'general');

  const current = tabs.find((t) => t.id === tab)!;

  return (
    <Modal title={canManage ? 'Настройки проекта' : 'О проекте'} subtitle={project.title} onClose={onClose} size="xl" flush dismissOnBackdrop={false}>
      <div className="set-layout">
        <nav className="set-nav" role="tablist" aria-label="Разделы настроек">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'set-nav-item on' : 'set-nav-item'}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </button>
          ))}
          <button className="set-leave" onClick={leave}>
            <Icon name="logout" size={18} />
            <span>Покинуть проект</span>
          </button>
        </nav>

        <div className="set-content">
          <div className="set-head">
            <h3>{current.label}</h3>
            <p className="muted">{current.hint}</p>
          </div>
          {leaveError && <div className="notice notice-err">{leaveError}</div>}
          <div className="tab-body">
            {tab === 'general' &&
              (canManage ? (
                <GeneralTab project={project} onChanged={onSaved} />
              ) : (
                <dl className="project-info">
                  <dt>Название</dt>
                  <dd>{project.title}</dd>
                  <dt>Описание</dt>
                  <dd>{project.description || '—'}</dd>
                  <dt>Создан</dt>
                  <dd>{new Date(project.created_at).toLocaleDateString('ru-RU')}</dd>
                </dl>
              ))}
            {tab === 'members' && (
              <MembersTab projectId={project.id} currentUserId={user?.id ?? 0} onChanged={onSaved} readOnly={!canManage} />
            )}
            {canManage && tab === 'roles' && <RolesTab projectId={project.id} onChanged={onSaved} />}
            {canManage && tab === 'tags' && <TagsTab projectId={project.id} onChanged={onSaved} />}
            {canManage && tab === 'extensions' && <ExtensionsTab projectId={project.id} onChanged={onSaved} />}
          </div>
        </div>
      </div>
    </Modal>
  );
}

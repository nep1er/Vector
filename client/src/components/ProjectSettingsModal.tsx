import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { ProjectDetails } from '../types';
import Modal from './Modal';
import GeneralTab from './settings/GeneralTab';
import MembersTab from './settings/MembersTab';
import RolesTab from './settings/RolesTab';
import TagsTab from './settings/TagsTab';

export type SettingsTab = 'general' | 'members' | 'roles' | 'tags';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'Общие' },
  { id: 'members', label: 'Участники' },
  { id: 'roles', label: 'Роли' },
  { id: 'tags', label: 'Теги задач' },
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
  const tabs = canManage ? TABS : TABS.filter((t) => t.id === 'general' || t.id === 'members');
  const [tab, setTab] = useState<SettingsTab>(tabs.some((t) => t.id === initialTab) ? initialTab : 'general');

  return (
    <Modal title={canManage ? 'Настройки проекта' : 'О проекте'} onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

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
          <MembersTab
            projectId={project.id}
            currentUserId={user?.id ?? 0}
            onChanged={onSaved}
            readOnly={!canManage}
          />
        )}
        {canManage && tab === 'roles' && <RolesTab projectId={project.id} onChanged={onSaved} />}
        {canManage && tab === 'tags' && <TagsTab projectId={project.id} onChanged={onSaved} />}
      </div>

      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Modal>
  );
}

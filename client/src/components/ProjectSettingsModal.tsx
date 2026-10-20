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
  onClose: () => void;
  /** Что-то изменилось (название, участники, роли, теги) — страница перезагружает данные */
  onSaved: () => Promise<void> | void;
}

export default function ProjectSettingsModal({ project, initialTab = 'general', onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  return (
    <Modal title="Настройки проекта" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
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
        {tab === 'general' && <GeneralTab project={project} onChanged={onSaved} />}
        {tab === 'members' && (
          <MembersTab projectId={project.id} currentUserId={user?.id ?? 0} onChanged={onSaved} />
        )}
        {tab === 'roles' && <RolesTab projectId={project.id} onChanged={onSaved} />}
        {tab === 'tags' && <TagsTab projectId={project.id} onChanged={onSaved} />}
      </div>

      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Modal>
  );
}

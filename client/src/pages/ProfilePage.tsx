import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';

interface Status {
  kind: 'ok' | 'err';
  text: string;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Что-то пошло не так');

function Section({
  title,
  hint,
  status,
  children,
}: {
  title: string;
  hint?: string;
  status: Status | null;
  children: ReactNode;
}) {
  return (
    <section className="card section">
      <h2>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      {children}
      {status && (
        <div className={status.kind === 'ok' ? 'notice notice-ok' : 'notice notice-err'}>
          {status.text}
        </div>
      )}
    </section>
  );
}

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [deleteWord, setDeleteWord] = useState('');

  const [nameStatus, setNameStatus] = useState<Status | null>(null);
  const [emailStatus, setEmailStatus] = useState<Status | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<Status | null>(null);
  const [passStatus, setPassStatus] = useState<Status | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<Status | null>(null);

  if (!user) return null;

  const saveUsername = async (e: FormEvent) => {
    e.preventDefault();
    const value = username.trim();
    if (!value) return setNameStatus({ kind: 'err', text: 'Имя не может быть пустым' });
    try {
      updateUser(await api.auth.updateUsername(value));
      setNameStatus({ kind: 'ok', text: 'Имя сохранено' });
    } catch (err) {
      setNameStatus({ kind: 'err', text: errText(err) });
    }
  };

  const saveEmail = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value.includes('@')) return setEmailStatus({ kind: 'err', text: 'Введите корректный email' });
    try {
      updateUser(await api.auth.updateEmail(value));
      setEmailStatus({ kind: 'ok', text: 'Email сохранён. Используйте его при следующем входе.' });
    } catch (err) {
      setEmailStatus({ kind: 'err', text: errText(err) });
    }
  };

  const saveAvatar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      updateUser(await api.auth.updateAvatar(avatarUrl.trim()));
      setAvatarStatus({ kind: 'ok', text: avatarUrl.trim() ? 'Аватар обновлён' : 'Аватар удалён' });
    } catch (err) {
      setAvatarStatus({ kind: 'err', text: errText(err) });
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) return setPassStatus({ kind: 'err', text: 'Заполните оба пароля' });
    if (newPassword.length < 6) return setPassStatus({ kind: 'err', text: 'Новый пароль — не короче 6 символов' });
    if (newPassword !== repeatPassword) return setPassStatus({ kind: 'err', text: 'Новые пароли не совпадают' });
    try {
      await api.auth.updatePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setRepeatPassword('');
      setPassStatus({ kind: 'ok', text: 'Пароль изменён' });
    } catch (err) {
      setPassStatus({ kind: 'err', text: errText(err) });
    }
  };

  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.auth.deleteAccount();
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setDeleteStatus({ kind: 'err', text: errText(err) });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Профиль</h1>
          <p className="muted">Личные данные и безопасность аккаунта</p>
        </div>
      </div>

      <div className="profile-grid">
        <Section title="Аватар" hint="Вставьте ссылку на изображение. Пустое поле — без аватара." status={avatarStatus}>
          <form className="inline-form" onSubmit={saveAvatar}>
            <Avatar user={{ username, avatar_url: avatarUrl.trim() || null }} size={64} />
            <input
              value={avatarUrl}
              placeholder="https://example.com/photo.png"
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
            <button className="btn btn-primary">Сохранить</button>
          </form>
        </Section>

        <Section title="Имя пользователя" status={nameStatus}>
          <form className="inline-form" onSubmit={saveUsername}>
            <input value={username} maxLength={50} onChange={(e) => setUsername(e.target.value)} />
            <button className="btn btn-primary">Сохранить</button>
          </form>
        </Section>

        <Section title="Email" hint="Email — ваш логин для входа." status={emailStatus}>
          <form className="inline-form" onSubmit={saveEmail}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn-primary">Сохранить</button>
          </form>
        </Section>

        <Section title="Смена пароля" status={passStatus}>
          <form className="stack-form" onSubmit={savePassword}>
            <label className="field">
              <span>Текущий пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Новый пароль</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Повторите новый пароль</span>
              <input
                type="password"
                autoComplete="new-password"
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
              />
            </label>
            <button className="btn btn-primary">Изменить пароль</button>
          </form>
        </Section>

        <section className="card section danger-zone">
          <h2>Удаление аккаунта</h2>
          <p className="muted">
            Аккаунт и все связанные с ним записи будут удалены без возможности восстановления.
            Чтобы подтвердить, введите слово «удалить».
          </p>
          <form className="inline-form" onSubmit={deleteAccount}>
            <input value={deleteWord} placeholder="удалить" onChange={(e) => setDeleteWord(e.target.value)} />
            <button className="btn btn-danger" disabled={deleteWord.trim().toLowerCase() !== 'удалить'}>
              Удалить аккаунт
            </button>
          </form>
          {deleteStatus && <div className="notice notice-err">{deleteStatus.text}</div>}
        </section>
      </div>
    </>
  );
}

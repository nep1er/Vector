import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { prepareAvatar } from '../utils/image';

type RowId = 'username' | 'email' | 'password' | 'delete';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Что-то пошло не так');

interface RowProps {
  label: string;
  value?: string;
  open: boolean;
  onToggle: () => void;
  actionLabel?: string;
  danger?: boolean;
  children: ReactNode;
}

/** Строка настроек: значение + кнопка, по которой раскрывается форма редактирования. */
function Row({ label, value, open, onToggle, actionLabel = 'Изменить', danger, children }: RowProps) {
  return (
    <div className="row">
      <div className="row-head">
        <div className="row-text">
          <div className="row-label">{label}</div>
          {value && !open && <div className="row-value">{value}</div>}
        </div>
        <button
          type="button"
          className={danger && !open ? 'btn btn-danger-ghost' : 'btn btn-quiet'}
          onClick={onToggle}
        >
          {open ? 'Отмена' : actionLabel}
        </button>
      </div>
      {open && <div className="row-body">{children}</div>}
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [openRow, setOpenRow] = useState<RowId | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [deleteWord, setDeleteWord] = useState('');

  if (!user) return null;

  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 2600);
  };

  const toggle = (id: RowId) => {
    setError('');
    setOpenRow((prev) => (prev === id ? null : id));
    setUsername(user.username);
    setEmail(user.email);
    setOldPassword('');
    setNewPassword('');
    setRepeatPassword('');
    setDeleteWord('');
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOpenRow(null);
    run(async () => {
      const image = await prepareAvatar(file);
      updateUser(await api.auth.uploadAvatar(image));
      notify('Фото обновлено');
    });
  };

  const removeAvatar = () =>
    run(async () => {
      updateUser(await api.auth.updateAvatar(''));
      notify('Фото удалено');
    });

  const saveUsername = (e: FormEvent) => {
    e.preventDefault();
    const value = username.trim();
    if (!value) return setError('Имя не может быть пустым');
    run(async () => {
      updateUser(await api.auth.updateUsername(value));
      setOpenRow(null);
      notify('Имя пользователя сохранено');
    });
  };

  const saveEmail = (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) return setError('Введите корректный email');
    run(async () => {
      updateUser(await api.auth.updateEmail(value));
      setOpenRow(null);
      notify('Email сохранён');
    });
  };

  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) return setError('Заполните все поля');
    if (newPassword.length < 6) return setError('Новый пароль — не короче 6 символов');
    if (newPassword !== repeatPassword) return setError('Новые пароли не совпадают');
    run(async () => {
      await api.auth.updatePassword(oldPassword, newPassword);
      setOpenRow(null);
      notify('Пароль изменён');
    });
  };

  const deleteAccount = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.auth.deleteAccount();
      logout();
      navigate('/login', { replace: true });
    });
  };

  const errorBox = error && <div className="notice notice-err">{error}</div>;

  return (
    <div className="profile">
      <h1>Настройки профиля</h1>

      <div className="profile-hero">
        <button
          type="button"
          className="avatar-edit"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Изменить фото профиля"
        >
          <Avatar user={user} size={112} />
          <span className="avatar-overlay">
            <Icon name="camera" size={26} />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={pickAvatar}
        />
        <div className="hero-name">{user.username}</div>
        {user.avatar_url && (
          <button type="button" className="link-btn muted" onClick={removeAvatar} disabled={busy}>
            Удалить фото
          </button>
        )}
        {!openRow && errorBox}
      </div>

      <div className="rows">
        <Row
          label="Имя пользователя"
          value={user.username}
          open={openRow === 'username'}
          onToggle={() => toggle('username')}
        >
          <form onSubmit={saveUsername}>
            <input
              autoFocus
              value={username}
              maxLength={50}
              onChange={(e) => setUsername(e.target.value)}
            />
            {errorBox}
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                Сохранить
              </button>
            </div>
          </form>
        </Row>

        <Row
          label="Email"
          value={user.email}
          open={openRow === 'email'}
          onToggle={() => toggle('email')}
        >
          <form onSubmit={saveEmail}>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errorBox}
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                Сохранить
              </button>
            </div>
          </form>
        </Row>

        <Row
          label="Пароль"
          value="••••••••"
          open={openRow === 'password'}
          onToggle={() => toggle('password')}
        >
          <form onSubmit={savePassword}>
            <label className="field">
              <span>Текущий пароль</span>
              <input
                autoFocus
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
            {errorBox}
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                Изменить пароль
              </button>
            </div>
          </form>
        </Row>

        <Row
          label="Удалить аккаунт"
          actionLabel="Удалить"
          danger
          open={openRow === 'delete'}
          onToggle={() => toggle('delete')}
        >
          <form onSubmit={deleteAccount}>
            <input
              autoFocus
              value={deleteWord}
              placeholder="Введите «удалить» для подтверждения"
              onChange={(e) => setDeleteWord(e.target.value)}
            />
            {errorBox}
            <div className="form-actions">
              <button
                className="btn btn-danger"
                disabled={busy || deleteWord.trim().toLowerCase() !== 'удалить'}
              >
                Удалить навсегда
              </button>
            </div>
          </form>
        </Row>
      </div>

      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LogoMark } from '../components/Avatar';

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) return setError('Введите email и пароль');
    if (!isLogin) {
      if (!username.trim()) return setError('Введите имя пользователя');
      if (password.length < 6) return setError('Пароль должен быть не короче 6 символов');
    }

    setBusy(true);
    try {
      if (isLogin) await login(email.trim(), password);
      else await register(username.trim(), email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="brand brand-light">
          <LogoMark size={34} />
          <span>Vector</span>
        </div>

        <div>
          <h1 className="auth-headline">Год в плане, неделя на доске</h1>
          <p className="auth-lead">
            Стратегия по месяцам и привычные канбан-доски для текущей работы — в одном месте.
          </p>
        </div>

        <ol className="year-strip" aria-hidden="true">
          {MONTHS.map((m, i) => (
            <li key={m} className={i === 9 ? 'now' : undefined}>
              {m}
            </li>
          ))}
        </ol>
      </aside>

      <main className="auth-main">
        <form className="auth-card" onSubmit={submit} noValidate>
          <h2>{isLogin ? 'Вход в Vector' : 'Создание аккаунта'}</h2>

          {!isLogin && (
            <label className="field">
              <span>Имя пользователя</span>
              <input
                value={username}
                maxLength={50}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <div className="notice notice-err">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Подождите…' : isLogin ? 'Войти' : 'Зарегистрироваться'}
          </button>

          <p className="auth-switch">
            {isLogin ? (
              <>
                Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
              </>
            ) : (
              <>
                Уже есть аккаунт? <Link to="/login">Войти</Link>
              </>
            )}
          </p>
        </form>
      </main>
    </div>
  );
}

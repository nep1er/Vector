// Система: сессия пользователя (AuthContext)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { api, tokenStorage } from '../api';

vi.mock('../api', async (orig) => {
  const real = await orig<typeof import('../api')>();
  return {
    ...real,
    api: { ...real.api, auth: { login: vi.fn(), register: vi.fn(), me: vi.fn() } },
  };
});

const auth = api.auth as unknown as Record<'login' | 'register' | 'me', ReturnType<typeof vi.fn>>;
let ctx: ReturnType<typeof useAuth>;
function Probe() {
  ctx = useAuth();
  return <div data-testid="s">{ctx.loading ? 'loading' : ctx.user ? ctx.user.username : 'guest'}</div>;
}
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  tokenStorage.clear();
});

describe('AuthProvider', () => {
  it('без токена — гость, загрузки нет', () => {
    mount();
    expect(screen.getByTestId('s').textContent).toBe('guest');
    expect(auth.me).not.toHaveBeenCalled();
  });

  it('с токеном при старте узнаёт пользователя', async () => {
    tokenStorage.set('t');
    auth.me.mockResolvedValue({ id: 1, username: 'anna' });
    mount();
    expect(screen.getByTestId('s').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('s').textContent).toBe('anna'));
  });

  it('недействительный токен стирается', async () => {
    tokenStorage.set('bad');
    auth.me.mockRejectedValue(new Error('401'));
    mount();
    await waitFor(() => expect(screen.getByTestId('s').textContent).toBe('guest'));
    expect(tokenStorage.get()).toBeNull();
  });

  it('login сохраняет токен и подтягивает профиль', async () => {
    auth.login.mockResolvedValue({ token: 'new' });
    auth.me.mockResolvedValue({ id: 2, username: 'boris' });
    mount();
    await act(() => ctx.login('b@b.b', 'pw'));
    expect(tokenStorage.get()).toBe('new');
    expect(screen.getByTestId('s').textContent).toBe('boris');
  });

  it('register сохраняет токен и пользователя; logout очищает всё', async () => {
    auth.register.mockResolvedValue({ token: 'r', user: { id: 3, username: 'vera' } });
    mount();
    await act(() => ctx.register('vera', 'v@v.v', 'secret1'));
    expect(screen.getByTestId('s').textContent).toBe('vera');
    act(() => ctx.updateUser({ username: 'vera2' }));
    expect(screen.getByTestId('s').textContent).toBe('vera2');
    act(() => ctx.logout());
    expect(screen.getByTestId('s').textContent).toBe('guest');
    expect(tokenStorage.get()).toBeNull();
  });
});

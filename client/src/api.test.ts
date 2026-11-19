// Система: HTTP-клиент (api.ts) — токен, ошибки, авторизация
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, assetUrl, setUnauthorizedHandler, tokenStorage } from './api';

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? '' : JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
  tokenStorage.clear();
});

describe('tokenStorage', () => {
  it('сохраняет, читает и очищает токен', () => {
    expect(tokenStorage.get()).toBeNull();
    tokenStorage.set('abc');
    expect(tokenStorage.get()).toBe('abc');
    tokenStorage.clear();
    expect(tokenStorage.get()).toBeNull();
  });
});

describe('assetUrl', () => {
  it('пустое значение → null, абсолютный адрес не меняется', () => {
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });
  it('относительный путь сохраняется', () => {
    expect(assetUrl('/uploads/a.png')).toContain('/uploads/a.png');
  });
});

describe('api.auth', () => {
  it('login отправляет JSON на /api/auth/login', async () => {
    fetchMock.mockResolvedValue(reply(200, { token: 't', user: { id: 1 } }));
    const res = await api.auth.login('a@b.c', 'pw');
    expect(res.token).toBe('t');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.c', password: 'pw' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('если токен есть, он уходит в заголовке Authorization', async () => {
    tokenStorage.set('secret');
    fetchMock.mockResolvedValue(reply(200, {}));
    await api.auth.login('a@b.c', 'pw');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
  });
});

describe('ошибки', () => {
  it('сервер вернул 4xx → ApiError с текстом сервера', async () => {
    fetchMock.mockResolvedValue(reply(409, { message: 'Этот email уже используется' }));
    const err = await api.auth.register('u', 'a@b.c', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('Этот email уже используется');
  });

  it('ответ без тела → общее сообщение с кодом', async () => {
    fetchMock.mockResolvedValue(reply(500));
    const err = await api.auth.login('a', 'b').catch((e) => e);
    expect(err.message).toContain('500');
  });

  it('сеть недоступна → ApiError со статусом 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    const err = await api.auth.login('a', 'b').catch((e) => e);
    expect(err.status).toBe(0);
  });

  it('401 при наличии токена вызывает обработчик выхода', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    tokenStorage.set('old');
    fetchMock.mockResolvedValue(reply(401, { message: 'Недействительный токен' }));
    await api.auth.login('a', 'b').catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('401 без токена (неверный пароль при входе) не разлогинивает', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(reply(401, { message: 'Неверный пароль' }));
    await api.auth.login('a', 'b').catch(() => {});
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

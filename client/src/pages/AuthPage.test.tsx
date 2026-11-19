// Система: страницы входа и регистрации (проверка формы и переходы)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthPage from './AuthPage';

const login = vi.fn();
const register = vi.fn();
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ login, register }) }));

const mount = (mode: 'login' | 'register') =>
  render(
    <MemoryRouter initialEntries={['/auth']}>
      <Routes>
        <Route path="/auth" element={<AuthPage mode={mode} />} />
        <Route path="/" element={<div>Главная</div>} />
      </Routes>
    </MemoryRouter>,
  );
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => vi.clearAllMocks());

describe('вход', () => {
  it('пустая форма → сообщение, запрос не уходит', () => {
    mount('login');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(screen.getByText('Введите email и пароль')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('успешный вход ведёт на главную', async () => {
    login.mockResolvedValue(undefined);
    mount('login');
    fill('Email', ' a@b.c ');
    fill('Пароль', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(screen.getByText('Главная')).toBeTruthy());
    expect(login).toHaveBeenCalledWith('a@b.c', 'secret');
  });

  it('ошибка сервера показывается пользователю', async () => {
    login.mockRejectedValue(new Error('Неверный пароль'));
    mount('login');
    fill('Email', 'a@b.c');
    fill('Пароль', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(screen.getByText('Неверный пароль')).toBeTruthy());
  });
});

describe('регистрация', () => {
  it('требует имя и пароль от 6 символов', () => {
    mount('register');
    fill('Email', 'a@b.c');
    fill('Пароль', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));
    expect(screen.getByText('Введите имя пользователя')).toBeTruthy();

    fill('Имя пользователя', 'anna');
    fill('Пароль', '123');
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));
    expect(screen.getByText('Пароль должен быть не короче 6 символов')).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('корректные данные отправляются на сервер', async () => {
    register.mockResolvedValue(undefined);
    mount('register');
    fill('Имя пользователя', 'anna');
    fill('Email', 'a@b.c');
    fill('Пароль', 'secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));
    await waitFor(() => expect(register).toHaveBeenCalledWith('anna', 'a@b.c', 'secret1'));
  });
});

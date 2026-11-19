// Система: общие окна (Modal)
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Modal from './Modal';

describe('Modal', () => {
  it('показывает заголовок и содержимое', () => {
    render(<Modal title="Окно" onClose={() => {}}>Текст</Modal>);
    expect(screen.getByRole('dialog', { name: 'Окно' })).toBeTruthy();
    expect(screen.getByText('Текст')).toBeTruthy();
  });

  it('Esc закрывает окно', () => {
    const onClose = vi.fn();
    render(<Modal title="Окно" onClose={onClose}>x</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('клик по тёмному фону закрывает, клик внутри окна — нет', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal title="Окно" onClose={onClose}>x</Modal>);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('dismissOnBackdrop={false} (настройки) — фон не закрывает окно', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal title="Настройки" dismissOnBackdrop={false} onClose={onClose}>x</Modal>);
    fireEvent.mouseDown(container.querySelector('.modal-backdrop')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('блокирует прокрутку страницы и возвращает её при закрытии', () => {
    const { unmount } = render(<Modal title="Окно" onClose={() => {}}>x</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

// Система: выпадающие панели (Dropdown)
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Dropdown from './Dropdown';

const mount = () =>
  render(
    <div>
      <span data-testid="outside">вне</span>
      <Dropdown button="Открыть" ariaLabel="Меню">Содержимое</Dropdown>
    </div>,
  );

describe('Dropdown', () => {
  it('закрыт по умолчанию, открывается по клику', () => {
    mount();
    expect(screen.queryByText('Содержимое')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    expect(screen.getByText('Содержимое')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Меню' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('повторный клик по кнопке закрывает', () => {
    mount();
    const b = screen.getByRole('button', { name: 'Меню' });
    fireEvent.click(b);
    fireEvent.click(b);
    expect(screen.queryByText('Содержимое')).toBeNull();
  });

  it('клик снаружи и Esc закрывают', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Содержимое')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Содержимое')).toBeNull();
  });

  it('клик внутри панели её не закрывает', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    fireEvent.mouseDown(screen.getByText('Содержимое'));
    expect(screen.getByText('Содержимое')).toBeTruthy();
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

it('账号密码正确后进入仪表盘', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.type(screen.getByLabelText('账号'), 'jiangshan');
  await user.type(screen.getByLabelText('密码'), 'Test1234');
  await user.click(screen.getByRole('button', { name: '登录' }));

  expect(await screen.findByRole('heading', { name: '仪表盘' })).toBeInTheDocument();
});

it('账号密码错误时停留在登录页并提示错误', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.type(screen.getByLabelText('账号'), 'jiangshan');
  await user.type(screen.getByLabelText('密码'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: '登录' }));

  expect(await screen.findByText('账号或密码错误')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '账号登录' })).toBeInTheDocument();
});

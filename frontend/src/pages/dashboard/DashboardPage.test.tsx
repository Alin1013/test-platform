import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

it('展示用例总数与最近用例', async () => {
  renderApp('/dashboard');

  expect(await screen.findByText('用例总数')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '最近用例' })).toBeInTheDocument();
});

it('从仪表盘进入新建接口用例流程', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(await screen.findByRole('button', { name: '新建接口用例' }));

  expect(await screen.findByRole('heading', { name: '测试用例' })).toBeInTheDocument();
});

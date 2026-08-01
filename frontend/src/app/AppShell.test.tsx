import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../tests/renderApp';

it('应用外壳使用统一产品文案', () => {
  renderApp('/test-cases/ui');

  expect(screen.getByLabelText('测试平台')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '选择项目' }).closest('.ant-select')).toHaveTextContent(
    '测试平台',
  );
  expect(screen.getByRole('menuitem', { name: 'UI自动化' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '用例生成器' })).toBeInTheDocument();
});

it('侧栏可进入人员管理', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(screen.getByRole('menuitem', { name: '人员管理' }));

  expect(await screen.findByRole('heading', { name: '人员管理' })).toBeInTheDocument();
});

it('菜单按钮打开移动端导航抽屉', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(screen.getByRole('button', { name: '打开导航' }));

  expect(screen.getByRole('dialog', { name: '主导航' })).toBeInTheDocument();
});

/**
 * 应用外壳测试：导航、顶栏与产品文案。
 */
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

it('侧栏执行测试用例菜单进入两类自动化工作台', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(screen.getByRole('menuitem', { name: '执行测试用例' }));
  await user.click(screen.getByRole('menuitem', { name: 'UI 自动化' }));
  expect(await screen.findByRole('heading', { name: 'UI 自动化' })).toBeInTheDocument();

  await user.click(screen.getByRole('menuitem', { name: '接口自动化' }));
  expect(await screen.findByRole('heading', { name: '接口自动化' })).toBeInTheDocument();
});

it('菜单按钮打开移动端导航抽屉', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(screen.getByRole('button', { name: '打开导航' }));

  expect(screen.getByRole('dialog', { name: '主导航' })).toBeInTheDocument();
});

it('点击头像显示账号操作并可退出登录', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(screen.getByRole('button', { name: '当前用户：江珊' }));

  expect(screen.getByRole('menuitem', { name: '编辑个人信息' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '切换账号' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '退出登录' })).toBeInTheDocument();

  await user.click(screen.getByRole('menuitem', { name: '退出登录' }));

  expect(await screen.findByRole('heading', { name: '账号登录' })).toBeInTheDocument();
});

it('点击编辑个人信息进入设置的个人信息页签', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(screen.getByRole('button', { name: '当前用户：江珊' }));
  await user.click(screen.getByRole('menuitem', { name: '编辑个人信息' }));

  expect(await screen.findByRole('heading', { name: '系统设置' })).toBeInTheDocument();
  expect(await screen.findByRole('tab', { name: '个人信息' })).toHaveAttribute('aria-selected', 'true');
});

it('切换账号也会回到登录页', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(screen.getByRole('button', { name: '当前用户：江珊' }));
  await user.click(screen.getByRole('menuitem', { name: '切换账号' }));

  expect(await screen.findByRole('heading', { name: '账号登录' })).toBeInTheDocument();
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

it('校验 XMind 文件并将有效文件创建为后台生成任务', async () => {
  const user = userEvent.setup();
  renderApp('/xmind');
  const fileInput = screen.getByLabelText('选择 XMind 文件');

  await user.upload(fileInput, new File(['not xmind'], 'login.txt', { type: 'text/plain' }));
  expect(await screen.findByText('仅支持 .xmind 文件')).toBeInTheDocument();

  await user.upload(
    fileInput,
    new File(['xmind content'], '用户登录.xmind', { type: 'application/octet-stream' }),
  );
  expect(await screen.findByText('用户登录.xmind')).toBeInTheDocument();
  expect(await screen.findByText('待审核')).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: '登录' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: '成功登录' })).toBeInTheDocument();
  expect(screen.getByText('核心模块 / 鉴权')).toBeInTheDocument();
});

it('待审核任务确认后合并到功能用例并可继续查看任务列表', async () => {
  const user = userEvent.setup();
  renderApp('/xmind');

  await user.upload(
    screen.getByLabelText('选择 XMind 文件'),
    new File(['xmind content'], '用户登录.XMIND', { type: 'application/octet-stream' }),
  );
  expect(await screen.findByText('待审核')).toBeInTheDocument();
  await user.click(screen.getByText('审核并合并'));

  expect(await screen.findByText('已合并到功能用例')).toBeInTheDocument();
  expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: '查看功能用例' }));
  expect(await screen.findByRole('heading', { name: '测试用例' })).toBeInTheDocument();
});

it('任务列表支持主动刷新并保持任务状态', async () => {
  const user = userEvent.setup();
  renderApp('/xmind');
  await user.upload(
    screen.getByLabelText('选择 XMind 文件'),
    new File(['xmind content'], '持久任务.xmind', { type: 'application/octet-stream' }),
  );
  expect(await screen.findByText('持久任务.xmind')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '刷新生成任务' }));
  expect(await screen.findByText('待审核')).toBeInTheDocument();
});

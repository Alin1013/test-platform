/**
 * 用例生成器测试：文件校验、任务创建与模块映射。
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

it('校验 XMind 文件并将有效文件创建为后台生成任务', async () => {
  const user = userEvent.setup();
  const { container } = renderApp('/xmind');
  const fileInput = screen.getByLabelText('选择 XMind 文件');

  await user.upload(fileInput, new File(['not xmind'], 'login.txt', { type: 'text/plain' }));
  expect(await screen.findByText('仅支持 .xmind 文件')).toBeInTheDocument();

  await user.upload(
    fileInput,
    new File(['xmind content'], '用户登录.xmind', { type: 'application/octet-stream' }),
  );
  expect(await screen.findByText('用户登录.xmind')).toBeInTheDocument();
  expect(await screen.findByText('待审核')).toBeInTheDocument();
  expect(container.querySelector('.xmind-page > .xmind-preview')).toBeNull();
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

it('任务列表不再在页面主体中展示任务详情区', async () => {
  const user = userEvent.setup();
  const { container } = renderApp('/xmind');

  await user.upload(
    screen.getByLabelText('选择 XMind 文件'),
    new File(['xmind content'], '列表收敛.xmind', { type: 'application/octet-stream' }),
  );

  expect(await screen.findByText('列表收敛.xmind')).toBeInTheDocument();
  expect(container.querySelector('.xmind-page > .xmind-preview')).toBeNull();
});

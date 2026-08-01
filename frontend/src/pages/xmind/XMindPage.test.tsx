import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderApp } from '../../tests/renderApp';

it('校验 XMind 文件并生成测试用例', async () => {
  const user = userEvent.setup();
  renderApp('/xmind');
  const fileInput = screen.getByLabelText('选择 XMind 文件');

  await user.upload(fileInput, new File(['not xmind'], 'login.txt', { type: 'text/plain' }));
  expect(await screen.findByText('仅支持 .xmind 文件')).toBeInTheDocument();

  await user.upload(
    fileInput,
    new File(['xmind content'], '用户登录.xmind', { type: 'application/octet-stream' }),
  );
  expect(await screen.findByRole('heading', { name: '解析预览' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: '登录' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: '成功登录' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: '登录失败' })).toBeInTheDocument();
  expect(screen.getByText('核心模块 / 鉴权')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '开始完整解析' }));
  expect(await screen.findByText('已生成 6 条测试用例')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '查看接口用例' }));
  expect(await screen.findByRole('heading', { name: '测试用例' })).toBeInTheDocument();
});

it('支持大小写不敏感的扩展名并可重新上传', async () => {
  const user = userEvent.setup();
  renderApp('/xmind');

  await user.upload(
    screen.getByLabelText('选择 XMind 文件'),
    new File(['xmind content'], '用户登录.XMIND', { type: 'application/octet-stream' }),
  );
  expect(await screen.findByRole('heading', { name: '解析预览' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '开始完整解析' }));
  await user.click(await screen.findByRole('button', { name: '重新上传' }));

  expect(screen.getByLabelText('选择 XMind 文件')).toBeInTheDocument();
});

it('取消或离开页面时会停止上传任务', () => {
  const userAgent = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('测试浏览器');
  vi.useFakeTimers();

  try {
    const view = renderApp('/xmind');
    fireEvent.change(screen.getByLabelText('选择 XMind 文件'), {
      target: {
        files: [new File(['xmind content'], '待取消.xmind', { type: 'application/octet-stream' })],
      },
    });

    expect(screen.getByText('待取消.xmind')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
    act(() => vi.advanceTimersByTime(140));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '24');
    fireEvent.click(screen.getByRole('button', { name: '取消上传' }));

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByLabelText('选择 XMind 文件')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '解析预览' })).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.change(screen.getByLabelText('选择 XMind 文件'), {
      target: {
        files: [new File(['xmind content'], '离开页面.xmind', { type: 'application/octet-stream' })],
      },
    });
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();
    act(() => vi.advanceTimersByTime(1_000));
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    userAgent.mockRestore();
    vi.useRealTimers();
  }
});

/**
 * 仪表盘测试：统计数据展示、快捷操作与导出。
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { MemoryRouter } from 'react-router-dom';
import { renderApp } from '../../tests/renderApp';
import { PlatformServiceProvider } from '../../services/PlatformServiceContext';
import { createMockPlatformService } from '../../services/mockPlatformService';
import { DashboardPage } from './DashboardPage';

afterEach(() => {
  vi.restoreAllMocks();
});

it('展示用例总数与最近用例', async () => {
  renderApp('/dashboard');

  expect(await screen.findByText('用例总数')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '最近用例' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新建UI自动化' })).toBeInTheDocument();
  expect(screen.getAllByText('UI自动化')).not.toHaveLength(0);
});

it('查看全部默认进入功能用例列表', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await screen.findByText('用例总数');
  await user.click(await screen.findByText('查看全部'));

  expect(await screen.findByRole('tab', { name: '功能用例' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByRole('tab', { name: '接口用例' })).toHaveAttribute('aria-selected', 'false');
});

it('仪表盘请求失败时显示错误态并允许重试', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const getDashboard = vi.spyOn(service, 'getDashboard');
  getDashboard.mockRejectedValueOnce(new Error('dashboard unavailable'));
  getDashboard.mockResolvedValueOnce(await createMockPlatformService({ delay: 0 }).getDashboard());

  const user = userEvent.setup();
  render(
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <PlatformServiceProvider service={service}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </PlatformServiceProvider>
      </AntdApp>
    </ConfigProvider>,
  );

  expect(await screen.findByText('仪表盘数据加载失败')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '重试加载' }));

  expect(await screen.findByText('用例总数')).toBeInTheDocument();
  expect(getDashboard).toHaveBeenCalledTimes(2);
});

it('导出电子表格前选择文件格式', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await screen.findByText('用例总数');
  await user.click(screen.getByRole('button', { name: /导出电子表格/ }));

  const dialog = screen.getByRole('dialog', { name: '导出电子表格' });
  const csvButton = within(dialog).getByRole('button', { name: 'CSV' });
  const xlsxButton = within(dialog).getByRole('button', { name: 'XLSX' });
  expect(csvButton).toHaveAttribute('aria-pressed', 'true');
  expect(xlsxButton).toHaveAttribute('aria-pressed', 'false');

  await user.click(xlsxButton);

  expect(csvButton).toHaveAttribute('aria-pressed', 'false');
  expect(xlsxButton).toHaveAttribute('aria-pressed', 'true');
  expect(within(dialog).getByRole('button', { name: '导出' })).toBeInTheDocument();
});

it('选择 XLSX 后下载工作簿', async () => {
  const user = userEvent.setup();
  let downloadedFilename = '';
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(
    this: HTMLAnchorElement,
  ) {
    downloadedFilename = this.download;
  });
  renderApp('/dashboard');

  await screen.findByText('用例总数');
  await user.click(screen.getByRole('button', { name: '导出电子表格' }));
  const dialog = screen.getByRole('dialog', { name: '导出电子表格' });
  await user.click(within(dialog).getByRole('button', { name: 'XLSX' }));
  await user.click(within(dialog).getByRole('button', { name: '导出' }));

  await waitFor(() => {
    expect(downloadedFilename).toBe('测试用例.xlsx');
  });
});

it('从仪表盘进入新建接口用例流程', async () => {
  const user = userEvent.setup();
  renderApp('/dashboard');

  await user.click(await screen.findByRole('button', { name: '新建接口用例' }));

  expect(await screen.findByRole('heading', { name: '测试用例' })).toBeInTheDocument();
});

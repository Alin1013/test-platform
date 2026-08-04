import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

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

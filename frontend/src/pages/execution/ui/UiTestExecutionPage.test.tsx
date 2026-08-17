/**
 * UI 自动化执行页测试：配置选择、启动执行与进度展示。
 */
import { App as AntdApp } from 'antd';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlatformServiceProvider } from '../../../services/PlatformServiceContext';
import { createMockPlatformService } from '../../../services/mockPlatformService';
import { renderApp } from '../../../tests/renderApp';
import { UiTestExecutionPage } from './UiTestExecutionPage';

function renderUiExecutionPageWithService(
  service: ReturnType<typeof createMockPlatformService>,
) {
  return render(
    <AntdApp>
      <PlatformServiceProvider service={service}>
        <MemoryRouter
          initialEntries={['/execution/ui-test']}
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <Routes>
            <Route path="/execution/ui-test" element={<UiTestExecutionPage />} />
          </Routes>
        </MemoryRouter>
      </PlatformServiceProvider>
    </AntdApp>,
  );
}

it('配置并启动 UI 自动化执行后展示实时进度', async () => {
  const user = userEvent.setup();
  renderApp('/execution/ui-test');

  expect(await screen.findByRole('heading', { name: 'UI 自动化' })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: '运行环境' }).closest('.ant-select')).toHaveTextContent('TEST'),
  );
  expect(screen.getByRole('combobox', { name: '浏览器' }).closest('.ant-select')).toHaveTextContent('Chrome');
  expect(screen.getByRole('spinbutton', { name: '并发数' })).toHaveDisplayValue('1');
  expect(screen.getByRole('switch', { name: '无头模式' })).toBeChecked();

  await user.click(await screen.findByRole('checkbox', { name: '选择 UI-13533 登录表单校验' }));
  await user.click(screen.getByRole('button', { name: '立即执行' }));

  const progress = await screen.findByRole('region', { name: 'UI 执行进度' });
  expect(within(progress).getAllByText('运行中').length).toBeGreaterThan(0);
  expect(within(progress).getByText('1 个用例')).toBeInTheDocument();
  expect(screen.getByText(/ui_exec_/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '取消或中断执行' })).toBeEnabled();
});

it('运行环境与系统设置中的环境列表保持一致', async () => {
  const user = userEvent.setup();
  renderApp('/execution/ui-test');

  const environmentSelect = await screen.findByRole('combobox', { name: '运行环境' });
  await user.click(environmentSelect);

  expect(await screen.findByRole('option', { name: 'DEV' })).toBeInTheDocument();
  expect(environmentSelect.closest('.ant-select')).toHaveTextContent('TEST');
  expect(screen.queryByRole('option', { name: 'Staging' })).not.toBeInTheDocument();
});

it('执行列表展示模块名称且不展示用例编号', async () => {
  renderApp('/execution/ui-test');

  expect(await screen.findByRole('heading', { name: 'UI 自动化' })).toBeInTheDocument();
  expect(await screen.findByText('登录表单校验')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '模块' })).toBeInTheDocument();
  expect(screen.getAllByText('鉴权').length).toBeGreaterThan(0);
  expect(screen.queryByText('UI-13533')).not.toBeInTheDocument();
});

it('可以选择测试用例目录并过滤执行列表', async () => {
  const user = userEvent.setup();
  renderApp('/execution/ui-test');

  expect(await screen.findByText('登录表单校验')).toBeInTheDocument();
  expect(screen.getByText('支付结果页展示')).toBeInTheDocument();

  await user.click(screen.getByRole('combobox', { name: '测试用例目录' }));
  const authOptions = await screen.findAllByText('鉴权');
  await user.click(authOptions.at(-1)!);

  expect(screen.getByText('登录表单校验')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByText('支付结果页展示')).not.toBeInTheDocument(),
  );
});

it('执行列表使用统一的分页控件', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const originalListTestCases = service.listTestCases;
  const baseRows = await originalListTestCases({ type: 'ui' });
  service.listTestCases = async (query = {}) => {
    const rows = await originalListTestCases(query);
    if (query.type !== 'ui') return rows;
    return [
      ...rows,
      ...Array.from({ length: 10 }, (_, index) => ({
        ...baseRows[0],
        storageId: 10000 + index,
        id: `UI-PAGE-${index + 1}`,
        name: `分页用例 ${index + 1}`,
      })),
    ];
  };
  const user = userEvent.setup();
  renderUiExecutionPageWithService(service);

  await screen.findByText('登录表单校验');

  expect(screen.getByRole('combobox', { name: '每页条数' })).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: '跳转页码' })).toBeInTheDocument();

  await user.click(screen.getByRole('checkbox', { name: '选择 UI-13533 登录表单校验' }));
  const nextPage = screen.getByRole('listitem', { name: 'Next Page' });
  expect(nextPage).toBeEnabled();
  await user.click(nextPage);
  await user.click(screen.getByRole('checkbox', { name: '选择 UI-PAGE-10 分页用例 10' }));
  expect(screen.getByText('已选择 2 条')).toBeInTheDocument();
  expect(screen.getByText('分页用例 10')).toBeInTheDocument();
  expect(screen.queryByText('分页用例 1')).not.toBeInTheDocument();
});

it('UI 用例详情抽屉展示步骤日志、媒体和 Trace Viewer', async () => {
  const service = createMockPlatformService({ delay: 0 });
  const originalGetUiExecution = service.getUiExecution;
  service.getUiExecution = async (executionId: string) => {
    const result = await originalGetUiExecution(executionId);
    return {
      ...result,
      cases: result.cases.map((item) => ({
        ...item,
        traceUrl: 'http://localhost:8000/uploads/executions/ui_exec_demo.trace.zip',
      })),
    };
  };
  const user = userEvent.setup();
  renderUiExecutionPageWithService(service);

  await screen.findByRole('heading', { name: 'UI 自动化' });
  await user.click(await screen.findByRole('checkbox', { name: '选择 UI-13533 登录表单校验' }));
  await user.click(screen.getByRole('button', { name: '立即执行' }));
  await screen.findByRole('region', { name: 'UI 执行进度' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '查看 登录表单校验 详情' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: '查看 登录表单校验 详情' }));

  const drawer = await screen.findByRole('dialog', { name: '用例执行详情' });
  expect(within(drawer).getByRole('tab', { name: '步骤明细' })).toBeInTheDocument();
  expect(within(drawer).getByRole('tab', { name: '失败媒体' })).toBeInTheDocument();
  expect(within(drawer).getByRole('tab', { name: '终端日志' })).toBeInTheDocument();
  await user.click(within(drawer).getByRole('tab', { name: '失败媒体' }));
  expect(await within(drawer).findByRole('link', { name: '查看 Trace Viewer' })).toHaveAttribute(
    'href',
    `https://trace.playwright.dev/?trace=${encodeURIComponent(
      'http://localhost:8000/uploads/executions/ui_exec_demo.trace.zip',
    )}`,
  );
});

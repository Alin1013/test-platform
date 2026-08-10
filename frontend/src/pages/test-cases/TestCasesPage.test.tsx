import { App as AntdApp } from 'antd';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../services/AuthContext';
import { PlatformServiceProvider } from '../../services/PlatformServiceContext';
import { createMockPlatformService } from '../../services/mockPlatformService';
import { renderApp } from '../../tests/renderApp';
import { TestCasesPage } from './TestCasesPage';

function renderTestCasesPageWithService(
  service: ReturnType<typeof createMockPlatformService>,
  route = '/test-cases/functional',
) {
  return render(
    <AntdApp>
      <AuthProvider>
        <PlatformServiceProvider service={service}>
          <MemoryRouter
            initialEntries={[route]}
            future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
          >
            <Routes>
              <Route path="/test-cases/:type" element={<TestCasesPage />} />
            </Routes>
          </MemoryRouter>
        </PlatformServiceProvider>
      </AuthProvider>
    </AntdApp>,
  );
}

it('UI自动化页使用统一名称', async () => {
  renderApp('/test-cases/ui');

  expect(await screen.findByRole('tab', { name: 'UI自动化' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新建UI自动化' })).toBeInTheDocument();
  expect(screen.getByText('按模块维护功能、接口和UI自动化资产')).toBeInTheDocument();
});

it.each([
  { route: '/test-cases/functional', listName: '功能用例列表', hiddenHeaders: ['编号', '需求ID'] },
  { route: '/test-cases/api', listName: '接口用例列表', hiddenHeaders: ['编号'] },
  { route: '/test-cases/ui', listName: 'UI自动化列表', hiddenHeaders: ['编号'] },
])('$listName不展示已移除的用例标识列', async ({ route, listName, hiddenHeaders }) => {
  renderApp(route);

  const list = await screen.findByRole('region', { name: listName });
  hiddenHeaders.forEach((header) => {
    expect(within(list).queryByRole('columnheader', { name: header })).not.toBeInTheDocument();
  });
  expect(screen.getByPlaceholderText('搜索用例名称或接口地址')).toBeInTheDocument();
});

it('新建 UI 自动化用例时提供完整配置和可维护的步骤列表', async () => {
  const user = userEvent.setup();
  renderTestCasesPageWithService(
    createMockPlatformService({ delay: 0 }),
    '/test-cases/ui?create=1',
  );

  const dialog = await screen.findByRole('dialog', { name: '新建UI自动化' });
  expect(within(dialog).getByText('基本信息')).toBeInTheDocument();
  expect(within(dialog).getByText('执行配置')).toBeInTheDocument();
  expect(within(dialog).getByText('自动化步骤')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('维护人')).toHaveValue('江珊');
  expect(within(dialog).getByRole('combobox', { name: '默认浏览器' })).toBeInTheDocument();
  expect(within(dialog).getByText('Chrome')).toBeInTheDocument();
  expect(within(dialog).getByRole('combobox', { name: '默认环境' })).toBeInTheDocument();
  expect(await within(dialog).findByText('TEST')).toBeInTheDocument();
  expect(within(dialog).getByRole('spinbutton', { name: '超时时间' })).toHaveValue('30');
  expect(within(dialog).getByRole('spinbutton', { name: '失败重试次数' })).toHaveValue('1');
  expect(within(dialog).getByLabelText('步骤 1 操作类型')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('步骤 1 元素定位值')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('步骤 1 预期断言')).toBeInTheDocument();

  await user.click(within(dialog).getByRole('button', { name: '添加步骤' }));
  expect(within(dialog).getByLabelText('步骤 2 操作类型')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: '上移步骤 2' }));
  expect(within(dialog).getByText('步骤 1')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: '删除步骤 2' }));
  expect(within(dialog).queryByLabelText('步骤 2 操作类型')).not.toBeInTheDocument();

  await user.type(within(dialog).getByLabelText('用例名称'), '用户登录 - 密码错误提示校验');
  await user.type(within(dialog).getByLabelText('步骤 1 元素定位值'), '#login-button');
  await user.click(within(dialog).getByRole('button', { name: '创建用例' }));

  expect(await screen.findByText('用户登录 - 密码错误提示校验')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: '新建UI自动化' })).not.toBeInTheDocument();
  });
});

it('Assert 步骤默认选择有效断言且不允许无断言', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/ui?create=1');

  const dialog = await screen.findByRole('dialog', { name: '新建UI自动化' });
  fireEvent.mouseDown(within(dialog).getByLabelText('步骤 1 操作类型'));
  await user.click(await screen.findByText('Assert（断言）'));

  expect(await within(dialog).findByText('元素文本等于')).toBeInTheDocument();

  fireEvent.mouseDown(within(dialog).getByLabelText('步骤 1 预期断言'));
  await user.click(await screen.findByText('无断言'));
  await user.type(within(dialog).getByLabelText('用例名称'), '校验登录提示');
  await user.type(within(dialog).getByLabelText('步骤 1 元素定位值'), '#login-message');
  await user.click(within(dialog).getByRole('button', { name: '创建用例' }));

  expect(await within(dialog).findByText('Assert 步骤必须选择断言')).toBeInTheDocument();
});

it('从仪表盘进入时自动打开接口用例抽屉', async () => {
  renderApp('/test-cases/api?create=1');

  expect(await screen.findByRole('dialog', { name: '新建接口用例' })).toBeInTheDocument();
});

it('校验 JSON 并创建接口用例', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api?create=1');
  const drawer = await screen.findByRole('dialog', { name: '新建接口用例' });

  await user.type(within(drawer).getByLabelText('用例名称'), '刷新访问令牌');
  await user.type(within(drawer).getByLabelText('接口地址'), '/api/token/refresh');
  fireEvent.change(within(drawer).getByLabelText('请求体'), { target: { value: '{bad json}' } });
  await user.click(within(drawer).getByRole('button', { name: '创建用例' }));
  expect(await within(drawer).findByText('请输入有效的 JSON')).toBeInTheDocument();

  fireEvent.change(within(drawer).getByLabelText('请求体'), {
    target: { value: '{"refreshToken":"demo"}' },
  });
  await user.click(within(drawer).getByRole('button', { name: '创建用例' }));

  expect(await screen.findByText('刷新访问令牌')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: '新建接口用例' })).not.toBeInTheDocument();
  });
});

it('接口调试运行后展示真实响应、断言和提取结果', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api?create=1');
  const dialog = await screen.findByRole('dialog', { name: '新建接口用例' });

  await user.type(within(dialog).getByLabelText('接口地址'), '/api/profile');
  await user.click(within(dialog).getByRole('button', { name: '发送请求（Debug）' }));

  expect(within(dialog).getByRole('button', { name: '发送请求（Debug）' })).toBeDisabled();
  expect(await within(dialog).findByText('响应结果 (Response Console)')).toBeInTheDocument();
  expect(within(dialog).getByText('Status: 200')).toBeInTheDocument();
  expect(within(dialog).getByText('Time: 36 ms')).toBeInTheDocument();
  expect(within(dialog).getByText('断言通过 2/2')).toBeInTheDocument();
  expect(within(dialog).getByText('实际值：200')).toBeInTheDocument();
  expect(within(dialog).getByText('期望值：200')).toBeInTheDocument();
  expect(within(dialog).getByText(/"requestId": "debug-request-001"/)).toBeInTheDocument();
});

it('接口调试请求失败时在响应控制台展示后端错误', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  vi.spyOn(service, 'debugApiCase').mockRejectedValue(new Error('环境 test 未配置'));
  renderTestCasesPageWithService(service, '/test-cases/api?create=1');
  const dialog = await screen.findByRole('dialog', { name: '新建接口用例' });

  await user.type(within(dialog).getByLabelText('用例名称'), '错误环境调试');
  await user.type(within(dialog).getByLabelText('接口地址'), '/api/profile');
  await user.click(within(dialog).getByRole('button', { name: '发送请求（Debug）' }));

  expect(await within(dialog).findByText('响应结果 (Response Console)')).toBeInTheDocument();
  expect(within(dialog).getByRole('alert')).toHaveTextContent('环境 test 未配置');
});

it('UI 调试运行后展示逐步结果、日志和录屏链接', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 600 });
  const settings = await service.getSystemSettings();
  vi.spyOn(service, 'getSystemSettings').mockResolvedValue({
    ...settings,
    execution: {
      ...settings.execution,
      environments: [{ id: 'qa', name: 'QA', baseUrl: 'https://qa.example.com' }],
      defaultEnvironmentId: 'qa',
    },
  });
  const debugUiCase = vi.spyOn(service, 'debugUiCase');
  renderTestCasesPageWithService(service, '/test-cases/ui?create=1');
  const dialog = await screen.findByRole('dialog', { name: '新建UI自动化' });

  expect(await within(dialog).findByText('QA')).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('步骤 1 元素定位值'), '{{baseUrl}}/login');
  await user.click(within(dialog).getByRole('button', { name: '调试运行' }));

  expect(within(dialog).getByRole('button', { name: '调试运行' })).toBeDisabled();
  expect(await within(dialog).findByText('调试结果')).toBeInTheDocument();
  expect(debugUiCase).toHaveBeenCalledWith(expect.objectContaining({ environment: 'qa' }));
  expect(within(dialog).getAllByText('PASSED')).toHaveLength(2);
  expect(within(dialog).getByText('步骤 1 · Navigate')).toBeInTheDocument();
  expect(within(dialog).getAllByText('24 ms')).toHaveLength(2);
  expect(within(dialog).getByText('步骤 1 执行成功')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: '查看录屏' })).toHaveAttribute(
    'href',
    '/uploads/executions/debug-demo.webm',
  );
});

it('切换模块后过滤用例', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api');

  const list = await screen.findByRole('region', { name: '接口用例列表' });
  expect(within(list).getByText('用户登录')).toBeInTheDocument();
  await user.click(screen.getByRole('treeitem', { name: '支付' }));

  expect(await within(list).findByText('创建支付订单')).toBeInTheDocument();
  expect(within(list).queryByText('用户登录')).not.toBeInTheDocument();
});

it('可以将 Apifox OpenAPI JSON 导入当前模块', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api');

  const list = await screen.findByRole('region', { name: '接口用例列表' });
  await user.click(screen.getByRole('treeitem', { name: '支付' }));

  const upload = screen.getByLabelText('导入 Apifox 用例');
  const file = new File([
    JSON.stringify({
      openapi: '3.0.0',
      paths: {
        '/api/orders': {
          post: {
            summary: '创建订单',
            parameters: [
              { name: 'X-Trace-Id', in: 'header', example: 'trace-demo' },
              { name: 'source', in: 'query', example: 'apifox' },
            ],
            requestBody: {
              content: {
                'application/json': {
                  example: { itemId: 10086 },
                },
              },
            },
            responses: { '201': { description: 'created' } },
          },
        },
      },
    }),
  ], 'apifox.json', { type: 'application/json' });

  await user.upload(upload, file);

  expect(await within(list).findByText('创建订单')).toBeInTheDocument();
  expect(within(list).getByText('/api/orders')).toBeInTheDocument();
  expect(await screen.findByText('已导入 1 条接口用例')).toBeInTheDocument();
});

it('未选择具体模块时不上传功能用例文件', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  const importTestCases = vi.spyOn(service, 'importTestCases');
  renderTestCasesPageWithService(service, '/test-cases/functional');

  const upload = screen.getByLabelText('导入功能用例');
  const file = new File(
    [
      [
        '用例目录,用例名称,需求ID,前置条件,用例步骤,预期结果,用例类型,用例状态,用例等级,创建人,归属迭代,是否冒烟,项目归属',
        ',缺少模块,REQ-MISSING-MODULE,,,,功能用例,草稿,P1,江珊,,,测试平台',
      ].join('\n'),
    ],
    'missing-module.csv',
    {
      type: 'text/csv',
    },
  );

  await user.upload(upload, file);

  expect(await screen.findByText('请先选择具体模块')).toBeInTheDocument();
  expect(importTestCases).not.toHaveBeenCalled();
});

it('全部模块下按文件中的用例目录导入功能用例', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  const importTestCases = vi
    .spyOn(service, 'importTestCases')
    .mockResolvedValue({ importedCount: 1, codes: ['FUN-MODULE'] });
  renderTestCasesPageWithService(service, '/test-cases/functional');

  const upload = screen.getByLabelText('导入功能用例');
  const file = new File(
    [
      [
        '用例目录,用例名称,需求ID,前置条件,用例步骤,预期结果,用例类型,用例状态,用例等级,创建人,归属迭代,是否冒烟,项目归属',
        '鉴权,按行模块导入,REQ-MODULE,,,,功能用例,草稿,P1,江珊,,,测试平台',
      ].join('\n'),
    ],
    'with-module.csv',
    { type: 'text/csv' },
  );

  await user.upload(upload, file);

  await waitFor(() => {
    expect(importTestCases).toHaveBeenCalledWith(file, undefined);
  });
});

it('导入功能用例时使用当前选中的模块', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  const importCalls: Array<{ fileName: string; moduleId?: string }> = [];
  const originalImportTestCases = service.importTestCases.bind(service);
  service.importTestCases = async (file, moduleId) => {
    importCalls.push({ fileName: file.name, moduleId });
    return originalImportTestCases(file, moduleId);
  };
  renderTestCasesPageWithService(service, '/test-cases/functional');

  const list = await screen.findByRole('region', { name: '功能用例列表' });
  await user.click(screen.getByRole('treeitem', { name: '鉴权' }));
  await waitFor(() => {
    expect(within(list).queryByText('创建支付订单')).not.toBeInTheDocument();
  });

  const upload = screen.getByLabelText('导入功能用例');
  const file = new File(
    [
      [
        '用例目录,用例名称,需求ID,前置条件,用例步骤,预期结果,用例类型,用例状态,用例等级,创建人,归属迭代,是否冒烟,项目归属',
        ',导入 Apifox 功能用例,REQ-APIFOX,账号已启用,打开登录页,进入首页,功能测试,正常,中,江珊,Sprint 13,否,测试平台',
      ].join('\n'),
    ],
    'apifox-functional.csv',
    { type: 'text/csv' },
  );

  await user.upload(upload, file);

  await waitFor(() => {
    expect(importCalls).toEqual([{ fileName: 'apifox-functional.csv', moduleId: 'auth' }]);
  });
});

it('可以添加和删除请求头', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api?create=1');
  const drawer = await screen.findByRole('dialog', { name: '新建接口用例' });

  await user.click(within(drawer).getByRole('tab', { name: 'Headers (2)' }));
  expect(within(drawer).getByLabelText('请求头键 1')).toBeInTheDocument();
  await user.click(within(drawer).getByRole('button', { name: '添加请求头' }));
  expect(within(drawer).getByLabelText('请求头键 3')).toBeInTheDocument();

  await user.click(within(drawer).getByRole('button', { name: '删除请求头 3' }));
  expect(within(drawer).queryByLabelText('请求头键 3')).not.toBeInTheDocument();
});

it('关闭脏表单前确认是否放弃', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api?create=1');
  const drawer = await screen.findByRole('dialog', { name: '新建接口用例' });

  await user.type(within(drawer).getByLabelText('用例名称'), '未保存的用例');
  await user.click(within(drawer).getByRole('button', { name: '取消' }));
  const confirmation = (await screen.findByText('关闭后，本次填写的内容不会保留。')).closest(
    '[role="dialog"]',
  ) as HTMLElement | null;
  expect(confirmation).not.toBeNull();

  await user.click(within(confirmation!).getByRole('button', { name: '放弃' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: '新建接口用例' })).not.toBeInTheDocument();
  });
});

it('创建用例后继续遵守当前筛选', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api');
  const list = await screen.findByRole('region', { name: '接口用例列表' });

  await user.type(screen.getByPlaceholderText('搜索用例名称或接口地址'), '不存在的筛选词');
  expect(await within(list).findByText('没有符合条件的测试用例')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '新建接口用例' }));
  const drawer = await screen.findByRole('dialog', { name: '新建接口用例' });
  await user.type(within(drawer).getByLabelText('用例名称'), 'P1 筛选外用例');
  await user.type(within(drawer).getByLabelText('接口地址'), '/api/filtered');
  await user.click(within(drawer).getByRole('button', { name: '创建用例' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: '新建接口用例' })).not.toBeInTheDocument();
  });

  expect(within(list).queryByText('P1 筛选外用例')).not.toBeInTheDocument();
});

it('功能用例支持按项目归属、是否冒烟和归属迭代组合筛选', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  await service.createTestCase({
    type: 'functional',
    moduleId: 'auth',
    name: '移动端结算回归',
    priority: 'P1',
    status: '维护中',
    projectName: '移动端',
    iteration: 'Sprint 13',
    isSmoke: false,
  });
  const listTestCases = vi.spyOn(service, 'listTestCases');
  renderTestCasesPageWithService(service, '/test-cases/functional');
  const list = await screen.findByRole('region', { name: '功能用例列表' });

  await user.click(screen.getByRole('combobox', { name: '筛选项目归属' }));
  await screen.findByRole('option', { name: '移动端' });
  await user.click(screen.getByTitle('移动端'));
  await waitFor(() => {
    expect(listTestCases).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectName: '移动端' }),
    );
  });
  await waitFor(() => expect(within(list).queryByText('FUN-12583')).not.toBeInTheDocument());
  await user.click(screen.getByRole('combobox', { name: '筛选项目归属' }));
  expect(await screen.findByRole('option', { name: '官网环境' })).toBeInTheDocument();
  await user.keyboard('{Escape}');

  await user.click(screen.getByRole('combobox', { name: '筛选是否冒烟' }));
  await screen.findByRole('option', { name: '否' });
  await user.click(screen.getByTitle('否'));
  await user.click(screen.getByRole('combobox', { name: '筛选归属迭代' }));
  await screen.findByRole('option', { name: 'Sprint 13' });
  await user.click(screen.getByTitle('Sprint 13'));

  expect(await within(list).findByText('移动端结算回归')).toBeInTheDocument();
  await waitFor(() => {
    expect(listTestCases).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'functional',
        projectName: '移动端',
        isSmoke: false,
        iteration: 'Sprint 13',
      }),
    );
  });
});

it('项目归属读取设置选项且新建用例默认使用官网环境', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  const settings = await service.getSystemSettings();
  await service.updateSystemSettings({
    ...settings,
    caseManagement: {
      projectNames: ['官网环境', '管理后台'],
      defaultProjectName: '官网环境',
    },
  });
  const createTestCase = vi.spyOn(service, 'createTestCase');
  renderTestCasesPageWithService(service, '/test-cases/functional');

  await user.click(screen.getByRole('combobox', { name: '筛选项目归属' }));
  expect(await screen.findByRole('option', { name: '管理后台' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: '新建功能用例' }));

  const dialog = await screen.findByRole('dialog', { name: '新建功能用例' });
  expect(within(dialog).getByText('官网环境')).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('用例名称'), '官网登录');
  await user.type(within(dialog).getByLabelText('用例步骤'), '打开官网');
  await user.type(within(dialog).getByLabelText('预期结果'), '展示首页');
  await user.click(within(dialog).getByRole('button', { name: '创建用例' }));

  await waitFor(() => {
    expect(createTestCase).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: 'auth', projectName: '官网环境' }),
    );
  });
});

it('测试用例分页提供统一的每页条数和页码跳转控件', async () => {
  renderApp('/test-cases/functional');

  await screen.findByRole('region', { name: '功能用例列表' });

  expect(screen.getByRole('combobox', { name: '每页条数' })).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: '跳转页码' })).toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole('combobox', { name: '每页条数' }));
  expect(await screen.findByRole('option', { name: '50 条/页' })).toBeInTheDocument();
});

it('模块栏可折叠并通过分隔线调整宽度', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  await screen.findByRole('region', { name: '功能用例列表' });
  const resizeHandle = screen.getByRole('separator', { name: '调整模块栏宽度' });
  expect(resizeHandle).toHaveAttribute('aria-valuenow', '248');

  fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
  expect(resizeHandle).toHaveAttribute('aria-valuenow', '264');

  await user.click(await screen.findByRole('button', { name: '鉴权 操作' }));
  await user.click(screen.getByRole('menuitem', { name: '重命名' }));
  const renameDialog = await screen.findByRole('dialog', { name: '重命名模块' });
  const nameInput = within(renameDialog).getByRole('textbox', { name: '目录名称' });
  await user.clear(nameInput);
  await user.type(nameInput, '登录鉴权');
  await user.click(within(renameDialog).getByRole('button', { name: '确定' }));

  await user.click(screen.getByRole('button', { name: '隐藏模块栏' }));
  expect(screen.queryByRole('complementary', { name: '模块树' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '显示模块栏' }));
  expect(screen.getByRole('complementary', { name: '模块树' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: '登录鉴权' })).toBeInTheDocument();
  expect(screen.getByRole('separator', { name: '调整模块栏宽度' })).toHaveAttribute(
    'aria-valuenow',
    '264',
  );
});

it('模块目录直接展示业务模块，不包含固定的核心模块分组', async () => {
  renderApp('/test-cases/functional');

  const tree = await screen.findByRole('tree', { name: '用例模块' });
  expect(await within(tree).findByRole('treeitem', { name: '鉴权' })).toHaveAttribute(
    'aria-level',
    '1',
  );
  expect(within(tree).queryByText('核心模块')).not.toBeInTheDocument();
  expect(within(tree).getByRole('treeitem', { name: '支付' })).toHaveAttribute('aria-level', '1');
  expect(within(tree).getByRole('treeitem', { name: '用户资料' })).toHaveAttribute(
    'aria-level',
    '1',
  );
});

it('模块树图标与文本保持同一水平线', async () => {
  renderApp('/test-cases/functional');

  const tree = await screen.findByRole('tree', { name: '用例模块' });
  expect(await within(tree).findByRole('treeitem', { name: '鉴权' })).toHaveStyle({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    lineHeight: '20px',
  });
  expect(within(tree).getByRole('treeitem', { name: '全部模块' })).toHaveStyle({
    paddingLeft: '26px',
  });
});

it('新建用例的所属模块不显示固定的核心模块路径', async () => {
  renderApp('/test-cases/ui?create=1');

  const dialog = await screen.findByRole('dialog', { name: '新建UI自动化' });
  expect(await within(dialog).findByText('鉴权')).toBeInTheDocument();
  expect(within(dialog).queryByText('核心模块 / 鉴权')).not.toBeInTheDocument();
});

it('项目归属与用例目录独立选择', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  const settings = await service.getSystemSettings();
  await service.updateSystemSettings({
    ...settings,
    caseManagement: {
      projectNames: ['官网环境', '管理后台'],
      defaultProjectName: '官网环境',
    },
  });
  const createTestCase = vi.spyOn(service, 'createTestCase');
  renderTestCasesPageWithService(service, '/test-cases/functional');

  await user.click(screen.getByRole('button', { name: '新建功能用例' }));
  const dialog = await screen.findByRole('dialog', { name: '新建功能用例' });
  const projectInput = within(dialog).getByRole('combobox', { name: '项目归属' });
  await user.click(projectInput);
  await user.click(await screen.findByTitle('管理后台'));
  await user.click(within(dialog).getByRole('combobox', { name: '用例目录' }));
  await user.click(await screen.findByTitle('支付'));
  await user.type(within(dialog).getByLabelText('用例名称'), '后台退款');
  await user.type(within(dialog).getByLabelText('用例步骤'), '提交退款申请');
  await user.type(within(dialog).getByLabelText('预期结果'), '退款完成');
  await user.click(within(dialog).getByRole('button', { name: '创建用例' }));

  await waitFor(() => {
    expect(createTestCase).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: 'payments', projectName: '管理后台' }),
    );
  });
});

it('切换项目归属不会改写用例目录', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  const settings = await service.getSystemSettings();
  await service.updateSystemSettings({
    ...settings,
    caseManagement: {
      projectNames: ['官网环境', '管理后台'],
      defaultProjectName: '官网环境',
    },
  });
  const createTestCase = vi.spyOn(service, 'createTestCase');
  renderTestCasesPageWithService(service, '/test-cases/functional');

  await user.click(screen.getByRole('button', { name: '新建功能用例' }));
  const dialog = await screen.findByRole('dialog', { name: '新建功能用例' });
  const projectInput = within(dialog).getByRole('combobox', { name: '项目归属' });
  await user.click(projectInput);
  await user.click(await screen.findByTitle('管理后台'));
  await user.type(within(dialog).getByLabelText('用例名称'), '后台登录');
  await user.type(within(dialog).getByLabelText('用例步骤'), '提交退款申请');
  await user.type(within(dialog).getByLabelText('预期结果'), '退款成功');
  await user.click(within(dialog).getByRole('button', { name: '创建用例' }));

  await waitFor(() => {
    expect(createTestCase).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: 'auth', projectName: '管理后台' }),
    );
  });
});

it('切换用例目录不会改写默认项目归属', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  const createTestCase = vi.spyOn(service, 'createTestCase');
  renderTestCasesPageWithService(service, '/test-cases/functional');

  await user.click(screen.getByRole('button', { name: '新建功能用例' }));
  const dialog = await screen.findByRole('dialog', { name: '新建功能用例' });
  await user.click(within(dialog).getByRole('combobox', { name: '用例目录' }));
  await screen.findByRole('option', { name: '支付' });
  await user.click(screen.getByTitle('支付'));
  expect(within(dialog).getByText('官网环境')).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('用例名称'), '支付退款目录用例');
  await user.type(within(dialog).getByLabelText('用例步骤'), '提交退款申请');
  await user.type(within(dialog).getByLabelText('预期结果'), '退款成功');
  await user.click(within(dialog).getByRole('button', { name: '创建用例' }));

  await waitFor(() => {
    expect(createTestCase).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: 'payments', projectName: '官网环境' }),
    );
  });
});

it('模块目录支持重命名、删除和新增子目录', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  await screen.findByRole('treeitem', { name: '鉴权' });
  await user.click(screen.getByRole('button', { name: '鉴权 操作' }));

  expect(screen.getByRole('menuitem', { name: '重命名' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '删除' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '新增子目录' })).toBeInTheDocument();

  await user.click(screen.getByRole('menuitem', { name: '重命名' }));
  const renameDialog = await screen.findByRole('dialog', { name: '重命名模块' });
  const nameInput = within(renameDialog).getByRole('textbox', { name: '目录名称' });
  await user.clear(nameInput);
  await user.type(nameInput, '登录鉴权');
  await user.click(within(renameDialog).getByRole('button', { name: '确定' }));

  expect(await screen.findByRole('treeitem', { name: '登录鉴权' })).toBeInTheDocument();
  expect(screen.queryByRole('treeitem', { name: '鉴权' })).not.toBeInTheDocument();
});

it('新增子目录后可以删除该目录', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  await screen.findByRole('treeitem', { name: '鉴权' });
  await user.click(screen.getByRole('button', { name: '鉴权 操作' }));
  await user.click(screen.getByRole('menuitem', { name: '新增子目录' }));

  const addDialog = await screen.findByRole('dialog', { name: '新增子目录' });
  await user.type(within(addDialog).getByRole('textbox', { name: '目录名称' }), '审计');
  await user.click(within(addDialog).getByRole('button', { name: '确定' }));

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: '新增子目录' })).not.toBeInTheDocument();
  });

  expect(await screen.findByRole('treeitem', { name: '审计' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '审计 操作' }));
  await user.click(screen.getByRole('menuitem', { name: '删除' }));

  const deleteDialog = await screen.findByRole('dialog', { name: '删除模块' });
  await user.click(within(deleteDialog).getByRole('button', { name: '删除' }));
  await waitFor(() => {
    expect(screen.queryByRole('treeitem', { name: '审计' })).not.toBeInTheDocument();
  });
});

it('新增子目录嵌套在父目录内并支持展开折叠', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  await screen.findByRole('treeitem', { name: '鉴权' });
  await user.click(screen.getByRole('button', { name: '鉴权 操作' }));
  await user.click(screen.getByRole('menuitem', { name: '新增子目录' }));
  const addDialog = await screen.findByRole('dialog', { name: '新增子目录' });
  await user.type(within(addDialog).getByRole('textbox', { name: '目录名称' }), '审计');
  await user.click(within(addDialog).getByRole('button', { name: '确定' }));

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: '新增子目录' })).not.toBeInTheDocument();
  });

  const persistedParent = screen.getByRole('treeitem', { name: '鉴权' });
  expect(persistedParent).toHaveAttribute('aria-level', '1');
  expect(persistedParent).toHaveAttribute('aria-expanded', 'true');
  expect(await screen.findByRole('treeitem', { name: '审计' })).toHaveAttribute('aria-level', '2');

  await user.click(screen.getByRole('button', { name: '折叠 鉴权' }));
  expect(screen.queryByRole('treeitem', { name: '审计' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '展开 鉴权' }));
  expect(screen.getByRole('treeitem', { name: '审计' })).toBeInTheDocument();
});

it('可以在模块根目录新增同级目录', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  await screen.findByRole('treeitem', { name: '鉴权' });
  await user.click(screen.getByRole('button', { name: '新增根目录' }));

  const addDialog = await screen.findByRole('dialog', { name: '新增根目录' });
  await user.type(within(addDialog).getByRole('textbox', { name: '目录名称' }), '结算模块');
  await user.click(within(addDialog).getByRole('button', { name: '确定' }));

  expect(await screen.findByText('结算模块')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '结算模块 操作' })).toBeInTheDocument();
});

it('接口和 UI 自动化用例可以编辑完整配置', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/api');

  const apiList = await screen.findByRole('region', { name: '接口用例列表' });
  await user.click(within(apiList).getByRole('button', { name: '编辑 API-253301' }));
  const apiDialog = await screen.findByRole('dialog', { name: '编辑接口用例' });
  expect(within(apiDialog).getByText('请求参数配置')).toBeInTheDocument();
  expect(within(apiDialog).getByRole('tab', { name: 'Headers (2)' })).toBeInTheDocument();
  expect(within(apiDialog).getByRole('tab', { name: '响应断言 (2)' })).toBeInTheDocument();
  await user.click(within(apiDialog).getByRole('button', { name: '取消' }));

  await user.click(screen.getByRole('tab', { name: 'UI自动化' }));
  const uiList = await screen.findByRole('region', { name: 'UI自动化列表' });
  await user.click(within(uiList).getByRole('button', { name: '编辑 UI-13533' }));
  const uiDialog = await screen.findByRole('dialog', { name: '编辑UI自动化' });
  expect(within(uiDialog).getByText('执行配置')).toBeInTheDocument();
  expect(within(uiDialog).getByText('自动化步骤')).toBeInTheDocument();
  expect(within(uiDialog).getByLabelText('步骤 1 操作类型')).toBeInTheDocument();
});

it('用例列表支持编辑和批量删除', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  const list = await screen.findByRole('region', { name: '功能用例列表' });
  expect(within(list).getByRole('columnheader', { name: '操作' })).toBeInTheDocument();
  expect(within(list).getByRole('button', { name: '编辑 FUN-12583' })).toBeInTheDocument();
  expect(within(list).getByRole('button', { name: '删除 FUN-12583' })).toBeInTheDocument();

  await user.click(within(list).getByRole('button', { name: '编辑 FUN-12583' }));
  const editDialog = await screen.findByRole('dialog', { name: '编辑功能用例' });
  const nameInput = within(editDialog).getByRole('textbox', { name: '用例名称' });
  await user.clear(nameInput);
  await user.type(nameInput, '用户登录成功（已编辑）');
  await user.click(within(editDialog).getByRole('button', { name: '保存' }));

  expect(await within(list).findByText('用户登录成功（已编辑）')).toBeInTheDocument();
  await user.click(within(list).getByRole('checkbox', { name: '选择 FUN-12583' }));
  await user.click(within(list).getByRole('checkbox', { name: '选择 FUN-12584' }));
  expect(screen.getByRole('toolbar', { name: '批量操作' })).toHaveTextContent('已选择 2 项');

  await user.click(screen.getByRole('button', { name: '删除已选 2 项' }));
  const [deleteTitle] = await screen.findAllByText('删除已选的 2 条用例？');
  const deleteDialog = deleteTitle.closest('[role="dialog"]') as HTMLElement | null;
  expect(deleteDialog).not.toBeNull();
  await user.click(within(deleteDialog!).getByRole('button', { name: '删除' }));

  expect(await within(list).findByText('没有符合条件的测试用例')).toBeInTheDocument();
});

it('批量删除部分失败时保留失败项供重试', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  const deleteTestCase = service.deleteTestCase;
  service.deleteTestCase = async (storageId) => {
    if (storageId === 6) throw new Error('删除失败');
    await deleteTestCase(storageId);
  };
  renderTestCasesPageWithService(service);

  const list = await screen.findByRole('region', { name: '功能用例列表' });
  await user.click(within(list).getByRole('checkbox', { name: '选择 FUN-12583' }));
  await user.click(within(list).getByRole('checkbox', { name: '选择 FUN-12584' }));
  await user.click(screen.getByRole('button', { name: '删除已选 2 项' }));
  const [deleteTitle] = await screen.findAllByText('删除已选的 2 条用例？');
  const deleteDialog = deleteTitle.closest('[role="dialog"]') as HTMLElement | null;
  await user.click(within(deleteDialog!).getByRole('button', { name: '删除' }));

  expect(await screen.findByText('已删除 1 条，1 条删除失败')).toBeInTheDocument();
  expect(
    within(list).queryByRole('checkbox', { name: '选择 FUN-12583' }),
  ).not.toBeInTheDocument();
  expect(within(list).getByRole('checkbox', { name: '选择 FUN-12584' })).toBeChecked();
  expect(screen.getByRole('toolbar', { name: '批量操作' })).toHaveTextContent('已选择 1 项');
});

it('单条删除失败时不改变行的勾选状态', async () => {
  const user = userEvent.setup();
  const service = createMockPlatformService({ delay: 0 });
  service.deleteTestCase = async () => {
    throw new Error('删除失败');
  };
  renderTestCasesPageWithService(service);

  const list = await screen.findByRole('region', { name: '功能用例列表' });
  await user.click(within(list).getByRole('button', { name: '删除 FUN-12583' }));
  const deleteDialog = await screen.findByRole('dialog', { name: '删除用例 FUN-12583？' });
  await user.click(within(deleteDialog).getByRole('button', { name: '删除' }));

  expect(await screen.findByText('删除失败，请重试')).toBeInTheDocument();
  expect(within(list).getByRole('checkbox', { name: '选择 FUN-12583' })).not.toBeChecked();
  expect(screen.queryByRole('toolbar', { name: '批量操作' })).not.toBeInTheDocument();
});

import { App as AntdApp } from 'antd';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
    </AntdApp>,
  );
}

it('UI自动化页使用统一名称', async () => {
  renderApp('/test-cases/ui');

  expect(await screen.findByRole('tab', { name: 'UI自动化' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新建UI自动化' })).toBeInTheDocument();
  expect(screen.getByText('按模块维护功能、接口和UI自动化资产')).toBeInTheDocument();
});

it('新建 UI 自动化用例时提供完整配置和可维护的步骤列表', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/ui?create=1');

  const dialog = await screen.findByRole('dialog', { name: '新建UI自动化' });
  expect(within(dialog).getByText('基本信息')).toBeInTheDocument();
  expect(within(dialog).getByText('执行配置')).toBeInTheDocument();
  expect(within(dialog).getByText('自动化步骤')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('维护人')).toHaveValue('江珊');
  expect(within(dialog).getByRole('combobox', { name: '默认浏览器' })).toBeInTheDocument();
  expect(within(dialog).getByText('Chrome')).toBeInTheDocument();
  expect(within(dialog).getByRole('combobox', { name: '默认环境' })).toBeInTheDocument();
  expect(within(dialog).getByText('Test')).toBeInTheDocument();
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

  await user.type(within(dialog).getByLabelText('用例名称'), '调试用户资料接口');
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
  renderApp('/test-cases/ui?create=1');
  const dialog = await screen.findByRole('dialog', { name: '新建UI自动化' });

  await user.type(within(dialog).getByLabelText('用例名称'), '调试登录页面');
  await user.type(within(dialog).getByLabelText('步骤 1 元素定位值'), '{{baseUrl}}/login');
  await user.click(within(dialog).getByRole('button', { name: '调试运行' }));

  expect(within(dialog).getByRole('button', { name: '调试运行' })).toBeDisabled();
  expect(await within(dialog).findByText('调试结果')).toBeInTheDocument();
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

  await user.type(screen.getByPlaceholderText('搜索编号、名称或接口地址'), '不存在的筛选词');
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

  expect(await screen.findByRole('treeitem', { name: '审计' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '审计 操作' }));
  await user.click(screen.getByRole('menuitem', { name: '删除' }));

  const deleteDialog = await screen.findByRole('dialog', { name: '删除模块' });
  await user.click(within(deleteDialog).getByRole('button', { name: '删除' }));
  expect(screen.queryByRole('treeitem', { name: '审计' })).not.toBeInTheDocument();
});

it('新增子目录嵌套在父目录内并支持展开折叠', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  const parent = await screen.findByRole('treeitem', { name: '鉴权' });
  await user.click(screen.getByRole('button', { name: '鉴权 操作' }));
  await user.click(screen.getByRole('menuitem', { name: '新增子目录' }));
  const addDialog = await screen.findByRole('dialog', { name: '新增子目录' });
  await user.type(within(addDialog).getByRole('textbox', { name: '目录名称' }), '审计');
  await user.click(within(addDialog).getByRole('button', { name: '确定' }));

  expect(parent).toHaveAttribute('aria-level', '1');
  expect(parent).toHaveAttribute('aria-expanded', 'true');
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
  expect(within(list).queryByText('FUN-12583')).not.toBeInTheDocument();
  expect(within(list).getByText('FUN-12584')).toBeInTheDocument();
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

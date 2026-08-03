import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

it('UI自动化页使用统一名称', async () => {
  renderApp('/test-cases/ui');

  expect(await screen.findByRole('tab', { name: 'UI自动化' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新建UI自动化' })).toBeInTheDocument();
  expect(screen.getByText('按模块维护功能、接口和UI自动化资产')).toBeInTheDocument();
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

  expect(within(drawer).getByLabelText('请求头键 1')).toBeInTheDocument();
  await user.click(within(drawer).getByRole('button', { name: '添加请求头' }));
  expect(within(drawer).getByLabelText('请求头键 2')).toBeInTheDocument();

  await user.click(within(drawer).getByRole('button', { name: '删除请求头 2' }));
  expect(within(drawer).queryByLabelText('请求头键 2')).not.toBeInTheDocument();
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

it('模块目录支持重命名、删除和新增子目录', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  await screen.findByRole('treeitem', { name: '鉴权' });
  await user.click(screen.getByRole('button', { name: '核心模块 操作' }));

  expect(screen.getByRole('menuitem', { name: '重命名' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '删除' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '新增子目录' })).toBeInTheDocument();

  await user.click(screen.getByRole('menuitem', { name: '重命名' }));
  const renameDialog = await screen.findByRole('dialog', { name: '重命名模块' });
  const nameInput = within(renameDialog).getByRole('textbox', { name: '目录名称' });
  await user.clear(nameInput);
  await user.type(nameInput, '业务核心');
  await user.click(within(renameDialog).getByRole('button', { name: '确定' }));

  expect(await screen.findByText('业务核心')).toBeInTheDocument();
  expect(screen.queryByText('核心模块')).not.toBeInTheDocument();
});

it('新增子目录后可以删除该目录', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  await screen.findByRole('treeitem', { name: '鉴权' });
  await user.click(screen.getByRole('button', { name: '核心模块 操作' }));
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

it('可以在模块根目录新增同级目录', async () => {
  const user = userEvent.setup();
  renderApp('/test-cases/functional');

  await screen.findByText('核心模块');
  await user.click(screen.getByRole('button', { name: '新增根目录' }));

  const addDialog = await screen.findByRole('dialog', { name: '新增根目录' });
  await user.type(within(addDialog).getByRole('textbox', { name: '目录名称' }), '结算模块');
  await user.click(within(addDialog).getByRole('button', { name: '确定' }));

  expect(await screen.findByText('结算模块')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '结算模块 操作' })).toBeInTheDocument();
});

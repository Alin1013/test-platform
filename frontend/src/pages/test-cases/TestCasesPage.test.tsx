import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

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

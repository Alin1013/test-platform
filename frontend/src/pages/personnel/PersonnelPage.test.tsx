import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

it('可以添加用户并停用新用户', async () => {
  const user = userEvent.setup();
  renderApp('/personnel');

  await user.click(await screen.findByRole('button', { name: '添加用户' }));
  const drawer = await screen.findByRole('dialog', { name: '添加用户' });
  await user.type(within(drawer).getByLabelText('姓名'), '周敏');
  await user.type(within(drawer).getByLabelText('邮箱'), 'zhoumin@example.com');
  await user.type(within(drawer).getByLabelText('初始密码'), 'Test1234');
  await user.click(within(drawer).getByRole('button', { name: '添加' }));

  expect(await screen.findByText('用户添加成功')).toBeInTheDocument();
  expect(await screen.findByText('周敏')).toBeInTheDocument();
  await user.click(screen.getByRole('switch', { name: '周敏的启用状态' }));
  expect(await screen.findByText('用户已停用')).toBeInTheDocument();
});

it('可以查看角色权限矩阵', async () => {
  const user = userEvent.setup();
  renderApp('/personnel');

  await user.click(await screen.findByRole('tab', { name: '角色与权限' }));

  const matrix = await screen.findByRole('table', { name: '权限矩阵' });
  expect(within(matrix).getByText('测试负责人')).toBeInTheDocument();
  expect(within(matrix).getByText('测试工程师')).toBeInTheDocument();
  expect(within(matrix).getByText('开发人员')).toBeInTheDocument();
  expect(within(matrix).getByRole('columnheader', { name: '系统设置' })).toBeInTheDocument();

  const saveButton = screen.getByRole('button', { name: '保存' });
  expect(saveButton).toBeDisabled();

  const permission = within(matrix).getByRole('checkbox', { name: '开发人员的用例编辑权限' });
  expect(permission).not.toBeChecked();
  await user.click(permission);
  expect(permission).toBeChecked();
  expect(saveButton).toBeEnabled();

  await user.click(saveButton);

  expect(await screen.findByText('角色权限已保存')).toBeInTheDocument();
  expect(saveButton).toBeDisabled();
  await user.click(screen.getByRole('tab', { name: '用户列表' }));
  await user.click(screen.getByRole('tab', { name: '角色与权限' }));
  expect(
    within(screen.getByRole('table', { name: '权限矩阵' })).getByRole('checkbox', {
      name: '开发人员的用例编辑权限',
    }),
  ).toBeChecked();
});

it('按关键字筛选用户列表', async () => {
  const user = userEvent.setup();
  renderApp('/personnel');
  const userList = await screen.findByRole('region', { name: '用户列表' });

  await user.type(screen.getByPlaceholderText('搜索姓名或邮箱'), 'linran');

  await waitFor(() => {
    expect(within(userList).getByText('林然')).toBeInTheDocument();
    expect(within(userList).queryByText('江珊')).not.toBeInTheDocument();
  });
});

it('已启用用户点击删除时提示先停用，不弹出确认框', async () => {
  const user = userEvent.setup();
  renderApp('/personnel');

  const userList = await screen.findByRole('region', { name: '用户列表' });
  const jiangshanRow = (await within(userList).findByText('江珊')).closest('tr');
  expect(jiangshanRow).not.toBeNull();

  await user.click(
    within(jiangshanRow as HTMLElement).getByRole('button', { name: '删除用户江珊' }),
  );

  expect(await screen.findByText('请先停用账号')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(within(userList).getByText('江珊')).toBeInTheDocument();
});

it('停用用户后点击删除需二次确认，确认后用户从列表中移除', async () => {
  const user = userEvent.setup();
  renderApp('/personnel');

  const userList = await screen.findByRole('region', { name: '用户列表' });
  const jiangshanRow = (await within(userList).findByText('江珊')).closest('tr');
  expect(jiangshanRow).not.toBeNull();

  await user.click(
    within(jiangshanRow as HTMLElement).getByRole('switch', { name: '江珊的启用状态' }),
  );
  expect(await screen.findByText('用户已停用')).toBeInTheDocument();

  await user.click(
    within(jiangshanRow as HTMLElement).getByRole('button', { name: '删除用户江珊' }),
  );

  const confirmDialog = await screen.findByRole('dialog', { name: /确认删除用户/ });
  await user.click(within(confirmDialog).getByRole('button', { name: /删\s*除/ }));

  expect(await screen.findByText('用户已删除')).toBeInTheDocument();
  await waitFor(() => {
    expect(within(userList).queryByText('江珊')).not.toBeInTheDocument();
  });
});

it('添加用户时校验邮箱格式和初始密码长度', async () => {
  const user = userEvent.setup();
  renderApp('/personnel');

  await user.click(await screen.findByRole('button', { name: '添加用户' }));
  const drawer = await screen.findByRole('dialog', { name: '添加用户' });
  await user.type(within(drawer).getByLabelText('姓名'), '校验用户');
  await user.type(within(drawer).getByLabelText('邮箱'), 'invalid-email');
  await user.type(within(drawer).getByLabelText('初始密码'), 'short');
  await user.click(within(drawer).getByRole('button', { name: '添加' }));

  expect(await within(drawer).findByText('请输入有效的邮箱地址')).toBeInTheDocument();
  expect(await within(drawer).findByText('初始密码至少 8 位')).toBeInTheDocument();
});

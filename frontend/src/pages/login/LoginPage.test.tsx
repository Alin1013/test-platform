import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../tests/renderApp';

it('账号密码正确后进入仪表盘', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.type(screen.getByLabelText('账号'), 'jiangshan');
  await user.type(screen.getByLabelText('密码'), 'Test1234');
  await user.click(screen.getByRole('button', { name: '登录' }));

  expect(await screen.findByRole('heading', { name: '仪表盘' })).toBeInTheDocument();
});

it('账号密码错误时停留在登录页并提示错误', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.type(screen.getByLabelText('账号'), 'jiangshan');
  await user.type(screen.getByLabelText('密码'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: '登录' }));

  expect(await screen.findByText('账号或密码错误')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '账号登录' })).toBeInTheDocument();
});

async function fillRegistrationForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { account?: string; name?: string; email?: string; confirmPassword?: string } = {},
) {
  const dialog = screen.getByRole('dialog', { name: '注册账号' });
  await user.type(within(dialog).getByLabelText('账号'), values.account ?? 'newtester');
  await user.type(within(dialog).getByLabelText('姓名'), values.name ?? '新测试员');
  await user.type(
    within(dialog).getByLabelText('邮箱'),
    values.email ?? 'newtester@example.com',
  );
  await user.type(within(dialog).getByLabelText('密码'), 'Register123');
  await user.type(
    within(dialog).getByLabelText('确认密码'),
    values.confirmPassword ?? 'Register123',
  );
  return dialog;
}

it('点击登录卡片底部按钮打开注册弹窗', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.click(screen.getByRole('button', { name: '立即注册' }));

  expect(screen.getByRole('dialog', { name: '注册账号' })).toBeInTheDocument();
});

it('注册时要求两次输入的密码一致', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.click(screen.getByRole('button', { name: '立即注册' }));
  const dialog = await fillRegistrationForm(user, { confirmPassword: 'Different123' });
  await user.click(within(dialog).getByRole('button', { name: '创建账号' }));

  expect(await within(dialog).findByText('两次输入的密码不一致')).toBeInTheDocument();
});

it('注册时阻止只包含空格的姓名', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.click(screen.getByRole('button', { name: '立即注册' }));
  const dialog = await fillRegistrationForm(user, { name: '   ' });
  await user.click(within(dialog).getByRole('button', { name: '创建账号' }));

  expect(await within(dialog).findByText('请输入姓名')).toBeInTheDocument();
  expect(dialog).toBeInTheDocument();
});

it('注册成功后关闭弹窗并回填登录账号', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.click(screen.getByRole('button', { name: '立即注册' }));
  const dialog = await fillRegistrationForm(user);
  await user.click(within(dialog).getByRole('button', { name: '创建账号' }));

  expect(await screen.findByText('注册成功，请登录')).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: '注册账号' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('main')).getByLabelText('账号')).toHaveValue('newtester');
});

it('重复注册时保留弹窗并提示账号或邮箱已存在', async () => {
  const user = userEvent.setup();
  renderApp('/login');

  await user.click(screen.getByRole('button', { name: '立即注册' }));
  let dialog = await fillRegistrationForm(user);
  await user.click(within(dialog).getByRole('button', { name: '创建账号' }));
  await screen.findByText('注册成功，请登录');

  await user.click(screen.getByRole('button', { name: '立即注册' }));
  dialog = await fillRegistrationForm(user, { email: 'another@example.com' });
  await user.click(within(dialog).getByRole('button', { name: '创建账号' }));

  expect(await within(dialog).findByText('账号或邮箱已存在')).toBeInTheDocument();
  expect(dialog).toBeInTheDocument();
});

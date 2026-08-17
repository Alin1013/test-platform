/**
 * 认证上下文测试：登录状态、注册与登出流程。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { createMemoryAuthClient } from './authClient';

function AuthHarness() {
  const { user, login, register } = useAuth();

  return (
    <div>
      <span>{user?.account ?? '未登录'}</span>
      <button
        type="button"
        onClick={() =>
          register({
            account: 'newtester',
            name: '新测试员',
            email: 'newtester@example.com',
            password: 'Register123',
          })
        }
      >
        注册新账号
      </button>
      <button type="button" onClick={() => login('newtester', 'Register123')}>
        登录新账号
      </button>
    </div>
  );
}

test('registered account can log in through the auth context', async () => {
  const user = userEvent.setup();
  render(
    <AuthProvider client={createMemoryAuthClient()}>
      <AuthHarness />
    </AuthProvider>,
  );

  await user.click(screen.getByRole('button', { name: '注册新账号' }));
  await user.click(screen.getByRole('button', { name: '登录新账号' }));

  expect(await screen.findByText('newtester')).toBeInTheDocument();
});

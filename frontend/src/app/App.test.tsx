/**
 * 应用入口测试：路由跳转与登录守卫。
 */
import { render, screen } from '@testing-library/react';
import { App } from './App';

it('默认进入仪表盘', async () => {
  render(<App router="memory" initialEntries={['/']} />);
  expect(await screen.findByRole('heading', { name: '仪表盘' })).toBeInTheDocument();
});

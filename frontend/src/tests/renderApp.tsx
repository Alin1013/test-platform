/**
 * 测试工具：以 MemoryRouter 渲染整个应用，支持指定初始路由。
 */
import { render } from '@testing-library/react';
import { App } from '../app/App';

export function renderApp(route = '/') {
  return render(<App router="memory" initialEntries={[route]} />);
}

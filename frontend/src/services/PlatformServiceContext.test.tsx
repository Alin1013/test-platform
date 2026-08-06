import { render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { createMockPlatformService } from './mockPlatformService';
import {
  PlatformServiceProvider,
  resolvePlatformApiBaseUrl,
  usePlatformService,
} from './PlatformServiceContext';

function UserCount() {
  const service = usePlatformService();
  const [count, setCount] = useState(0);

  useEffect(() => {
    void service.listUsers().then((users) => setCount(users.length));
  }, [service]);

  return <span>用户数量：{count}</span>;
}

it('向页面组件提供平台服务', async () => {
  render(
    <PlatformServiceProvider service={createMockPlatformService({ delay: 0 })}>
      <UserCount />
    </PlatformServiceProvider>,
  );

  expect(await screen.findByText('用户数量：2')).toBeInTheDocument();
});

it('开发环境未配置 API 地址时默认使用数据库后端，测试环境保留 mock', () => {
  expect(resolvePlatformApiBaseUrl(undefined, 'development')).toBe(
    'http://127.0.0.1:8000/api/v1',
  );
  expect(resolvePlatformApiBaseUrl(undefined, 'test')).toBeUndefined();
  expect(resolvePlatformApiBaseUrl(' https://example.test/api/v1 ', 'development')).toBe(
    'https://example.test/api/v1',
  );
});

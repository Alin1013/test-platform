import { render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { createMockPlatformService } from './mockPlatformService';
import { PlatformServiceProvider, usePlatformService } from './PlatformServiceContext';

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

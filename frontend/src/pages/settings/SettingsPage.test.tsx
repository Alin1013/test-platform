import { App as AntdApp, ConfigProvider } from 'antd';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlatformServiceProvider } from '../../services/PlatformServiceContext';
import { createMockPlatformService } from '../../services/mockPlatformService';
import { SettingsPage } from './SettingsPage';

function renderSettingsPage() {
  const service = createMockPlatformService({ delay: 0 });

  render(
    <ConfigProvider theme={{ token: { borderRadius: 6, colorPrimary: '#1677ff' } }}>
      <AntdApp>
        <PlatformServiceProvider service={service}>
          <SettingsPage />
        </PlatformServiceProvider>
      </AntdApp>
    </ConfigProvider>,
  );

  return service;
}

it('切换设置分类并保存基础设置', async () => {
  const user = userEvent.setup();
  const service = renderSettingsPage();

  expect(await screen.findByDisplayValue('测试平台')).toBeInTheDocument();
  expect(screen.getByDisplayValue('TC-')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: '环境与执行配置' }));
  expect(await screen.findByLabelText('测试环境 Base URL')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: '基础设置' }));

  const nameInput = screen.getByLabelText('平台名称');
  await user.clear(nameInput);
  await user.type(nameInput, '质量保障中心');
  await user.click(screen.getByRole('button', { name: '保存设置' }));

  expect(await screen.findByText('设置已保存')).toBeInTheDocument();
  await expect(service.getSystemSettings()).resolves.toMatchObject({
    general: { platformName: '质量保障中心' },
  });
});

it('填写企微 Webhook 后可以测试连接', async () => {
  const user = userEvent.setup();
  renderSettingsPage();

  await screen.findByDisplayValue('测试平台');
  await user.click(screen.getByRole('tab', { name: '通知推送' }));
  await user.type(
    screen.getByLabelText('企微 Webhook'),
    'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
  );
  await user.click(screen.getByRole('button', { name: '测试企微连接' }));

  expect(await screen.findByText('已成功连接 qyapi.weixin.qq.com')).toBeInTheDocument();
});

it('选择默认模型并保存 AI 配置', async () => {
  const user = userEvent.setup();
  const service = renderSettingsPage();

  await screen.findByDisplayValue('测试平台');
  await user.click(screen.getByRole('tab', { name: 'AI 模型配置' }));
  await user.type(screen.getByLabelText('LLM API Key'), 'sk-test-key');
  await user.click(screen.getByLabelText('默认模型'));
  await user.click(await screen.findByText('DeepSeek Chat'));
  await user.click(screen.getByRole('button', { name: '保存设置' }));

  expect(await screen.findByText('设置已保存')).toBeInTheDocument();
  await expect(service.getSystemSettings()).resolves.toMatchObject({
    ai: {
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'deepseek-chat',
    },
  });
});

it('将超过三次的失败重试次数限制为三次', async () => {
  const user = userEvent.setup();
  const service = renderSettingsPage();

  await screen.findByDisplayValue('测试平台');
  await user.click(screen.getByRole('tab', { name: '环境与执行配置' }));
  const retryInput = screen.getByLabelText('失败重试次数');
  await user.clear(retryInput);
  await user.type(retryInput, '4');
  await user.click(screen.getByRole('button', { name: '保存设置' }));

  expect(await screen.findByText('设置已保存')).toBeInTheDocument();
  await expect(service.getSystemSettings()).resolves.toMatchObject({
    execution: { retryCount: 3 },
  });
});

it('添加环境并将其设为默认执行环境', async () => {
  const user = userEvent.setup();
  const service = renderSettingsPage();

  await screen.findByDisplayValue('测试平台');
  await user.click(screen.getByRole('tab', { name: '环境与执行配置' }));
  await user.click(screen.getByRole('button', { name: '添加环境' }));

  const environmentNames = screen.getAllByLabelText('环境名称');
  const environmentUrls = screen.getAllByPlaceholderText('https://test-api.example.com');
  await user.type(environmentNames.at(-1)!, 'STAG');
  await user.type(environmentUrls.at(-1)!, 'https://staging.example.com');
  await user.click(screen.getByLabelText('默认执行环境'));
  await user.click(await screen.findByText('STAG'));
  await user.click(screen.getByRole('button', { name: '保存设置' }));

  expect(await screen.findByText('设置已保存')).toBeInTheDocument();
  const savedSettings = await service.getSystemSettings();
  expect(savedSettings.execution.defaultEnvironmentId).toMatch(/^env-/);
  expect(savedSettings.execution.environments).toContainEqual(
    expect.objectContaining({ name: 'STAG', baseUrl: 'https://staging.example.com' }),
  );
});

/**
 * 系统设置页测试：配置保存、Webhook 测试与个人资料。
 */
import { App as AntdApp, ConfigProvider } from 'antd';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderApp } from '../../tests/renderApp';
import { PlatformServiceProvider } from '../../services/PlatformServiceContext';
import { createMockPlatformService } from '../../services/mockPlatformService';
import { AuthProvider } from '../../services/AuthContext';
import { SettingsPage } from './SettingsPage';

function renderSettingsPage() {
  const service = createMockPlatformService({ delay: 0 });

  render(
    <ConfigProvider theme={{ token: { borderRadius: 6, colorPrimary: '#1677ff' } }}>
      <AntdApp>
        <AuthProvider>
          <PlatformServiceProvider service={service}>
            <MemoryRouter>
              <SettingsPage />
            </MemoryRouter>
          </PlatformServiceProvider>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>,
  );

  return service;
}

it('个人信息页签位于设置页签首位', async () => {
  renderSettingsPage();

  await screen.findByDisplayValue('测试平台');
  expect(screen.getAllByRole('tab')[0]).toHaveTextContent('个人信息');
});

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
  expect(screen.getByText('GPT-5.6（最新 ChatGPT）')).toBeInTheDocument();
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

it('配置项目归属并同步默认选项', async () => {
  const user = userEvent.setup();
  const service = renderSettingsPage();

  await screen.findByDisplayValue('测试平台');
  await user.click(screen.getByRole('tab', { name: '用例配置' }));
  expect(screen.getByDisplayValue('官网环境')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '删除官网环境' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '添加项目归属' }));

  const projectNames = screen.getAllByLabelText('项目名称');
  await user.type(projectNames.at(-1)!, '管理后台');
  await user.click(screen.getByRole('button', { name: '保存设置' }));

  expect(await screen.findByText('设置已保存')).toBeInTheDocument();
  await expect(service.getSystemSettings()).resolves.toMatchObject({
    caseManagement: {
      projectNames: ['官网环境', '管理后台'],
    },
  });
});

it('个人信息页签中账号不可修改且密码需要二次确认', async () => {
  const user = userEvent.setup();
  renderSettingsPage();

  await screen.findByDisplayValue('测试平台');
  await user.click(screen.getByRole('tab', { name: '个人信息' }));

  const account = screen.getByLabelText('账号');
  expect(account).toBeDisabled();

  await user.type(screen.getByLabelText('新密码'), 'NewPass123');
  await user.type(screen.getByLabelText('确认新密码'), 'Different123');
  await user.click(screen.getByRole('button', { name: '保存个人信息' }));

  expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();
});

it('修改密码后退出到登录页并要求使用新密码重新登录', async () => {
  const user = userEvent.setup();
  renderApp('/settings?tab=profile');

  await screen.findByRole('tab', { name: '个人信息' });
  await user.type(screen.getByLabelText('新密码'), 'NewPass123');
  await user.type(screen.getByLabelText('确认新密码'), 'NewPass123');
  await user.click(screen.getByRole('button', { name: '保存个人信息' }));

  expect(await screen.findByRole('heading', { name: '账号登录' })).toBeInTheDocument();
  await user.type(screen.getByLabelText('账号'), 'jiangshan');
  await user.type(screen.getByLabelText('密码'), 'NewPass123');
  await user.click(screen.getByRole('button', { name: '登录' }));

  expect(await screen.findByRole('heading', { name: '仪表盘' })).toBeInTheDocument();
});

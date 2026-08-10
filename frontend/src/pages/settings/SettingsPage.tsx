import {
  DeleteOutlined,
  LinkOutlined,
  PlusOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { App, Button, Form, Input, InputNumber, Select, Skeleton, Tabs, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PersonAvatar } from '../../components/PersonAvatar';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../services/AuthContext';
import { usePlatformService } from '../../services/PlatformServiceContext';
import {
  DEFAULT_PROJECT_NAME,
  type NotificationChannel,
  type SystemSettings,
} from '../../services/contracts';
import './settings.css';

const { TextArea } = Input;

const notificationChannels: Array<{ key: NotificationChannel; label: string }> = [
  { key: 'wechatWork', label: '企微' },
  { key: 'feishu', label: '飞书' },
  { key: 'dingtalk', label: '钉钉' },
];

const modelOptions = [
  { value: 'gpt-5.6', label: 'GPT-5.6（最新 ChatGPT）' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: 'qwen-plus', label: 'Qwen Plus' },
];

export function SettingsPage() {
  const service = usePlatformService();
  const { message } = App.useApp();
  const { user, logout, updateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form] = Form.useForm<SystemSettings>();
  const initialTab = new URLSearchParams(location.search).get('tab');
  const [activeTab, setActiveTab] = useState(
    initialTab === 'profile' || initialTab === 'ai' ? initialTab : 'general',
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileAvatar, setProfileAvatar] = useState(user?.avatar);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileError, setProfileError] = useState('');
  const [testingChannel, setTestingChannel] = useState<NotificationChannel | null>(null);
  const environments = Form.useWatch(['execution', 'environments'], form) ?? [];
  const projectNames = Form.useWatch(['caseManagement', 'projectNames'], form) ?? [];

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    setActiveTab(tab === 'profile' || tab === 'ai' ? tab : 'general');
  }, [location.search]);

  useEffect(() => {
    setProfileName(user?.name ?? '');
    setProfileAvatar(user?.avatar);
  }, [user?.avatar, user?.name]);

  useEffect(() => {
    let active = true;

    void service
      .getSystemSettings()
      .then((settings) => {
        if (active) form.setFieldsValue(settings);
      })
      .catch(() => {
        void message.error('设置加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [form, message, service]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await service.updateSystemSettings(form.getFieldsValue(true));
      void message.success('设置已保存');
    } catch {
      void message.error('设置保存失败');
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    setProfileError('');
    if (!profileName.trim()) {
      setProfileError('请输入用户名');
      return;
    }
    if (newPassword !== confirmPassword) {
      setProfileError('两次输入的密码不一致');
      return;
    }

    setSaving(true);
    try {
      const passwordChanged = await updateProfile({
        name: profileName,
        avatar: profileAvatar,
        password: newPassword || undefined,
      });

      if (passwordChanged) {
        await logout();
        navigate('/login', { replace: true });
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      void message.success('个人信息已保存');
    } catch {
      setProfileError('个人信息保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      void message.error('请选择图片文件');
      return false;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setProfileAvatar(reader.result);
    };
    reader.readAsDataURL(file);
    return false;
  };

  const testWebhook = async (channel: NotificationChannel) => {
    const namePath: ['notifications', NotificationChannel] = ['notifications', channel];
    const webhookUrl = form.getFieldValue(namePath)?.trim();

    if (!webhookUrl) {
      void message.warning('请先填写 Webhook 地址');
      return;
    }

    try {
      await form.validateFields([namePath]);
    } catch {
      return;
    }

    setTestingChannel(channel);
    try {
      const result = await service.testWebhookConnection({ channel, webhookUrl });
      if (result.success) {
        void message.success(result.message);
      } else {
        void message.error(result.message);
      }
    } catch {
      void message.error('连接测试失败');
    } finally {
      setTestingChannel(null);
    }
  };

  const addEnvironment = (add: (defaultValue?: SystemSettings['execution']['environments'][number]) => void) => {
    const usedIds = new Set(environments.map((environment) => environment.id));
    const baseId = `env-${Date.now()}`;
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
    add({ id, name: '', baseUrl: '' });
  };

  const removeEnvironment = (index: number, remove: (index: number | number[]) => void) => {
    const removingId = environments[index]?.id;
    const defaultEnvironmentId = form.getFieldValue(['execution', 'defaultEnvironmentId']);
    remove(index);

    if (defaultEnvironmentId === removingId) {
      const nextEnvironment = environments.find((environment, environmentIndex) => environmentIndex !== index);
      form.setFieldValue(['execution', 'defaultEnvironmentId'], nextEnvironment?.id ?? '');
    }
  };

  const profileTab = {
    key: 'profile',
    label: '个人信息',
    children: (
      <div className="settings-profile">
        <div className="settings-profile__avatar-row">
          <PersonAvatar name={profileName || user?.name || '用'} src={profileAvatar} size={72} />
          <div className="settings-profile__avatar-actions">
            <Upload
              accept="image/*"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => handleAvatarUpload(file)}
            >
              <Button icon={<UploadOutlined aria-hidden="true" />}>更换头像</Button>
            </Upload>
            <span>支持 JPG、PNG 格式图片</span>
          </div>
        </div>
        <div className="settings-form-grid settings-profile__fields">
          <div className="settings-profile__field">
            <label htmlFor="profile-account">账号</label>
            <Input id="profile-account" autoComplete="username" value={user?.account ?? ''} disabled />
          </div>
          <div className="settings-profile__field">
            <label htmlFor="profile-name">用户名</label>
            <Input
              id="profile-name"
              autoComplete="name"
              value={profileName}
              maxLength={40}
              onChange={(event) => setProfileName(event.target.value)}
            />
          </div>
          <div className="settings-profile__field">
            <label htmlFor="profile-new-password">新密码</label>
            <Input.Password
              id="profile-new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="不修改请留空"
            />
          </div>
          <div className="settings-profile__field">
            <label htmlFor="profile-confirm-password">确认新密码</label>
            <Input.Password
              id="profile-confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入新密码"
            />
          </div>
        </div>
        {profileError ? <div className="settings-profile__error" role="alert">{profileError}</div> : null}
      </div>
    ),
  };

  const tabItems = [
    profileTab,
    {
      key: 'general',
      label: '基础设置',
      children: (
        <div className="settings-form-grid">
          <Form.Item
            name={['general', 'platformName']}
            label="平台名称"
            rules={[{ required: true, message: '请输入平台名称' }]}
          >
            <Input maxLength={40} placeholder="请输入平台名称" />
          </Form.Item>
          <Form.Item
            name={['general', 'caseNumberPrefix']}
            label="默认用例编号前缀"
            rules={[
              { required: true, message: '请输入用例编号前缀' },
              { pattern: /^[A-Za-z0-9_-]+$/, message: '仅支持字母、数字、短横线和下划线' },
            ]}
          >
            <Input maxLength={16} placeholder="例如 TC-" />
          </Form.Item>
          <Form.Item
            className="settings-form-grid__wide"
            name={['general', 'announcement']}
            label="全局系统公告"
          >
            <TextArea rows={5} maxLength={500} showCount placeholder="输入需要展示的系统公告" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'execution',
      label: '环境与执行配置',
      children: (
        <div className="settings-execution-content">
          <Form.List name={['execution', 'environments']}>
            {(fields, { add, remove }) => (
              <>
                <div className="settings-section-heading">
                  <h2>测试环境管理</h2>
                  <Button
                    type="default"
                    icon={<PlusOutlined aria-hidden="true" />}
                    onClick={() => addEnvironment(add)}
                  >
                    添加环境
                  </Button>
                </div>
                <div className="settings-environment-list">
                  {fields.map((field, index) => (
                    <div className="settings-environment-row" key={field.key}>
                      <Form.Item name={[field.name, 'id']} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'name']}
                        label="环境名称"
                        rules={[
                          { required: true, message: '请输入环境名称' },
                          {
                            validator: async (_rule, value: string) => {
                              const normalizedName = value?.trim().toLowerCase();
                              const duplicate = environments.some(
                                (environment, environmentIndex) =>
                                  environmentIndex !== index &&
                                  environment.name?.trim().toLowerCase() === normalizedName,
                              );
                              if (duplicate) throw new Error('环境名称不能重复');
                            },
                          },
                        ]}
                      >
                        <Input placeholder="例如 DEV、TEST、STAG" />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'baseUrl']}
                        label="Base URL"
                        rules={[
                          { required: true, message: '请输入环境 Base URL' },
                          { type: 'url', message: '请输入有效的 URL' },
                        ]}
                      >
                        <Input
                          aria-label={
                            index === 0
                              ? '测试环境 Base URL'
                              : `${environments[index]?.name || '环境'} Base URL`
                          }
                          placeholder="https://test-api.example.com"
                        />
                      </Form.Item>
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined aria-hidden="true" />}
                        aria-label={`删除${environments[index]?.name || `第${index + 1}个环境`}`}
                        disabled={fields.length <= 1}
                        onClick={() => removeEnvironment(index, remove)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Form.List>

          <Form.Item
            className="settings-default-environment"
            name={['execution', 'defaultEnvironmentId']}
            label="默认执行环境"
            rules={[{ required: true, message: '请选择默认执行环境' }]}
          >
            <Select
              options={environments.map((environment) => ({
                value: environment.id,
                label: environment.name || '未命名环境',
              }))}
              placeholder="选择执行环境"
            />
          </Form.Item>

          <div className="settings-form-grid">
            <Form.Item
              name={['execution', 'retryCount']}
              label="失败重试次数"
              rules={[
                { required: true, message: '请设置失败重试次数' },
                { type: 'number', min: 0, max: 3, message: '重试次数必须在 0 到 3 次之间' },
              ]}
            >
              <InputNumber min={0} max={3} precision={0} suffix="次" />
            </Form.Item>
            <Form.Item
              name={['execution', 'apiTimeoutMs']}
              label="接口超时时间"
              rules={[
                { required: true, message: '请设置接口超时时间' },
                {
                  type: 'number',
                  min: 1000,
                  max: 300000,
                  message: '超时时间必须在 1000 到 300000 ms 之间',
                },
              ]}
            >
              <InputNumber min={1000} max={300000} step={1000} precision={0} suffix="ms" />
            </Form.Item>
          </div>
        </div>
      ),
    },
    {
      key: 'cases',
      label: '用例配置',
      children: (
        <div className="settings-case-content">
          <Form.List name={['caseManagement', 'projectNames']}>
            {(fields, { add, remove }) => (
              <>
                <div className="settings-section-heading">
                  <h2>项目归属</h2>
                  <Button
                    type="default"
                    icon={<PlusOutlined aria-hidden="true" />}
                    onClick={() => add('')}
                  >
                    添加项目归属
                  </Button>
                </div>
                <div className="settings-project-list">
                  {fields.map((field, index) => (
                    <div className="settings-project-row" key={field.key}>
                      <Form.Item
                        name={field.name}
                        label="项目名称"
                        rules={[
                          { required: true, whitespace: true, message: '请输入项目名称' },
                          {
                            validator: async (_rule, value: string) => {
                              const normalizedName = value?.trim().toLowerCase();
                              const duplicate = projectNames.some(
                                (projectName, projectIndex) =>
                                  projectIndex !== index &&
                                  projectName?.trim().toLowerCase() === normalizedName,
                              );
                              if (duplicate) throw new Error('项目名称不能重复');
                            },
                          },
                        ]}
                      >
                        <Input
                          disabled={projectNames[index] === DEFAULT_PROJECT_NAME}
                          maxLength={128}
                          placeholder="例如：官网环境"
                        />
                      </Form.Item>
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined aria-hidden="true" />}
                        aria-label={`删除${projectNames[index] || `第${index + 1}个项目归属`}`}
                        disabled={projectNames[index] === DEFAULT_PROJECT_NAME}
                        onClick={() => remove(index)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Form.List>

        </div>
      ),
    },
    {
      key: 'notifications',
      label: '通知推送',
      children: (
        <div className="settings-webhook-list">
          {notificationChannels.map((channel) => (
            <div className="settings-webhook-row" key={channel.key}>
              <Form.Item
                name={['notifications', channel.key]}
                label={`${channel.label} Webhook`}
                rules={[{ type: 'url', message: '请输入有效的 Webhook URL' }]}
              >
                <Input placeholder="https://..." />
              </Form.Item>
              <Button
                icon={<LinkOutlined aria-hidden="true" />}
                aria-label={`测试${channel.label}连接`}
                loading={testingChannel === channel.key}
                disabled={testingChannel !== null && testingChannel !== channel.key}
                onClick={() => void testWebhook(channel.key)}
              >
                测试连接
              </Button>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'ai',
      label: 'AI 模型配置',
      children: (
        <div className="settings-form-grid">
          <Form.Item
            name={['ai', 'apiKey']}
            label="LLM API Key"
            rules={[{ required: true, message: '请输入 LLM API Key' }]}
          >
            <Input.Password autoComplete="new-password" placeholder="输入 API Key" />
          </Form.Item>
          <Form.Item
            name={['ai', 'defaultModel']}
            label="默认模型"
            rules={[{ required: true, message: '请选择默认模型' }]}
          >
            <Select options={modelOptions} placeholder="选择默认模型" />
          </Form.Item>
          <Form.Item
            className="settings-form-grid__wide"
            name={['ai', 'baseUrl']}
            label="LLM Base URL"
            rules={[
              { required: true, message: '请输入 LLM Base URL' },
              { type: 'url', message: '请输入有效的 URL' },
            ]}
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
        </div>
      ),
    },
  ];

  return (
    <section className="page-section settings-page">
      <PageHeader
        title="系统设置"
        actions={
          <Button
            type="primary"
            icon={<SaveOutlined aria-hidden="true" />}
            loading={saving}
            disabled={loading}
            onClick={() => (activeTab === 'profile' ? saveProfile() : form.submit())}
          >
            {activeTab === 'profile' ? '保存个人信息' : '保存设置'}
          </Button>
        }
      />

      <div className="settings-panel">
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Form<SystemSettings>
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={saveSettings}
          >
            <Tabs activeKey={activeTab} items={tabItems} onChange={setActiveTab} />
          </Form>
        )}
      </div>
    </section>
  );
}

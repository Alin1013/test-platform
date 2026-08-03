import { LoginOutlined, UserAddOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Modal } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';
import './login.css';

interface LoginFormValues {
  account: string;
  password: string;
}

interface RegisterFormValues {
  account: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [loginForm] = Form.useForm<LoginFormValues>();
  const [registerForm] = Form.useForm<RegisterFormValues>();
  const [error, setError] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  const submit = async (values: LoginFormValues) => {
    setError('');
    setRegistrationSuccess('');
    setSubmitting(true);
    try {
      if (!(await login(values.account, values.password))) {
        setError('账号或密码错误');
        return;
      }
      navigate('/dashboard', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const openRegistration = () => {
    setRegisterError('');
    setRegisterOpen(true);
  };

  const closeRegistration = () => {
    if (registerSubmitting) return;
    setRegisterOpen(false);
    setRegisterError('');
    registerForm.resetFields();
  };

  const submitRegistration = async (values: RegisterFormValues) => {
    const account = values.account.trim().toLowerCase();
    setRegisterError('');
    setRegisterSubmitting(true);
    try {
      await register({
        account,
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      loginForm.setFieldsValue({ account });
      registerForm.resetFields();
      setRegisterOpen(false);
      setRegistrationSuccess('注册成功，请登录');
    } catch (registrationError) {
      setRegisterError(
        registrationError instanceof Error &&
          registrationError.message === 'Account or email already exists'
          ? '账号或邮箱已存在'
          : '注册失败，请稍后重试',
      );
    } finally {
      setRegisterSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <Card className="login-card" variant="borderless">
        <div className="login-card__brand" aria-label="测试平台">
          <span className="login-card__mark">测</span>
          <div>
            <strong>测试平台</strong>
            <span>质量保障工作台</span>
          </div>
        </div>
        <div className="login-card__heading">
          <h1>账号登录</h1>
          <p>登录后继续管理测试资产与团队协作</p>
        </div>
        <Form<LoginFormValues>
          form={loginForm}
          name="login"
          layout="vertical"
          requiredMark={false}
          onFinish={submit}
          autoComplete="on"
        >
          <Form.Item
            name="account"
            label="账号"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input size="large" autoComplete="username" placeholder="请输入账号" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password size="large" autoComplete="current-password" placeholder="请输入密码" />
          </Form.Item>
          {error ? <Alert className="login-card__error" type="error" showIcon title={error} /> : null}
          {registrationSuccess ? (
            <Alert
              className="login-card__error"
              type="success"
              showIcon
              title={registrationSuccess}
            />
          ) : null}
          <Button
            className="login-card__submit"
            type="primary"
            htmlType="submit"
            size="large"
            icon={<LoginOutlined aria-hidden="true" />}
            loading={submitting}
          >
            登录
          </Button>
        </Form>
        <div className="login-card__register">
          <span>还没有账号？</span>
          <Button type="link" icon={<UserAddOutlined aria-hidden="true" />} onClick={openRegistration}>
            立即注册
          </Button>
        </div>
      </Card>

      <Modal
        className="register-modal"
        title="注册账号"
        open={registerOpen}
        footer={null}
        destroyOnHidden
        width={480}
        centered
        mask={{ closable: !registerSubmitting }}
        closable={!registerSubmitting}
        onCancel={closeRegistration}
      >
        <Form<RegisterFormValues>
          form={registerForm}
          name="register"
          layout="vertical"
          requiredMark={false}
          autoComplete="on"
          onFinish={submitRegistration}
        >
          <Form.Item
            name="account"
            label="账号"
            rules={[
              { required: true, message: '请输入账号' },
              { min: 3, max: 64, message: '账号长度为 3-64 位' },
              {
                pattern: /^[A-Za-z0-9_.-]+$/,
                message: '账号仅支持字母、数字、下划线、短横线和点',
              },
            ]}
          >
            <Input autoComplete="username" placeholder="请输入账号" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input autoComplete="name" placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效邮箱' },
            ]}
          >
            <Input autoComplete="email" placeholder="name@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, max: 128, message: '密码长度为 8-128 位' },
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="再次输入密码" />
          </Form.Item>
          {registerError ? (
            <Alert className="register-modal__error" type="error" showIcon title={registerError} />
          ) : null}
          <div className="register-modal__actions">
            <Button onClick={closeRegistration} disabled={registerSubmitting}>
              取消
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<UserAddOutlined aria-hidden="true" />}
              loading={registerSubmitting}
            >
              创建账号
            </Button>
          </div>
        </Form>
      </Modal>
    </main>
  );
}

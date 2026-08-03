import { LoginOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';
import './login.css';

interface LoginFormValues {
  account: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (values: LoginFormValues) => {
    setError('');
    setSubmitting(true);
    try {
      if (!login(values.account, values.password)) {
        setError('账号或密码错误');
        return;
      }
      navigate('/dashboard', { replace: true });
    } finally {
      setSubmitting(false);
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
        <Form<LoginFormValues> layout="vertical" requiredMark={false} onFinish={submit} autoComplete="on">
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
      </Card>
    </main>
  );
}

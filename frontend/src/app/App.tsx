/**
 * 应用根组件：路由表、认证守卫与全局 Provider 装配。
 */
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PlatformServiceProvider } from '../services/PlatformServiceContext';
import { AppShell } from './AppShell';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { PersonnelPage } from '../pages/personnel/PersonnelPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { TestCasesPage } from '../pages/test-cases/TestCasesPage';
import { XMindPage } from '../pages/xmind/XMindPage';
import { LoginPage } from '../pages/login/LoginPage';
import { UiTestExecutionPage } from '../pages/execution/ui/UiTestExecutionPage';
import { ApiTestExecutionPage } from '../pages/execution/api/ApiTestExecutionPage';
import { AuthProvider, useAuth } from '../services/AuthContext';

interface AppProps {
  router?: 'browser' | 'memory';
  initialEntries?: string[];
}

function AppRoutes() {
  // 未登录一律重定向到 /login；登录后由 AppShell 承载所有业务页面。
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route element={user ? <AppShell /> : <Navigate to="/login" replace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/test-cases/:type" element={<TestCasesPage />} />
        <Route path="/execution/ui-test" element={<UiTestExecutionPage />} />
        <Route path="/execution/api-test" element={<ApiTestExecutionPage />} />
        <Route path="/xmind" element={<XMindPage />} />
        <Route path="/personnel" element={<PersonnelPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  /** 全局依赖：AntD 中文语言包/主题 + 认证 + 平台服务。 */
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{ token: { borderRadius: 6, colorPrimary: '#1677ff', fontSize: 14 } }}
    >
      <AntdApp>
        <AuthProvider>
          <PlatformServiceProvider>{children}</PlatformServiceProvider>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export function App({ router = 'browser', initialEntries = ['/'] }: AppProps) {
  // 支持 MemoryRouter 以便单测隔离路由状态。
  const future = { v7_relativeSplatPath: true, v7_startTransition: true } as const;

  if (router === 'memory') {
    return (
      <Providers>
        <MemoryRouter initialEntries={initialEntries} future={future}>
          <AppRoutes />
        </MemoryRouter>
      </Providers>
    );
  }

  return (
    <Providers>
      <BrowserRouter future={future}>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  );
}

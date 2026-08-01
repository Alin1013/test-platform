import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { PlatformServiceProvider } from '../services/PlatformServiceContext';
import { AppShell } from './AppShell';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { TestCasesPage } from '../pages/test-cases/TestCasesPage';
import { XMindPage } from '../pages/xmind/XMindPage';

interface AppProps {
  router?: 'browser' | 'memory';
  initialEntries?: string[];
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/test-cases/:type" element={<TestCasesPage />} />
        <Route path="/xmind" element={<XMindPage />} />
        <Route path="/personnel" element={<PlaceholderPage title="人员管理" />} />
        <Route path="/settings" element={<PlaceholderPage title="系统设置" />} />
      </Route>
    </Routes>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="page-section">
      <PageHeader title={title} description="页面内容正在构建中" />
      <div className="placeholder-panel">
        <strong>{title}</strong>
        <p>当前路由与工作台布局已就绪。</p>
      </div>
    </section>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{ token: { borderRadius: 6, colorPrimary: '#1677ff', fontSize: 14 } }}
    >
      <AntdApp>
        <PlatformServiceProvider>{children}</PlatformServiceProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export function App({ router = 'browser', initialEntries = ['/'] }: AppProps) {
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

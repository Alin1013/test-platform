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
        <Route path="/personnel" element={<PersonnelPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
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

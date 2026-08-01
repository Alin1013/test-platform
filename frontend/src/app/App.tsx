import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';

interface AppProps {
  router?: 'browser' | 'memory';
  initialEntries?: string[];
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<h1>仪表盘</h1>} />
    </Routes>
  );
}

export function App({ router = 'browser', initialEntries = ['/'] }: AppProps) {
  const future = { v7_relativeSplatPath: true, v7_startTransition: true } as const;

  if (router === 'memory') {
    return (
      <MemoryRouter initialEntries={initialEntries} future={future}>
        <AppRoutes />
      </MemoryRouter>
    );
  }

  return (
    <BrowserRouter future={future}>
      <AppRoutes />
    </BrowserRouter>
  );
}

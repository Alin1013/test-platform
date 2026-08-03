import { createContext, type ReactNode, useContext } from 'react';
import { createApiPlatformService } from './apiPlatformService';
import type { PlatformService } from './contracts';
import { createMockPlatformService } from './mockPlatformService';

const PlatformServiceContext = createContext<PlatformService | null>(null);
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const defaultService = apiBaseUrl
  ? createApiPlatformService({ baseUrl: apiBaseUrl })
  : createMockPlatformService();

interface PlatformServiceProviderProps {
  children: ReactNode;
  service?: PlatformService;
}

export function PlatformServiceProvider({ children, service = defaultService }: PlatformServiceProviderProps) {
  return <PlatformServiceContext.Provider value={service}>{children}</PlatformServiceContext.Provider>;
}

export function usePlatformService() {
  const service = useContext(PlatformServiceContext);
  if (!service) {
    throw new Error('usePlatformService 必须在 PlatformServiceProvider 内使用');
  }
  return service;
}

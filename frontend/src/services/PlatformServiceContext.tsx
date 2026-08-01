import { createContext, type ReactNode, useContext } from 'react';
import type { PlatformService } from './contracts';
import { createMockPlatformService } from './mockPlatformService';

const PlatformServiceContext = createContext<PlatformService | null>(null);
const defaultService = createMockPlatformService();

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

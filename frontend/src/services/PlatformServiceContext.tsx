import { createContext, type ReactNode, useContext, useState } from 'react';
import {
  createApiPlatformService,
  DEFAULT_PLATFORM_API_BASE_URL,
} from './apiPlatformService';
import type { PlatformService } from './contracts';
import { createMockPlatformService } from './mockPlatformService';

const PlatformServiceContext = createContext<PlatformService | null>(null);
// Production and local development must use the database-backed API by default.
// Tests intentionally keep the deterministic in-memory adapter.
export function resolvePlatformApiBaseUrl(
  configuredBaseUrl: string | undefined,
  mode: string,
): string | undefined {
  return configuredBaseUrl?.trim() || (mode === 'test' ? undefined : DEFAULT_PLATFORM_API_BASE_URL);
}

const apiBaseUrl = resolvePlatformApiBaseUrl(import.meta.env.VITE_API_BASE_URL, import.meta.env.MODE);

function createDefaultPlatformService(): PlatformService {
  return apiBaseUrl
    ? createApiPlatformService({ baseUrl: apiBaseUrl })
    : createMockPlatformService();
}

interface PlatformServiceProviderProps {
  children: ReactNode;
  service?: PlatformService;
}

export function PlatformServiceProvider({ children, service }: PlatformServiceProviderProps) {
  const [fallbackService] = useState(createDefaultPlatformService);
  return (
    <PlatformServiceContext.Provider value={service ?? fallbackService}>
      {children}
    </PlatformServiceContext.Provider>
  );
}

export function usePlatformService() {
  const service = useContext(PlatformServiceContext);
  if (!service) {
    throw new Error('usePlatformService 必须在 PlatformServiceProvider 内使用');
  }
  return service;
}

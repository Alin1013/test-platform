/**
 * 平台服务上下文：按运行环境选择真实 API 服务或内存 Mock 服务。
 */
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
  // 生产/本地开发默认走后端 API；测试环境保持 undefined 以使用 Mock。
  return configuredBaseUrl?.trim() || (mode === 'test' ? undefined : DEFAULT_PLATFORM_API_BASE_URL);
}

const apiBaseUrl = resolvePlatformApiBaseUrl(import.meta.env.VITE_API_BASE_URL, import.meta.env.MODE);

function createDefaultPlatformService(): PlatformService {
  // 配置了 API 地址就走真实接口，否则退回内存 Mock。
  return apiBaseUrl
    ? createApiPlatformService({ baseUrl: apiBaseUrl })
    : createMockPlatformService();
}

interface PlatformServiceProviderProps {
  children: ReactNode;
  service?: PlatformService;
}

export function PlatformServiceProvider({ children, service }: PlatformServiceProviderProps) {
  // 首次渲染时惰性创建默认服务，外部可通过 service prop 注入测试替身。
  const [fallbackService] = useState(createDefaultPlatformService);
  return (
    <PlatformServiceContext.Provider value={service ?? fallbackService}>
      {children}
    </PlatformServiceContext.Provider>
  );
}

export function usePlatformService() {
  /** 读取平台服务；在 Provider 外调用时直接报错提示。 */
  const service = useContext(PlatformServiceContext);
  if (!service) {
    throw new Error('usePlatformService 必须在 PlatformServiceProvider 内使用');
  }
  return service;
}

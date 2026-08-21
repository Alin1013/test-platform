/**
 * 认证上下文：管理登录用户状态、令牌与登录/注册/登出/资料更新。
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
  createConfiguredAuthClient,
  AuthClientError,
  type AuthClient,
  type AuthUser,
  type RegisterInput,
  type UpdateProfileInput,
} from './authClient';
import { clearCurrentAuthSession, setCurrentAuthSession } from './authSession';

export { AuthClientError } from './authClient';
export type { AuthUser, RegisterInput, UpdateProfileInput } from './authClient';

interface AuthContextValue {
  user: AuthUser | null;
  login: (account: string, password: string) => Promise<boolean>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<boolean>;
}

interface AuthProviderProps {
  children: ReactNode;
  client?: AuthClient;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createDefaultClient() {
  // 与 PlatformService 相同：测试环境使用内存实现。
  return createConfiguredAuthClient({
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    mode: import.meta.env.MODE,
  });
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  // 初始用户与令牌从客户端携带（例如刷新后恢复会话）。
  const [authClient] = useState(() => client ?? createDefaultClient());
  const [user, setUser] = useState<AuthUser | null>(authClient.initialUser);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // 平台服务不在 React 组件内，请求层通过共享快照读取当前用户身份。
    setCurrentAuthSession(token, user?.id ?? null);
    return () => clearCurrentAuthSession();
  }, [token, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      async login(account, password) {
        try {
          const session = await authClient.login(account, password);
          setToken(session.token);
          setUser(session.user);
          return true;
        } catch (error) {
          if (error instanceof AuthClientError) throw error;
          return false;
        }
      },
      register(input) {
        return authClient.register(input);
      },
      async logout() {
        try {
          await authClient.logout(token);
        } finally {
          setToken(null);
          setUser(null);
        }
      },
      async updateProfile(input) {
        const result = await authClient.updateProfile(token, input);
        setUser(result.user);
        // 修改密码后旧令牌已吊销，强制前端回到未登录状态。
        if (result.passwordChanged) setToken(null);
        return result.passwordChanged;
      },
    }),
    [authClient, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  /** 读取认证状态与方法；在 AuthProvider 外调用时直接报错。 */
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return context;
}

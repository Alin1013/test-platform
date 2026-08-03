import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import {
  createApiAuthClient,
  createMemoryAuthClient,
  type AuthClient,
  type AuthUser,
  type RegisterInput,
  type UpdateProfileInput,
} from './authClient';

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
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  return baseUrl ? createApiAuthClient({ baseUrl }) : createMemoryAuthClient();
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  const [authClient] = useState(() => client ?? createDefaultClient());
  const [user, setUser] = useState<AuthUser | null>(authClient.initialUser);
  const [token, setToken] = useState<string | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      async login(account, password) {
        try {
          const session = await authClient.login(account, password);
          setToken(session.token);
          setUser(session.user);
          return true;
        } catch {
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
        if (result.passwordChanged) setToken(null);
        return result.passwordChanged;
      },
    }),
    [authClient, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return context;
}

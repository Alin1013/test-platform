import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export interface AuthUser {
  account: string;
  name: string;
  avatar?: string;
}

interface AuthProfile extends AuthUser {
  password: string;
}

export interface UpdateProfileInput {
  name: string;
  avatar?: string;
  password?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (account: string, password: string) => boolean;
  logout: () => void;
  updateProfile: (input: UpdateProfileInput) => boolean;
}

const initialProfile: AuthProfile = {
  account: 'jiangshan',
  name: '江珊',
  password: 'Test1234',
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AuthProfile>(initialProfile);
  const [user, setUser] = useState<AuthUser | null>(initialProfile);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login(account, password) {
        if (account.trim() !== profile.account || password !== profile.password) return false;
        setUser({ account: profile.account, name: profile.name, avatar: profile.avatar });
        return true;
      },
      logout() {
        setUser(null);
      },
      updateProfile(input) {
        const nextProfile: AuthProfile = {
          ...profile,
          name: input.name.trim(),
          avatar: input.avatar ?? profile.avatar,
          password: input.password || profile.password,
        };
        setProfile(nextProfile);
        if (user) {
          setUser({ account: nextProfile.account, name: nextProfile.name, avatar: nextProfile.avatar });
        }
        return Boolean(input.password);
      },
    }),
    [profile, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return context;
}

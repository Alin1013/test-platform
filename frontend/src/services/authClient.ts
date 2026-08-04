import { initialAuthProfile } from '../mocks/authFixtures';

export interface AuthUser {
  id: number;
  account: string;
  name: string;
  avatar?: string;
}

export interface RegisterInput {
  account: string;
  name: string;
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name: string;
  avatar?: string;
  password?: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface ProfileUpdateResult {
  user: AuthUser;
  passwordChanged: boolean;
}

export interface AuthClient {
  initialUser: AuthUser | null;
  login(account: string, password: string): Promise<AuthSession>;
  register(input: RegisterInput): Promise<AuthUser>;
  logout(token: string | null): Promise<void>;
  updateProfile(token: string | null, input: UpdateProfileInput): Promise<ProfileUpdateResult>;
}

export class AuthClientError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AuthClientError';
    this.status = status;
    this.code = code;
  }
}

interface ApiUser {
  id: number;
  account: string;
  name: string;
  avatar: string | null;
  email: string;
  department: string;
  role: string;
  permissions: Record<string, boolean>;
  status: string;
}

interface ApiLoginResponse {
  access_token: string;
  user: ApiUser;
}

interface ApiRegisterResponse {
  user: ApiUser;
}

interface ApiProfileUpdateResponse {
  user: ApiUser;
  password_changed: boolean;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ApiAuthClientOptions {
  baseUrl: string;
  fetcher?: Fetcher;
}

interface ConfiguredAuthClientOptions {
  apiBaseUrl?: string;
  mode: string;
  fetcher?: Fetcher;
}

interface ApiErrorDetail {
  code?: unknown;
  message?: unknown;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

function mapUser(user: ApiUser): AuthUser {
  return {
    id: user.id,
    account: user.account,
    name: user.name,
    avatar: user.avatar ?? undefined,
  };
}

export function createApiAuthClient({
  baseUrl,
  fetcher = globalThis.fetch.bind(globalThis),
}: ApiAuthClientOptions): AuthClient {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  const request = async <T>(
    path: string,
    init: RequestInit = {},
    token?: string | null,
  ): Promise<T> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (init.body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetcher(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { detail?: unknown } | null;
      const detail = errorBody?.detail;
      const structuredDetail =
        detail && typeof detail === 'object' ? (detail as ApiErrorDetail) : null;
      const code =
        typeof structuredDetail?.code === 'string' ? structuredDetail.code : undefined;
      const message =
        typeof detail === 'string'
          ? detail
          : typeof structuredDetail?.message === 'string'
            ? structuredDetail.message
            : detail
              ? JSON.stringify(detail)
              : `HTTP ${response.status}`;
      throw new AuthClientError(message, response.status, code);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  return {
    initialUser: null,

    async login(account, password) {
      const response = await request<ApiLoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ account, password }),
      });
      return { token: response.access_token, user: mapUser(response.user) };
    },

    async register(input) {
      const response = await request<ApiRegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return mapUser(response.user);
    },

    async logout(token) {
      if (!token) return;
      await request<void>('/auth/logout', { method: 'POST' }, token);
    },

    async updateProfile(token, input) {
      const response = await request<ApiProfileUpdateResponse>(
        '/auth/me',
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      );
      return {
        user: mapUser(response.user),
        passwordChanged: response.password_changed,
      };
    },
  };
}

export function createConfiguredAuthClient({
  apiBaseUrl,
  mode,
  fetcher,
}: ConfiguredAuthClientOptions): AuthClient {
  if (mode === 'test') return createMemoryAuthClient();
  return createApiAuthClient({
    baseUrl: apiBaseUrl?.trim() || DEFAULT_API_BASE_URL,
    fetcher,
  });
}

interface MemoryProfile extends AuthUser {
  email: string;
  password: string;
}

export function createMemoryAuthClient(): AuthClient {
  const profiles: MemoryProfile[] = [{ ...initialAuthProfile }];
  let userSequence = Math.max(...profiles.map((profile) => profile.id)) + 1;

  const publicUser = (profile: MemoryProfile): AuthUser => ({
    id: profile.id,
    account: profile.account,
    name: profile.name,
    avatar: profile.avatar,
  });

  return {
    initialUser: publicUser(initialAuthProfile),

    async login(account, password) {
      const profile = profiles.find(
        (candidate) => candidate.account === account.trim() && candidate.password === password,
      );
      if (!profile) throw new Error('Invalid account or password');
      return { token: `memory-${profile.account}`, user: publicUser(profile) };
    },

    async register(input) {
      const account = input.account.trim().toLowerCase();
      const email = input.email.trim().toLowerCase();
      if (
        profiles.some(
          (profile) => profile.account === account || profile.email === email,
        )
      ) {
        throw new AuthClientError(
          'Account or email already exists',
          409,
          'account_or_email_already_exists',
        );
      }
      const profile: MemoryProfile = {
        id: userSequence++,
        account,
        name: input.name.trim(),
        email,
        password: input.password,
      };
      profiles.push(profile);
      return publicUser(profile);
    },

    async logout() {
      return undefined;
    },

    async updateProfile(token, input) {
      const account = token?.replace(/^memory-/, '') || initialAuthProfile.account;
      const profile = profiles.find((candidate) => candidate.account === account);
      if (!profile) throw new Error('Invalid or expired access token');
      profile.name = input.name.trim();
      profile.avatar = input.avatar ?? profile.avatar;
      if (input.password) profile.password = input.password;
      return {
        user: publicUser(profile),
        passwordChanged: Boolean(input.password),
      };
    },
  };
}

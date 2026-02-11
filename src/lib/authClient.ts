const SESSION_STORAGE_KEY = 'flexpay_supabase_session';
const ALLOWED_EMAIL_DOMAINS = ['pay.com.au', 'waller.com.au'] as const;

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  user: AuthUser;
}

export interface SignUpResult {
  session: AuthSession | null;
  requiresEmailConfirmation: boolean;
}

interface AuthErrorResponse {
  msg?: string;
  message?: string;
  error_description?: string;
}

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: {
    id?: string;
    email?: string;
  };
}

interface SupabaseUserResponse {
  id?: string;
  email?: string;
}

interface RecoveryHashResult {
  session: AuthSession | null;
  type: string | null;
}

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

function getErrorMessage(errorBody: unknown): string {
  const body = (errorBody ?? {}) as AuthErrorResponse;
  return body.error_description ?? body.msg ?? body.message ?? 'Authentication failed.';
}

function toEpochSeconds(expiresIn?: number, expiresAt?: number): number {
  if (Number.isFinite(expiresAt)) {
    return Number(expiresAt);
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds + (Number.isFinite(expiresIn) ? Number(expiresIn) : 3600);
}

function toSession(data: SupabaseTokenResponse): AuthSession {
  const userId = String(data.user?.id ?? '');
  const userEmail = String(data.user?.email ?? '');
  if (!userId || !userEmail) {
    throw new Error('Could not determine authenticated user from Supabase response.');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: toEpochSeconds(data.expires_in, data.expires_at),
    user: {
      id: userId,
      email: userEmail.toLowerCase(),
    },
  };
}

function getRecoveryHashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

function clearUrlHash(): void {
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function parseStoredSession(rawValue: string | null): AuthSession | null {
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue) as Partial<AuthSession>;
    const accessToken = String(parsed.accessToken ?? '');
    const userId = String(parsed.user?.id ?? '');
    const userEmail = String(parsed.user?.email ?? '').toLowerCase();
    const expiresAt = Number(parsed.expiresAt ?? 0);
    if (!accessToken || !userId || !userEmail || !Number.isFinite(expiresAt)) {
      return null;
    }
    return {
      accessToken,
      refreshToken: parsed.refreshToken ? String(parsed.refreshToken) : null,
      expiresAt,
      user: { id: userId, email: userEmail },
    };
  } catch {
    return null;
  }
}

export function isAllowedEmail(email: string): boolean {
  const normalized = String(email).trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2 || !parts[0]) {
    return false;
  }
  return (ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(parts[1]);
}

export function getAllowedDomainsText(): string {
  return ALLOWED_EMAIL_DOMAINS.map((domain) => `@${domain}`).join(', ');
}

export function isSessionExpired(session: AuthSession): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return session.expiresAt <= nowSeconds + 15;
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function loadSession(): AuthSession | null {
  return parseStoredSession(localStorage.getItem(SESSION_STORAGE_KEY));
}

async function supabaseRequest<TResponse>(
  path: string,
  init: RequestInit,
  bearerToken?: string,
): Promise<TResponse> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  const headers = new Headers(init.headers ?? {});
  headers.set('apikey', config.anonKey);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${bearerToken ?? config.anonKey}`);

  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let errorBody: unknown = {};
    try {
      errorBody = await response.json();
    } catch {
      // noop
    }
    throw new Error(getErrorMessage(errorBody));
  }

  if (response.status === 204) {
    return {} as TResponse;
  }
  return (await response.json()) as TResponse;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await supabaseRequest<SupabaseTokenResponse>('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizedEmail,
      password,
    }),
  });
  return toSession(data);
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await supabaseRequest<SupabaseTokenResponse>('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    }),
  });

  if (data.access_token) {
    return {
      session: toSession(data),
      requiresEmailConfirmation: false,
    };
  }

  return {
    session: null,
    requiresEmailConfirmation: true,
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  await supabaseRequest('/auth/v1/recover', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizedEmail,
      redirect_to: `${window.location.origin}/auth/reset`,
    }),
  });
}

export async function updatePassword(accessToken: string, nextPassword: string): Promise<void> {
  const token = accessToken.trim();
  if (!token) {
    throw new Error('Missing recovery session token.');
  }
  await supabaseRequest('/auth/v1/user', {
    method: 'PUT',
    body: JSON.stringify({
      password: nextPassword,
    }),
  }, token);
}

export async function fetchUser(accessToken: string): Promise<AuthUser> {
  const data = await supabaseRequest<SupabaseUserResponse>('/auth/v1/user', {
    method: 'GET',
  }, accessToken);
  const id = String(data.id ?? '');
  const email = String(data.email ?? '').toLowerCase();
  if (!id || !email) {
    throw new Error('Unable to fetch authenticated user.');
  }
  return { id, email };
}

export function getRecoverySessionFromHash(): RecoveryHashResult {
  const params = getRecoveryHashParams();
  const accessToken = String(params.get('access_token') ?? '');
  if (!accessToken) {
    return { session: null, type: null };
  }

  const refreshToken = params.get('refresh_token');
  const expiresIn = Number(params.get('expires_in') ?? '');
  const expiresAt = Number(params.get('expires_at') ?? '');
  const type = params.get('type');
  const userId = String(params.get('user_id') ?? '');
  const userEmail = String(params.get('email') ?? '').toLowerCase();

  clearUrlHash();

  const fallbackUser: AuthUser = {
    id: userId || 'recovery-user',
    email: userEmail || 'recovery@pay.com.au',
  };

  return {
    type,
    session: {
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt: toEpochSeconds(
        Number.isFinite(expiresIn) ? expiresIn : undefined,
        Number.isFinite(expiresAt) ? expiresAt : undefined,
      ),
      user: fallbackUser,
    },
  };
}

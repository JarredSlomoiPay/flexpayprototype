import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSession,
  fetchUser,
  getRecoverySessionFromHash,
  isAllowedEmail,
  isSessionExpired,
  loadSession,
  requestPasswordReset,
  saveSession,
  signInWithPassword,
  signUpWithPassword,
  type SignUpResult,
  type AuthSession,
} from '../lib/authClient';

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  isRecoverySession: boolean;
  session: AuthSession | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => void;
  sendResetEmail: (email: string) => Promise<void>;
  setSession: (session: AuthSession | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getBypassAuthValue(): boolean {
  return import.meta.env.MODE === 'test' || String(import.meta.env.VITE_BYPASS_AUTH) === 'true';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const bypassAuth = getBypassAuthValue();

  const setSession = useCallback(async (nextSession: AuthSession | null) => {
    if (!nextSession) {
      clearSession();
      setSessionState(null);
      setIsRecoverySession(false);
      return;
    }

    if (isSessionExpired(nextSession)) {
      clearSession();
      setSessionState(null);
      setIsRecoverySession(false);
      return;
    }

    const shouldFetchUser = !nextSession.user.email || nextSession.user.email === 'recovery@pay.com.au';
    let resolvedSession = nextSession;
    if (shouldFetchUser) {
      const user = await fetchUser(nextSession.accessToken);
      resolvedSession = { ...nextSession, user };
    }

    if (!isAllowedEmail(resolvedSession.user.email)) {
      clearSession();
      setSessionState(null);
      setIsRecoverySession(false);
      throw new Error('Only @pay.com.au and @waller.com.au email addresses are allowed.');
    }

    saveSession(resolvedSession);
    setSessionState(resolvedSession);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (bypassAuth) {
        if (!cancelled) {
          setSessionState({
            accessToken: 'test-token',
            refreshToken: null,
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: 'test-user',
              email: 'test@pay.com.au',
            },
          });
          setIsLoading(false);
        }
        return;
      }

      try {
        const hashSession = getRecoverySessionFromHash();
        if (hashSession.session) {
          await setSession(hashSession.session);
          if (!cancelled) {
            setIsRecoverySession(hashSession.type === 'recovery');
          }
          return;
        }

        const stored = loadSession();
        if (stored) {
          await setSession(stored);
        } else if (!cancelled) {
          setSessionState(null);
          setIsRecoverySession(false);
        }
      } catch {
        if (!cancelled) {
          clearSession();
          setSessionState(null);
          setIsRecoverySession(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [bypassAuth, setSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!isAllowedEmail(email)) {
        throw new Error('Only @pay.com.au and @waller.com.au email addresses are allowed.');
      }
      const nextSession = await signInWithPassword(email, password);
      await setSession(nextSession);
      setIsRecoverySession(false);
    },
    [setSession],
  );

  const signOut = useCallback(() => {
    clearSession();
    setSessionState(null);
    setIsRecoverySession(false);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!isAllowedEmail(email)) {
        throw new Error('Only @pay.com.au and @waller.com.au email addresses are allowed.');
      }
      const result = await signUpWithPassword(email, password);
      if (result.session) {
        await setSession(result.session);
        setIsRecoverySession(false);
      }
      return result;
    },
    [setSession],
  );

  const sendResetEmail = useCallback(async (email: string) => {
    if (!isAllowedEmail(email)) {
      throw new Error('Only @pay.com.au and @waller.com.au email addresses are allowed.');
    }
    await requestPasswordReset(email);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: Boolean(session),
      isRecoverySession,
      session,
      signIn,
      signUp,
      signOut,
      sendResetEmail,
      setSession,
    }),
    [isLoading, session, isRecoverySession, signIn, signUp, signOut, sendResetEmail, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}

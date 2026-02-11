import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAllowedDomainsText } from '../lib/authClient';

export function AuthPage() {
  const navigate = useNavigate();
  const { isAuthenticated, signIn, signUp, sendResetEmail } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const domainsText = useMemo(() => getAllowedDomainsText(), []);

  if (isAuthenticated) {
    return <Navigate to="/new-payment" replace />;
  }

  const handleLoginSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/new-payment', { replace: true });
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp(email, password);
      if (result.session) {
        navigate('/new-payment', { replace: true });
        return;
      }
      setSuccess('Account created. Check your email to confirm your account, then sign in.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      await sendResetEmail(email);
      setSuccess('Password reset link sent. Check your email inbox.');
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flexpay-auth-shell">
      <section className="flexpay-auth-card">
        <h1>{mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</h1>
        {mode !== 'login' ? (
          <p className="flexpay-auth-subtitle">
            Access is restricted to {domainsText}.
          </p>
        ) : null}
        {error ? <p className="flexpay-auth-message flexpay-auth-message-error">{error}</p> : null}
        {success ? <p className="flexpay-auth-message flexpay-auth-message-success">{success}</p> : null}

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="flexpay-auth-form">
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : mode === 'signup' ? (
          <form onSubmit={handleSignUpSubmit} className="flexpay-auth-form">
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetSubmit} className="flexpay-auth-form">
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="flexpay-auth-actions">
          {mode === 'login' ? (
            <>
              <button type="button" onClick={() => setMode('signup')} className="flexpay-auth-link">
                Create account
              </button>
              <button type="button" onClick={() => setMode('reset')} className="flexpay-auth-link">
                Forgot password?
              </button>
            </>
          ) : mode === 'signup' ? (
            <button type="button" onClick={() => setMode('login')} className="flexpay-auth-link">
              Back to sign in
            </button>
          ) : (
            <button type="button" onClick={() => setMode('login')} className="flexpay-auth-link">
              Back to sign in
            </button>
          )}
          <Link to="/auth/reset" className="flexpay-auth-link">
            Already have a recovery link?
          </Link>
        </div>
      </section>
    </main>
  );
}

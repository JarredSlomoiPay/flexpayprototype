import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { updatePassword } from '../lib/authClient';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, isLoading, isRecoverySession, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && !session && !isRecoverySession) {
    return <Navigate to="/auth" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
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

    if (!session?.accessToken) {
      setError('Recovery session is missing or has expired.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(session.accessToken, password);
      setSuccess('Password updated successfully. Please sign in again.');
      signOut();
      setTimeout(() => {
        navigate('/auth', { replace: true });
      }, 800);
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flexpay-auth-shell">
      <section className="flexpay-auth-card">
        <h1>Set a new password</h1>
        <p className="flexpay-auth-subtitle">Enter your new password for this account.</p>
        {error ? <p className="flexpay-auth-message flexpay-auth-message-error">{error}</p> : null}
        {success ? <p className="flexpay-auth-message flexpay-auth-message-success">{success}</p> : null}
        <form onSubmit={handleSubmit} className="flexpay-auth-form">
          <label>
            <span>New password</span>
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
            {isSubmitting ? 'Updating...' : 'Update password'}
          </button>
        </form>
        <div className="flexpay-auth-actions">
          <Link to="/auth" className="flexpay-auth-link">
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}


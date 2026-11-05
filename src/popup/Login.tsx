// ════════════════════════════════════════════════════════════════════════
//  Login screen. Uses the shared controls defined in styles.css.
// ════════════════════════════════════════════════════════════════════════

import { Eye, EyeSlash, SignIn } from '@phosphor-icons/react';
import { useState } from 'react';
import Brand from '../shared/Brand';
import { signInEmail } from '../shared/auth';

export default function Login({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading || !email.trim() || !password) return;

    setIsLoading(true);
    setError('');

    try {
      await signInEmail(email, password);
      onSuccess();
    } catch (err: unknown) {
      console.error('Login failed:', err);
      const code = (err as { code?: string }).code;
      setError(getErrorMessage(code));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[440px] flex-col px-5 pb-5 pt-4">
      <header>
        <Brand size="text-2xl" />
        <h1 className="mt-6 text-base font-semibold text-text">Sign in to submit sessions</h1>
        <p className="mt-1 text-sm text-text-muted">Use your Drafted account.</p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="field"
            disabled={isLoading}
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field pr-11"
              disabled={isLoading}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 -translate-y-1/2 icon-btn"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <Eye size={18} /> : <EyeSlash size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-coral">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!email.trim() || !password || isLoading}
          className="btn-primary w-full"
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" />
              Signing in
            </>
          ) : (
            <>
              <SignIn size={16} weight="bold" />
              Sign in
            </>
          )}
        </button>
      </form>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 self-center text-sm text-text-muted hover:text-text"
        >
          Not now
        </button>
      )}

      <p className="mt-auto pt-6 text-center text-xs text-text-muted">
        No account?{' '}
        <a
          href="https://joindrafted.com/onboarding"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-text hover:underline"
        >
          Sign up on joindrafted.com
        </a>
      </p>
    </div>
  );
}

function getErrorMessage(code?: string): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password';
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/user-disabled':
      return 'Account disabled';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection';
    default:
      return 'Sign in failed. Try again';
  }
}

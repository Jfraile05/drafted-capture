// ════════════════════════════════════════════════════════════════════════
//  Login card — matches the deep-space design system.
//
//  If trySeekerBridge finds a seeker session, we show "continue as X" and
//  pre-fill the email. User still enters password (see auth.ts for why).
// ════════════════════════════════════════════════════════════════════════

import { Eye, EyeSlash, SignIn } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { signInEmail, trySeekerBridge } from '../shared/auth';

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [seekerEmail, setSeekerEmail] = useState<string | null>(null);

  useEffect(() => {
    // Best-effort seeker bridge on mount.
    trySeekerBridge()
      .then((result) => {
        if (result?.email) {
          setSeekerEmail(result.email);
          setEmail(result.email);
        }
      })
      .catch(() => {
        // Silent fail — bridge is best-effort.
      });
  }, []);

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
    <div className="p-6 space-y-6 atmosphere min-h-[340px] flex flex-col justify-center">
      <header className="text-center space-y-2">
        <div className="wordmark text-2xl">
          drafted<span className="dot">.</span>
        </div>
        <p className="text-text-muted text-sm">
          {seekerEmail ? `signed into joindrafted as ${seekerEmail}` : 'sign in to submit captures'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-text text-xs font-medium uppercase tracking-wider">
            email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            className="w-full px-4 py-2.5 bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-border-active focus:outline-none transition-colors"
            disabled={isLoading}
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-text text-xs font-medium uppercase tracking-wider"
          >
            password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-bg-input border border-border rounded-lg text-text placeholder:text-text-faint focus:border-border-active focus:outline-none transition-colors pr-12"
              disabled={isLoading}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <Eye size={18} /> : <EyeSlash size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2.5 bg-coral/10 border border-coral/25 rounded-lg text-coral text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!email.trim() || !password || isLoading}
          className="w-full py-3 bg-green text-bg rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" />
              signing in...
            </>
          ) : (
            <>
              <SignIn size={18} weight="bold" />
              {seekerEmail ? 'continue' : 'sign in'}
            </>
          )}
        </button>
      </form>

      <div className="text-center text-text-muted text-xs">
        no account?{' '}
        <a
          href="https://candidate.joindrafted.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green hover:underline"
        >
          sign up on candidate.joindrafted.com
        </a>
      </div>
    </div>
  );
}

function getErrorMessage(code?: string): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'incorrect email or password';
    case 'auth/user-not-found':
      return 'no account found with this email';
    case 'auth/invalid-email':
      return 'invalid email address';
    case 'auth/user-disabled':
      return 'account disabled';
    case 'auth/too-many-requests':
      return 'too many attempts — try again later';
    case 'auth/network-request-failed':
      return 'network error — check your connection';
    default:
      return 'sign in failed — try again';
  }
}

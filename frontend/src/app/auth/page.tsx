'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/case';

  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // If already logged in, redirect
  useEffect(() => {
    if (!authLoading && user) {
      router.push(redirectTarget);
    }
  }, [user, authLoading, router, redirectTarget]);

  const handleAuthError = (err: unknown) => {
    let msg = 'Authentication failed. Please try again.';
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        msg = 'Invalid email or password. Please check your credentials.';
      } else if (code === 'auth/wrong-password') {
        msg = 'Incorrect password.';
      } else if (code === 'auth/email-already-in-use') {
        msg = 'An account with this email already exists. Try signing in.';
      } else if (code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      } else if (code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (code === 'auth/popup-closed-by-user') {
        msg = 'Google sign-in popup was closed before completing.';
      } else if (code === 'auth/unauthorized-domain') {
        msg = 'This domain is not authorized in Firebase Console (Authentication > Settings > Authorized domains).';
      } else if ('message' in err) {
        msg = String((err as { message: string }).message);
      }
    } else if (err instanceof Error) {
      msg = err.message;
    }
    setErrorMessage(msg);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password);
        router.push(redirectTarget);
      } else {
        await signUpWithEmail(email.trim(), password, displayName.trim() || undefined);
        setSuccessMessage('Account created successfully! Redirecting...');
        router.push(redirectTarget);
      }
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await signInWithGoogle();
      router.push(redirectTarget);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-[12.5px] font-medium text-ink">
          <div className="h-4 w-4 rounded-full border-2 border-line-strong border-t-accent animate-spin-slow" />
          <span>Verifying authentication state...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-fill flex flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-accent-line bg-accent-soft text-xl">
            🔐
          </span>
          <h1 className="font-display text-[22px] leading-tight text-ink">
            {mode === 'signin' ? 'Sign In to IP-SAKTI' : 'Create an Account'}
          </h1>
          <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-muted">
            Save and access your previous Ayurvedic case consultations, formulation classification roadmaps, and statutory dossiers.
          </p>
        </div>

        <div className="panel p-6">
          {/* Toggle Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-sunken p-1 text-[12.5px] font-medium">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMessage(null);
              }}
              className={`rounded-[4px] transition-colors ${
                mode === 'signin'
                  ? 'bg-surface text-ink shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
              }}
              className={`rounded-[4px] transition-colors ${
                mode === 'signup'
                  ? 'bg-surface text-ink shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error / Success Notifications */}
          {errorMessage && (
            <div className="mt-4 flex items-start gap-2.5 rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-[12px] leading-snug text-danger">
              <span aria-hidden="true">⚠️</span>
              <div>{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="mt-4 flex items-center gap-2.5 rounded-md border border-ok-line bg-ok-soft px-3.5 py-3 text-[12px] text-ok">
              <span aria-hidden="true">✓</span>
              <div>{successMessage}</div>
            </div>
          )}

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-md border border-line-strong bg-surface px-4 py-2.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 border-t border-line" />
            <span className="eyebrow">or with email</span>
            <div className="flex-1 border-t border-line" />
          </div>

          {/* Email & Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label className="eyebrow block">Full Name (Optional)</label>
                <input
                  type="text"
                  placeholder="Dr. Adithya Sharma"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="eyebrow block">Email Address</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="eyebrow block">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[12.5px] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-line-strong border-t-accent-fg animate-spin-slow" />
                  <span>Processing...</span>
                </>
              ) : mode === 'signin' ? (
                <span>Sign In →</span>
              ) : (
                <span>Create Account →</span>
              )}
            </button>
          </form>

          <div className="pt-4 text-center">
            <Link
              href="/chat"
              className="text-[11.5px] font-medium text-muted transition-colors hover:text-accent"
            >
              ← Continue as Guest in AI Chat
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-[12.5px] text-muted">Loading authentication...</div>
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
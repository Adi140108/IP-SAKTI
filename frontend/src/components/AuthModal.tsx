'use client';

import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, UserRole } from './AuthProvider';
import { ScalesIcon, LeafIcon, AlertIcon, XIcon } from './Icons';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  subtitle?: string;
}

const emptySubscribe = () => () => {};

export default function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Sign In or Create Account',
  subtitle = 'Sign in to save your consultations to Firebase and resume chatting with your cases anytime.',
}: AuthModalProps) {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, userRole, setUserRole } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [role, setRole] = useState<UserRole>(userRole || 'practitioner');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (userRole) {
      setRole(userRole);
    }
  }, [userRole]);

  // Keyboard navigation & body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!email.trim() || !password.trim()) {
          throw new Error('Please enter both email and password.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        await signUpWithEmail(email.trim(), password, displayName.trim() || undefined, role);
      } else {
        if (!email.trim() || !password.trim()) {
          throw new Error('Please enter both email and password.');
        }
        await signInWithEmail(email.trim(), password);
        setUserRole(role);
      }
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      let msg = errObj?.message || 'Authentication failed.';
      if (msg.includes('auth/email-already-in-use')) {
        msg = 'This email is already registered. Please switch to Sign In.';
      } else if (
        msg.includes('auth/invalid-credential') ||
        msg.includes('auth/wrong-password') ||
        msg.includes('auth/user-not-found')
      ) {
        msg = 'Invalid email or password. Please verify your credentials.';
      } else if (msg.includes('auth/popup-closed-by-user')) {
        msg = 'Google sign-in popup was closed before completing.';
      } else if (msg.includes('auth/unauthorized-domain')) {
        msg =
          'This domain is not yet authorized in Firebase Console. Please add your domain to Firebase Console > Authentication > Settings > Authorized Domains.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle(role);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      let msg = errObj?.message || 'Google sign-in failed.';
      if (msg.includes('auth/popup-closed-by-user')) {
        msg = 'Google sign-in popup was closed.';
      } else if (msg.includes('auth/unauthorized-domain')) {
        msg =
          'This domain is not yet authorized in Firebase Console. Please add your domain to Firebase Console > Authentication > Settings > Authorized Domains.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsGuest = () => {
    setUserRole(role);
    onClose();
    if (onSuccess) onSuccess();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-ink/45 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-[440px] my-auto overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl p-6 sm:p-7 space-y-5 animate-scaleIn"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer active:scale-95"
        >
          <XIcon size={14} />
        </button>

        {/* Centered & Evenly Spaced Header */}
        <div className="flex flex-col items-center text-center pt-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-accent shadow-xs mb-3">
            <ScalesIcon size={20} />
          </div>
          <h2 id="auth-modal-title" className="font-display text-[22px] leading-tight text-ink font-normal tracking-tight">
            {title}
          </h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted max-w-[320px] mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Role Selector */}
        <div className="space-y-1.5">
          <label className="eyebrow block">
            Select Account Role
          </label>
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Select account role">
            <button
              type="button"
              role="radio"
              aria-checked={role === 'practitioner'}
              onClick={() => setRole('practitioner')}
              className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                role === 'practitioner'
                  ? 'border-accent bg-accent-soft text-accent-ink shadow-soft ring-1 ring-accent/30'
                  : 'border-line bg-sunken text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                <LeafIcon
                  size={14}
                  className={role === 'practitioner' ? 'text-accent' : 'text-faint'}
                />
                <span>Practitioner</span>
              </div>
              <p className="mt-1 text-[10.5px] leading-tight text-muted">
                Ayurvedic Innovator / Formulator
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={role === 'facilitator'}
              onClick={() => setRole('facilitator')}
              className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                role === 'facilitator'
                  ? 'border-warn bg-warn-soft text-warn shadow-soft ring-1 ring-warn/30'
                  : 'border-line bg-sunken text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                <ScalesIcon
                  size={14}
                  className={role === 'facilitator' ? 'text-warn' : 'text-faint'}
                />
                <span>IP Facilitator</span>
              </div>
              <p className="mt-1 text-[10.5px] leading-tight text-muted">
                Reviewer / Regulatory Officer
              </p>
            </button>
          </div>
        </div>

        {/* Tab Selector: Sign Up vs Sign In */}
        <div
          className="grid grid-cols-2 rounded-xl border border-line bg-sunken p-1"
          role="tablist"
          aria-label="Authentication mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            className={`rounded-lg py-2 text-[12px] font-medium transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-surface text-ink shadow-soft font-semibold'
                : 'text-muted hover:text-ink'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
            className={`rounded-lg py-2 text-[12px] font-medium transition-all cursor-pointer ${
              mode === 'signin'
                ? 'bg-surface text-ink shadow-soft font-semibold'
                : 'text-muted hover:text-ink'
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-soft p-3 text-[12px] text-danger animate-fadeIn">
            <AlertIcon size={15} className="mt-0.5 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-surface hover:bg-subtle px-4 py-2.5 text-[12.5px] font-medium text-ink transition-all cursor-pointer disabled:opacity-50 active:scale-[0.99] shadow-soft"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
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
          <span>Continue with Google as {role === 'facilitator' ? 'Facilitator' : 'Practitioner'}</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-0.5">
          <div className="border-t border-line w-full" />
          <span className="bg-surface px-2.5 text-[10px] font-semibold uppercase tracking-wider text-faint absolute">
            or with email
          </span>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label className="block text-[11.5px] font-medium text-ink mb-1">
                Full Name or Organization <span className="text-faint">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. A. Sharma"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-line bg-sunken px-3.5 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/15 focus:outline-none transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-[11.5px] font-medium text-ink mb-1">
              Email Address <span className="text-accent">*</span>
            </label>
            <input
              type="email"
              required
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line bg-sunken px-3.5 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/15 focus:outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-ink mb-1">
              Password <span className="text-accent">*</span>
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-sunken px-3.5 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/15 focus:outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-[12.5px] font-medium text-accent-fg transition-all hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-soft"
          >
            {loading ? (
              <>
                <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg border-t-transparent" />
                <span>Processing...</span>
              </>
            ) : (
              <span>
                {mode === 'signup'
                  ? `Create ${role === 'facilitator' ? 'Facilitator' : 'Practitioner'} Account`
                  : 'Sign In & Continue'}
              </span>
            )}
          </button>
        </form>

        {/* Guest Option Footer */}
        <div className="pt-2 text-center border-t border-line/60">
          <button
            type="button"
            onClick={handleContinueAsGuest}
            className="text-[11.5px] text-muted hover:text-ink transition-colors hover:underline cursor-pointer"
          >
            Continue as Guest ({role === 'facilitator' ? 'Facilitator' : 'Practitioner'}) without saving &rarr;
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

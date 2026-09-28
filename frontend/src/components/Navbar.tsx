'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { fetchHealth } from '@/lib/api';
import { useTheme } from './ThemeProvider';
import { useAuth } from './AuthProvider';
import AuthModal from './AuthModal';
import {
  SunIcon,
  MoonIcon,
  MenuIcon,
  XIcon,
  CheckIcon,
  XIcon as CrossIcon,
  ScalesIcon,
  UserIcon,
} from './Icons';

export default function Navbar() {
  const pathname = usePathname();
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { user, userRole, setUserRole, signOutUser } = useAuth();
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = () => {
      fetchHealth()
        .then(() => {
          if (isMounted) setIsHealthy(true);
        })
        .catch(() => {
          if (isMounted) setIsHealthy(false);
        });
    };

    checkHealth();
    const interval = setInterval(checkHealth, isHealthy ? 30000 : 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isHealthy]);

  // Close the user menu on any outside click
  useEffect(() => {
    if (!userDropdownOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userDropdownOpen]);

  const navItems =
    userRole === 'facilitator'
      ? [
          { href: '/', label: 'Overview' },
          { href: '/facilitator', label: 'Facilitator Queue' },
          { href: '/case', label: 'Case Workspace' },
          { href: '/chat', label: 'AI Chat' },
          { href: '/sources', label: 'Legal Sources' },
        ]
      : [
          { href: '/', label: 'Overview' },
          { href: '/chat', label: 'AI Chat' },
          { href: '/case', label: 'Case Workspace' },
          { href: '/escalation', label: 'Escalate Case' },
          { href: '/sources', label: 'Legal Sources' },
        ];

  const healthState =
    isHealthy === true
      ? { label: 'Gateway Active', dot: 'status-dot-ok' }
      : isHealthy === false
        ? { label: 'Offline', dot: 'status-dot-danger' }
        : { label: 'Connecting', dot: 'status-dot-warn' };

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1700px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5"
          onClick={() => setMobileOpen(false)}
        >
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-line bg-surface">
            <Image
              src="/logo-icon.png"
              alt="IP-SAKTI"
              width={26}
              height={26}
              className="object-contain"
              priority
            />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[17px] leading-none tracking-tight text-ink">
              IP-SAKTI <span className="text-accent">Sahayak</span>
            </span>
            <span className="mt-1 hidden text-[10px] leading-none text-faint sm:block">
              SIH PS-26045 &middot; AYUSH &amp; Bio-Resource IP AI
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative px-2.5 py-1.5 text-[13px] transition-colors ${
                  isActive
                    ? 'text-ink after:absolute after:inset-x-2.5 after:-bottom-[13px] after:h-[2px] after:rounded-full after:bg-accent'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Gateway health is an external-service signal — kept as a quiet
              dot that links to full diagnostics, rather than a text label. */}
          <Link
            href="/diagnostics"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface transition-colors hover:text-ink"
            title={`Gateway: ${healthState.label}`}
            aria-label={`Gateway ${healthState.label} — open diagnostics`}
          >
            <span className={`status-dot ${healthState.dot}`} aria-hidden="true" />
          </Link>

          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:text-ink active:scale-95"
          >
            {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
          </button>

          {/* Auth status / user menu */}
          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                aria-expanded={userDropdownOpen}
                aria-haspopup="true"
                aria-label="Account menu"
                className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 text-muted transition-colors hover:text-ink"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-accent-fg">
                  {user.displayName
                    ? user.displayName.slice(0, 1)
                    : user.email
                      ? user.email.slice(0, 1)
                      : 'U'}
                </span>
                <span className="hidden max-w-[90px] truncate text-[12px] sm:inline">
                  {user.displayName || user.email?.split('@')[0] || 'User'}
                </span>
              </button>

              {userDropdownOpen && (
                <div className="animate-liftIn absolute right-0 z-50 mt-2 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-lift">
                  <div className="border-b border-line px-2.5 pb-2 pt-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="eyebrow">Account</span>
                      <span
                        className={`chip shrink-0 ${
                          userRole === 'facilitator' ? 'chip-warn' : 'chip-accent'
                        }`}
                      >
                        {userRole === 'facilitator' ? 'Facilitator' : 'Practitioner'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[12px] font-medium text-ink">
                      {user.email || 'User'}
                    </p>
                  </div>

                  <Link
                    href="/case"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] text-ink transition-colors hover:bg-subtle"
                  >
                    <UserIcon size={14} className="shrink-0 text-faint" />
                    My Saved Cases
                  </Link>

                  {userRole === 'facilitator' ? (
                    <Link
                      href="/facilitator"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium text-accent-ink transition-colors hover:bg-accent-soft"
                    >
                      <ScalesIcon size={14} className="shrink-0 text-accent" />
                      Facilitator Review Portal
                    </Link>
                  ) : (
                    <Link
                      href="/escalation"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] text-ink transition-colors hover:bg-subtle"
                    >
                      <ScalesIcon size={14} className="shrink-0 text-faint" />
                      Escalate Active Case
                    </Link>
                  )}

                  <button
                    onClick={() => {
                      signOutUser();
                      setUserDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md border-t border-line px-2.5 py-2 text-left text-[12.5px] font-medium text-danger transition-colors hover:bg-danger-soft"
                  >
                    <XIcon size={14} className="shrink-0" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg transition-colors hover:bg-accent-hover active:scale-95"
            >
              Sign In
            </button>
          )}

          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:text-ink md:hidden"
          >
            {mobileOpen ? <XIcon size={15} /> : <MenuIcon size={15} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="animate-liftIn border-t border-line bg-canvas md:hidden">
          <nav className="mx-auto max-w-[1700px] px-4 py-2 sm:px-6 lg:px-8" aria-label="Mobile">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center justify-between border-b border-line-subtle py-3 text-sm last:border-0 ${
                    isActive ? 'text-accent' : 'text-muted'
                  }`}
                >
                  {item.label}
                  {isActive ? <CheckIcon size={14} /> : <CrossIcon size={14} className="opacity-0" />}
                </Link>
              );
            })}

            {user ? (
              <>
                <Link
                  href="/case"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 border-b border-line-subtle py-3 text-sm text-muted"
                >
                  <UserIcon size={14} />
                  My Saved Cases
                </Link>
                <Link
                  href={userRole === 'facilitator' ? '/facilitator' : '/escalation'}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 border-b border-line-subtle py-3 text-sm text-muted"
                >
                  <ScalesIcon size={14} />
                  {userRole === 'facilitator' ? 'Facilitator Portal' : 'Escalate Case'}
                </Link>
                <button
                  onClick={() => {
                    signOutUser();
                    setMobileOpen(false);
                  }}
                  className="flex w-full items-center gap-2 py-3 text-left text-sm text-danger"
                >
                  <XIcon size={14} />
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  setAuthModalOpen(true);
                }}
                className="w-full py-3 text-left text-sm font-medium text-accent"
              >
                Sign In / Register
              </button>
            )}

            <Link
              href="/diagnostics"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 py-3 text-sm text-muted"
            >
              <span className={`status-dot ${healthState.dot}`} aria-hidden="true" />
              <span className="mono-caps">{healthState.label}</span>
            </Link>
          </nav>
        </div>
      )}

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </header>
  );
}

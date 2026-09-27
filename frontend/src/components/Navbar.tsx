'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchHealth } from '@/lib/api';
import { useTheme } from './ThemeProvider';
import { SunIcon, MoonIcon, MenuIcon, XIcon, CheckIcon, XIcon as CrossIcon } from './Icons';

export default function Navbar() {
  const pathname = usePathname();
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

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

  const navItems = [
    { href: '/', label: 'Overview' },
    { href: '/chat', label: 'AI Chat' },
    { href: '/case', label: 'Case Workspace' },
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
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
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
          <nav className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8" aria-label="Mobile">
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
    </header>
  );
}

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchHealth } from '@/lib/api';
import { useTheme } from './ThemeProvider';
import { useAuth } from './AuthProvider';
import AuthModal from './AuthModal';

export default function Navbar() {
  const pathname = usePathname();
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { user, signOutUser } = useAuth();
  const [userDropdownOpen, setUserDropdownOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

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
    { href: '/escalation', label: 'Escalate Case' },
    { href: '/sources', label: 'Legal RAG Sources' },
    { href: '/facilitator', label: 'Facilitator Portal' },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md border-b transition-colors bg-white/90 dark:bg-slate-950/85 border-slate-200 dark:border-slate-800/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group" onClick={() => setMobileMenuOpen(false)}>
          <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-sm group-hover:scale-105 transition-transform flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <Image
              src="/logo-icon.png"
              alt="IP-SAKTI Logo"
              width={38}
              height={38}
              className="object-contain p-0.5"
              priority
            />
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight flex items-center gap-2 text-slate-900 dark:text-white">
              IP-SAKTI <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/50">Sahayak</span>
            </span>
            <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">
              SIH PS-26045 • AYUSH & Bio-Resource IP AI
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* THEME TOGGLE BUTTON (Dark / Light) */}
          <button
            onClick={toggleTheme}
            className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 text-xs font-bold hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            <span className="text-sm">{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>

          {/* AUTH STATUS / USER MENU */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-slate-900 border border-emerald-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-emerald-500 transition-all cursor-pointer shadow-xs"
              >
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white dark:text-slate-950 flex items-center justify-center text-[10px] font-extrabold uppercase">
                  {user.displayName ? user.displayName.slice(0, 1) : user.email ? user.email.slice(0, 1) : 'U'}
                </span>
                <span className="hidden sm:inline max-w-[100px] truncate text-[11px]">
                  {user.displayName || user.email?.split('@')[0] || 'User'}
                </span>
                <span className="text-[9px] text-slate-400">▼</span>
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 py-1.5 text-xs">
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Signed in as</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate text-[11px]">
                      {user.email || 'User'}
                    </p>
                  </div>
                  <Link
                    href="/case"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 transition-colors"
                  >
                    📁 My Saved Cases
                  </Link>
                  <Link
                    href="/facilitator"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 transition-colors"
                  >
                    ⚖️ Facilitator Portal
                  </Link>
                  <button
                    onClick={() => {
                      signOutUser();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors font-semibold cursor-pointer"
                  >
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-extrabold text-xs hover:from-emerald-400 hover:to-teal-400 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>🔑</span>
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}

          {/* System Health Status Indicator */}
          <Link
            href="/diagnostics"
            className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs shadow-xs"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy === true
                  ? 'bg-emerald-500 animate-pulse'
                  : isHealthy === false
                  ? 'bg-rose-500'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px] font-medium">
              {isHealthy === true ? 'Active' : isHealthy === false ? 'Offline' : '...'}
            </span>
          </Link>

          {/* Mobile Hamburger Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 pt-2 pb-4 space-y-1 shadow-lg animate-in slide-in-from-top-2 duration-150">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <Link
              href="/diagnostics"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400"
            >
              <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span>System Health & Diagnostics</span>
            </Link>
          </div>
        </div>
      )}

      {/* Global Auth Modal Triggered from Navbar */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </header>
  );
}

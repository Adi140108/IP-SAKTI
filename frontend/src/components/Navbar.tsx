'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchHealth } from '@/lib/api';
import { useTheme } from './ThemeProvider';

export default function Navbar() {
  const pathname = usePathname();
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    fetchHealth()
      .then(() => setIsHealthy(true))
      .catch(() => setIsHealthy(false));
  }, []);

  const navItems = [
    { href: '/', label: 'Overview' },
    { href: '/chat', label: 'AI Chat' },
    { href: '/case', label: 'Case Workspace' },
    { href: '/sources', label: 'Legal RAG Sources' },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md border-b transition-colors bg-white/90 dark:bg-slate-950/85 border-slate-200 dark:border-slate-800/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
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

        <div className="flex items-center gap-3">
          {/* THEME TOGGLE BUTTON (Dark / Light) */}
          <button
            onClick={toggleTheme}
            className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 text-xs font-bold hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            <span className="text-sm">{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span className="hidden sm:inline font-medium">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <Link
            href="/diagnostics"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs shadow-xs"
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
              {isHealthy === true ? 'Gateway Active' : isHealthy === false ? 'Offline' : 'Connecting...'}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}


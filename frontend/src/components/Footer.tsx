'use client';

import { usePathname } from 'next/navigation';

export default function Footer() {
  const pathname = usePathname();

  // Suppress footer on /chat page to allow full-height workspace
  if (pathname === '/chat') {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-6 mt-auto text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="mb-2 text-slate-700 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-white">Legal Informational Disclaimer:</strong> IP-SAKTI Sahayak provides source-cited informational guidance for Ayurvedic IP, Traditional Knowledge, and Regulatory Compliance under SIH Problem Statement PS-26045. It does not provide binding legal advice.
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-500">
          Powered by Groq 120B Fast & Gemma 4 12B • Multilingual AI • Authoritative RAG (India Code, WIPO, CBD Nagoya, TKDL Public)
        </p>
      </div>
    </footer>
  );
}

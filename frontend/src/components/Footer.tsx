'use client';

import { usePathname } from 'next/navigation';

export default function Footer() {
  const pathname = usePathname();

  // Suppress footer on /chat page to allow full-height workspace
  if (pathname === '/chat') {
    return null;
  }

  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8">
        <p className="mx-auto max-w-3xl text-center text-[11px] leading-relaxed text-faint">
          <strong className="font-semibold text-muted">Legal Informational Disclaimer:</strong>{' '}
          IP-SAKTI Sahayak provides source-cited informational guidance for Ayurvedic IP, Traditional
          Knowledge, and Regulatory Compliance under SIH Problem Statement PS-26045. It does not
          provide binding legal advice.
        </p>
        <p className="mt-3 text-center text-[10px] text-faint">
          Powered by Groq 120B Fast &amp; Gemma 4 12B &middot; Multilingual AI &middot; Authoritative
          RAG (India Code, WIPO, CBD Nagoya, TKDL Public)
        </p>
      </div>
    </footer>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ScalesIcon, ScrollIcon, GlobeIcon, ArrowRightIcon } from '@/components/Icons';
import { useAuth } from '@/components/AuthProvider';
import AuthModal from '@/components/AuthModal';

const CAPABILITIES = [
  {
    id: 'questioning',
    title: 'Dynamic Adaptive Questioning',
    body: 'High-speed Groq 120B reasoning dynamically evaluates missing information parameters to ask context-aware legal questions with 1-click option chips.',
    icon: ScalesIcon,
  },
  {
    id: 'rag',
    title: 'Authoritative RAG & Citations',
    body: 'Evidence-verified answers against India Code, Patents Act 1970, NBA Biological Diversity Act, WIPO Treaties, EPC, and 35 U.S.C. with section citations.',
    icon: ScrollIcon,
  },
  {
    id: 'speech',
    title: 'Multi-lingual Speech AI',
    body: 'Hands-free voice consultation supporting Indian languages with speech-to-text input, clear voice synthesis, and inline document OCR ingestion.',
    icon: GlobeIcon,
  },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  const handleLaunchConsultation = () => {
    if (!user) {
      setShowAuthModal(true);
    } else {
      router.push('/chat');
    }
  };

  return (
    <div className="pb-12">
      {/* Hero */}
      <section className="grid grid-cols-1 items-center gap-10 border-b border-line pb-14 sm:gap-12 sm:pb-20 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <p className="eyebrow">SIH Problem Statement PS-26045</p>
          <h1 className="font-display mt-6 text-[clamp(2.75rem,6.5vw,4.75rem)] leading-[1.02] text-ink">
            Multilingual, source-cited guidance on Ayurvedic{' '}
            <span className="text-accent">IP &amp; regulatory</span> questions.
          </h1>
          <p className="mt-8 max-w-xl text-[16px] leading-relaxed text-muted">
            Navigate complex Indian (Sec 3(p), Biological Diversity Act, Drugs &amp; Cosmetics Act) and
            International (WIPO, PCT, TRIPS, Nagoya Protocol) legal regimes for traditional knowledge,
            biological resources, and Ayurvedic innovations.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <button
              onClick={handleLaunchConsultation}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 text-[13.5px] font-medium text-accent-fg transition-colors hover:bg-accent-hover cursor-pointer shadow-xs"
            >
              Launch AI Consultation
              <ArrowRightIcon size={15} />
            </button>
            {!user ? (
              <button
                onClick={() => setShowAuthModal(true)}
                className="inline-flex items-center gap-2 rounded-md border border-line-strong px-5 py-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-subtle cursor-pointer"
              >
                Sign In / Register
              </button>
            ) : (
              <Link
                href="/case"
                className="inline-flex items-center gap-2 rounded-md border border-line-strong px-5 py-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-subtle"
              >
                My Saved Cases
              </Link>
            )}
            <Link
              href="/sources"
              className="inline-flex items-center gap-2 rounded-md border border-line-strong px-5 py-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-subtle"
            >
              Browse Legal RAG Sources
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col items-center justify-center lg:items-start lg:pl-10">
          <figure className="mx-auto lg:mx-0 w-full max-w-[280px] sm:max-w-[310px]">
            <div className="relative flex aspect-square items-center justify-center rounded-2xl border border-line bg-surface/90 p-7 shadow-sm backdrop-blur-sm transition-all hover:border-accent/40">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-accent/5 to-transparent pointer-events-none" />
              <Image
                src="/logo-emblem.png"
                alt="IP-SAKTI Sahayak emblem"
                width={400}
                height={400}
                className="relative h-full w-full object-contain drop-shadow-md"
                priority
              />
            </div>
            <figcaption className="mt-4 text-center text-[11.5px] leading-relaxed text-faint">
              Ayush &amp; bio-resource intellectual property assistant for Indian and international
              statutory regimes.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Capabilities — editorial list, not identical cards */}
      <section className="pt-16">
        <h2 className="eyebrow">Core capabilities</h2>
        <ul className="mt-8 divide-y divide-line border-t border-line">
          {CAPABILITIES.map((item, i) => {
            const Icon = item.icon;
            return (
              <li
                key={item.id}
                className="grid grid-cols-1 gap-3 py-7 sm:grid-cols-12 sm:gap-8 sm:py-10"
              >
                <div className="flex items-baseline gap-3 sm:col-span-4 sm:items-start">
                  <span className="mono-caps text-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Icon size={19} className="shrink-0 translate-y-0.5 text-accent" />
                  <h3 className="font-display text-[21px] leading-snug text-ink sm:mt-[-2px]">
                    {item.title}
                  </h3>
                </div>
                <p className="max-w-2xl text-[14px] leading-relaxed text-muted sm:col-span-8 sm:pl-6">
                  {item.body}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => router.push('/chat')}
        title="Sign In Before Starting Your Consultation"
        subtitle="Sign in to save your consultations and resume chatting with your cases anytime, or continue as guest."
      />
    </div>
  );
}

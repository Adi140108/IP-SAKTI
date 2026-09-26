'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="space-y-12 pb-10">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 text-white p-8 sm:p-12 border border-slate-800 shadow-xl">
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
              <span>🇮🇳 SIH Problem Statement PS-26045</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
              Multilingual, Source-Cited <span className="gradient-text-emerald">Ayurvedic IP & Regulatory</span> Assistant
            </h1>

            <p className="text-slate-200 text-base sm:text-lg leading-relaxed">
              Navigate complex Indian (Sec 3(p), Biological Diversity Act, Drugs & Cosmetics Act) and International (WIPO, PCT, TRIPS, Nagoya Protocol) legal regimes for traditional knowledge, biological resources, and Ayurvedic innovations.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/chat"
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-extrabold text-sm hover:from-emerald-400 hover:to-teal-500 transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <span>Launch AI Consultation</span>
                <span>→</span>
              </Link>
              <Link
                href="/sources"
                className="px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/20 transition-all backdrop-blur-sm cursor-pointer"
              >
                Browse Legal RAG Sources
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4 flex justify-center items-center">
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-3xl bg-slate-900/80 border border-emerald-500/30 p-4 shadow-2xl flex items-center justify-center backdrop-blur-md">
              <div className="absolute inset-0 bg-emerald-500/10 rounded-3xl blur-xl pointer-events-none" />
              <Image
                src="/logo-icon.png"
                alt="IP-SAKTI Ayurvedic IP Assistant"
                width={220}
                height={220}
                className="object-contain relative z-10 drop-shadow-lg"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 space-y-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-lg">
            ⚡
          </div>
          <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">Dynamic Adaptive Questioning</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            High-speed Groq 120B reasoning dynamically evaluates missing information parameters to ask context-aware legal questions with 1-click option chips.
          </p>
        </div>

        <div className="glass-panel p-6 space-y-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
            📜
          </div>
          <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">Authoritative RAG & Citations</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            Evidence-verified answers against India Code, Patents Act 1970, NBA Biological Diversity Act, WIPO Treaties, EPC, and 35 U.S.C. with section citations.
          </p>
        </div>

        <div className="glass-panel p-6 space-y-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-500/10 border border-cyan-300 dark:border-cyan-500/20 text-cyan-700 dark:text-cyan-400 flex items-center justify-center font-bold text-lg">
            🗣️
          </div>
          <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">Multi-lingual Speech AI</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            Hands-free voice consultation supporting Indian languages with speech-to-text input, clear voice synthesis, and inline document OCR ingestion.
          </p>
        </div>
      </section>
    </div>
  );
}

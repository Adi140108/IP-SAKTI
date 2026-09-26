'use client';

import { useState, useEffect } from 'react';
import { fetchLegalSources } from '@/lib/api';
import { LegalSourceItem } from '@/types';

export default function SourcesPage() {
  const [sources, setSources] = useState<LegalSourceItem[]>([]);
  const [jurisdiction, setJurisdiction] = useState<string>('India');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    fetchLegalSources(jurisdiction)
      .then((res) => {
        if (isMounted) setSources(res);
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setSources([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [jurisdiction]);

  const handleSwitchJurisdiction = (newJurisdiction: string) => {
    if (newJurisdiction !== jurisdiction) {
      setLoading(true);
      setJurisdiction(newJurisdiction);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Authoritative Legal Sources</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Browse official statutes, acts, regulations, and treaties ingested into the IP-SAKTI RAG vector index.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => handleSwitchJurisdiction('India')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              jurisdiction === 'India'
                ? 'bg-amber-500 text-white dark:text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            🇮🇳 INDIA LAW
          </button>
          <button
            onClick={() => handleSwitchJurisdiction('International')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              jurisdiction === 'International'
                ? 'bg-cyan-500 text-white dark:text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            🌐 INTERNATIONAL TREATIES
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-600 dark:text-slate-400 text-sm">Loading legal knowledge index...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sources.map((src, idx) => (
            <div key={idx} className="glass-panel p-6 space-y-4 border-t-4 border-emerald-500 bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/50">
                  {src.ip_domain}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{src.effective_date}</span>
              </div>

              <h3 className="font-bold text-lg text-slate-900 dark:text-white">{src.source_title}</h3>

              <div className="space-y-1.5">
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Key Sections / Articles:</span>
                <div className="flex flex-wrap gap-1.5">
                  {src.sections.map((sec: string, sIdx: number) => (
                    <span key={sIdx} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-emerald-700 dark:text-emerald-400 font-mono text-[11px] font-medium">
                      {sec}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 leading-relaxed">
                &ldquo;{src.sample_content}&rdquo;
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

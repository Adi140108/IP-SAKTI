'use client';

import { useState, useEffect } from 'react';
import { fetchLegalSources } from '@/lib/api';
import { LegalSourceItem } from '@/types';
import { LandmarkIcon, GlobeIcon } from '@/components/Icons';

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
    <div className="pb-10">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight text-ink">
            Authoritative Legal Sources
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Browse official statutes, acts, regulations, and treaties ingested into the IP-SAKTI RAG
            vector index.
          </p>
        </div>

        <div
          className="inline-flex items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5"
          role="group"
          aria-label="Jurisdiction"
        >
          <button
            onClick={() => handleSwitchJurisdiction('India')}
            aria-pressed={jurisdiction === 'India'}
            className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-[11px] font-medium transition-colors ${
              jurisdiction === 'India' ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink'
            }`}
          >
            <LandmarkIcon size={12} />
            India Law
          </button>
          <button
            onClick={() => handleSwitchJurisdiction('International')}
            aria-pressed={jurisdiction === 'International'}
            className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-[11px] font-medium transition-colors ${
              jurisdiction === 'International'
                ? 'bg-surface text-ink shadow-soft'
                : 'text-muted hover:text-ink'
            }`}
          >
            <GlobeIcon size={12} />
            International Treaties
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-[13px] text-muted">Loading legal knowledge index...</p>
      ) : (
        <ul className="divide-y divide-line">
          {sources.map((src, idx) => (
            <li key={idx} className="grid grid-cols-1 gap-4 py-9 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-5">
                <div className="flex items-center gap-2.5">
                  <span className="chip chip-accent">{src.ip_domain}</span>
                  <span className="mono-caps text-faint">{src.effective_date}</span>
                </div>
                <h2 className="font-display mt-3.5 text-[19px] leading-snug text-ink">
                  {src.source_title}
                </h2>
              </div>

              <div className="lg:col-span-7">
                <div className="flex flex-wrap gap-2">
                  {src.sections.map((sec: string, sIdx: number) => (
                    <span
                      key={sIdx}
                      className="mono-caps rounded border border-line bg-sunken px-2 py-1 text-muted"
                    >
                      {sec}
                    </span>
                  ))}
                </div>
                <p className="mt-4 border-l-2 border-line-strong pl-4 text-[13.5px] leading-relaxed text-muted italic">
                  &ldquo;{src.sample_content}&rdquo;
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

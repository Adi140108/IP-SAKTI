'use client';

import { useState, useEffect } from 'react';
import { CaseState, ComparisonResponse, Citation } from '@/types';
import { compareJurisdictions, fetchComparisonTargets } from '@/lib/api';
import {
  GlobeIcon,
  ScalesIcon,
  CheckIcon,
  ChevronDownIcon,
  XIcon,
  ArrowRightIcon,
  ClipboardIcon,
  AlertIcon,
  ScrollIcon
} from '@/components/Icons';

interface InternationalComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseState: CaseState | null;
  language?: string;
  initialTargetCountry?: string;
  onInsertToChat?: (comparisonText: string, citations?: Citation[]) => void;
}

const PRESET_TARGETS = [
  { id: 'International', label: '🌐 International Standards (WIPO / PCT / Nagoya)', short: 'International (WIPO/PCT)' },
  { id: 'USA', label: '🇺🇸 United States (USPTO - 35 U.S.C. §101/102)', short: 'USA (USPTO)' },
  { id: 'European Union', label: '🇪🇺 European Union (EPO - EPC Art 52/54)', short: 'Europe (EPO)' },
  { id: 'Germany', label: '🇩🇪 Germany (DPMA - PatG §1/2a)', short: 'Germany (DPMA)' },
  { id: 'United Kingdom', label: '🇬🇧 United Kingdom (UK IPO - Patents Act 1977)', short: 'UK (UK IPO)' },
  { id: 'Japan', label: '🇯🇵 Japan (JPO - Patent Act §29 / Kampo)', short: 'Japan (JPO)' },
  { id: 'Australia', label: '🇦🇺 Australia (IP Australia - Patents Act 1990)', short: 'Australia' },
  { id: 'China', label: '🇨🇳 China (CNIPA - Patent Law Art 25/26 TCM)', short: 'China (CNIPA)' },
  { id: 'Canada', label: '🇨🇦 Canada (CIPO - Patent Act)', short: 'Canada' },
  { id: 'Singapore', label: '🇸🇬 Singapore (IPOS - Patents Act)', short: 'Singapore' },
];

export default function InternationalComparisonModal({
  isOpen,
  onClose,
  caseState,
  language = 'en',
  initialTargetCountry,
  onInsertToChat
}: InternationalComparisonModalProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>(initialTargetCountry || 'International');
  const [customCountry, setCustomCountry] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [customQuery, setCustomQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResponse | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTargetCountry) {
      const match = PRESET_TARGETS.find(p => p.id.toLowerCase() === initialTargetCountry.toLowerCase());
      if (match) {
        setSelectedCountry(match.id);
        setIsCustom(false);
      } else {
        setSelectedCountry('custom');
        setCustomCountry(initialTargetCountry);
        setIsCustom(true);
      }
    }
  }, [initialTargetCountry]);

  useEffect(() => {
    if (isOpen && !comparisonResult && caseState?.case_id) {
      runComparison(selectedCountry);
    }
  }, [isOpen, caseState?.case_id]);

  if (!isOpen) return null;

  const targetToUse = isCustom ? customCountry : selectedCountry;

  const runComparison = async (targetCountryToRun?: string) => {
    if (!caseState?.case_id) return;
    const effectiveTarget = targetCountryToRun || targetToUse;
    if (!effectiveTarget.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await compareJurisdictions({
        case_id: caseState.case_id,
        target_country: effectiveTarget,
        user_query: customQuery.trim() || undefined,
        language
      });
      setComparisonResult(res);
    } catch (err: any) {
      console.error('Comparison error:', err);
      setError(err?.message || 'Failed to generate statutory comparison.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySummary = () => {
    if (!comparisonResult) return;
    const text = `### ${comparisonResult.comparison_title}\n\n${comparisonResult.comparison_summary}\n\n` +
      comparisonResult.dimensions.map(d => `* **${d.dimension}**\n  - India: ${d.india_law}\n  - ${comparisonResult.target_country}: ${d.target_law}\n  - Difference: ${d.key_difference}\n  - Strategy: ${d.strategic_implication}`).join('\n\n') +
      `\n\n### Cross-Border Filing Advice\n${comparisonResult.filing_pathway_advice}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    if (!comparisonResult || !onInsertToChat) return;
    const summaryMarkdown = `### ⚖️ ${comparisonResult.comparison_title}\n\n` +
      `**Executive Summary**: ${comparisonResult.comparison_summary}\n\n` +
      `#### 📊 Key Statutory Divergences:\n` +
      comparisonResult.dimensions.map(d => `- **${d.dimension}**:\n  • *India*: ${d.india_law}\n  • *${comparisonResult.target_country}*: ${d.target_law}\n  • *Key Divergence*: ${d.key_difference}\n  • *Strategy*: ${d.strategic_implication}`).join('\n') +
      `\n\n#### 🗺️ Cross-Border Filing Roadmap:\n${comparisonResult.filing_pathway_advice}`;

    onInsertToChat(summaryMarkdown, comparisonResult.citations);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm animate-fadeIn">
      <div className="panel relative flex h-[90vh] max-h-[860px] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl animate-liftIn">
        
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-sunken">
              <GlobeIcon size={20} className="text-accent" />
            </span>
            <div>
              <h2 className="font-display text-[17px] font-semibold text-ink">
                Comparative IP Law &amp; International Standards
              </h2>
              <p className="text-[12px] text-faint">
                Compare Indian IP laws (Sec 3(p), 3(e), BDA 2002) with international treaties &amp; foreign domestic statutes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
            aria-label="Close modal"
          >
            <XIcon size={14} />
          </button>
        </div>

        {/* Country Selector Toolbar */}
        <div className="shrink-0 border-b border-line bg-sunken/60 px-5 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow shrink-0 text-faint">Compare India With:</span>
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
              {PRESET_TARGETS.map((target) => (
                <button
                  key={target.id}
                  onClick={() => {
                    setSelectedCountry(target.id);
                    setIsCustom(false);
                    runComparison(target.id);
                  }}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    !isCustom && selectedCountry === target.id
                      ? 'bg-accent text-accent-fg shadow-soft'
                      : 'border border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {target.short}
                </button>
              ))}
              <button
                onClick={() => setIsCustom(true)}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  isCustom
                    ? 'bg-accent text-accent-fg shadow-soft'
                    : 'border border-dashed border-line-strong bg-surface text-muted hover:border-accent hover:text-ink'
                }`}
              >
                + Custom Country...
              </button>
            </div>
          </div>

          {isCustom && (
            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter country name (e.g. France, South Korea, Switzerland, Brazil)..."
                value={customCountry}
                onChange={(e) => setCustomCountry(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runComparison(customCountry)}
                className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => runComparison(customCountry)}
                disabled={loading || !customCountry.trim()}
                className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                Analyze Country
              </button>
            </div>
          )}
        </div>

        {/* Modal Body / Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <span className="h-8 w-8 animate-spin-slow rounded-full border-2 border-line-strong border-t-accent" />
              <div className="space-y-1">
                <p className="text-[13.5px] font-medium text-ink">
                  Synthesizing Dual-Jurisdiction Statutory RAG Evidence...
                </p>
                <p className="text-[12px] text-faint">
                  Comparing Indian Patent &amp; Biodiversity Acts against {targetToUse} statutory registers &amp; WIPO treaties.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-md border border-danger-line bg-danger-soft p-4 text-[13px] text-danger flex items-start gap-2.5">
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Comparison Generation Failed</p>
                <p className="mt-1 text-[12px] opacity-90">{error}</p>
                <button
                  onClick={() => runComparison()}
                  className="mt-3 rounded-md bg-danger px-3 py-1 text-[11px] font-medium text-white hover:opacity-90"
                >
                  Retry Comparison
                </button>
              </div>
            </div>
          ) : comparisonResult ? (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Executive Summary Card */}
              <div className="rounded-lg border border-accent-line bg-accent-soft p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 border-b border-accent-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <ScalesIcon size={16} className="text-accent" />
                    <h3 className="text-[14px] font-semibold text-accent-ink">
                      {comparisonResult.comparison_title}
                    </h3>
                  </div>
                  <span className="chip chip-accent">
                    Confidence {Math.round(comparisonResult.confidence_score * 100)}%
                  </span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink">
                  {comparisonResult.comparison_summary}
                </p>
              </div>

              {/* Side-by-Side Comparative Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="eyebrow text-ink">Statutory Comparison Matrix</h4>
                  <span className="mono-caps text-faint">India vs {comparisonResult.target_country}</span>
                </div>

                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="grid grid-cols-1 divide-y divide-line">
                    {comparisonResult.dimensions.map((dim, idx) => (
                      <div key={idx} className="p-4 sm:p-5 hover:bg-subtle/30 transition-colors">
                        <div className="flex items-center gap-2 pb-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10.5px] font-bold text-accent-fg">
                            {idx + 1}
                          </span>
                          <h5 className="text-[13px] font-semibold text-ink">
                            {dim.dimension}
                          </h5>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Indian Law Box */}
                          <div className="rounded-md border border-line bg-sunken/40 p-3">
                            <div className="flex items-center gap-1.5 pb-1 text-[11px] font-semibold text-ink">
                              <span>🇮🇳 Indian Law Position</span>
                            </div>
                            <p className="text-[12px] leading-relaxed text-muted">
                              {dim.india_law}
                            </p>
                          </div>

                          {/* Target Law Box */}
                          <div className="rounded-md border border-line bg-sunken/40 p-3">
                            <div className="flex items-center gap-1.5 pb-1 text-[11px] font-semibold text-accent-ink">
                              <span>🌐 {comparisonResult.target_country} Position</span>
                            </div>
                            <p className="text-[12px] leading-relaxed text-muted">
                              {dim.target_law}
                            </p>
                          </div>
                        </div>

                        {/* Crucial Difference & Strategy Footer */}
                        <div className="mt-3 rounded-md border border-line-subtle bg-surface p-3 space-y-1.5">
                          <div className="text-[11.5px] text-ink">
                            <strong className="text-warn">⚡ Key Statutory Difference: </strong>
                            <span className="text-muted">{dim.key_difference}</span>
                          </div>
                          <div className="text-[11.5px] text-ink">
                            <strong className="text-accent">💡 Innovator Strategy: </strong>
                            <span className="text-muted">{dim.strategic_implication}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cross-Border Filing Roadmap */}
              <div className="rounded-lg border border-line bg-surface p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 border-b border-line pb-2.5">
                  <ScrollIcon size={15} className="text-accent" />
                  <h4 className="eyebrow text-ink">Strategic Cross-Border Filing Pathway</h4>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted whitespace-pre-wrap">
                  {comparisonResult.filing_pathway_advice}
                </p>
              </div>

              {/* Authoritative Verified Citations */}
              {comparisonResult.citations && comparisonResult.citations.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="eyebrow text-ink">Verified Statutory Citations</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {comparisonResult.citations.map((c, cIdx) => (
                      <div key={cIdx} className="rounded-md border border-line bg-sunken p-3 text-[11.5px] space-y-1">
                        <div className="flex items-center justify-between font-medium text-ink">
                          <span className="truncate">{c.source}</span>
                          <span className="chip chip-ok shrink-0">Verified</span>
                        </div>
                        <div className="mono-caps text-accent-ink">
                          {c.section_or_rule || 'Statutory Article'}
                        </div>
                        {c.snippet && (
                          <p className="text-[11px] text-faint italic line-clamp-2">
                            &ldquo;{c.snippet}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted">
              Select a country or standard above to generate a statutory comparative matrix.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken/40 px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              disabled={!comparisonResult}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-50"
            >
              {copied ? <CheckIcon size={13} className="text-ok" /> : <ClipboardIcon size={13} />}
              {copied ? 'Copied!' : 'Copy Summary'}
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              Close
            </button>
            {onInsertToChat && (
              <button
                onClick={handleInsert}
                disabled={!comparisonResult}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-[12px] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                Insert into Active Chat
                <ArrowRightIcon size={12} />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

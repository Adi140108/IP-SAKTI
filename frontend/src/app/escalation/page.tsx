'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { EscalationDossier, CaseState } from '@/types';
import { fetchEscalationDossier, submitEscalationRequest, getCase, listCases } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

const ESCALATION_REASONS = [
  'Insufficient authoritative evidence in corpus',
  'Low evidence confidence score',
  'Conflicting statutory sources identified',
  'Complex cross-border / PCT international filing',
  'Novel proprietary formulation classification',
  'Biological resource sourcing / NBA clearance uncertainty',
  'Public disclosure / Prior commercial use concern',
  'Significant prior-art record identified',
  'User requested expert human IP review',
  'Other complex regulatory question'
];

function EscalationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseIdFromQuery = searchParams.get('case_id');
  const { user } = useAuth();

  const [activeCaseId, setActiveCaseId] = useState<string>(caseIdFromQuery || '');
  const [userCases, setUserCases] = useState<Array<{ case_id: string; product_name?: string; updated_at?: string }>>([]);
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [dossier, setDossier] = useState<EscalationDossier | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [selectedReason, setSelectedReason] = useState<string>(ESCALATION_REASONS[0]);
  const [userNote, setUserNote] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'formulation' | 'ip' | 'abs' | 'prior_art' | 'citations' | 'audit'>('summary');

  // Load user cases list
  useEffect(() => {
    listCases(user?.uid || undefined)
      .then((cases) => {
        if (cases && cases.length > 0) {
          setUserCases(cases);
          if (!activeCaseId) {
            setActiveCaseId(cases[0].case_id);
          }
        }
      })
      .catch(() => {});

    // Fallback to localStorage active case
    if (!activeCaseId && typeof window !== 'undefined') {
      const savedCaseId = localStorage.getItem('ip_sakti_active_case_id');
      if (savedCaseId) {
        setActiveCaseId(savedCaseId);
      }
    }
  }, [user]);

  // Load case state and generate/fetch dossier whenever activeCaseId changes
  useEffect(() => {
    if (!activeCaseId) return;

    setLoading(true);
    setError(null);
    setSubmitSuccess(null);

    Promise.all([
      getCase(activeCaseId).catch(() => null),
      fetchEscalationDossier(activeCaseId).catch(() => null)
    ])
      .then(([stateRes, dossierRes]) => {
        if (stateRes) setCaseState(stateRes);
        if (dossierRes) setDossier(dossierRes);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load dossier details:', err);
        setError('Could not retrieve case details. Please ensure the case exists.');
        setLoading(false);
      });
  }, [activeCaseId]);

  const handleSubmitEscalation = async () => {
    if (!activeCaseId) {
      setError('Please select or create an active case first.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await submitEscalationRequest({
        case_id: activeCaseId,
        reason: selectedReason,
        user_note: userNote
      });

      if (res && res.dossier) {
        setDossier(res.dossier);
      } else if (res && res.dossier_id) {
        // Refresh dossier
        const updated = await fetchEscalationDossier(activeCaseId);
        setDossier(updated);
      }
      setSubmitSuccess(`Escalation request submitted successfully! Dossier ID: ${res.dossier_id || dossier?.dossier_id || 'Registered'}`);
    } catch (err: any) {
      console.error('Submission error:', err);
      setError(err?.message || 'Failed to submit escalation request to human facilitator.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadMarkdownDossier = () => {
    if (!dossier) return;
    const content = `# IP-SAKTI Human IP Facilitator Escalation Dossier
**Dossier ID:** ${dossier.dossier_id || 'DRAFT'}
**Case ID:** ${dossier.case_id}
**Status:** ${dossier.status?.toUpperCase() || 'DRAFT'}
**Jurisdiction:** ${dossier.jurisdiction} ${dossier.country ? `(${dossier.country})` : ''}
**Created:** ${dossier.created_at || new Date().toISOString()}

---

## 1. Case Summary
${dossier.case_summary || 'No summary recorded'}

## 2. Product & Formulation
- **Product Name:** ${dossier.product_name || 'N/A'}
- **Product Type:** ${dossier.product_type || 'N/A'}
- **Classification:** ${dossier.formulation_classification || 'N/A'}
- **Classical Reference:** ${dossier.classical_reference || 'None'}
- **Ingredients:** ${dossier.ingredients?.join(', ') || 'None specified'}
- **Composition Details:** ${dossier.composition_details || 'N/A'}
- **Dosage / Form:** ${dossier.dosage_or_form || 'N/A'}

## 3. IP Objectives & Claims
- **Objectives:** ${dossier.intellectual_property_objective?.join(', ') || 'Unspecified'}
- **Novelty Aspect:** ${dossier.novelty_aspect || 'N/A'}
- **Technical Improvement:** ${dossier.technical_improvement || 'N/A'}
- **Experimental Evidence:** ${dossier.experimental_evidence || 'N/A'}
- **Public Disclosure:** ${dossier.public_disclosure ? 'Yes - Warning' : 'None reported'}

## 4. ABS & Traditional Knowledge
- **Traditional Knowledge Involved:** ${dossier.traditional_knowledge_involved ? 'Yes' : 'No'}
- **Biological Resources Involved:** ${dossier.biological_resources_involved ? 'Yes' : 'No'}
- **ABS Clearance Required:** ${dossier.access_and_benefit_sharing ? 'Yes' : 'No'}
- **ABS Assessment Notes:** ${dossier.abs_assessment || 'None'}

## 5. Potential Prior Art & TKDL Pointers
${dossier.prior_art_matches && dossier.prior_art_matches.length > 0
  ? dossier.prior_art_matches.map(m => `- **${m.title}** (${m.jurisdiction}): ${m.match_category}`).join('\n')
  : 'No sufficiently relevant verified record was found in the currently available corpus.'}

## 6. Citations & Legal Evidence
${dossier.citations && dossier.citations.length > 0
  ? dossier.citations.map(c => `- **${c.source}** [${c.section_or_rule || 'Statute'}]: ${c.authority || 'Authoritative Source'}`).join('\n')
  : 'No citations referenced yet.'}

## 7. AI Confidence & Escalation Reasoning
- **Confidence Level:** ${dossier.confidence_level || 'N/A'} (${dossier.confidence ?? 'N/A'})
- **Confidence Reason:** ${dossier.confidence_reason || 'N/A'}
- **Escalation Reason:** ${dossier.escalation_reason || selectedReason}
- **User Note:** ${dossier.user_note || userNote || 'None'}

---
*Disclaimer: Informational case dossier for human IP facilitator review — not an AI legal verdict or determination of patentability.*
`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `IP_SAKTI_Dossier_${dossier.dossier_id || activeCaseId}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16">
      {/* Header Banner */}
      <div className="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-16 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚖️</span>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
                Human IP Facilitator Escalation
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
                Informational Legal Guidance
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review authoritative case facts, statutory citations, and submit a structured dossier to an IP Facilitator.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadMarkdownDossier}
              disabled={!dossier}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
            >
              <span>📥</span>
              <span>Export Markdown</span>
            </button>
            <Link
              href={`/chat${activeCaseId ? `?case_id=${activeCaseId}` : ''}`}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <span>💬</span>
              <span>Back to Chat</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Case Selector and Status Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Active Case Selector */}
          <div className="glass-panel p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Select Active Case
              </label>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                {activeCaseId ? `ID: ${activeCaseId.substring(0, 10)}...` : 'None'}
              </span>
            </div>

            {userCases.length > 0 ? (
              <select
                value={activeCaseId}
                onChange={(e) => setActiveCaseId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              >
                {userCases.map((c) => (
                  <option key={c.case_id} value={c.case_id}>
                    {c.product_name || 'Unnamed Case'} ({c.case_id.substring(0, 8)})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Case ID (e.g. case_...)"
                  value={activeCaseId}
                  onChange={(e) => setActiveCaseId(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200"
                />
              </div>
            )}

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1">
              <span>Jurisdiction: <strong>{caseState?.jurisdiction || dossier?.jurisdiction || 'India'}</strong></span>
              <span>Country: <strong>{caseState?.country || dossier?.country || 'India'}</strong></span>
            </div>
          </div>

          {/* Lifecycle Status & Confidence Badge */}
          <div className="glass-panel p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Escalation Status & Confidence
            </div>
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 ${
                dossier?.status === 'submitted'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                  : dossier?.status === 'under_review'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse'
                  : dossier?.status === 'resolved'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
              }`}>
                <span>{dossier?.status === 'under_review' ? '⏳' : dossier?.status === 'resolved' ? '✅' : dossier?.status === 'submitted' ? '📨' : '📝'}</span>
                <span>Status: {dossier?.status || 'Draft'}</span>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300">
                Confidence: {dossier?.confidence_level || 'Medium'} ({dossier?.confidence ? `${Math.round(dossier.confidence * 100)}%` : '65%'})
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {dossier?.confidence_reason || 'Evaluated against indexed statutory provisions and official prior-art corpus.'}
            </p>
          </div>

          {/* Quick Submission Action */}
          <div className="glass-panel p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-emerald-500/5 to-teal-500/10 border border-amber-500/30 dark:border-amber-500/25 space-y-3 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <span>⚡ Request Human Review</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                Submit this case to the Human IP Facilitator Queue for expert regulatory guidance.
              </p>
            </div>

            <button
              onClick={handleSubmitEscalation}
              disabled={submitting || !activeCaseId}
              className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-black text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Submitting to Facilitator...</span>
                </>
              ) : (
                <>
                  <span>🚀 Submit Escalation Request</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback Notifications */}
        {submitSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎉</span>
              <div>
                <strong>{submitSuccess}</strong>
                <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/90 mt-0.5">
                  An IP facilitator can now inspect this case dossier in the Facilitator Portal.
                </p>
              </div>
            </div>
            <Link
              href="/facilitator"
              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold text-[11px] hover:bg-emerald-800 transition-all whitespace-nowrap cursor-pointer"
            >
              View Facilitator Portal ➔
            </Link>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Reason & User Note Customization Card */}
        <div className="glass-panel p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>📝</span>
            <span>Escalation Request Parameters</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Primary Reason for Escalation
              </label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              >
                {ESCALATION_REASONS.map((r, idx) => (
                  <option key={idx} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Custom User Note / Specific Questions for Facilitator (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Please evaluate if our bio-enhancer data satisfies Section 3(e) synergistic criteria..."
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* 10-Section Structured Dossier Viewer */}
        <div className="glass-panel rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto bg-slate-50/70 dark:bg-slate-950/70 p-1.5 gap-1">
            {[
              { id: 'summary', label: '1. Summary & Facts', icon: '📋' },
              { id: 'formulation', label: '2. Formulation & Classification', icon: '🌿' },
              { id: 'ip', label: '3. IP Objectives & Claims', icon: '💡' },
              { id: 'abs', label: '4. ABS & Biodiversity', icon: '🌱' },
              { id: 'prior_art', label: '5. Prior Art & TKDL', icon: '🔍' },
              { id: 'citations', label: '6. Verified Citations', icon: '📜' },
              { id: 'audit', label: '7. Audit & Questions', icon: '🛡️' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-850'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="p-6">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
                <div className="w-8 h-8 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
                <span className="text-xs font-semibold">Loading authoritative case facts & evidence...</span>
              </div>
            ) : !dossier ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <p className="text-sm font-semibold">No case dossier data available.</p>
                <p className="text-xs">Select or enter a valid case ID above to inspect its escalation parameters.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Tab 1: Summary */}
                {activeTab === 'summary' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Case Overview Summary
                      </div>
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                        {dossier.case_summary || 'No summary registered.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Dossier ID</span>
                        <span className="font-mono font-bold">{dossier.dossier_id || 'Pending'}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Created At</span>
                        <span>{dossier.created_at ? new Date(dossier.created_at).toLocaleString() : 'N/A'}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Target Jurisdiction</span>
                        <span className="font-bold">{dossier.jurisdiction} {dossier.country ? `(${dossier.country})` : ''}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Formulation */}
                {activeTab === 'formulation' && (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Product Identity</span>
                        <div className="space-y-1">
                          <div><strong>Product Name:</strong> {dossier.product_name || 'N/A'}</div>
                          <div><strong>Product Type:</strong> {dossier.product_type || 'N/A'}</div>
                          <div><strong>Dosage / Form:</strong> {dossier.dosage_or_form || 'N/A'}</div>
                          <div><strong>Intended Use:</strong> {dossier.intended_use || 'N/A'}</div>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Regulatory Classification</span>
                        <div className="space-y-1">
                          <div><strong>Classification:</strong> <span className="capitalize px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">{dossier.formulation_classification || 'unknown'}</span></div>
                          <div><strong>Classical Reference:</strong> {dossier.classical_reference || 'None (Proprietary / New)'}</div>
                          <div><strong>Manufacturing Context:</strong> {dossier.manufacturing_context || 'Standard GMP'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Active Ingredients & Sourcing</span>
                      {dossier.ingredients && dossier.ingredients.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {dossier.ingredients.map((ing, iIdx) => (
                            <span key={iIdx} className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-semibold text-xs">
                              🌿 {ing}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">No ingredients specified yet.</p>
                      )}
                      {dossier.composition_details && (
                        <p className="mt-2 text-slate-700 dark:text-slate-300">
                          <strong>Composition Details:</strong> {dossier.composition_details}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 3: IP Objectives */}
                {activeTab === 'ip' && (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Target IP Types</span>
                      <div className="flex flex-wrap gap-2">
                        {dossier.intellectual_property_objective && dossier.intellectual_property_objective.length > 0 ? (
                          dossier.intellectual_property_objective.map((obj, oIdx) => (
                            <span key={oIdx} className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 font-bold uppercase text-[11px]">
                              💡 {obj}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 italic">No specific IP objective registered</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Novelty & Inventive Step</span>
                        <p className="text-slate-800 dark:text-slate-200">
                          <strong>Novelty Aspect:</strong> {dossier.novelty_aspect || 'None specified'}
                        </p>
                        <p className="text-slate-800 dark:text-slate-200">
                          <strong>Technical Improvement:</strong> {dossier.technical_improvement || 'None specified'}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Experimental Evidence & Disclosure</span>
                        <p className="text-slate-800 dark:text-slate-200">
                          <strong>Experimental Data:</strong> {dossier.experimental_evidence || 'No in-vitro / in-vivo data attached'}
                        </p>
                        <div className="pt-1">
                          <strong>Public Disclosure:</strong>{' '}
                          {dossier.public_disclosure ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">⚠️ Warning: Disclosed prior to filing ({dossier.public_disclosure_details || 'Unspecified'})</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Confidential (No prior public disclosure)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 4: ABS & Biodiversity */}
                {activeTab === 'abs' && (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Biological Diversity Act (NBA) Assessment</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-500 block text-[10px]">Biological Resources</span>
                          <strong className={dossier.biological_resources_involved ? 'text-amber-600' : 'text-slate-700'}>
                            {dossier.biological_resources_involved ? 'Yes (Indian Origin)' : 'Not Declared'}
                          </strong>
                        </div>
                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-500 block text-[10px]">Traditional Knowledge</span>
                          <strong className={dossier.traditional_knowledge_involved ? 'text-teal-600' : 'text-slate-700'}>
                            {dossier.traditional_knowledge_involved ? 'Yes (Classical AYUSH)' : 'None'}
                          </strong>
                        </div>
                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-500 block text-[10px]">ABS Approval Required</span>
                          <strong className={dossier.access_and_benefit_sharing ? 'text-rose-600' : 'text-emerald-600'}>
                            {dossier.access_and_benefit_sharing ? 'Yes (Form I / Form III)' : 'No'}
                          </strong>
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-amber-50/50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-900">
                        {dossier.abs_assessment || 'No biological sourcing considerations noted.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Tab 5: Prior Art & TKDL */}
                {activeTab === 'prior_art' && (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Indexed Prior-Art Records</span>
                        <span className="text-[10px] text-slate-400">Preserved official corpus matches</span>
                      </div>

                      {dossier.prior_art_matches && dossier.prior_art_matches.length > 0 ? (
                        <div className="space-y-2">
                          {dossier.prior_art_matches.map((pa, pIdx) => (
                            <div key={pIdx} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                              <div className="flex items-center justify-between">
                                <strong className="text-slate-900 dark:text-slate-100">{pa.title}</strong>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  {pa.match_category}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 flex gap-3">
                                <span>Jurisdiction: {pa.jurisdiction}</span>
                                <span>Source: {pa.source_type}</span>
                                <span>Score: {Math.round(pa.relevance_score * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">No sufficiently relevant verified record was found in the currently available corpus.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 6: Citations */}
                {activeTab === 'citations' && (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Authoritative Statutory Citations</span>
                      {dossier.citations && dossier.citations.length > 0 ? (
                        <div className="space-y-2">
                          {dossier.citations.map((c, cIdx) => (
                            <div key={cIdx} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                              <div className="flex items-center justify-between">
                                <strong className="text-emerald-700 dark:text-emerald-400">{c.source}</strong>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-mono">
                                  {c.document_id || 'DOC-VERIFIED'}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 flex gap-3">
                                <span>Authority: {c.authority || 'IPO / Statutory'}</span>
                                <span>Section: {c.section_or_rule || 'General Statute'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">No statutory citations referenced yet.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 7: Audit & Questions */}
                {activeTab === 'audit' && (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Unresolved Questions for Human Facilitator</span>
                      <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
                        {dossier.unresolved_questions && dossier.unresolved_questions.length > 0 ? (
                          dossier.unresolved_questions.map((q, qIdx) => (
                            <li key={qIdx}>{q}</li>
                          ))
                        ) : (
                          <li className="italic text-slate-500">None specified</li>
                        )}
                      </ul>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Immutable Audit Trail</span>
                      <div className="space-y-1.5 font-mono text-[10px]">
                        {dossier.audit_log && dossier.audit_log.length > 0 ? (
                          dossier.audit_log.map((log, lIdx) => (
                            <div key={lIdx} className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                              <span><strong>{log.action}</strong>: {log.reason || log.note || 'Recorded event'}</span>
                              <span className="text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-500 italic">No audit entries yet.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Safety Disclaimer Banner */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-850 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-[10px] flex items-center gap-2">
                  <span>🛡️</span>
                  <span>
                    <strong>Safety Standard:</strong> {dossier.disclaimer || 'Informational case dossier for human IP facilitator review — not an AI legal verdict or determination of patentability.'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EscalationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-slate-500">Loading Escalation Portal...</span>
      </div>
    }>
      <EscalationContent />
    </Suspense>
  );
}

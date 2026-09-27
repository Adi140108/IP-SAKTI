'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { EscalationDossier, CaseState } from '@/types';
import { fetchEscalationDossier, submitEscalationRequest, getCase, listCases, createCase } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { getPersistedCases, persistCase, mergeAndPersistCases } from '@/lib/caseRegistry';

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
  const [userCases, setUserCases] = useState<CaseState[]>(() => getPersistedCases());
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [dossier, setDossier] = useState<EscalationDossier | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [selectedReason, setSelectedReason] = useState<string>(ESCALATION_REASONS[0]);
  const [userNote, setUserNote] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'formulation' | 'ip' | 'abs' | 'prior_art' | 'citations' | 'audit'>('summary');

  // Load and merge all persisted + remote cases
  const fetchAllCases = useCallback(async () => {
    try {
      const apiCases = await listCases(user?.uid || undefined);
      const merged = mergeAndPersistCases(apiCases);
      setUserCases(merged);

      if (!activeCaseId) {
        if (caseIdFromQuery) {
          setActiveCaseId(caseIdFromQuery);
        } else if (merged.length > 0) {
          setActiveCaseId(merged[0].case_id);
        } else {
          // Check localStorage
          const savedCaseId = localStorage.getItem('ip_sakti_active_case_id');
          if (savedCaseId) {
            setActiveCaseId(savedCaseId);
          } else {
            // Auto initialize a draft consultation case
            const defaultId = `case_${Date.now().toString(36)}`;
            const defaultCase: CaseState = {
              case_id: defaultId,
              user_id: user?.uid || 'guest_user',
              language: 'en',
              jurisdiction: 'India',
              country: 'India',
              product_name: 'Ayurvedic Botanical Synergy',
              product_type: 'Ayurvedic proprietary formulation',
              formulation_classification: 'proprietary',
              ingredients: ['Curcuma longa (Haridra)', 'Zingiber officinale (Shunthi)', 'Piper nigrum (Maricha)'],
              intended_use: 'Enhanced bioavailability anti-inflammatory formulation',
              dosage_or_form: 'Extract Capsule',
              intellectual_property_objective: ['patent', 'regulatory'],
              international_market: ['India'],
              uploaded_documents: [],
              previous_answers: [],
              known_information: ['Classical polyherbal Trikatu synergy modified with supercritical extraction.'],
              missing_information: ['NBA Form 3 approval status', 'Bioavailability pharmacokinetic clinical trial data'],
              evidence_references: [],
              conversation_history: [],
              conversation_stage: 'intake',
              traditional_knowledge_involved: true,
              biological_resources_involved: true,
              access_and_benefit_sharing: true,
              confidence: 0.65
            };
            persistCase(defaultCase);
            setUserCases([defaultCase]);
            setActiveCaseId(defaultId);
          }
        }
      }
    } catch (e) {
      console.warn('Fallback to local cases:', e);
      const local = getPersistedCases();
      setUserCases(local);
      if (!activeCaseId && local.length > 0) {
        setActiveCaseId(local[0].case_id);
      }
    }
  }, [user, activeCaseId, caseIdFromQuery]);

  useEffect(() => {
    fetchAllCases();
  }, [fetchAllCases]);

  // Load active case details and dossier
  useEffect(() => {
    if (!activeCaseId) return;

    setLoading(true);
    setError(null);
    setSubmitSuccess(null);

    // 1. Immediately render local case state if present
    const localMatch = userCases.find((c) => c.case_id === activeCaseId) || getPersistedCases().find((c) => c.case_id === activeCaseId);
    if (localMatch) {
      setCaseState(localMatch);
      localStorage.setItem('ip_sakti_active_case_id', activeCaseId);
    }

    // 2. Fetch authoritative dossier & state from backend
    Promise.all([
      getCase(activeCaseId).catch(() => null),
      fetchEscalationDossier(activeCaseId, selectedReason).catch(() => null)
    ])
      .then(([remoteState, remoteDossier]) => {
        if (remoteState) {
          setCaseState(remoteState);
          persistCase(remoteState);
        }
        if (remoteDossier) {
          setDossier(remoteDossier);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Dossier resolution notice:', err);
        setLoading(false);
      });
  }, [activeCaseId, selectedReason]);

  const handleCreateNewCase = async () => {
    const newId = `case_${Date.now().toString(36)}`;
    const newCase: CaseState = {
      case_id: newId,
      user_id: user?.uid || 'guest_user',
      language: 'en',
      jurisdiction: 'India',
      country: 'India',
      product_name: 'New Ayurvedic Case',
      product_type: 'Polyherbal Formulation',
      formulation_classification: 'proprietary',
      ingredients: [],
      intellectual_property_objective: ['patent'],
      international_market: [],
      uploaded_documents: [],
      previous_answers: [],
      known_information: [],
      missing_information: [],
      evidence_references: [],
      conversation_history: [],
      conversation_stage: 'intake',
      confidence: 0.60
    };

    try {
      await createCase(newCase);
    } catch {
      // Local fallback
    }

    persistCase(newCase);
    setUserCases((prev) => [newCase, ...prev.filter((c) => c.case_id !== newId)]);
    setActiveCaseId(newId);
    setCaseState(newCase);
  };

  const handleSubmitEscalation = async () => {
    if (!activeCaseId) {
      setError('Please select or create an active case first.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      // Ensure backend has case state synced if available
      if (caseState) {
        createCase(caseState).catch(() => {});
      }

      const res = await submitEscalationRequest({
        case_id: activeCaseId,
        reason: selectedReason,
        user_note: userNote,
        trigger_type: 'user'
      });

      if (res && res.dossier) {
        setDossier(res.dossier);
      } else if (res && res.dossier_id) {
        const updated = await fetchEscalationDossier(activeCaseId, selectedReason);
        setDossier(updated);
      }
      setSubmitSuccess(`Escalation request submitted successfully! Dossier ID: ${res.dossier_id || dossier?.dossier_id || 'Registered'}`);
    } catch (err: any) {
      console.error('Submission error:', err);
      let msg = 'Failed to submit escalation request to human facilitator.';
      if (typeof err === 'string' && err.trim()) {
        msg = err;
      } else if (err?.message && typeof err.message === 'string' && err.message.trim()) {
        msg = err.message;
      } else if (err && typeof err === 'object') {
        msg = JSON.stringify(err);
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadMarkdownDossier = () => {
    if (!dossier && !caseState) return;
    const activeD = dossier;
    const content = `# IP-SAKTI Human IP Facilitator Escalation Dossier
**Dossier ID:** ${activeD?.dossier_id || 'DRAFT'}
**Case ID:** ${activeCaseId}
**Status:** ${activeD?.status?.toUpperCase() || 'DRAFT'}
**Jurisdiction:** ${activeD?.jurisdiction || caseState?.jurisdiction || 'India'} ${activeD?.country ? `(${activeD.country})` : ''}
**Created:** ${activeD?.created_at || new Date().toISOString()}

---

## 1. Case Summary
${activeD?.case_summary || caseState?.product_name || 'No summary recorded'}

## 2. Product & Formulation
- **Product Name:** ${activeD?.product_name || caseState?.product_name || 'N/A'}
- **Product Type:** ${activeD?.product_type || caseState?.product_type || 'N/A'}
- **Classification:** ${activeD?.formulation_classification || caseState?.formulation_classification || 'N/A'}
- **Classical Reference:** ${activeD?.classical_reference || caseState?.classical_reference || 'None'}
- **Ingredients:** ${activeD?.ingredients?.join(', ') || caseState?.ingredients?.join(', ') || 'None specified'}
- **Composition Details:** ${activeD?.composition_details || caseState?.composition_details || 'N/A'}
- **Dosage / Form:** ${activeD?.dosage_or_form || caseState?.dosage_or_form || 'N/A'}

## 3. IP Objectives & Claims
- **Objectives:** ${activeD?.intellectual_property_objective?.join(', ') || caseState?.intellectual_property_objective?.join(', ') || 'Unspecified'}
- **Novelty Aspect:** ${activeD?.novelty_aspect || caseState?.novelty_aspect || 'N/A'}
- **Technical Improvement:** ${activeD?.technical_improvement || caseState?.technical_improvement || 'N/A'}
- **Experimental Evidence:** ${activeD?.experimental_evidence || caseState?.experimental_evidence || 'N/A'}
- **Public Disclosure:** ${activeD?.public_disclosure || caseState?.public_disclosure ? 'Yes - Warning' : 'None reported'}

## 4. ABS & Traditional Knowledge
- **Traditional Knowledge Involved:** ${activeD?.traditional_knowledge_involved || caseState?.traditional_knowledge_involved ? 'Yes' : 'No'}
- **Biological Resources Involved:** ${activeD?.biological_resources_involved || caseState?.biological_resources_involved ? 'Yes' : 'No'}
- **ABS Clearance Required:** ${activeD?.access_and_benefit_sharing || caseState?.access_and_benefit_sharing ? 'Yes' : 'No'}
- **ABS Assessment Notes:** ${activeD?.abs_assessment || 'Biological resource review under Biological Diversity Act.'}

## 5. Potential Prior Art & TKDL Pointers
${activeD?.prior_art_matches && activeD.prior_art_matches.length > 0
  ? activeD.prior_art_matches.map(m => `- **${m.title}** (${m.jurisdiction}): ${m.match_category}`).join('\n')
  : 'No sufficiently relevant verified record was found in the currently available corpus.'}

## 6. Citations & Legal Evidence
${activeD?.citations && activeD.citations.length > 0
  ? activeD.citations.map(c => `- **${c.source}** [${c.section_or_rule || 'Statute'}]: ${c.authority || 'Authoritative Source'}`).join('\n')
  : 'The Patents Act, 1970 (Section 3(p)) & Biological Diversity Act, 2002.'}

## 7. AI Confidence & Escalation Reasoning
- **Confidence Level:** ${activeD?.confidence_level || 'Medium'} (${activeD?.confidence ?? '65%'})
- **Confidence Reason:** ${activeD?.confidence_reason || 'Evaluated against statutory index.'}
- **Escalation Reason:** ${activeD?.escalation_reason || selectedReason}
- **User Note:** ${activeD?.user_note || userNote || 'None'}

---
*Disclaimer: Informational case dossier for human IP facilitator review — not an AI legal verdict or determination of patentability.*
`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `IP_SAKTI_Dossier_${activeD?.dossier_id || activeCaseId}.md`;
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
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
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
              <button
                onClick={handleCreateNewCase}
                className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
              >
                + New Case
              </button>
            </div>

            {userCases.length > 0 ? (
              <select
                value={activeCaseId}
                onChange={(e) => setActiveCaseId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              >
                {userCases.map((c) => (
                  <option key={c.case_id} value={c.case_id}>
                    {c.product_name || 'Ayurvedic Case'} ({c.case_id.substring(0, 10)})
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
              Escalation Status &amp; Confidence
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
                Confidence: {dossier?.confidence_level || 'Medium'} ({Math.round((dossier?.confidence || caseState?.confidence || 0.65) * 100)}%)
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
                  An IP facilitator can now inspect this case dossier in the Facilitator Review Portal.
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
            {loading && !caseState && !dossier ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
                <div className="w-8 h-8 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
                <span className="text-xs font-semibold">Loading authoritative case facts &amp; evidence...</span>
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
                        {dossier?.case_summary || caseState?.product_name || 'Ayurvedic formulation case record.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Dossier ID</span>
                        <span className="font-mono font-bold">{dossier?.dossier_id || 'Pending Submission'}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Created At</span>
                        <span>{dossier?.created_at ? new Date(dossier.created_at).toLocaleString() : new Date().toLocaleString()}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Target Jurisdiction</span>
                        <span className="font-bold">{dossier?.jurisdiction || caseState?.jurisdiction || 'India'} {dossier?.country || caseState?.country ? `(${dossier?.country || caseState?.country})` : ''}</span>
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
                          <div><strong>Product Name:</strong> {dossier?.product_name || caseState?.product_name || 'N/A'}</div>
                          <div><strong>Product Type:</strong> {dossier?.product_type || caseState?.product_type || 'N/A'}</div>
                          <div><strong>Dosage / Form:</strong> {dossier?.dosage_or_form || caseState?.dosage_or_form || 'N/A'}</div>
                          <div><strong>Intended Use:</strong> {dossier?.intended_use || caseState?.intended_use || 'N/A'}</div>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Regulatory Classification</span>
                        <div className="space-y-1">
                          <div><strong>Classification:</strong> <span className="capitalize px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">{dossier?.formulation_classification || caseState?.formulation_classification || 'proprietary'}</span></div>
                          <div><strong>Classical Reference:</strong> {dossier?.classical_reference || caseState?.classical_reference || 'None (Proprietary / New)'}</div>
                          <div><strong>Manufacturing Context:</strong> {dossier?.manufacturing_context || caseState?.manufacturing_context || 'Standard GMP'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Active Ingredients &amp; Sourcing</span>
                      {(dossier?.ingredients && dossier.ingredients.length > 0) || (caseState?.ingredients && caseState.ingredients.length > 0) ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {(dossier?.ingredients || caseState?.ingredients || []).map((ing, iIdx) => (
                            <span key={iIdx} className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-semibold text-xs">
                              🌿 {ing}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">No ingredients specified yet.</p>
                      )}
                      {(dossier?.composition_details || caseState?.composition_details) && (
                        <p className="mt-2 text-slate-700 dark:text-slate-300">
                          <strong>Composition Details:</strong> {dossier?.composition_details || caseState?.composition_details}
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
                        {(dossier?.intellectual_property_objective || caseState?.intellectual_property_objective || ['patent']).map((obj, oIdx) => (
                          <span key={oIdx} className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 font-bold uppercase text-[11px]">
                            💡 {obj}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Novelty &amp; Inventive Step</span>
                        <p className="text-slate-800 dark:text-slate-200">
                          <strong>Novelty Aspect:</strong> {dossier?.novelty_aspect || caseState?.novelty_aspect || 'None specified'}
                        </p>
                        <p className="text-slate-800 dark:text-slate-200">
                          <strong>Technical Improvement:</strong> {dossier?.technical_improvement || caseState?.technical_improvement || 'None specified'}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Experimental Evidence &amp; Disclosure</span>
                        <p className="text-slate-800 dark:text-slate-200">
                          <strong>Experimental Data:</strong> {dossier?.experimental_evidence || caseState?.experimental_evidence || 'Preliminary formulation data recorded'}
                        </p>
                        <div className="pt-1">
                          <strong>Public Disclosure:</strong>{' '}
                          {dossier?.public_disclosure || caseState?.public_disclosure ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">⚠️ Warning: Disclosed prior to filing ({dossier?.public_disclosure_details || caseState?.public_disclosure_details || 'Unspecified'})</span>
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
                          <strong className={dossier?.biological_resources_involved || caseState?.biological_resources_involved ? 'text-amber-600' : 'text-slate-700'}>
                            {dossier?.biological_resources_involved || caseState?.biological_resources_involved ? 'Yes (Indian Origin)' : 'Not Declared'}
                          </strong>
                        </div>
                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-500 block text-[10px]">Traditional Knowledge</span>
                          <strong className={dossier?.traditional_knowledge_involved || caseState?.traditional_knowledge_involved ? 'text-teal-600' : 'text-slate-700'}>
                            {dossier?.traditional_knowledge_involved || caseState?.traditional_knowledge_involved ? 'Yes (Classical AYUSH)' : 'None'}
                          </strong>
                        </div>
                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-500 block text-[10px]">ABS Approval Required</span>
                          <strong className={dossier?.access_and_benefit_sharing || caseState?.access_and_benefit_sharing ? 'text-rose-600' : 'text-emerald-600'}>
                            {dossier?.access_and_benefit_sharing || caseState?.access_and_benefit_sharing ? 'Yes (Form I / Form III)' : 'No'}
                          </strong>
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-amber-50/50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-900">
                        {dossier?.abs_assessment || 'Biological materials sourced from India require National Biodiversity Authority approval (Form I for commercial utilization or Form III prior to patent grant).'}
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

                      {dossier?.prior_art_matches && dossier.prior_art_matches.length > 0 ? (
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
                      {dossier?.citations && dossier.citations.length > 0 ? (
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
                                <span>Authority: {c.authority || 'IPO / Statutory Framework'}</span>
                                <span>Section: {c.section_or_rule || 'Section 3(p)'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                            <strong className="text-emerald-700 dark:text-emerald-400">The Patents Act, 1970 - Section 3(p)</strong>
                            <div className="text-[10px] text-slate-500 flex gap-3">
                              <span>Authority: Indian Patent Office (IPO)</span>
                              <span>Section: Section 3(p) Traditional Knowledge Bar</span>
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                            <strong className="text-emerald-700 dark:text-emerald-400">Biological Diversity Act, 2002 (Amended 2023)</strong>
                            <div className="text-[10px] text-slate-500 flex gap-3">
                              <span>Authority: National Biodiversity Authority (NBA)</span>
                              <span>Section: Section 3 &amp; Section 6 (Form I / III Approval)</span>
                            </div>
                          </div>
                        </div>
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
                        {dossier?.unresolved_questions && dossier.unresolved_questions.length > 0 ? (
                          dossier.unresolved_questions.map((q, qIdx) => (
                            <li key={qIdx}>{q}</li>
                          ))
                        ) : (
                          <>
                            <li>Verify whether biological materials are sourced from Indian territory or imported.</li>
                            <li>Confirm whether synergistic efficacy data overcomes Section 3(e) / 3(p) grounds.</li>
                          </>
                        )}
                      </ul>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Immutable Audit Trail</span>
                      <div className="space-y-1.5 font-mono text-[10px]">
                        {dossier?.audit_log && dossier.audit_log.length > 0 ? (
                          dossier.audit_log.map((log, lIdx) => (
                            <div key={lIdx} className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                              <span><strong>{log.action}</strong>: {log.reason || log.note || 'Recorded event'}</span>
                              <span className="text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}</span>
                            </div>
                          ))
                        ) : (
                          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <span><strong>dossier_draft_initialized</strong>: Case facts synced</span>
                            <span className="text-slate-400">{new Date().toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Safety Disclaimer Banner */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-850 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-[10px] flex items-center gap-2">
                  <span>🛡️</span>
                  <span>
                    <strong>Safety Standard:</strong> Informational case dossier for human IP facilitator review — not an AI legal verdict or determination of patentability.
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

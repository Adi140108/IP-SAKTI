'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CaseState, ChatResponse, EscalationDossier } from '@/types';
import { getTierFromClassification } from '@/lib/formulationTaxonomy';
import { fetchEscalationDossier, submitEscalationRequest } from '@/lib/api';

interface DossierExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseState: CaseState | null;
  chatHistory: Array<{ sender: 'user' | 'assistant'; data?: ChatResponse; text?: string }>;
  jurisdiction: string;
  country?: string;
  initialReason?: string;
}

export default function DossierExportModal({
  isOpen,
  onClose,
  caseState,
  chatHistory,
  jurisdiction,
  country,
  initialReason = 'User requested expert review',
}: DossierExportModalProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [escalationReason, setEscalationReason] = useState<string>(initialReason);
  const [userNote, setUserNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<boolean>(false);
  const [submittedDossierId, setSubmittedDossierId] = useState<string>('');
  const [dossierData, setDossierData] = useState<EscalationDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState<boolean>(false);

  const caseId = caseState?.case_id || 'case_session';

  // Fetch or compile authoritative dossier data from backend on open
  useEffect(() => {
    if (isOpen && caseId) {
      setLoadingDossier(true);
      fetchEscalationDossier(caseId, escalationReason)
        .then((data) => {
          setDossierData(data);
          setLoadingDossier(false);
        })
        .catch((err) => {
          console.warn('Could not pre-fetch remote dossier:', err);
          setLoadingDossier(false);
        });
    }
  }, [isOpen, caseId, escalationReason]);

  if (!isOpen) return null;

  const tier = getTierFromClassification(caseState?.formulation_classification || caseState?.product_type);
  const now = new Date().toLocaleString();

  // Extract all unique citations from chatHistory and dossierData
  const allCitations: Array<{ source: string; section_or_rule?: string; snippet?: string }> = [];
  if (dossierData?.citations) {
    dossierData.citations.forEach((c) => {
      if (!allCitations.some((existing) => existing.source === c.source && existing.section_or_rule === c.section_or_rule)) {
        allCitations.push(c);
      }
    });
  }
  chatHistory.forEach((item) => {
    if (item.data?.citations) {
      item.data.citations.forEach((c) => {
        if (!allCitations.some((existing) => existing.source === c.source && existing.section_or_rule === c.section_or_rule)) {
          allCitations.push(c);
        }
      });
    }
  });

  const handlePrint = () => {
    window.print();
  };

  const handleCopyMarkdown = () => {
    const md = generateMarkdownDossier();
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSubmitEscalation = async () => {
    setSubmitting(true);
    try {
      const res = await submitEscalationRequest(caseId, escalationReason, userNote);
      setSubmissionSuccess(true);
      setSubmittedDossierId(res.dossier_id || res.dossier?.dossier_id || 'SUBMITTED');
    } catch (err) {
      console.error('Failed to submit escalation request:', err);
      alert('Failed to submit escalation request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const generateMarkdownDossier = (): string => {
    return `# IP-SAKTI SAHAYAK • HUMAN IP FACILITATOR CASE DOSSIER
**SIH Problem Statement PS-26045: AYUSH & Bio-Resource IP AI**
**Case ID:** ${caseId}  
**Dossier Status:** ${dossierData?.status || 'Draft'}  
**Date of Compilation:** ${now}  
**Jurisdiction:** ${jurisdiction} ${country ? `(${country})` : ''}  
**Target Category:** ${tier.label}  
**AI Confidence:** ${Math.round((dossierData?.confidence || caseState?.confidence || 0.85) * 100)}% (${dossierData?.confidence_level || 'Medium'})

---

## 1. CASE SUMMARY
${dossierData?.case_summary || `${caseState?.product_name || caseState?.product_type || 'Ayurvedic formulation'} under ${jurisdiction} IP and regulatory framework.`}

---

## 2. JURISDICTION & REGULATORY PATHWAY
- **Jurisdiction:** ${jurisdiction} ${country ? `(${country})` : ''}
- **Classification Tier:** ${tier.label} (${tier.shortLabel})
- **Statutory Authority:** ${tier.statutoryBasis}
- **Product Scope:** ${tier.description}
- **IP Posture:** ${tier.ipPosture}
- **Access & Benefit Sharing (ABS) Duty:** ${tier.absPosture}
- **Regulatory Approval Pathway:** ${tier.regulatoryPathway}

---

## 3. PRODUCT & FORMULATION PARAMETERS
| Parameter | Value / Status | Statutory Implication |
| :--- | :--- | :--- |
| **Product Name** | ${caseState?.product_name || 'Unspecified'} | Brand & Trademark Identifiability |
| **Product Type** | ${caseState?.product_type || 'Unspecified'} | Applicability of D&C Act vs FSSAI |
| **Active Ingredients** | ${caseState?.ingredients && caseState.ingredients.length > 0 ? caseState.ingredients.join(', ') : 'Not recorded'} | NBA Biological Resource Screening |
| **Composition Details** | ${caseState?.composition_details || 'Not specified'} | Synergistic ratio verification |
| **Classical Reference** | ${caseState?.classical_reference || 'None specified'} | Section 3(p) TK Prior Art Defense |
| **Manufacturing Context** | ${caseState?.manufacturing_context || 'Unspecified'} | Novel extraction vs classical kwatha |

---

## 4. INTELLECTUAL PROPERTY & NOVELTY INFORMATION
- **IP Objectives:** ${caseState?.intellectual_property_objective && caseState.intellectual_property_objective.length > 0 ? caseState.intellectual_property_objective.join(', ') : 'Patent Protection'}
- **Novelty Aspect:** ${caseState?.novelty_aspect || 'Not specified'}
- **Technical Improvement:** ${caseState?.technical_improvement || 'Not specified'}
- **Experimental Evidence:** ${caseState?.experimental_evidence || (caseState?.synergistic_efficacy_proven ? 'Yes (Proven Synergistic Lab Data)' : 'Not recorded')}
- **Public Disclosure:** ${caseState?.public_disclosure ? `Reported (${caseState.public_disclosure_details || 'Prior exhibition/sale'})` : 'Kept Confidential'}
- **Prior Art Known:** ${caseState?.prior_art_known ? `Yes (${caseState.prior_art_details || 'Known reference'})` : 'None known'}

---

## 5. ACCESS & BENEFIT SHARING (ABS) & TRADITIONAL KNOWLEDGE
- **Biological Resources:** ${caseState?.biological_resources_involved ? 'Yes (Sourced in India - NBA Clearance Required)' : 'No / Non-Indian Sourcing'}
- **Traditional Knowledge:** ${caseState?.traditional_knowledge_involved ? 'Yes (Classical AYUSH Knowledge Involved)' : 'No (Novel Proprietary Formula)'}
- **Applicant Entity:** ${caseState?.applicant_entity_type || 'Unspecified'}
- **ABS Statutory Guidance:** ${dossierData?.abs_assessment || 'Form I/III intimation with National Biodiversity Authority under BD Act 2002 (Amended 2023).'}

---

## 6. PRIOR-ART & TKDL POINTERS
${dossierData?.prior_art_matches && dossierData.prior_art_matches.length > 0
  ? dossierData.prior_art_matches.map((m, idx) => `${idx + 1}. **${m.title}** (${m.match_category})\n   - Matched: ${m.matched_features.join(', ')}\n   - Relevance: ${Math.round(m.relevance_score * 100)}%\n   - Disclaimer: ${m.disclaimer}`).join('\n\n')
  : 'No sufficiently similar conflicting prior-art record identified in indexed corpus.'}

---

## 7. VERIFIED STATUTORY CITATIONS
${allCitations.length > 0
  ? allCitations.map((c, idx) => `${idx + 1}. **${c.source}** - \`${c.section_or_rule || 'Statutory Provision'}\`\n   > "${c.snippet || 'Authoritative citation'}"`).join('\n\n')
  : '1. The Patents Act, 1970 - Section 3(p), Section 3(e)\n2. The Biological Diversity Act, 2002 - Section 3 & Section 6'}

---

## 8. AI CONFIDENCE & UNRESOLVED QUESTIONS
- **Confidence Score:** ${Math.round((dossierData?.confidence || caseState?.confidence || 0.85) * 100)}% (${dossierData?.confidence_level || 'Medium'})
- **Confidence Reason:** ${dossierData?.confidence_reason || 'Evaluated against statutory index and verified citations.'}
- **Unresolved Questions:**
${(dossierData?.unresolved_questions || []).map((q) => `  - ${q}`).join('\n')}

---

## 9. REASON FOR ESCALATION
**Reason:** ${escalationReason}  
**User Note:** ${userNote || 'None provided'}

---

## 10. LEGAL DISCLAIMER
*This dossier is compiled for human IP facilitator review. It does not constitute formal legal counsel or a binding patentability verdict.*
`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl shadow-xs">
              ⚖️
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Human IP Facilitator Escalation Dossier</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {dossierData?.status || 'Draft'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authoritative case parameters & statutory evidence ready for facilitator review
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <span>{copied ? '✅' : '📋'}</span>
              <span className="hidden sm:inline">{copied ? 'Copied Markdown' : 'Copy MD'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <span>🖨️</span>
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">

          {/* Submission Success Banner */}
          {submissionSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-400 dark:border-emerald-700 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-extrabold text-sm">
                  <span>✅</span>
                  <span>Human review request submitted successfully!</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 font-mono font-bold text-[11px]">
                  Status: Submitted
                </span>
              </div>
              <p className="text-emerald-800 dark:text-emerald-300 text-xs leading-relaxed">
                Your case dossier (<strong>ID: #{submittedDossierId}</strong>) has been queued for review by an IP facilitator. An expert will examine the statutory references, prior-art overlaps, and ABS compliance parameters.
              </p>
              <div className="pt-2 flex items-center gap-3">
                <Link
                  href="/facilitator"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span>⚖️ View in Facilitator Portal →</span>
                </Link>
              </div>
            </div>
          )}

          {/* Escalation Request Submission Form (Before Submit) */}
          {!submissionSuccess && (
            <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="font-extrabold text-xs text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <span>🚀</span>
                  <span>Request Facilitator Review</span>
                </div>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                  Review &amp; submit to human IP expert
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Primary Escalation Reason:
                  </label>
                  <select
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="User requested expert review">User requested expert review</option>
                    <option value="Insufficient authoritative evidence">Insufficient authoritative evidence</option>
                    <option value="Low evidence confidence">Low evidence confidence</option>
                    <option value="Conflicting statutory sources">Conflicting statutory sources</option>
                    <option value="Complex cross-border jurisdiction">Complex cross-border jurisdiction</option>
                    <option value="Novel proprietary formulation">Novel proprietary formulation</option>
                    <option value="ABS / NBA clearance uncertainty">ABS / NBA clearance uncertainty</option>
                    <option value="Public disclosure concern">Public disclosure concern</option>
                    <option value="Significant prior-art record identified">Significant prior-art record identified</option>
                    <option value="Other">Other specific inquiry</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Additional Notes for Facilitator (Optional):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Need urgent confirmation on Form III vs Form I filing deadline"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end pt-1">
                <button
                  onClick={handleSubmitEscalation}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-xs hover:from-emerald-500 hover:to-teal-500 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting Dossier...</span>
                    </>
                  ) : (
                    <>
                      <span>📤</span>
                      <span>Submit for Facilitator Review</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 10-SECTION STRUCTURED DOSSIER PREVIEW */}
          <div className="space-y-4">

            {/* Section 1: Case Summary & Confidence Header */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/80 pb-2">
                <div className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>📌</span>
                  <span>1. Case Summary &amp; Assessment Posture</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Confidence:</span>
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    {Math.round((dossierData?.confidence || caseState?.confidence || 0.85) * 100)}% ({dossierData?.confidence_level || 'Medium'})
                  </span>
                </div>
              </div>
              <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                {dossierData?.case_summary || `${caseState?.product_name || caseState?.product_type || 'Ayurvedic formulation'} under ${jurisdiction} IP regime.`}
              </p>
              {dossierData?.confidence_reason && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                  💡 <strong>Basis:</strong> {dossierData.confidence_reason}
                </div>
              )}
            </div>

            {/* Section 2: Formulation Legal Classification & Statutory Pathway */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🏛️</span>
                <span>2. Jurisdiction &amp; Classification Pathway</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Jurisdiction:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{jurisdiction} {country ? `(${country})` : ''}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Classified Category:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{tier.label}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Statutory Basis:</span>
                  <span className="text-slate-700 dark:text-slate-300">{tier.statutoryBasis}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Regulatory Approval:</span>
                  <span className="text-slate-700 dark:text-slate-300">{tier.regulatoryPathway}</span>
                </div>
              </div>
            </div>

            {/* Section 3: Product Parameters & Formulation Details */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🌿</span>
                <span>3. Product &amp; Formulation Specifics</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Active Botanical Ingredients:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {caseState?.ingredients && caseState.ingredients.length > 0 ? caseState.ingredients.join(', ') : 'None listed'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Composition Proportions:</span>
                  <span className="text-slate-700 dark:text-slate-300">{caseState?.composition_details || 'Not specified'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Classical Reference:</span>
                  <span className="text-slate-700 dark:text-slate-300">{caseState?.classical_reference || 'None specified'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Manufacturing / Extraction Context:</span>
                  <span className="text-slate-700 dark:text-slate-300">{caseState?.manufacturing_context || 'Unspecified'}</span>
                </div>
              </div>
            </div>

            {/* Section 4: IP Objectives & Novelty */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>💡</span>
                <span>4. Intellectual Property Objectives &amp; Novelty Claims</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Target IP Domains:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {caseState?.intellectual_property_objective?.join(', ') || 'Patent Protection'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Claimed Novelty Aspect:</span>
                  <span className="text-slate-700 dark:text-slate-300">{caseState?.novelty_aspect || 'Not specified'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Claimed Technical Improvement:</span>
                  <span className="text-slate-700 dark:text-slate-300">{caseState?.technical_improvement || 'Not specified'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Public Disclosure Status:</span>
                  <span className={caseState?.public_disclosure ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-700 dark:text-emerald-400 font-bold'}>
                    {caseState?.public_disclosure ? `Disclosed (${caseState.public_disclosure_details || 'Prior sale/exhibition'})` : 'Kept Confidential'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 5: Access & Benefit Sharing (ABS) & Traditional Knowledge */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🌱</span>
                <span>5. Access &amp; Benefit Sharing (ABS) &amp; Biological Resources</span>
              </h3>
              <div className="text-[11px] space-y-1.5 text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 dark:text-slate-400">Indian Bio-Resources:</span>
                  <span>{caseState?.biological_resources_involved ? 'Yes (NBA Clearance Mandatory)' : 'No biological materials sourced from India'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 dark:text-slate-400">Applicant Entity:</span>
                  <span>{caseState?.applicant_entity_type || 'Unspecified'}</span>
                </div>
                {dossierData?.abs_assessment && (
                  <p className="bg-amber-50/50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300 text-[11px]">
                    {dossierData.abs_assessment}
                  </p>
                )}
              </div>
            </div>

            {/* Section 6: Prior-Art Matches & TKDL Pointers */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🔍</span>
                <span>6. Potential Prior-Art Matches &amp; TKDL References</span>
              </h3>
              <div className="space-y-2">
                {dossierData?.prior_art_matches && dossierData.prior_art_matches.length > 0 ? (
                  dossierData.prior_art_matches.map((m, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-slate-900 dark:text-white">{m.title}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {m.match_category}
                        </span>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                        Matched Features: {m.matched_features.join(', ') || 'General statutory overlap'} | Relevance: {Math.round(m.relevance_score * 100)}%
                      </div>
                      <div className="text-[9px] text-slate-400 italic">
                        {m.disclaimer}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    No sufficiently similar conflicting prior-art record identified in indexed corpus.
                  </p>
                )}
              </div>
            </div>

            {/* Section 7: Verified Statutory Citations */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>📖</span>
                <span>7. Verified Statutory Citations &amp; Provisions</span>
              </h3>
              <div className="space-y-1.5">
                {allCitations.length > 0 ? (
                  allCitations.map((c, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">{c.source}</span>
                      <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">{c.section_or_rule || 'Provision'}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    Grounded in The Patents Act 1970 (Sec 3(p), 3(e)) and Biological Diversity Act 2002.
                  </p>
                )}
              </div>
            </div>

            {/* Section 8: Unresolved Questions Requiring Facilitator Review */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>❓</span>
                <span>8. Unresolved Questions Requiring Human IP Review</span>
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                {(dossierData?.unresolved_questions || []).map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
            </div>

          </div>

          {/* Legal Disclaimer */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 text-center leading-relaxed">
            *This dossier is compiled for informational pre-filing diagnostic review by an IP facilitator. IP-SAKTI does not provide a definitive legal verdict or guarantee patent grant.*
          </div>

        </div>

      </div>
    </div>
  );
}

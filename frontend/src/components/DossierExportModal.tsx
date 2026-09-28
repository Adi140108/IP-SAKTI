'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CaseState, ChatResponse, EscalationDossier } from '@/types';
import { getTierFromClassification } from '@/lib/formulationTaxonomy';
import { fetchEscalationDossier, submitEscalationRequest } from '@/lib/api';
import { persistDossier } from '@/lib/caseRegistry';
import Dialog from './Dialog';
import {
  FileTextIcon,
  CopyIcon,
  DownloadIcon,
  PrinterIcon,
  CheckIcon,
  ScrollIcon,
  ClipboardIcon,
  PencilIcon,
  stripLeadingGlyphs,
} from './Icons';

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

  const caseId = caseState?.case_id || 'IP-SAKTI-SESSION';

  // Fetch authoritative dossier data from backend on open
  useEffect(() => {
    if (isOpen && caseId && caseId !== 'IP-SAKTI-SESSION') {
      setLoadingDossier(true);
      fetchEscalationDossier(caseId, escalationReason)
        .then((data) => {
          setDossierData(data);
          setLoadingDossier(false);
        })
        .catch(() => {
          setLoadingDossier(false);
        });
    }
  }, [isOpen, caseId, escalationReason]);

  if (!isOpen) return null;

  const tier = getTierFromClassification(caseState?.formulation_classification || caseState?.product_type);
  const now = new Date().toLocaleString();

  // Extract all unique citations from chatHistory
  const allCitations: Array<{ source: string; section_or_rule?: string; snippet?: string }> = [];
  chatHistory.forEach((item) => {
    if (item.data?.citations) {
      item.data.citations.forEach((c) => {
        if (!allCitations.some((existing) => existing.source === c.source && existing.section_or_rule === c.section_or_rule)) {
          allCitations.push(c);
        }
      });
    }
  });

  const generateMarkdownDossier = (): string => {
    return `# IP-SAKTI SAHAYAK • AYURVEDIC IP PRE-FILING DIAGNOSTIC DOSSIER
**SIH Problem Statement PS-26045: AYUSH & Bio-Resource IP AI**
**Case ID:** ${caseId}
**Date of Generation:** ${now}
**Jurisdiction:** ${jurisdiction} ${country ? `(${country})` : ''}
**Target Category:** ${tier.label}

---

## 1. FORMULATION CLASSIFICATION & LEGAL REGIME
- **Classification Tier:** ${tier.label} (${tier.shortLabel})
- **Statutory Authority:** ${tier.statutoryBasis}
- **Product Scope:** ${tier.description}
- **IP Posture:** ${tier.ipPosture}
- **Access & Benefit Sharing (ABS) Duty:** ${tier.absPosture}
- **Regulatory Approval Pathway:** ${tier.regulatoryPathway}

---

## 2. CASE STATE & PARAMETER ASSESSMENT
| Parameter | Value / Status | Statutory Implication |
| :--- | :--- | :--- |
| **Jurisdiction** | ${jurisdiction} ${country ? `(${country})` : ''} | Determines national vs international treaty compliance. |
| **Product Type** | ${caseState?.product_type || 'Unspecified'} | Governs applicability of Drugs & Cosmetics Act vs FSSAI. |
| **Classical Reference (TK)** | ${caseState?.classical_reference || 'None specified'} | Prior art reference under First Schedule of D&C Act. |
| **Active Herbal Ingredients** | ${caseState?.ingredients && caseState.ingredients.length > 0 ? caseState.ingredients.join(', ') : 'Not recorded'} | Source of biological material requiring NBA screening. |
| **Traditional Knowledge (TK)** | ${caseState?.traditional_knowledge_involved ? 'Yes (Classical Prior Art)' : 'No (Novel Formula)'} | Section 3(p) of Patents Act & TKDL protection. |
| **Indian Bio-Resources (ABS)** | ${caseState?.biological_resources_involved ? 'Yes (NBA Clearance Required)' : 'No / Exempt'} | Section 3 & 6 of Biological Diversity Act, 2002. |

---

## 3. STATUTORY EVIDENCE & VERIFIED CITATIONS
${
  allCitations.length > 0
    ? allCitations
        .map(
          (c, idx) =>
            `${idx + 1}. **${c.source}** - \`${c.section_or_rule || 'Statutory Provision'}\`\n   > "${c.snippet || 'Authoritative legal citation'}"`
        )
        .join('\n\n')
    : '1. **The Patents Act, 1970 (India)** - `Section 3(p), Section 3(e)`\n2. **The Biological Diversity Act, 2002 (as amended 2023)** - `Section 6(1)`\n3. **The Drugs and Cosmetics Act, 1940** - `Section 3(h), First Schedule`'
}

---

## 4. PRE-FILING ACTIONABLE ROADMAP
1. **Prior Art Search:** Conduct an exhaustive search against the Traditional Knowledge Digital Library (TKDL) and Indian Patent Office database to identify non-patentable classical combinations under Section 3(p).
2. **Experimental Data Dossier:** If applying under Section 3(h) (Patent & Proprietary), prepare comparative experimental data demonstrating unexpected synergistic therapeutic efficacy over individual ingredients.
3. **NBA Clearance (Form III):** If biological resources sourced from India are used, submit NBA Form III before the patent application is granted.
4. **Trademark & Design Registration:** File Form TM-A with the Trade Marks Registry for distinctive branding and register unique packaging under the Designs Act, 2000.
5. **Manufacturing License:** Submit Form 25D (AYUSH SLA) or FoSCoS Form B (Ayurveda Aahar) depending on classification.

---

## 5. STATUTORY DISCLAIMER
*This dossier is automatically compiled by IP-SAKTI Sahayak (SIH PS-26045) for informational, pre-filing diagnostic purposes. It is grounded in version-tracked statutes and public treaties but does not constitute formal legal counsel or create an attorney-client relationship.*
`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateMarkdownDossier());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const content = generateMarkdownDossier();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `IP-SAKTI-Dossier-${caseId}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSubmitEscalation = async () => {
    if (!caseState) {
      alert('No active case found. Please start a consultation first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitEscalationRequest(caseId, escalationReason, userNote);
      setSubmissionSuccess(true);
      const returnedDossier = res.dossier || dossierData || {
        dossier_id: res.dossier_id || `dos_${Date.now().toString(36)}`,
        case_id: caseId,
        product_name: caseState?.product_name || caseState?.product_type || 'Ayurvedic Case',
        product_type: caseState?.product_type || 'Formulation',
        formulation_classification: caseState?.formulation_classification || 'proprietary',
        ingredients: caseState?.ingredients || [],
        jurisdiction: jurisdiction,
        country: country,
        escalation_reason: escalationReason,
        user_note: userNote,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      persistDossier(returnedDossier);
      setSubmittedDossierId(res.dossier_id || res.dossier?.dossier_id || 'SUBMITTED');
    } catch {
      alert('Failed to submit escalation request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      printable
      icon={<FileTextIcon size={16} />}
      title="Ayurvedic IP Diagnostic Dossier"
      description={`Official SIH PS-26045 Pre-Filing Diagnostic Dossier • Case #${caseId}`}
      headerActions={
        <>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink transition-colors hover:bg-subtle"
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            {copied ? 'Copied' : 'Copy MD'}
          </button>
          <button
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink transition-colors hover:bg-subtle"
          >
            <DownloadIcon size={12} />
            Download .md
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            <PrinterIcon size={12} />
            Print / PDF
          </button>
        </>
      }
    >
      <div className="space-y-6 text-[12px] leading-relaxed print:bg-white print:text-black">
        {/* Dossier Title Box */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-4 print:border-black">
          <div className="space-y-1">
            <span className="eyebrow">SIH Problem Statement PS-26045 • Official Output</span>
            <h1 className="font-display text-[21px] leading-snug text-ink print:text-black">
              Ayurvedic IP &amp; Regulatory Pre-Filing Dossier
            </h1>
            <div className="mono-caps text-faint">
              Case ID: <span className="font-medium text-accent-ink">{caseId}</span> • Regime:{' '}
              {jurisdiction} • Date: {now}
            </div>
          </div>
          <span className="chip chip-accent">{stripLeadingGlyphs(tier.badge)}</span>
        </div>

        {/* Section 1: Classification & Legal Pathway */}
        <section className="panel-sunken space-y-3 p-4 print:border-gray-300 print:bg-white">
          <h2 className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink print:text-black">
            <ScrollIcon size={13} className="text-accent" />
            1. Formulation Legal Classification &amp; Statutory Pathway
          </h2>
          <div className="grid grid-cols-1 gap-3 text-[11.5px] md:grid-cols-2">
            <Field label="Classified Category" value={tier.label} emphasis />
            <Field label="Statutory Basis" value={tier.statutoryBasis} />
            <div className="md:col-span-2">
              <Field label="Intellectual Property Posture" value={tier.ipPosture} />
            </div>
            <Field label="ABS & Biodiversity Duty" value={tier.absPosture} />
            <Field label="Manufacturing & Regulatory" value={tier.regulatoryPathway} />
          </div>
        </section>

        {/* Section 2: Case State Parameters Matrix */}
        <section className="space-y-2">
          <h2 className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink print:text-black">
            <ClipboardIcon size={13} className="text-accent" />
            2. Gathered Innovation Parameters
          </h2>
          <div className="overflow-hidden rounded-md border border-line print:border-gray-300">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-sunken text-muted print:bg-gray-100">
                <tr className="border-b border-line print:border-gray-300">
                  <th className="p-2.5 font-medium">Parameter</th>
                  <th className="p-2.5 font-medium">Recorded Value</th>
                  <th className="p-2.5 font-medium">Statutory Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle print:divide-gray-200">
                <tr>
                  <td className="p-2.5 font-medium text-ink print:text-black">
                    Active Herbal Ingredients
                  </td>
                  <td className="p-2.5 text-accent-ink">
                    {caseState?.ingredients && caseState.ingredients.length > 0
                      ? caseState.ingredients.join(', ')
                      : 'Not specified'}
                  </td>
                  <td className="p-2.5 text-muted">
                    National Biodiversity Act Biological Resource Check
                  </td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-ink print:text-black">Classical Text Basis</td>
                  <td className="p-2.5 text-ink print:text-black">
                    {caseState?.classical_reference || 'None specified'}
                  </td>
                  <td className="p-2.5 text-muted">
                    Section 3(p) TK Prior Art Bar &amp; TKDL Defense
                  </td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-ink print:text-black">
                    Traditional Knowledge Involved
                  </td>
                  <td className="p-2.5 text-ink print:text-black">
                    {caseState?.traditional_knowledge_involved ? 'Yes (Prior Art)' : 'No (Novel Formula)'}
                  </td>
                  <td className="p-2.5 text-muted">
                    WIPO GRATK Treaty (2024) Mandatory Disclosure
                  </td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-ink print:text-black">
                    Indian Bio-Resources (ABS)
                  </td>
                  <td className="p-2.5 text-ink print:text-black">
                    {caseState?.biological_resources_involved ? 'Yes (NBA Clearance)' : 'No Indian Bio'}
                  </td>
                  <td className="p-2.5 text-muted">
                    NBA Form I &amp; Form III Approval prior to patent grant
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: Verified Statutory Citations */}
        <section className="space-y-2">
          <h2 className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink print:text-black">
            <ScrollIcon size={13} className="text-accent" />
            3. Authoritative Statutory Citations
          </h2>
          <div className="space-y-2">
            {allCitations.length > 0 ? (
              allCitations.map((c, idx) => (
                <div key={idx} className="panel-sunken space-y-1 p-2.5 print:border-gray-300 print:bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink print:text-black">{c.source}</span>
                    <span className="mono-caps text-accent-ink">
                      {c.section_or_rule || 'Statute Section'}
                    </span>
                  </div>
                  {c.snippet && (
                    <p className="border-l-2 border-line-strong pl-2 text-muted italic print:border-gray-400 print:text-gray-700">
                      &ldquo;{c.snippet}&rdquo;
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="panel-sunken p-2.5 text-faint italic print:border-gray-300 print:bg-white print:text-gray-700">
                Statutory provisions cited: The Patents Act 1970 (Sec 3(p), 3(e)), Biological
                Diversity Act 2002/2023, Drugs &amp; Cosmetics Act 1940 (Sec 3(h)), WIPO GRATK Treaty
                2024.
              </p>
            )}
          </div>
        </section>

        {/* Section 4: Required Official Forms */}
        <section className="space-y-2">
          <h2 className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink print:text-black">
            <PencilIcon size={13} className="text-accent" />
            4. Required Statutory Filing Forms
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {tier.formsRequired.map((f, idx) => (
              <span key={idx} className="mono-caps rounded border border-line bg-sunken px-2 py-0.5 text-ink print:border-gray-300 print:bg-gray-100 print:text-black">
                {f}
              </span>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ESCALATE TO HUMAN IP FACILITATOR — screen-only, never printed          */}
        {/* ========================================================================= */}
        <section className="print:hidden space-y-3 border-t border-line pt-5">
          <h2 className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
            <ScrollIcon size={13} className="text-accent" />
            Escalate to a Human IP Facilitator
          </h2>

          {submissionSuccess ? (
            <div className="panel-sunken space-y-2.5 p-4">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-ok">
                <CheckIcon size={14} />
                Escalation request submitted successfully.
              </div>
              <p className="text-[11.5px] leading-relaxed text-muted">
                Your dossier reference is{' '}
                <span className="mono-caps text-ink">{submittedDossierId}</span>. A human IP
                facilitator will review this case and follow up. You can track the review status from
                the Escalation or Facilitator portal.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href="/escalation"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11.5px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
                >
                  View Escalation Tracker
                </Link>
                <button
                  onClick={() => {
                    setSubmissionSuccess(false);
                    setUserNote('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[11.5px] font-medium text-ink transition-colors hover:bg-subtle"
                >
                  Submit Another Request
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="escalation-reason" className="eyebrow">
                  Reason for Escalation
                </label>
                <input
                  id="escalation-reason"
                  type="text"
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-ink"
                  placeholder="e.g. Potential Sec 3(p) TK conflict requires human review"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="escalation-note" className="eyebrow">
                  Additional Context (optional)
                </label>
                <textarea
                  id="escalation-note"
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-line bg-surface px-2.5 py-1.5 text-ink"
                  placeholder="Share any details the facilitator should know — prior art concerns, TK holders, filing deadlines, etc."
                />
              </div>

              {loadingDossier && (
                <p className="text-[11.5px] text-faint">Compiling authoritative dossier data…</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSubmitEscalation}
                  disabled={submitting || loadingDossier || !caseState}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[12px] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit Escalation Request'}
                </button>
                {!caseState && (
                  <span className="text-[11px] text-faint">
                    Start a consultation to enable escalation.
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Footnote Disclaimer */}
        <p className="border-t border-line pt-4 text-center text-[10px] text-faint print:border-gray-300">
          Generated by IP-SAKTI Sahayak AI Engine • SIH Problem Statement PS-26045 • Compliant with
          Digital Personal Data Protection (DPDP) Act 2023.
        </p>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <span className="eyebrow block">{label}</span>
      <span
        className={`mt-0.5 block ${
          emphasis ? 'font-medium text-ink print:text-black' : 'text-muted print:text-gray-700'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

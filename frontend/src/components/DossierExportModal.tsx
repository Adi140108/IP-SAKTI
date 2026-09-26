'use client';

import React, { useState } from 'react';
import { CaseState, ChatResponse } from '@/types';
import { getTierFromClassification } from '@/lib/formulationTaxonomy';

interface DossierExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseState: CaseState | null;
  chatHistory: Array<{ sender: 'user' | 'assistant'; data?: ChatResponse; text?: string }>;
  jurisdiction: string;
  country?: string;
}

export default function DossierExportModal({
  isOpen,
  onClose,
  caseState,
  chatHistory,
  jurisdiction,
  country,
}: DossierExportModalProps) {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const tier = getTierFromClassification(caseState?.formulation_classification || caseState?.product_type);
  const now = new Date().toLocaleString();
  const caseId = caseState?.case_id || 'IP-SAKTI-SESSION';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn print:p-0 print:bg-white">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden print:border-none print:shadow-none print:max-h-none print:w-full">
        
        {/* Header (Hidden on Print) */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xl font-bold border border-emerald-300 dark:border-emerald-800">
              📄
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Ayurvedic IP Diagnostic Dossier
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official SIH PS-26045 Pre-Filing Diagnostic Dossier • Case #{caseId}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:border-emerald-500 transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>{copied ? '✓ Copied!' : '📋 Copy MD'}</span>
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="px-3 py-1.5 rounded-xl bg-slate-800 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>⬇ Download .md</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white dark:text-slate-950 text-xs font-extrabold hover:bg-emerald-400 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
            >
              <span>🖨 Print / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-sm cursor-pointer ml-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Preview Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-slate-800 dark:text-slate-200 text-xs leading-relaxed bg-white dark:bg-slate-900 font-sans print:p-0 print:text-black">
          
          {/* Dossier Title Box */}
          <div className="border-b-2 border-emerald-500 pb-4 flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                SIH Problem Statement PS-26045 • Official Output
              </span>
              <h1 className="text-xl font-black text-slate-900 dark:text-white print:text-black">
                Ayurvedic IP & Regulatory Pre-Filing Dossier
              </h1>
              <div className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">
                Case ID: <span className="font-bold text-emerald-700 dark:text-emerald-400">{caseId}</span> • Regime: {jurisdiction} • Date: {now}
              </div>
            </div>
            <div className="text-right">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                {tier.badge}
              </span>
            </div>
          </div>

          {/* Section 1: Classification & Legal Pathway */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white print:text-black flex items-center gap-1.5">
              <span>🏛️</span> 1. Formulation Legal Classification & Statutory Pathway
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="font-bold text-slate-500 dark:text-slate-400 block">Classified Category:</span>
                <span className="font-extrabold text-slate-900 dark:text-white">{tier.label}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 dark:text-slate-400 block">Statutory Basis:</span>
                <span className="text-slate-700 dark:text-slate-300">{tier.statutoryBasis}</span>
              </div>
              <div className="md:col-span-2">
                <span className="font-bold text-slate-500 dark:text-slate-400 block">Intellectual Property Posture:</span>
                <span className="text-slate-700 dark:text-slate-300">{tier.ipPosture}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 dark:text-slate-400 block">ABS & Biodiversity Duty:</span>
                <span className="text-slate-700 dark:text-slate-300">{tier.absPosture}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 dark:text-slate-400 block">Manufacturing & Regulatory:</span>
                <span className="text-slate-700 dark:text-slate-300">{tier.regulatoryPathway}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Case State Parameters Matrix */}
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white print:text-black flex items-center gap-1.5">
              <span>📋</span> 2. Gathered Innovation Parameters
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5">Parameter</th>
                    <th className="p-2.5">Recorded Value</th>
                    <th className="p-2.5">Statutory Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">Active Herbal Ingredients</td>
                    <td className="p-2.5 text-emerald-700 dark:text-emerald-400 font-medium">
                      {caseState?.ingredients && caseState.ingredients.length > 0 ? caseState.ingredients.join(', ') : 'Not specified'}
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">National Biodiversity Act Biological Resource Check</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">Classical Text Basis</td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300">
                      {caseState?.classical_reference || 'None specified'}
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">Section 3(p) TK Prior Art Bar & TKDL Defense</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">Traditional Knowledge Involved</td>
                    <td className="p-2.5 font-medium text-slate-700 dark:text-slate-300">
                      {caseState?.traditional_knowledge_involved ? 'Yes (Prior Art)' : 'No (Novel Formula)'}
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">WIPO GRATK Treaty (2024) Mandatory Disclosure</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">Indian Bio-Resources (ABS)</td>
                    <td className="p-2.5 font-medium text-slate-700 dark:text-slate-300">
                      {caseState?.biological_resources_involved ? 'Yes (NBA Clearance)' : 'No Indian Bio'}
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">NBA Form I & Form III Approval prior to patent grant</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Verified Statutory Citations */}
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white print:text-black flex items-center gap-1.5">
              <span>📖</span> 3. Authoritative Statutory Citations
            </h3>
            <div className="space-y-2">
              {allCitations.length > 0 ? (
                allCitations.map((c, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-900 dark:text-white">{c.source}</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-mono text-[10px]">{c.section_or_rule || 'Statute Section'}</span>
                    </div>
                    {c.snippet && <div className="text-slate-600 dark:text-slate-400 italic">"{c.snippet}"</div>}
                  </div>
                ))
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 italic">
                  Statutory provisions cited: The Patents Act 1970 (Sec 3(p), 3(e)), Biological Diversity Act 2002/2023, Drugs & Cosmetics Act 1940 (Sec 3(h)), WIPO GRATK Treaty 2024.
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Required Official Forms */}
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white print:text-black flex items-center gap-1.5">
              <span>📝</span> 4. Required Statutory Filing Forms
            </h3>
            <div className="flex flex-wrap gap-2">
              {tier.formsRequired.map((f, idx) => (
                <span key={idx} className="px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-mono font-bold text-[11px]">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Footnote Disclaimer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 text-center">
            Generated by IP-SAKTI Sahayak AI Engine • SIH Problem Statement PS-26045 • Compliant with Digital Personal Data Protection (DPDP) Act 2023.
          </div>
        </div>
      </div>
    </div>
  );
}

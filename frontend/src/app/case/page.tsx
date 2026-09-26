'use client';

import { useState, useEffect } from 'react';
import { getCase, updateCase } from '@/lib/api';
import { CaseState } from '@/types';
import { FORMULATION_TIERS, getTierFromClassification } from '@/lib/formulationTaxonomy';
import FormulationPathwayModal from '@/components/FormulationPathwayModal';
import OfficialFormsModal from '@/components/OfficialFormsModal';
import DossierExportModal from '@/components/DossierExportModal';

export default function CaseWorkspacePage() {
  const [caseIdInput, setCaseIdInput] = useState<string>('');
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [localHistory, setLocalHistory] = useState<any[]>([]);

  // Modals state
  const [showPathwayModal, setShowPathwayModal] = useState<boolean>(false);
  const [showFormsModal, setShowFormsModal] = useState<boolean>(false);
  const [showDossierModal, setShowDossierModal] = useState<boolean>(false);

  useEffect(() => {
    const savedCaseId = localStorage.getItem('ip_sakti_active_case_id');
    const savedHistory = localStorage.getItem('ip_sakti_chat_history');

    if (savedHistory) {
      try {
        setLocalHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error(e);
      }
    }

    if (savedCaseId) {
      setCaseIdInput(savedCaseId);
      handleFetchCase(savedCaseId);
    }
  }, []);

  const handleFetchCase = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCase(id);
      setCaseState(data);
    } catch (err) {
      setError('Case ID not found in Firestore / Local DB repository.');
      setCaseState(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateClassification = async (tierId: string) => {
    if (!caseState?.case_id) return;
    try {
      const updated = await updateCase(caseState.case_id, {
        formulation_classification: tierId,
        product_type: FORMULATION_TIERS[tierId]?.shortLabel || tierId,
      });
      setCaseState(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const getEffectiveRecords = () => {
    if (localHistory && localHistory.length > 0) {
      return localHistory;
    }
    if (caseState && caseState.conversation_history && caseState.conversation_history.length > 0) {
      return caseState.conversation_history;
    }
    return [];
  };

  const effectiveRecords = getEffectiveRecords();
  const activeTier = getTierFromClassification(caseState?.formulation_classification || caseState?.product_type);

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-10">
      
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Case State Workspace</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Persisted state parameters, 6-tier formulation classification, and official pre-filing dossier.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowPathwayModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <span>⚖️ 6-Tier Pathway</span>
          </button>

          <button
            onClick={() => setShowFormsModal(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:text-emerald-600 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <span>🏛️ Official Forms</span>
          </button>

          {caseState && (
            <button
              onClick={() => setShowDossierModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white dark:text-slate-950 text-xs font-extrabold hover:from-emerald-400 hover:to-teal-500 transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
            >
              <span>📄 Export Dossier</span>
            </button>
          )}

          <div className="flex items-center gap-2 pl-2">
            <input
              type="text"
              placeholder="Enter Case ID..."
              value={caseIdInput}
              onChange={(e) => setCaseIdInput(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
            />
            <button
              onClick={() => handleFetchCase(caseIdInput)}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-white dark:text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-all shadow-xs cursor-pointer"
            >
              Load Case
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="text-slate-600 dark:text-slate-400 text-sm">Loading Case State...</div>}
      {error && <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs">{error}</div>}

      {!caseState && !loading && (
        <div className="glass-panel p-12 text-center text-slate-500 dark:text-slate-400 space-y-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-4xl">📁</div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-300">No Case Loaded</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Start a chat session to create an active case or load an existing Case ID above.
          </p>
        </div>
      )}

      {caseState && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Main Context Card */}
            <div className="md:col-span-2 glass-panel p-6 space-y-6 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Case ID</span>
                  <div className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400">{caseState.case_id}</div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-xs font-bold uppercase">
                  Stage: {caseState.conversation_stage}
                </span>
              </div>

              {/* 6-Tier Formulation Card */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                    <span>🏛️</span> 6-Tier Legal Formulation Category
                  </span>
                  <button
                    onClick={() => setShowPathwayModal(true)}
                    className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    Change Category ➔
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                    {activeTier.label}
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    {activeTier.badge}
                  </span>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong>IP Posture:</strong> {activeTier.ipPosture}
                </p>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong>ABS & Regulatory:</strong> {activeTier.absPosture} • {activeTier.regulatoryPathway}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px]">Jurisdiction</span>
                  <div className="font-bold text-slate-800 dark:text-slate-200">{caseState.jurisdiction} {caseState.country ? `(${caseState.country})` : ''}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px]">Active Herbal Ingredients</span>
                  <div className="font-bold text-emerald-700 dark:text-emerald-400 truncate">
                    {caseState.ingredients && caseState.ingredients.length > 0 ? caseState.ingredients.join(', ') : 'Not specified'}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">Known Case Parameters:</h4>
                <div className="space-y-1.5">
                  {caseState.known_information && caseState.known_information.length > 0 ? (
                    caseState.known_information.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-800/80">
                        ✓ {item}
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 dark:text-slate-400 italic">No specific known information parameters recorded yet.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Missing Information Tracker Card */}
            <div className="glass-panel p-6 space-y-4 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <span>📋</span> Parameter Tracking
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Current parameter status tracked across questioning turns:
              </p>

              <div className="space-y-2 pt-2">
                {caseState.missing_information && caseState.missing_information.length > 0 ? (
                  caseState.missing_information.map((field) => (
                    <div key={field} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/40 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                      <span className="font-semibold uppercase text-[11px]">• {field.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-amber-800 dark:text-amber-400 font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950">Needed</span>
                    </div>
                  ))
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800/40 text-xs text-emerald-800 dark:text-emerald-300 font-bold">
                    ✓ All core case parameters fully satisfied!
                  </div>
                )}
              </div>

              {/* One-Click Action in Sidebar */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setShowDossierModal(true)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white dark:text-slate-950 text-xs font-extrabold hover:from-emerald-400 hover:to-teal-500 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span>📄 Generate Pre-Filing Dossier</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          </div>

          {/* FULL QUESTIONING & CONSULTATION HISTORY LOG */}
          <div className="glass-panel p-6 space-y-4 border-t-4 border-emerald-500 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>💬</span> Questioning Records & Consultation Transcript ({effectiveRecords.length})
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Case #{caseState.case_id}
              </span>
            </div>

            {effectiveRecords.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {effectiveRecords.map((item: any, idx: number) => {
                  const isUser = item.sender === 'user' || item.user_message;
                  const textContent = item.text || item.user_message || item.data?.answer || item.assistant_answer || item.question;
                  const questionAsked = item.data?.next_question || item.next_question || item.question;

                  return (
                    <div key={idx} className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-2 ${
                      isUser && item.user_message
                        ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                        : isUser
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300'
                    }`}>
                      <div className="flex items-center justify-between font-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <span>{isUser ? '👤 User Input / Answer' : '⚖️ IP-SAKTI Legal Response'}</span>
                        {item.timestamp && <span className="font-mono text-[9px]">{new Date(item.timestamp).toLocaleTimeString()}</span>}
                      </div>

                      {item.user_message && (
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 font-medium">
                          👤 {item.user_message}
                        </div>
                      )}

                      {item.assistant_answer && (
                        <div className="whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-200">
                          {item.assistant_answer}
                        </div>
                      )}

                      {!item.user_message && !item.assistant_answer && (
                        <div className="whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-200">
                          {textContent}
                        </div>
                      )}

                      {questionAsked && (
                        <div className="p-2 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5">
                          <span>❓</span>
                          <span>Target Question Asked: {questionAsked}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 text-center">
                No previous questioning records stored for this case session yet. Submit a message in AI Chat to start recording.
              </div>
            )}
          </div>
        </div>
      )}

      {/* POPUP MODALS */}
      <FormulationPathwayModal
        isOpen={showPathwayModal}
        onClose={() => setShowPathwayModal(false)}
        activeClassification={caseState?.formulation_classification || 'classical'}
        onSelectClassification={handleUpdateClassification}
      />

      <OfficialFormsModal
        isOpen={showFormsModal}
        onClose={() => setShowFormsModal(false)}
      />

      <DossierExportModal
        isOpen={showDossierModal}
        onClose={() => setShowDossierModal(false)}
        caseState={caseState}
        chatHistory={effectiveRecords}
        jurisdiction={caseState?.jurisdiction || 'India'}
        country={caseState?.country || undefined}
      />
    </div>
  );
}

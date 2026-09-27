'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCase, updateCase, listCases } from '@/lib/api';
import { CaseState, ConversationHistoryItem, ChatResponse } from '@/types';
import { FORMULATION_TIERS, getTierFromClassification } from '@/lib/formulationTaxonomy';
import FormulationPathwayModal from '@/components/FormulationPathwayModal';
import OfficialFormsModal from '@/components/OfficialFormsModal';
import DossierExportModal from '@/components/DossierExportModal';
import { useAuth } from '@/components/AuthProvider';

interface ExtendedHistoryItem extends ConversationHistoryItem {
  user_message?: string;
  assistant_answer?: string;
  question?: string;
  next_question?: string;
}

export default function CaseWorkspacePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [caseIdInput, setCaseIdInput] = useState<string>('');
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [localHistory, setLocalHistory] = useState<ExtendedHistoryItem[]>([]);

  // List of all user cases
  const [savedCases, setSavedCases] = useState<CaseState[]>([]);
  const [loadingCasesList, setLoadingCasesList] = useState<boolean>(false);

  // Modals state
  const [showPathwayModal, setShowPathwayModal] = useState<boolean>(false);
  const [showFormsModal, setShowFormsModal] = useState<boolean>(false);
  const [showDossierModal, setShowDossierModal] = useState<boolean>(false);

  const fetchUserCases = useCallback(async () => {
    setLoadingCasesList(true);
    try {
      const cases = await listCases(user?.uid || undefined);
      setSavedCases(cases);
    } catch (e) {
      console.error('Failed to list user cases:', e);
    } finally {
      setLoadingCasesList(false);
    }
  }, [user]);

  const handleFetchCase = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCase(id);
      setCaseState(data);
    } catch {
      setError('Case ID not found in Firestore / Local DB repository.');
      setCaseState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserCases();
  }, [fetchUserCases]);

  useEffect(() => {
    const timer = setTimeout(() => {
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
    }, 0);

    return () => clearTimeout(timer);
  }, [handleFetchCase]);

  const handleContinueChatting = (targetCase: CaseState) => {
    // Set active case ID in localStorage
    localStorage.setItem('ip_sakti_active_case_id', targetCase.case_id);

    // If conversation history exists on the case object, restore it for chat
    if (targetCase.conversation_history && targetCase.conversation_history.length > 0) {
      const restoredChat: Array<{ sender: 'user' | 'assistant'; text?: string; data?: ChatResponse }> = [];
      targetCase.conversation_history.forEach((h, idx) => {
        if (h.user_message) {
          restoredChat.push({ sender: 'user', text: h.user_message });
        } else if (h.sender === 'user') {
          restoredChat.push({ sender: 'user', text: h.text || h.content || '' });
        }

        if (h.assistant_answer || h.sender === 'assistant') {
          const assistantData: ChatResponse = h.data || {
            case_id: targetCase.case_id,
            message_id: `restored_msg_${idx}`,
            answer: h.assistant_answer || h.text || h.content || '',
            jurisdiction: targetCase.jurisdiction || 'India',
            country: targetCase.country,
            relevant_ip_domains: targetCase.intellectual_property_objective || ['patent'],
            product_classification: targetCase.formulation_classification || 'unknown',
            citations: h.citations || [],
            confidence_score: targetCase.confidence || 0.85,
            confidence_explanation: 'Loaded from previous consultation record.',
            next_question: h.next_question || undefined,
            suggested_options: h.suggested_options || undefined,
            safe_abstention: false,
            requires_human_escalation: false
          };
          restoredChat.push({ sender: 'assistant', data: assistantData });
        }
      });
      localStorage.setItem('ip_sakti_chat_history', JSON.stringify(restoredChat));
    }

    // Navigate to /chat
    router.push('/chat');
  };

  const handleUpdateClassification = async (tierId: string) => {
    if (!caseState?.case_id) return;
    try {
      const updated = await updateCase(caseState.case_id, {
        formulation_classification: tierId,
        product_type: FORMULATION_TIERS[tierId]?.shortLabel || tierId,
      });
      setCaseState(updated);
      fetchUserCases();
    } catch (e) {
      console.error(e);
    }
  };

  const getEffectiveRecords = (): ExtendedHistoryItem[] => {
    if (localHistory && localHistory.length > 0) {
      return localHistory;
    }
    if (caseState && caseState.conversation_history && caseState.conversation_history.length > 0) {
      return caseState.conversation_history as ExtendedHistoryItem[];
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
            Persisted state parameters, 6-tier formulation classification, previous sessions, and official pre-filing dossier.
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

      {/* ========================================================================= */}
      {/* SAVED PREVIOUS CASES SECTION */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📁</span>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              {user ? `Saved Consultations (${savedCases.length})` : 'Recent Consultation Cases'}
            </h2>
          </div>
          {!user && (
            <Link
              href="/auth?redirect=/case"
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
            >
              Sign In to save cases to your account →
            </Link>
          )}
        </div>

        {loadingCasesList ? (
          <div className="text-xs text-slate-500 flex items-center gap-2 p-4">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            <span>Loading previous cases...</span>
          </div>
        ) : savedCases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedCases.map((c) => {
              const tier = getTierFromClassification(c.formulation_classification || c.product_type);
              const isCurrent = caseState?.case_id === c.case_id;

              return (
                <div
                  key={c.case_id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2.5 ${
                    isCurrent
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-xs'
                      : 'glass-panel bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        #{c.case_id}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : 'Active'}
                      </span>
                    </div>

                    <div className="font-semibold text-xs text-emerald-800 dark:text-emerald-300">
                      {tier.shortLabel || tier.label}
                    </div>

                    <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <span>{c.jurisdiction === 'International' ? '🌐' : '🇮🇳'} {c.jurisdiction} {c.country ? `(${c.country})` : ''}</span>
                      <span>•</span>
                      <span>{c.language.toUpperCase()}</span>
                    </div>

                    {c.ingredients && c.ingredients.length > 0 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        🌿 {c.ingredients.slice(0, 3).join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setCaseIdInput(c.case_id);
                        handleFetchCase(c.case_id);
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer text-center"
                    >
                      Inspect
                    </button>
                    <button
                      onClick={() => handleContinueChatting(c)}
                      className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white dark:text-slate-950 text-xs font-bold transition-all shadow-xs cursor-pointer text-center"
                    >
                      💬 Chat ➔
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
            No saved consultations found. Start a consultation in <Link href="/chat" className="text-emerald-600 font-bold hover:underline">AI Chat</Link> to create your first case.
          </div>
        )}
      </div>

      {loading && <div className="text-slate-600 dark:text-slate-400 text-sm">Loading Case State...</div>}
      {error && <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs">{error}</div>}

      {!caseState && !loading && (
        <div className="glass-panel p-10 text-center text-slate-500 dark:text-slate-400 space-y-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-4xl">📂</div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-300">Select or Load a Case</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Choose a case from your saved consultations above, enter a Case ID, or start a new consultation session in AI Chat.
          </p>
          <div className="pt-2">
            <Link
              href="/chat"
              className="inline-flex px-4 py-2 rounded-xl bg-emerald-500 text-white dark:text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-all shadow-xs"
            >
              ➕ Start New AI Consultation
            </Link>
          </div>
        </div>
      )}

      {caseState && (
        <div className="space-y-6">

          {/* ACTIVE CASE QUICK ACTIONS BANNER */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-slate-900/10 dark:from-emerald-950/60 dark:via-teal-950/40 dark:to-slate-900 border border-emerald-400/40 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white dark:text-slate-950 flex items-center justify-center text-xl font-bold shadow-xs">
                ⚖️
              </div>
              <div>
                <div className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Active Consultation: Case #{caseState.case_id}</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 text-[10px] font-bold border border-emerald-300 dark:border-emerald-800">
                    {activeTier.shortLabel || activeTier.label}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Ready to continue interactive questioning and statutory RAG citations in AI Chat.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleContinueChatting(caseState)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white dark:text-slate-950 text-xs font-extrabold hover:from-emerald-400 hover:to-teal-500 transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
            >
              <span>💬 Continue Chatting in AI Chat</span>
              <span>➔</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Case Parameters Card */}
            <div className="glass-panel p-6 space-y-4 lg:col-span-2 border-t-4 border-emerald-500 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <span className="text-xs font-mono text-emerald-800 dark:text-emerald-400 font-bold">
                  CASE ID: #{caseState.case_id}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {caseState.updated_at || 'Active Session'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold">Jurisdiction:</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{caseState.jurisdiction} {caseState.country ? `(${caseState.country})` : ''}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold">Language:</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{caseState.language.toUpperCase()}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold">Product Type:</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{caseState.product_type || 'Unspecified'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold">Classical Basis (TK):</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{caseState.classical_reference || 'None specified'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold">Traditional Knowledge:</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{caseState.traditional_knowledge_involved ? 'Yes' : 'No / Uncertain'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold">Indian Bio-Resources (ABS):</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{caseState.biological_resources_involved ? 'Yes (NBA Clearance)' : 'No / Exempt'}</p>
                </div>
              </div>

              {/* Active Herbs */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Active Herbs & Biological Ingredients:</span>
                <div className="flex flex-wrap gap-1.5">
                  {caseState.ingredients && caseState.ingredients.length > 0 ? (
                    caseState.ingredients.map((ing, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 text-xs font-semibold">
                        🌿 {ing}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 italic">No specific herbs extracted yet.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Classification & Pathway Summary Sidebar */}
            <div className="glass-panel p-6 space-y-4 border-t-4 border-amber-500 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🏛️</span> Classification
                  </span>
                  <button
                    onClick={() => setShowPathwayModal(true)}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Modify ➔
                  </button>
                </div>

                <div className="font-black text-slate-900 dark:text-white text-base">
                  {activeTier.label}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeTier.ipPosture}
                </p>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="font-bold text-slate-700 dark:text-slate-300">Statutory Authority:</div>
                  <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">{activeTier.statutoryBasis}</div>
                </div>
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
                {effectiveRecords.map((item, idx: number) => {
                  const isUser = item.sender === 'user' || Boolean(item.user_message);
                  const textContent = item.text || item.user_message || item.data?.answer || item.assistant_answer || item.question || item.content;
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
        chatHistory={effectiveRecords.flatMap((r, idx) => {
          const items: Array<{ sender: 'user' | 'assistant'; data?: ChatResponse; text?: string }> = [];
          if (r.user_message || r.sender === 'user') {
            items.push({ sender: 'user', text: r.user_message || r.text || r.content || '' });
          }
          if (r.assistant_answer || r.sender === 'assistant') {
            items.push({
              sender: 'assistant',
              data: r.data || {
                case_id: caseState?.case_id || 'IP-SAKTI-SESSION',
                message_id: `rec_${idx}`,
                answer: r.assistant_answer || r.text || r.content || '',
                jurisdiction: caseState?.jurisdiction || 'India',
                product_classification: caseState?.formulation_classification || 'unknown',
                relevant_ip_domains: caseState?.intellectual_property_objective || ['patent'],
                citations: r.citations || [],
                confidence_score: caseState?.confidence || 0.85,
                confidence_explanation: 'Historical consultation record',
                requires_human_escalation: false,
                safe_abstention: false,
              },
            });
          }
          return items;
        })}
        jurisdiction={caseState?.jurisdiction || 'India'}
        country={caseState?.country || undefined}
      />
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCase, updateCase, listCases } from '@/lib/api';
import { CaseState, ConversationHistoryItem, ChatResponse } from '@/types';
import { FORMULATION_TIERS, getTierFromClassification } from '@/lib/formulationTaxonomy';
import { getPersistedCases, persistCase, mergeAndPersistCases } from '@/lib/caseRegistry';
import FormulationPathwayModal from '@/components/FormulationPathwayModal';
import OfficialFormsModal from '@/components/OfficialFormsModal';
import DossierExportModal from '@/components/DossierExportModal';
import {
  ScalesIcon,
  LandmarkIcon,
  FileTextIcon,
  FolderIcon,
  MessageIcon,
  UserIcon,
  LeafIcon,
  SearchIcon,
  PencilIcon,
  PlusIcon,
} from '@/components/Icons';
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

  // List of all user cases (hydrated from local/remote on mount)
  const [savedCases, setSavedCases] = useState<CaseState[]>([]);
  const [loadingCasesList, setLoadingCasesList] = useState<boolean>(false);

  // Modals state
  const [showPathwayModal, setShowPathwayModal] = useState<boolean>(false);
  const [showFormsModal, setShowFormsModal] = useState<boolean>(false);
  const [showDossierModal, setShowDossierModal] = useState<boolean>(false);

  const fetchUserCases = useCallback(async () => {
    setLoadingCasesList(true);
    try {
      const apiCases = await listCases(user?.uid || undefined);
      const merged = mergeAndPersistCases(apiCases);
      setSavedCases(merged);
    } catch (e) {
      console.warn('Failed to list user cases from remote API, falling back to local registry:', e);
      setSavedCases(getPersistedCases());
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
      persistCase(data);
      setSavedCases(getPersistedCases());
    } catch {
      // Check if found in local registry
      const local = getPersistedCases().find((c) => c.case_id === id);
      if (local) {
        setCaseState(local);
      } else {
        setError('Case ID not found in Firestore / Local DB repository.');
        setCaseState(null);
      }
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

  const parameters = [
    {
      label: 'Jurisdiction',
      value: `${caseState?.jurisdiction || ''} ${caseState?.country ? `(${caseState.country})` : ''}`.trim(),
    },
    { label: 'Language', value: caseState?.language?.toUpperCase() || '' },
    { label: 'Product Type', value: caseState?.product_type || 'Unspecified' },
    { label: 'Classical Basis (TK)', value: caseState?.classical_reference || 'None specified' },
    {
      label: 'Traditional Knowledge',
      value: caseState?.traditional_knowledge_involved ? 'Yes' : 'No / Uncertain',
    },
    {
      label: 'Indian Bio-Resources (ABS)',
      value: caseState?.biological_resources_involved ? 'Yes (NBA Clearance)' : 'No / Exempt',
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-10">

      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight text-ink">
            Case State Workspace
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Persisted state parameters, 6-tier formulation classification, previous sessions, and official pre-filing dossier.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPathwayModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-subtle"
          >
            <ScalesIcon size={13} />
            6-Tier Pathway
          </button>

          <button
            onClick={() => setShowFormsModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-subtle"
          >
            <LandmarkIcon size={13} />
            Official Forms
          </button>

          {caseState && (
            <button
              onClick={() => setShowDossierModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
            >
              <FileTextIcon size={13} />
              Export Dossier
            </button>
          )}

          <div className="flex items-center gap-1.5 pl-1">
            <input
              type="text"
              placeholder="Enter Case ID..."
              value={caseIdInput}
              onChange={(e) => setCaseIdInput(e.target.value)}
              aria-label="Case ID"
              className="mono-caps w-44 rounded-md border border-line bg-surface px-2.5 py-1.5 text-ink placeholder:text-faint"
            />
            <button
              onClick={() => handleFetchCase(caseIdInput)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-subtle"
            >
              <SearchIcon size={13} />
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
            <FolderIcon size={20} className="text-accent" />
            <h2 className="text-base font-bold text-ink">
              {user ? `Saved Consultations (${savedCases.length})` : 'Recent Consultation Cases'}
            </h2>
          </div>
          {!user && (
            <Link
              href="/auth?redirect=/case"
              className="text-xs text-accent-ink hover:underline font-bold"
            >
              Sign In to save cases to your account &rarr;
            </Link>
          )}
        </div>

        {loadingCasesList ? (
          <div className="text-xs text-muted flex items-center gap-2 p-4">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span>Loading previous cases...</span>
          </div>
        ) : savedCases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedCases.map((c, idx) => {
              const tier = getTierFromClassification(c.formulation_classification || c.product_type);
              const isCurrent = caseState?.case_id === c.case_id;
              const caseNumber = savedCases.length - idx;

              return (
                <div
                  key={c.case_id}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                    isCurrent
                      ? 'bg-accent-soft border-accent shadow-soft'
                      : 'bg-surface border-line hover:border-accent/50'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-accent-soft text-accent-ink font-bold text-[10px] font-mono border border-accent-line">
                          Case #{caseNumber}
                        </span>
                        <span className="font-mono text-[11px] text-muted">
                          #{c.case_id.slice(0, 8)}
                        </span>
                      </div>
                      <span className="text-[10px] text-faint">
                        {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : 'Active'}
                      </span>
                    </div>

                    <div className="font-semibold text-xs text-accent-ink">
                      {tier.shortLabel || tier.label}
                    </div>

                    <div className="text-[11px] text-muted flex items-center gap-2">
                      <span>{c.jurisdiction === 'International' ? '🌐' : '🇮🇳'} {c.jurisdiction} {c.country ? `(${c.country})` : ''}</span>
                      <span>&bull;</span>
                      <span>{c.language.toUpperCase()}</span>
                    </div>

                    {c.ingredients && c.ingredients.length > 0 && (
                      <div className="text-[10px] text-faint truncate">
                        🌿 {c.ingredients.slice(0, 3).join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-line">
                    <button
                      onClick={() => {
                        setCaseIdInput(c.case_id);
                        handleFetchCase(c.case_id);
                      }}
                      className="flex-1 inline-flex items-center justify-center py-2 rounded-lg border border-line bg-surface hover:bg-surface-sunken text-ink text-xs font-semibold transition-all cursor-pointer text-center"
                    >
                      Inspect
                    </button>
                    <button
                      onClick={() => handleContinueChatting(c)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent text-accent-fg hover:opacity-95 text-xs font-bold transition-all shadow-xs cursor-pointer text-center"
                    >
                      <MessageIcon size={13} className="shrink-0" />
                      <span>Chat &rarr;</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-surface border border-line text-xs text-muted text-center">
            No saved consultations found. Start a consultation in <Link href="/chat" className="text-accent-ink font-bold hover:underline">AI Chat</Link> to create your first case.
          </div>
        )}
      </div>

      {loading && <p className="py-6 text-[13px] text-muted">Loading Case State...</p>}
      {error && (
        <p className="mt-6 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}

      {!caseState && !loading && (
        <div className="p-10 text-center text-muted space-y-3 border border-dashed border-line-strong rounded-lg bg-surface">
          <FolderIcon size={32} className="mx-auto text-faint" />
          <h3 className="text-lg font-bold text-ink">Select or Load a Case</h3>
          <p className="text-[12px] leading-relaxed text-muted max-w-sm mx-auto">
            Choose a case from your saved consultations above, enter a Case ID, or start a new consultation session in AI Chat.
          </p>
          <div className="pt-2">
            <Link
              href="/chat"
              className="inline-flex px-4 py-2 rounded-xl bg-accent text-accent-fg font-bold text-xs hover:bg-accent-hover transition-all shadow-xs"
            >
              <PlusIcon size={12} className="mr-1" />
              Start New AI Consultation
            </Link>
          </div>
        </div>
      )}

      {caseState && (
        <div className="mt-10 grid grid-cols-1 gap-7 lg:grid-cols-3">
          {/* Case Parameters */}
          <div className="panel p-7 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <span className="mono-caps text-accent-ink">CASE ID: #{caseState.case_id}</span>
              <span className="mono-caps text-faint">
                {caseState.updated_at || 'Active Session'}
              </span>
            </div>

            <dl className="grid grid-cols-1 gap-x-10 gap-y-5 pt-6 sm:grid-cols-2">
              {parameters.map((p) => (
                <div key={p.label}>
                  <dt className="eyebrow">{p.label}</dt>
                  <dd className="mt-1.5 text-[13.5px] font-medium text-ink">{p.value}</dd>
                </div>
              ))}
            </dl>

            {/* Active Herbs */}
            <div className="mt-6 border-t border-line pt-5">
              <span className="eyebrow">Active Herbs &amp; Biological Ingredients</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {caseState.ingredients && caseState.ingredients.length > 0 ? (
                  caseState.ingredients.map((ing, i) => (
                    <span key={i} className="chip chip-accent">
                      <LeafIcon size={10} />
                      {ing}
                    </span>
                  ))
                ) : (
                  <span className="text-[12.5px] text-faint italic">
                    No specific herbs extracted yet.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Classification & Pathway Summary */}
          <div className="panel flex flex-col justify-between p-7">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="eyebrow">Classification</span>
                <button
                  onClick={() => setShowPathwayModal(true)}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent-ink hover:underline"
                >
                  <PencilIcon size={11} />
                  Modify
                </button>
              </div>

              <h3 className="font-display text-[19px] leading-snug text-ink">{activeTier.label}</h3>

              <p className="text-[13px] leading-relaxed text-muted">{activeTier.ipPosture}</p>

              <div className="panel-sunken space-y-2 p-4">
                <div className="eyebrow">Statutory Authority</div>
                <p className="text-[11.5px] leading-relaxed text-accent-ink">{activeTier.statutoryBasis}</p>
              </div>
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <button
                onClick={() => setShowDossierModal(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-3 text-[12.5px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
              >
                <FileTextIcon size={14} />
                Generate Pre-Filing Dossier
              </button>
            </div>
          </div>

          {/* Questioning & Consultation History */}
          <div className="panel p-7 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <h3 className="inline-flex items-center gap-2.5 font-display text-[17px] text-ink">
                <MessageIcon size={16} className="text-accent" />
                Questioning Records &amp; Consultation Transcript ({effectiveRecords.length})
              </h3>
              <span className="mono-caps text-faint">Case #{caseState.case_id}</span>
            </div>

            {effectiveRecords.length > 0 ? (
              <div className="mt-5 max-h-96 space-y-4 overflow-y-auto pr-1">
                {effectiveRecords.map((item, idx: number) => {
                  const isUser = item.sender === 'user' || Boolean(item.user_message);
                  const textContent =
                    item.text ||
                    item.user_message ||
                    item.data?.answer ||
                    item.assistant_answer ||
                    item.question ||
                    item.content;
                  const questionAsked =
                    item.data?.next_question || item.next_question || item.question;

                  return (
                    <div
                      key={idx}
                      className={`space-y-2.5 rounded-md border p-4 text-[12.5px] leading-relaxed ${
                        isUser
                          ? 'border-line bg-sunken text-ink'
                          : 'border-line bg-surface text-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="eyebrow inline-flex items-center gap-2">
                          {isUser ? <UserIcon size={12} /> : <ScalesIcon size={12} />}
                          {isUser ? 'User Input / Answer' : 'IP-SAKTI Legal Response'}
                        </span>
                        {item.timestamp && (
                          <span className="mono-caps text-faint">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>

                      {item.user_message && (
                        <div className="rounded-md bg-accent-soft px-3 py-2.5 font-medium text-accent-ink">
                          {item.user_message}
                        </div>
                      )}

                      {item.assistant_answer && (
                        <div className="whitespace-pre-wrap text-ink">{item.assistant_answer}</div>
                      )}

                      {!item.user_message && !item.assistant_answer && (
                        <div className="whitespace-pre-wrap">{textContent}</div>
                      )}

                      {questionAsked && (
                        <div className="rounded-md border border-accent-line bg-accent-soft px-3 py-2 text-[11.5px] font-medium text-accent-ink">
                          Target Question Asked: {questionAsked}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 rounded-md border border-dashed border-line-strong px-3 py-8 text-center text-[12.5px] text-faint">
                No previous questioning records stored for this case session yet. Submit a message
                in AI Chat to start recording.
              </p>
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

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createCase, sendChatMessage, getCase, uploadDocument, updateCase } from '@/lib/api';
import { ChatResponse, CaseState } from '@/types';
import { FORMULATION_TIERS, getTierFromClassification } from '@/lib/formulationTaxonomy';
import { getPersistedCases, persistCase, mergeAndPersistCases } from '@/lib/caseRegistry';
import FormulationPathwayModal from '@/components/FormulationPathwayModal';
import OfficialFormsModal from '@/components/OfficialFormsModal';
import DossierExportModal from '@/components/DossierExportModal';
import AuthModal from '@/components/AuthModal';
import { useAuth } from '@/components/AuthProvider';
import { listCases } from '@/lib/api';

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResultItem[];
  length: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEventLike) => void;
  onerror: (event: SpeechRecognitionErrorEventLike) => void;
  onend: () => void;
  start: () => void;
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [caseId, setCaseId] = useState<string>('');
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [jurisdiction, setJurisdiction] = useState<'India' | 'International'>('India');
  const [country, setCountry] = useState<string>('');
  const [language, setLanguage] = useState<string>('en');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'assistant'; data?: ChatResponse; text?: string }>>([]);
  const [latestResponse, setLatestResponse] = useState<ChatResponse | null>(null);

  // Saved user cases list for quick switching (seeded immediately from persistent storage)
  const [userCases, setUserCases] = useState<CaseState[]>(() => getPersistedCases());
  const [casePickerOpen, setCasePickerOpen] = useState<boolean>(false);

  // Modals state
  const [showPathwayModal, setShowPathwayModal] = useState<boolean>(false);
  const [showFormsModal, setShowFormsModal] = useState<boolean>(false);
  const [showDossierModal, setShowDossierModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  // Actions dropdown & Mobile sidebar toggle
  const [actionsDropdownOpen, setActionsDropdownOpen] = useState<boolean>(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState<boolean>(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const casePickerRef = useRef<HTMLDivElement>(null);

  // Sidebar Accordions State
  const [isParamsOpen, setIsParamsOpen] = useState<boolean>(false);
  const [isIpDomainsOpen, setIsIpDomainsOpen] = useState<boolean>(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState<boolean>(true);

  // Document Upload State
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice & Speech Controls (Sound ON/OFF, Female Voice, Slower Speed 0.85x)
  const [isListening, setIsListening] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<string>('');

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'हिंदी (Hindi)' },
    { code: 'ta', name: 'தமிழ் (Tamil)' },
    { code: 'te', name: 'తెలుగు (Telugu)' },
    { code: 'mr', name: 'मराठी (Marathi)' },
    { code: 'bn', name: 'বাংলা (Bengali)' },
    { code: 'gu', name: 'ગુજરાતી (Gujarati)' },
    { code: 'kn', name: 'ಕನ್ನಡ (Kannada)' },
    { code: 'ml', name: 'മലയാളം (Malayalam)' },
  ];

  const allIpDomains = [
    { id: 'patent', label: 'Patent', icon: '📜' },
    { id: 'trademark', label: 'Trademark', icon: '🏷️' },
    { id: 'gi', label: 'Geographical Indication', icon: '🗺️' },
    { id: 'copyright', label: 'Copyright', icon: '©️' },
    { id: 'design', label: 'Industrial Design', icon: '🎨' },
    { id: 'plant_variety', label: 'Plant Variety', icon: '🌱' },
    { id: 'trade_secret', label: 'Trade Secret', icon: '🔒' },
    { id: 'tkdl_prior_art', label: 'TKDL / Prior Art', icon: '📚' },
    { id: 'abs', label: 'Access & Benefit Sharing (ABS)', icon: '🌿' },
    { id: 'regulatory', label: 'AYUSH / FSSAI Regulatory', icon: '⚕️' },
  ];

  const fetchUserCases = useCallback(async () => {
    try {
      const cases = await listCases(user?.uid || undefined);
      const merged = mergeAndPersistCases(cases);
      setUserCases(merged);
    } catch (e) {
      console.error('Failed to list user cases:', e);
      setUserCases(getPersistedCases());
    }
  }, [user]);

  useEffect(() => {
    fetchUserCases();
  }, [fetchUserCases]);

  const refreshCaseState = useCallback(async (id: string) => {
    try {
      const state = await getCase(id);
      setCaseState(state);
      persistCase(state);
      setUserCases(getPersistedCases());
    } catch (e) {
      console.error('Failed to refresh case state:', e);
    }
  }, []);

  const switchActiveCase = (targetCase: CaseState) => {
    setCaseId(targetCase.case_id);
    setCaseState(targetCase);
    persistCase(targetCase);
    setJurisdiction((targetCase.jurisdiction as 'India' | 'International') || 'India');
    if (targetCase.country) setCountry(targetCase.country);
    if (targetCase.language) setLanguage(targetCase.language);
    localStorage.setItem('ip_sakti_active_case_id', targetCase.case_id);

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
      setChatHistory(restoredChat);
      localStorage.setItem('ip_sakti_chat_history', JSON.stringify(restoredChat));
      const lastAssistant = [...restoredChat].reverse().find((m) => m.sender === 'assistant' && m.data);
      if (lastAssistant && lastAssistant.data) {
        setLatestResponse(lastAssistant.data);
      }
    } else {
      setChatHistory([]);
      setLatestResponse(null);
      localStorage.removeItem('ip_sakti_chat_history');
    }

    setCasePickerOpen(false);
  };

  const startNewConsultation = useCallback(() => {
    localStorage.removeItem('ip_sakti_active_case_id');
    localStorage.removeItem('ip_sakti_chat_history');
    setChatHistory([]);
    setLatestResponse(null);
    setCaseState(null);

    createCase({ jurisdiction, country, language, user_id: user?.uid || undefined })
      .then((res) => {
        setCaseId(res.case_id);
        setCaseState(res);
        localStorage.setItem('ip_sakti_active_case_id', res.case_id);
        persistCase(res);
        fetchUserCases();
      })
      .catch((err) => console.error('Failed to init case:', err));
  }, [jurisdiction, country, language, user, fetchUserCases]);

  // Load Persisted Session or Create New Case
  useEffect(() => {
    const timer = setTimeout(() => {
      const savedCaseId = localStorage.getItem('ip_sakti_active_case_id');
      const savedHistory = localStorage.getItem('ip_sakti_chat_history');

      if (savedCaseId) {
        setCaseId(savedCaseId);
        refreshCaseState(savedCaseId);
        if (savedHistory) {
          try {
            const parsed = JSON.parse(savedHistory);
            setChatHistory(parsed);
            if (parsed.length > 0 && parsed[parsed.length - 1].data) {
              setLatestResponse(parsed[parsed.length - 1].data);
            }
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        startNewConsultation();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [refreshCaseState, startNewConsultation]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save Chat History to LocalStorage on updates
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem('ip_sakti_chat_history', JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  // Pre-load SpeechSynthesis voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const handleUpdateClassification = async (tierId: string) => {
    if (!caseId) return;
    try {
      const updated = await updateCase(caseId, {
        formulation_classification: tierId,
        product_type: FORMULATION_TIERS[tierId]?.shortLabel || tierId,
      });
      setCaseState(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const LANG_VOICE_MAP: Record<string, string> = {
    en: 'en-US',
    hi: 'hi-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    mr: 'mr-IN',
    bn: 'bn-IN',
    gu: 'gu-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
  };

  // Extract clean 2-sentence conversational executive summary for speech
  const extractSpokenSummary = (rawText: string, nextQuestion?: string): string => {
    if (!rawText) return '';
    let clean = rawText
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#{1,6}\s+.*/gm, '')
      .replace(/>\s+.*Notice.*/gi, '')
      .replace(/>/g, '')
      .replace(/\|.*?\|/g, '')
      .replace(/[-*•]\s+/g, '')
      .replace(/\b(Section|Sec\.)\s+\d+[\w()]*/gi, '')
      .replace(/[*_~`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const sentences = clean.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 12);
    let summary = sentences.slice(0, 2).join(' ');
    if (!summary || summary.length < 20) {
      summary = clean.slice(0, 180);
    }

    if (nextQuestion && nextQuestion.trim()) {
      const cleanQ = nextQuestion.replace(/[*_`#]/g, '').trim();
      summary += ` Regarding your next step: ${cleanQ}`;
    }

    return summary;
  };

  // Helper: Find Natural Female Voice
  const getFemaleVoice = (targetLangCode?: string): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const prefix = (targetLangCode || 'en').slice(0, 2);
    const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));

    const femaleKeywords = [
      'female', 'zira', 'samantha', 'google us english', 'victoria', 'karen',
      'veena', 'swara', 'kalpana', 'hazel', 'susan', 'aria', 'jenny', 'heera', 'anita'
    ];

    const foundInLang = langVoices.find((v) => {
      const n = v.name.toLowerCase();
      return femaleKeywords.some((k) => n.includes(k));
    });
    if (foundInLang) return foundInLang;
    if (langVoices.length > 0) return langVoices[0];

    const foundGeneral = voices.find((v) => {
      const n = v.name.toLowerCase();
      return femaleKeywords.some((k) => n.includes(k));
    });

    return foundGeneral || voices[0];
  };

  // Speech Recognition (Speech-to-Text)
  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const win = window as WindowWithSpeech;
    const SpeechRecClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecClass) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = LANG_VOICE_MAP[language] || 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
      setInputMessage(currentTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Speech Synthesis (Text-to-Speech / Executive 2-sentence summary / Female Voice)
  const speakText = (text: string, idx?: number, nextQuestion?: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    if (idx !== undefined && speakingIdx === idx) {
      setSpeakingIdx(null);
      return;
    }

    const spokenSummary = extractSpokenSummary(text, nextQuestion);
    const utterance = new SpeechSynthesisUtterance(spokenSummary);

    utterance.rate = 0.88;
    utterance.pitch = 1.05;

    const femaleVoice = getFemaleVoice(language);
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }
    utterance.lang = LANG_VOICE_MAP[language] || 'en-US';

    if (idx !== undefined) setSpeakingIdx(idx);

    utterance.onend = () => setSpeakingIdx(null);
    utterance.onerror = () => setSpeakingIdx(null);

    window.speechSynthesis.speak(utterance);
  };

  const handleOptionChipClick = (option: string) => {
    const lower = option.toLowerCase();
    const isTypingAction =
      lower.includes('type') ||
      lower.includes('write') ||
      lower.includes('custom') ||
      lower.includes('manual') ||
      lower.includes('list each') ||
      lower.includes('specify') ||
      lower.includes('percentage') ||
      lower.includes('exact weight') ||
      lower.includes('composition');

    if (isTypingAction) {
      if (lower.includes('ingredient')) {
        setInputMessage('Ingredients: ');
      } else if (lower.includes('test') || lower.includes('lab') || lower.includes('efficacy')) {
        setInputMessage('Efficacy Lab Data: ');
      } else if (lower.includes('sourcing') || lower.includes('location')) {
        setInputMessage('Sourced from: ');
      } else if (lower.includes('product') || lower.includes('form')) {
        setInputMessage('Product form: ');
      } else if (lower.includes('basis') || lower.includes('classical')) {
        setInputMessage('Classical text / formulation basis: ');
      } else {
        setInputMessage('');
      }
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
    } else {
      handleSendMessage(option);
    }
  };

  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = customMessage || inputMessage;
    if (!textToSend.trim() || loading) return;

    setLoading(true);
    setChatHistory((prev) => [...prev, { sender: 'user', text: textToSend }]);
    if (!customMessage) setInputMessage('');

    // Ensure a unique dedicated case ID is assigned so previous cases are never overwritten
    const effectiveCaseId = caseId || `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    if (!caseId) {
      setCaseId(effectiveCaseId);
    }

    try {
      const res = await sendChatMessage({
        case_id: effectiveCaseId,
        message: textToSend,
        language,
        jurisdiction,
        country: jurisdiction === 'International' ? country : undefined,
        user_id: user?.uid || undefined
      });

      const newIdx = chatHistory.length + 1;
      setChatHistory((prev) => [...prev, { sender: 'assistant', data: res }]);
      setLatestResponse(res);
      refreshCaseState(effectiveCaseId);
      fetchUserCases();

      // Auto-open sources if citations returned
      if (res.citations && res.citations.length > 0) {
        setIsSourcesOpen(true);
      }

      // Auto-speak natural 2-sentence conversational summary if Sound is enabled
      if (soundEnabled && res.answer) {
        speakText(res.answer, newIdx, res.next_question);
      }
    } catch (err) {
      console.error('Chat error:', err);
      const errMsg = err instanceof Error ? err.message : 'An error occurred while reaching the IP-SAKTI gateway.';
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `Error reaching gateway: ${errMsg}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Document Upload & Inline OCR Processing
  const handleDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const effectiveCaseId = caseId || `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    if (!caseId) {
      setCaseId(effectiveCaseId);
    }

    if (file.size === 0) {
      alert('Selected file is empty. Please choose a valid document.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      alert('File exceeds the maximum upload limit of 25 MB. Please upload a smaller file.');
      return;
    }

    setIsUploadingDoc(true);

    try {
      const docRes = await uploadDocument(file, caseId);
      const extractedText = docRes.ocr_result?.extracted_text || '';

      const docPrompt = `[Uploaded Document Attached: ${file.name}]\nExtracted Document Text:\n"${extractedText.slice(0, 800)}"\n\nPlease analyze this document for active biological ingredients, classical references, and IP statutory compliance.`;

      await handleSendMessage(docPrompt);
    } catch (err) {
      console.error('Document upload error:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to upload document.';
      alert(`Document upload error: ${errMsg}`);
    } finally {
      setIsUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Parameters count
  const knownCount = caseState?.known_information?.length || 0;
  const missingCount = caseState?.missing_information?.length || 0;
  const totalParams = knownCount + missingCount || 7;
  const completionPct = Math.round((knownCount / totalParams) * 100);

  const activeTier = getTierFromClassification(caseState?.formulation_classification || caseState?.product_type);
  const activeDomainsCount = latestResponse?.relevant_ip_domains?.length || 0;
  const citationsCount = latestResponse?.citations?.length || 0;

  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)] overflow-hidden space-y-2.5">

      {/* ========================================================================= */}
      {/* 1. COMPACT CASE CONTEXT BAR */}
      {/* ========================================================================= */}
      <div className="glass-panel px-3.5 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2.5 border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-xs transition-colors shrink-0">

        {/* Left: Regime, Case ID, Formulation Type, Jurisdiction */}
        <div className="flex items-center flex-wrap gap-2">
          {/* New Case Button */}
          <button
            onClick={startNewConsultation}
            className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-slate-950 border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 dark:hover:text-slate-950 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
            title="Start New Case Session"
          >
            <span>➕</span>
            <span className="hidden sm:inline">New Case</span>
          </button>

          {/* Sign In Prompt if not logged in */}
          {!user && (
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-300 font-bold text-xs hover:bg-amber-100 transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
              title="Sign in to save your consultations to your account"
            >
              <span>🔑</span>
              <span>Sign In to Save</span>
            </button>
          )}

          {/* Switch Saved Case Dropdown */}
          {userCases.length > 0 && (
            <div className="relative" ref={casePickerRef}>
              <button
                onClick={() => setCasePickerOpen(!casePickerOpen)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                title="Switch between your ongoing consultations"
              >
                <span>📂</span>
                <span className="hidden sm:inline">Cases</span>
                <span className="text-[9px]">▼</span>
              </button>

              {casePickerOpen && (
                <div className="absolute left-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 py-1.5 text-xs max-h-60 overflow-y-auto">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span>Saved Cases ({userCases.length})</span>
                    <Link href="/case" className="text-emerald-600 hover:underline text-[9px] font-bold">Workspace →</Link>
                  </div>
                  {userCases.map((c, idx) => {
                    const tier = getTierFromClassification(c.formulation_classification || c.product_type);
                    const isSelected = c.case_id === caseId;
                    const caseNumber = userCases.length - idx;
                    return (
                      <button
                        key={c.case_id}
                        onClick={() => switchActiveCase(c)}
                        className={`w-full text-left px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-50/70 dark:bg-emerald-950/60 font-bold text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <div className="truncate">
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">Case #{caseNumber}</span>
                            <span className="text-slate-400">#{c.case_id.slice(0, 8)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{tier.shortLabel || tier.label}</div>
                        </div>
                        {isSelected && <span className="text-emerald-500 font-bold text-xs">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Regime Switcher */}
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => setJurisdiction('India')}
              className={`px-2.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                jurisdiction === 'India'
                  ? 'bg-emerald-500 text-white dark:text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              🇮🇳 India
            </button>
            <button
              onClick={() => setJurisdiction('International')}
              className={`px-2.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                jurisdiction === 'International'
                  ? 'bg-cyan-500 text-white dark:text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              🌐 International
            </button>
          </div>

          {/* International Country Input */}
          {jurisdiction === 'International' && (
            <input
              type="text"
              placeholder="Country (e.g. USA, Germany)"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-md px-2 py-0.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 w-32"
            />
          )}

          {/* Case ID Badge */}
          {caseId && (
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[11px] font-mono font-bold">
              Case #{caseId.slice(0, 8)}
            </span>
          )}

          {/* Formulation Badge with Quick Change Modal Trigger */}
          <button
            onClick={() => setShowPathwayModal(true)}
            className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 text-[11px] font-semibold hover:border-emerald-500 transition-colors flex items-center gap-1 cursor-pointer"
            title="Click to change 6-Tier formulation classification"
          >
            <span>🏛️ {activeTier.shortLabel || activeTier.label}</span>
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400">✎</span>
          </button>
        </div>

        {/* Right: Actions Dropdown, Sound, Language & Mobile Sidebar Trigger */}
        <div className="flex items-center gap-2">

          {/* Actions Dropdown Menu (6-Tier Pathway, Official Forms, Export Dossier) */}
          <div className="relative" ref={actionsMenuRef}>
            <button
              onClick={() => setActionsDropdownOpen(!actionsDropdownOpen)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>⚙️ Actions</span>
              <span className="text-[9px]">▼</span>
            </button>

            {actionsDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 py-1.5 text-xs">
                <button
                  onClick={() => {
                    setShowPathwayModal(true);
                    setActionsDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <span>⚖️</span>
                  <div>
                    <div className="font-bold">6-Tier Legal Pathway</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Formulation roadmap & ABS</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setShowFormsModal(true);
                    setActionsDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <span>🏛️</span>
                  <div>
                    <div className="font-bold">Official Forms & Portals</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">IPO, NBA, FSSAI, AYUSH</div>
                  </div>
                </button>

                <div className="border-t border-slate-200 dark:border-slate-800 my-1" />

                <button
                  onClick={() => {
                    setShowDossierModal(true);
                    setActionsDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <span>📄</span>
                  <div>
                    <div className="font-bold text-emerald-700 dark:text-emerald-400">Export Legal Dossier</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Download diagnostic report</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Sound ON/OFF Toggle with Crisp Vector Audio Icon */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
              soundEnabled
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-400 dark:border-emerald-500/40 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200 hover:border-emerald-500/40'
            }`}
            title={soundEnabled ? 'Text-to-Speech is ON (Click to mute)' : 'Text-to-Speech is OFF (Click to unmute)'}
          >
            {soundEnabled ? (
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>

          {/* Language Selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-md px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>

          {/* Mobile Case Context Toggle Button */}
          <button
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            className="lg:hidden px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>📋 Context</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN 2-PANE WORKSPACE (CHAT ~72% | COMPACT SIDEBAR ~28%) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 overflow-hidden min-h-0">

        {/* ===================================================================== */}
        {/* DOMINANT CHAT AREA (Col 8 / ~72% on desktop) */}
        {/* ===================================================================== */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col glass-panel p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/70 overflow-hidden shadow-xs relative">

          {/* Chat Card Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
                <span>⚖️</span>
                <span>AI Consultation</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Source-cited IP & regulatory guidance under Indian statutory frameworks
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>RAG Sources Ready</span>
            </div>
          </div>

          {/* Hidden File Input for Document Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleDocumentSelected}
            accept=".pdf,.png,.jpg,.jpeg,.txt,.json,.docx"
            className="hidden"
          />

          {/* Scrollable Message History Area */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 py-3 min-h-0">

            {/* Clean Minimal Empty State */}
            {chatHistory.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 text-slate-500 dark:text-slate-400 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl shadow-xs">
                  ⚖️
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    AI Consultation
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Ask about patents, traditional knowledge, ABS, GI, trademarks, regulatory classification, or international IP requirements.
                  </p>
                </div>

                {/* 3 Compact Suggested Prompts */}
                <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-lg">
                  <button
                    onClick={() => handleSendMessage('Can I patent this Ayurvedic formulation?')}
                    className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/30 transition-all cursor-pointer shadow-2xs"
                  >
                    💡 &ldquo;Can I patent this Ayurvedic formulation?&rdquo;
                  </button>
                  <button
                    onClick={() => handleSendMessage('Does this formulation require ABS clearance from NBA?')}
                    className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:border-cyan-500/60 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50/30 transition-all cursor-pointer shadow-2xs"
                  >
                    🌿 &ldquo;Does this require ABS clearance?&rdquo;
                  </button>
                  <button
                    onClick={() => handleSendMessage('What IP protection is available for our Ayurvedic product?')}
                    className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:border-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50/30 transition-all cursor-pointer shadow-2xs"
                  >
                    📜 &ldquo;What IP protection is available?&rdquo;
                  </button>
                </div>
              </div>
            )}

            {/* Chat Messages */}
            {chatHistory.map((item, idx) => (
              <div key={idx} className={`flex ${item.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {item.sender === 'user' ? (
                  <div className="max-w-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl px-4 py-2.5 shadow-sm text-xs font-medium leading-relaxed">
                    {item.text}
                  </div>
                ) : item.data ? (
                  <div className="w-full glass-panel p-4 rounded-xl space-y-3 border border-slate-200 dark:border-slate-800/80 border-l-4 border-l-emerald-500 bg-white/95 dark:bg-slate-950/90 shadow-sm text-xs">

                    {/* Message Header Bar with Voice Button */}
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-extrabold text-slate-900 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                          IP-SAKTI Legal Guidance
                        </span>
                      </div>
                      <button
                        onClick={() => speakText(item.data!.answer, idx, item.data!.next_question)}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          speakingIdx === idx
                            ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-400 dark:border-rose-500/50 animate-pulse shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-200/60 dark:hover:bg-slate-850'
                        }`}
                      >
                        <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                          {speakingIdx === idx ? (
                            <rect x="6" y="6" width="12" height="12" rx="2" />
                          ) : (
                            <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zm-2.5 0L6.5 7H3v10h3.5l5 3.77V3.23zM16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                          )}
                        </svg>
                        <span>{speakingIdx === idx ? '⏹ Stop Voice' : '🔊 Listen Summary'}</span>
                      </button>
                    </div>

                    {/* Safe Abstention / Insufficient Evidence Warning */}
                    {item.data.safe_abstention && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span className="text-sm">⚠️</span>
                            <span>Safe Abstention — Insufficient Authoritative Evidence</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-rose-200/80 dark:bg-rose-900/80 text-rose-800 dark:text-rose-200 text-[10px] font-bold">
                            Confidence: Low
                          </span>
                        </div>
                        <p className="text-[11px] text-rose-800/90 dark:text-rose-300/90 leading-relaxed">
                          {item.data.confidence_explanation || "I don't have enough authoritative evidence to provide a reliable answer for this specific case."}
                        </p>
                      </div>
                    )}

                    {/* Human IP Facilitator Escalation Card */}
                    {(item.data.requires_human_escalation || item.data.safe_abstention || (item.data.confidence_score !== undefined && item.data.confidence_score < 0.75)) && (
                      <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-emerald-500/5 to-teal-500/10 border border-amber-500/30 dark:border-amber-500/25 space-y-2.5 shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-start sm:items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 text-sm">
                              ⚖️
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <span>Need expert assistance?</span>
                                {item.data.confidence_score !== undefined && (
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    item.data.confidence_score >= 0.75
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : item.data.confidence_score >= 0.45
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  }`}>
                                    Confidence: {item.data.confidence_score >= 0.75 ? 'High' : item.data.confidence_score >= 0.45 ? 'Medium' : 'Low'}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5">
                                This case contains questions or evidence that may benefit from review by an IP facilitator.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowDossierModal(true)}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-bold text-[11px] shadow-sm hover:shadow transition-all cursor-pointer whitespace-nowrap self-start sm:self-center flex items-center gap-1.5 active:scale-95"
                          >
                            <span>Request Human Review</span>
                            <span>➔</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Rendered Guidance Payload */}
                    <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                      {item.data.answer}
                    </div>

                    {/* Potential Prior-Art Matches Section */}
                    {item.data.prior_art_matches && item.data.prior_art_matches.length > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/80 pb-1.5">
                          <div className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <span>🔍</span>
                            <span>Potential Prior-Art Matches</span>
                          </div>
                          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                            Potential match — not a legal determination.
                          </span>
                        </div>

                        <div className="space-y-2">
                          {item.data.prior_art_matches.map((match, mIdx) => (
                            <div
                              key={mIdx}
                              className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800/90 space-y-1.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-bold text-[11px] text-slate-900 dark:text-slate-100">
                                  {match.title}
                                </div>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                  match.match_category === 'Strong potential prior-art relevance'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    : match.match_category === 'Related traditional knowledge'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                }`}>
                                  {match.match_category}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                                <span><strong>Source:</strong> {match.source_type}</span>
                                <span><strong>Jurisdiction:</strong> {match.jurisdiction} {match.country ? `(${match.country})` : ''}</span>
                                <span><strong>Relevance:</strong> {Math.round(match.relevance_score * 100)}%</span>
                                {match.source_url && (
                                  <a
                                    href={match.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-600 hover:underline font-semibold"
                                  >
                                    Source Link ↗
                                  </a>
                                )}
                              </div>

                              {match.matched_features && match.matched_features.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">Matched:</span>
                                  {match.matched_features.map((feat, fIdx) => (
                                    <span
                                      key={fIdx}
                                      className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px]"
                                    >
                                      {feat}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {match.explanation && (
                                <div className="text-[10px] text-slate-600 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-900/60 p-1.5 rounded">
                                  {match.explanation}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* Prominent Dynamic Question Box with 1-Click Option Chips */}
                    {item.data.next_question && (
                      <div className="p-3 rounded-xl bg-emerald-50/90 dark:bg-gradient-to-r dark:from-emerald-950/70 dark:via-teal-950/50 dark:to-slate-950 border border-emerald-500/40 space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            <span>⚡ Case Clarification</span>
                          </div>
                          <span className="text-[9px] text-amber-800 dark:text-amber-400 font-mono font-bold bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800/50">
                            Select to proceed
                          </span>
                        </div>

                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
                          {item.data.next_question}
                        </p>

                        {/* Clickable Option Chips + Custom Type Support */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {item.data.suggested_options && item.data.suggested_options.length > 0 && item.data.suggested_options.map((option, optIdx) => (
                            <button
                              key={optIdx}
                              onClick={() => handleOptionChipClick(option)}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 dark:hover:text-slate-950 transition-all shadow-2xs active:scale-95 flex items-center gap-1 cursor-pointer"
                            >
                              <span>{option.startsWith('✍️') ? '✍️' : '👉'}</span>
                              <span>{option.replace(/^✍️\s*/, '')}</span>
                            </button>
                          ))}
                          <button
                            onClick={() => handleOptionChipClick('✍️ Type Custom Answer')}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950 hover:border-emerald-500/50 transition-all shadow-2xs active:scale-95 flex items-center gap-1 cursor-pointer"
                          >
                            <span>✍️</span>
                            <span>Type custom details...</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-w-md glass-panel p-2.5 text-xs text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800">
                    {item.text}
                  </div>
                )}
              </div>
            ))}

            {(loading || isUploadingDoc) && (
              <div className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400 text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-emerald-500/30">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                <span className="font-semibold">
                  {isUploadingDoc
                    ? 'Extracting document text via OCR and updating case state...'
                    : 'Retrieving statutory RAG context & running Groq reasoning...'}
                </span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* =================================================================== */}
          {/* STICKY CHAT INPUT BAR */}
          {/* =================================================================== */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-1.5 shrink-0">
            {isListening && (
              <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 border border-rose-400 dark:border-rose-500/50 text-rose-800 dark:text-rose-300 text-[11px] flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span>Listening... Speak your query clearly.</span>
                </div>
                <span className="font-mono text-[10px] text-rose-700 dark:text-rose-400">{transcript}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Document Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingDoc}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-slate-850 transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-2xs"
                title="Upload Document / PDF / Image (Inline OCR)"
              >
                <svg className="w-4 h-4 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {/* Speech-to-Text Microphone Button */}
              <button
                onClick={toggleListening}
                className={`p-2.5 rounded-xl border transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-2xs ${
                  isListening
                    ? 'bg-rose-500 text-white border-rose-400 shadow-md ring-2 ring-rose-400/50 animate-pulse'
                    : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-slate-850'
                }`}
                title={isListening ? 'Click to stop listening' : 'Voice Input (Speech-to-Text)'}
              >
                <svg className="w-4 h-4 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>

              {/* Query Text Input */}
              <input
                ref={chatInputRef}
                type="text"
                placeholder="Ask an Ayurvedic IP question or upload a document..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
              />

              {/* Send Button */}
              <button
                onClick={() => handleSendMessage()}
                disabled={loading || !inputMessage.trim()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white dark:text-slate-950 font-bold text-xs hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all shadow-xs cursor-pointer shrink-0"
              >
                Send ➔
              </button>
            </div>

            {/* Clean Disclaimer Footnote */}
            <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center truncate">
              <strong className="text-slate-600 dark:text-slate-300">Disclaimer:</strong> IP-SAKTI Sahayak provides statutory information under SIH PS-26045. It does not replace professional legal counsel.
            </p>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* COMPACT CASE CONTEXT SIDEBAR (Col 4 / ~28% on desktop) */}
        {/* ===================================================================== */}
        <div className={`lg:col-span-4 xl:col-span-3 flex-col glass-panel p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/70 overflow-y-auto space-y-3 shadow-xs text-xs ${
          showMobileSidebar ? 'flex fixed inset-x-4 top-20 bottom-4 z-40 bg-white dark:bg-slate-900' : 'hidden lg:flex'
        }`}>

          {/* Sidebar Header with Coverage Confidence */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                Case Context
              </span>
              {showMobileSidebar && (
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="lg:hidden ml-2 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-bold"
                >
                  ✕ Close
                </button>
              )}
            </div>

            {/* Coverage Confidence Badge */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Coverage:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                latestResponse?.confidence_score && latestResponse.confidence_score >= 0.5
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
              }`}>
                {latestResponse ? `${Math.round(latestResponse.confidence_score * 100)}%` : 'N/A'}
              </span>
            </div>
          </div>

          {/* SECTION 1: COMPACT CASE CONTEXT ROWS */}
          <div className="space-y-1.5 bg-slate-50/70 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80">
            {/* Jurisdiction */}
            <div className="flex items-center justify-between py-1 text-[11px] border-b border-slate-200/50 dark:border-slate-800/50">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Jurisdiction</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {jurisdiction} {country ? `(${country})` : ''}
              </span>
            </div>

            {/* Formulation Tier */}
            <div className="flex items-center justify-between py-1 text-[11px] border-b border-slate-200/50 dark:border-slate-800/50">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Formulation</span>
              <button
                onClick={() => setShowPathwayModal(true)}
                className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer truncate max-w-[140px]"
                title="Change formulation tier"
              >
                <span className="truncate">{activeTier.shortLabel || activeTier.label}</span>
                <span className="text-[9px]">✎</span>
              </button>
            </div>

            {/* Classical Basis */}
            <div className="flex items-center justify-between py-1 text-[11px] border-b border-slate-200/50 dark:border-slate-800/50">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Classical Basis</span>
              <span className={`font-medium ${caseState?.classical_reference ? 'text-slate-800 dark:text-slate-200' : 'text-amber-700 dark:text-amber-400'}`}>
                {caseState?.classical_reference || 'Unspecified'}
              </span>
            </div>

            {/* Active Herbs */}
            <div className="flex items-center justify-between py-1 text-[11px] border-b border-slate-200/50 dark:border-slate-800/50">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Active Herbs</span>
              <span className={`font-medium truncate max-w-[130px] ${caseState?.ingredients && caseState.ingredients.length > 0 ? 'text-slate-800 dark:text-slate-200' : 'text-amber-700 dark:text-amber-400'}`}>
                {caseState?.ingredients && caseState.ingredients.length > 0 ? caseState.ingredients.join(', ') : 'Not specified'}
              </span>
            </div>

            {/* TK Involved */}
            <div className="flex items-center justify-between py-1 text-[11px] border-b border-slate-200/50 dark:border-slate-800/50">
              <span className="text-slate-500 dark:text-slate-400 font-medium">TK Involved</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {caseState?.traditional_knowledge_involved === true
                  ? 'Yes (Prior Art)'
                  : caseState?.traditional_knowledge_involved === false
                  ? 'No (Novel)'
                  : 'Uncertain'}
              </span>
            </div>

            {/* Biological Resources */}
            <div className="flex items-center justify-between py-1 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Bio Resources (ABS)</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {caseState?.biological_resources_involved === true
                  ? 'Yes (NBA Clearance)'
                  : caseState?.biological_resources_involved === false
                  ? 'No Indian Bio'
                  : 'Uncertain'}
              </span>
            </div>
          </div>

          {/* SECTION 2: COLLAPSIBLE CASE PARAMETERS ACCORDION */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 overflow-hidden">
            <button
              onClick={() => setIsParamsOpen(!isParamsOpen)}
              className="w-full px-3 py-2 bg-slate-50/90 dark:bg-slate-950/80 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] flex items-center gap-1.5">
                <span>{isParamsOpen ? '▾' : '▸'}</span>
                <span>Case Parameters</span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {isParamsOpen ? `${knownCount}/${totalParams} gathered` : `${missingCount} needed`}
              </span>
            </button>

            {isParamsOpen && (
              <div className="p-2.5 space-y-2 bg-white dark:bg-slate-900/40 text-[10px] border-t border-slate-200 dark:border-slate-800">
                {/* Progress bar */}
                <div className="space-y-1 pb-1">
                  <div className="flex justify-between text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <span>Progress</span>
                    <span>{completionPct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-950 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                </div>

                {/* Known items */}
                {caseState?.known_information && caseState.known_information.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Gathered:
                    </span>
                    {caseState.known_information.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        <span className="text-emerald-500">✓</span>
                        <span className="truncate">{item}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Missing items */}
                {caseState?.missing_information && caseState.missing_information.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Pending Clarification:
                    </span>
                    {caseState.missing_information.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                        <span className="text-amber-500">○</span>
                        <span className="truncate">{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 3: COLLAPSIBLE IP DOMAINS ACCORDION */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 overflow-hidden">
            <button
              onClick={() => setIsIpDomainsOpen(!isIpDomainsOpen)}
              className="w-full px-3 py-2 bg-slate-50/90 dark:bg-slate-950/80 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] flex items-center gap-1.5">
                <span>{isIpDomainsOpen ? '▾' : '▸'}</span>
                <span>IP Domains</span>
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                activeDomainsCount > 0
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}>
                {activeDomainsCount} active
              </span>
            </button>

            {isIpDomainsOpen && (
              <div className="p-2 space-y-1 bg-white dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800">
                {allIpDomains.map((dom) => {
                  const isRelevant = latestResponse?.relevant_ip_domains.includes(dom.id);
                  return (
                    <div
                      key={dom.id}
                      className={`px-2 py-1 rounded-md flex items-center justify-between text-[10px] transition-all ${
                        isRelevant
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-semibold'
                          : 'text-slate-500 dark:text-slate-400 opacity-70'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{dom.icon}</span>
                        <span>{dom.label}</span>
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                        isRelevant
                          ? 'bg-emerald-500 text-white dark:text-slate-950 font-black'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}>
                        {isRelevant ? 'ON' : 'Off'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 4: COLLAPSIBLE VERIFIED CITATIONS ACCORDION */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 overflow-hidden">
            <button
              onClick={() => setIsSourcesOpen(!isSourcesOpen)}
              className="w-full px-3 py-2 bg-slate-50/90 dark:bg-slate-950/80 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] flex items-center gap-1.5">
                <span>{isSourcesOpen ? '▾' : '▸'}</span>
                <span>Verified Sources</span>
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                citationsCount > 0
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}>
                {citationsCount}
              </span>
            </button>

            {isSourcesOpen && (
              <div className="p-2 space-y-2 bg-white dark:bg-slate-900/40 text-[10px] border-t border-slate-200 dark:border-slate-800 max-h-60 overflow-y-auto">
                {latestResponse?.citations && latestResponse.citations.length > 0 ? (
                  latestResponse.citations.map((c, cIdx) => (
                    <div key={cIdx} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-bold text-slate-900 dark:text-slate-200 truncate">{c.source}</span>
                        <span className={`px-1 py-0.2 rounded text-[8px] font-extrabold uppercase shrink-0 ${
                          c.is_authoritative
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {c.is_authoritative ? '✓ Auth' : 'Ref'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 font-mono text-[9px]">
                        <span className="truncate">{c.section_or_rule || 'Statutory Section'}</span>
                        {c.support_status && (
                          <span className="text-[8px] font-bold text-emerald-700 dark:text-emerald-400">
                            {c.support_status}
                          </span>
                        )}
                      </div>
                      {c.snippet && (
                        <div className="text-slate-600 dark:text-slate-400 text-[9px] line-clamp-2 italic bg-white dark:bg-slate-900/60 p-1 rounded border border-slate-200/60 dark:border-slate-800/60">
                          &ldquo;{c.snippet}&rdquo;
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-[10px] italic p-2 text-center">
                    Citations appear when a query is submitted.
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. POPUP MODALS (Preserved) */}
      {/* ========================================================================= */}
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
        chatHistory={chatHistory}
        jurisdiction={jurisdiction}
        country={country}
      />

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          fetchUserCases();
        }}
        title="Sign In to Save Consultations"
        subtitle="Sign in with Google or email so your consultations and case history are saved and accessible anytime."
      />
    </div>
  );
}

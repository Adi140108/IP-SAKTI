'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createCase, sendChatMessage, getCase, uploadDocument, updateCase } from '@/lib/api';
import { ChatResponse, CaseState } from '@/types';
import { FORMULATION_TIERS, getTierFromClassification } from '@/lib/formulationTaxonomy';
import FormulationPathwayModal from '@/components/FormulationPathwayModal';
import OfficialFormsModal from '@/components/OfficialFormsModal';
import DossierExportModal from '@/components/DossierExportModal';

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
  const [caseId, setCaseId] = useState<string>('');
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [jurisdiction, setJurisdiction] = useState<'India' | 'International'>('India');
  const [country, setCountry] = useState<string>('');
  const [language, setLanguage] = useState<string>('en');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'assistant'; data?: ChatResponse; text?: string }>>([]);
  const [latestResponse, setLatestResponse] = useState<ChatResponse | null>(null);

  // Modals state
  const [showPathwayModal, setShowPathwayModal] = useState<boolean>(false);
  const [showFormsModal, setShowFormsModal] = useState<boolean>(false);
  const [showDossierModal, setShowDossierModal] = useState<boolean>(false);

  // Document Upload State
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice & Speech Controls (Sound ON/OFF, Female Voice, Slower Speed 0.85x)
  const [isListening, setIsListening] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<string>('');

  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  const refreshCaseState = useCallback(async (id: string) => {
    try {
      const state = await getCase(id);
      setCaseState(state);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const startNewConsultation = useCallback(() => {
    localStorage.removeItem('ip_sakti_active_case_id');
    localStorage.removeItem('ip_sakti_chat_history');
    setChatHistory([]);
    setLatestResponse(null);
    setCaseState(null);

    createCase({ jurisdiction, country, language })
      .then((res) => {
        setCaseId(res.case_id);
        setCaseState(res);
        localStorage.setItem('ip_sakti_active_case_id', res.case_id);
      })
      .catch((err) => console.error('Failed to init case:', err));
  }, [jurisdiction, country, language]);

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

  // Helper: Find Natural Female Voice
  const getFemaleVoice = (): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const femaleKeywords = [
      'female', 'zira', 'samantha', 'google us english', 'victoria', 'karen', 
      'veena', 'swara', 'kalpana', 'hazel', 'susan', 'aria', 'jenny', 'heera', 'anita'
    ];

    const found = voices.find((v) => {
      const n = v.name.toLowerCase();
      return femaleKeywords.some((k) => n.includes(k));
    });

    return found || voices[0];
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
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-US';

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

  // Speech Synthesis (Text-to-Speech / Female Voice / Slower Speed 0.85x)
  const speakText = (text: string, idx?: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    if (idx !== undefined && speakingIdx === idx) {
      setSpeakingIdx(null);
      return;
    }

    const cleanedText = text.replace(/[*#`>_-]/g, ' ').replace(/\s+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(cleanedText.slice(0, 350));
    
    utterance.rate = 0.85;
    utterance.pitch = 1.05;

    const femaleVoice = getFemaleVoice();
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-US';

    if (idx !== undefined) setSpeakingIdx(idx);

    utterance.onend = () => setSpeakingIdx(null);
    utterance.onerror = () => setSpeakingIdx(null);

    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = customMessage || inputMessage;
    if (!textToSend.trim() || loading) return;

    setLoading(true);
    setChatHistory((prev) => [...prev, { sender: 'user', text: textToSend }]);
    if (!customMessage) setInputMessage('');

    try {
      const res = await sendChatMessage({
        case_id: caseId || 'default_case',
        message: textToSend,
        language,
        jurisdiction,
        country: jurisdiction === 'International' ? country : undefined
      });

      const newIdx = chatHistory.length + 1;
      setChatHistory((prev) => [...prev, { sender: 'assistant', data: res }]);
      setLatestResponse(res);
      if (caseId) refreshCaseState(caseId);

      // Auto-speak in Female Voice if Sound ON is enabled
      if (soundEnabled && res.answer) {
        speakText(
          res.next_question ? `${res.answer.slice(0, 140)}. Next question: ${res.next_question}` : res.answer, 
          newIdx
        );
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
    if (!file || !caseId) return;

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

  // Compute parameter completion percentage
  const knownCount = caseState?.known_information?.length || 0;
  const missingCount = caseState?.missing_information?.length || 0;
  const totalParams = knownCount + missingCount || 7;
  const completionPct = Math.round((knownCount / totalParams) * 100);

  const activeTier = getTierFromClassification(caseState?.formulation_classification || caseState?.product_type);

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] overflow-hidden space-y-3 pb-2">
      
      {/* COMPACT TOP CONTROL BAR */}
      <div className="glass-panel p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm transition-colors">
        
        {/* Jurisdiction & New Case Session Button */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={startNewConsultation}
            className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-slate-950 border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 dark:hover:text-slate-950 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
            title="Start New Case Session"
          >
            <span>➕ New Case</span>
          </button>

          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Regime:</span>
          <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setJurisdiction('India')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                jurisdiction === 'India'
                  ? 'bg-emerald-500 text-white dark:text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              🇮🇳 INDIA
            </button>
            <button
              onClick={() => setJurisdiction('International')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                jurisdiction === 'International'
                  ? 'bg-cyan-500 text-white dark:text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              🌐 INTERNATIONAL
            </button>
          </div>

          {jurisdiction === 'International' && (
            <input
              type="text"
              placeholder="Country (e.g. Germany, USA, Japan)"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          )}
        </div>

        {/* Feature Actions: Official Forms & Dossier Export */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPathwayModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
            title="View 6-Tier Formulation Legal Classification Roadmap"
          >
            <span>⚖️ 6-Tier Pathway</span>
          </button>

          <button
            onClick={() => setShowFormsModal(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/40 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
            title="Official Registry Forms & Portals (IPO, NBA, FSSAI, AYUSH)"
          >
            <span>🏛️ Official Forms</span>
          </button>

          <button
            onClick={() => setShowDossierModal(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white dark:text-slate-950 text-xs font-extrabold hover:from-emerald-400 hover:to-teal-500 transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
            title="Export Diagnostic Dossier (PDF / Markdown)"
          >
            <span>📄 Export Dossier</span>
          </button>
        </div>

        {/* Engine Status, Sound Toggle & Language Selector */}
        <div className="flex items-center gap-2.5">
          {/* Sound ON / OFF Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              soundEnabled
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-500/40 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>{soundEnabled ? '🔊' : '🔇'}</span>
            <span className="hidden sm:inline">Sound {soundEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Language Selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>

          {caseId && (
            <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-[11px] font-mono font-bold">
              #{caseId}
            </span>
          )}
        </div>
      </div>

      {/* THREE-PANE IMMERSIVE WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 overflow-hidden">
        
        {/* LEFT PANEL (Col 3): Compact Parameter Tracker & 6-Tier Classification */}
        <div className="lg:col-span-3 glass-panel p-3.5 rounded-2xl overflow-y-auto space-y-3 text-xs border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 flex flex-col justify-between shadow-xs">
          <div className="space-y-2.5">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <span>📋</span> Parameter Tracker
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 text-[10px] font-mono font-bold border border-emerald-300 dark:border-emerald-800">
                {completionPct}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                <span>Gathered Parameters</span>
                <span>{knownCount} / {totalParams}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-950 rounded-full h-1.5 overflow-hidden p-0.5 border border-slate-200 dark:border-slate-800">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>

            {/* 6-TIER FORMULATION CLASSIFICATION CARD */}
            <div className="p-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
                  <span>🏛️</span> Formulation Legal Tier
                </span>
                <button
                  onClick={() => setShowPathwayModal(true)}
                  className="text-[9px] font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Change ➔
                </button>
              </div>

              <div className="font-bold text-slate-900 dark:text-white text-[11px]">
                {activeTier.label}
              </div>

              <div className="text-[10px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                {activeTier.ipPosture}
              </div>

              <button
                onClick={() => setShowPathwayModal(true)}
                className="w-full py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 dark:hover:text-slate-950 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>View Full Legal & ABS Roadmap</span>
                <span>➔</span>
              </button>
            </div>

            {/* Unified Checklist */}
            <div className="space-y-1.5 text-[10px]">
              {/* 1. Jurisdiction */}
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[8px] block">Jurisdiction</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{jurisdiction} {country ? `(${country})` : ''}</span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-[8px] font-bold">✓ GATHERED</span>
              </div>

              {/* 2. Classical Basis */}
              <div className={`p-2 rounded-xl border flex items-center justify-between ${
                caseState?.classical_reference ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800' : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/40'
              }`}>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[8px] block">Classical Basis (TK)</span>
                  <span className={`font-bold ${caseState?.classical_reference ? 'text-slate-800 dark:text-slate-200' : 'text-amber-800 dark:text-amber-300 font-semibold'}`}>
                    {caseState?.classical_reference || 'Unspecified'}
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                  caseState?.classical_reference ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                }`}>
                  {caseState?.classical_reference ? '✓ GATHERED' : '○ NEEDED'}
                </span>
              </div>

              {/* 3. Active Herbs */}
              <div className={`p-2 rounded-xl border flex items-center justify-between ${
                caseState?.ingredients && caseState.ingredients.length > 0 ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800' : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/40'
              }`}>
                <div className="truncate pr-1">
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[8px] block">Active Herbs</span>
                  <span className={`font-bold truncate block ${caseState?.ingredients && caseState.ingredients.length > 0 ? 'text-slate-800 dark:text-slate-200' : 'text-amber-800 dark:text-amber-300 font-semibold'}`}>
                    {caseState?.ingredients && caseState.ingredients.length > 0 ? caseState.ingredients.join(', ') : 'Not specified'}
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0 ${
                  caseState?.ingredients && caseState.ingredients.length > 0 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                }`}>
                  {caseState?.ingredients && caseState.ingredients.length > 0 ? '✓ GATHERED' : '○ NEEDED'}
                </span>
              </div>

              {/* 4. Traditional Knowledge */}
              <div className={`p-2 rounded-xl border flex items-center justify-between ${
                caseState?.traditional_knowledge_involved !== null && caseState?.traditional_knowledge_involved !== undefined ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800' : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/40'
              }`}>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[8px] block">TK Involved</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {caseState?.traditional_knowledge_involved === true
                      ? 'Yes (Prior Art)'
                      : caseState?.traditional_knowledge_involved === false
                      ? 'No (Novel Formula)'
                      : 'Uncertain'}
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                  caseState?.traditional_knowledge_involved !== null && caseState?.traditional_knowledge_involved !== undefined ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                }`}>
                  {caseState?.traditional_knowledge_involved !== null && caseState?.traditional_knowledge_involved !== undefined ? '✓ GATHERED' : '○ NEEDED'}
                </span>
              </div>

              {/* 5. Indian Bio-Resources */}
              <div className={`p-2 rounded-xl border flex items-center justify-between ${
                caseState?.biological_resources_involved !== null && caseState?.biological_resources_involved !== undefined ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800' : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/40'
              }`}>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[8px] block">Indian Bio-Resources (ABS)</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {caseState?.biological_resources_involved === true
                      ? 'Yes (NBA Clearance)'
                      : caseState?.biological_resources_involved === false
                      ? 'No Indian Bio'
                      : 'Uncertain'}
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                  caseState?.biological_resources_involved !== null && caseState?.biological_resources_involved !== undefined ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                }`}>
                  {caseState?.biological_resources_involved !== null && caseState?.biological_resources_involved !== undefined ? '✓ GATHERED' : '○ NEEDED'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER PANEL (Col 6): Conversational Stream with Guidance & Question Box */}
        <div className="lg:col-span-6 flex flex-col glass-panel p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 overflow-hidden relative shadow-xs">
          
          {/* Hidden File Input for Document Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleDocumentSelected}
            accept=".pdf,.png,.jpg,.jpeg,.txt,.json,.docx"
            className="hidden"
          />

          {/* Scrollable Messages Stream */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
            {chatHistory.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-slate-500 dark:text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl">
                  ⚖️
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-200">Ayurvedic IP Consultation Assistant</h3>
                  <p className="text-xs max-w-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Ask about patents under Section 3(p), traditional knowledge prior art, National Biodiversity Authority (NBA) ABS clearance, or FSSAI Ayurveda-Aahar classification.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <button
                    onClick={() => handleSendMessage('I want to patent a novel Ayurvedic herbal formulation containing Ashwagandha and Ginger.')}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all cursor-pointer"
                  >
                    💡 Patent Ashwagandha Formula →
                  </button>
                  <button
                    onClick={() => handleSendMessage('What are the NBA Access and Benefit Sharing (ABS) compliance steps for exporting Brahmi extract?')}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 hover:border-cyan-500/50 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all cursor-pointer"
                  >
                    🌿 Biological Resource Export (ABS) →
                  </button>
                </div>
              </div>
            )}

            {chatHistory.map((item, idx) => (
              <div key={idx} className={`flex ${item.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {item.sender === 'user' ? (
                  <div className="max-w-md bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl px-3.5 py-2.5 shadow-sm text-xs font-medium leading-relaxed">
                    {item.text}
                  </div>
                ) : item.data ? (
                  <div className="w-full glass-panel p-3.5 rounded-2xl space-y-3 border border-slate-200 dark:border-slate-800/80 border-l-4 border-l-emerald-500 bg-white/95 dark:bg-slate-950/90 shadow-sm text-xs">
                    
                    {/* Header Bar with Voice Button */}
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-extrabold text-slate-900 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                          Concise Legal Guidance
                        </span>
                      </div>
                      <button
                        onClick={() => speakText(item.data!.answer, idx)}
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          speakingIdx === idx
                            ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-400 dark:border-rose-500/50 animate-pulse'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400'
                        }`}
                      >
                        <span>{speakingIdx === idx ? '⏹ Stop' : '🔊 Read Aloud (Female)'}</span>
                      </button>
                    </div>

                    {/* Safe Abstention Warning */}
                    {item.data.safe_abstention && (
                      <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                        <span>⚠️</span>
                        <div>{item.data.confidence_explanation}</div>
                      </div>
                    )}

                    {/* Human Escalation Warning */}
                    {item.data.requires_human_escalation && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">⚖️</span>
                          <div>
                            <strong className="block font-bold">Human Legal Review Required</strong>
                            <span className="text-[11px] leading-tight">This matter involves cross-border statutory considerations or novel biological formulation claims.</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowDossierModal(true)}
                          className="px-2.5 py-1 rounded-lg bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 font-bold text-[10px] hover:bg-amber-300 transition-all cursor-pointer whitespace-nowrap"
                        >
                          Export Dossier ➔
                        </button>
                      </div>
                    )}

                    {/* Rendered Guidance Payload */}
                    <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                      {item.data.answer}
                    </div>

                    {/* PROMINENT DYNAMIC QUESTION BOX WITH 1-CLICK OPTION CHIPS */}
                    {item.data.next_question && (
                      <div className="p-3.5 rounded-xl bg-emerald-50/90 dark:bg-gradient-to-r dark:from-emerald-950/70 dark:via-teal-950/50 dark:to-slate-950 border-2 border-emerald-500/50 space-y-2.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                            <span>⚡ Required Case Clarification</span>
                          </div>
                          <span className="text-[9px] text-amber-800 dark:text-amber-400 font-mono font-bold bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800/50">
                            Answer to advance
                          </span>
                        </div>

                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
                          {item.data.next_question}
                        </p>

                        {/* Clickable Options Chips */}
                        {item.data.suggested_options && item.data.suggested_options.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.data.suggested_options.map((option, optIdx) => (
                              <button
                                key={optIdx}
                                onClick={() => handleSendMessage(option)}
                                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-500/50 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 dark:hover:text-slate-950 transition-all shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer"
                              >
                                <span>👉</span>
                                <span>{option}</span>
                              </button>
                            ))}
                          </div>
                        )}
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
                    : 'Retrieving statutory RAG context & running Groq 120B reasoning...'}
                </span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* INPUT BAR WITH MIC, UPLOAD DOCUMENT & FOOTNOTE DISCLAIMER */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-1.5">
            {isListening && (
              <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 border border-rose-400 dark:border-rose-500/50 text-rose-800 dark:text-rose-300 text-[11px] flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span>Listening... Speak clearly.</span>
                </div>
                <span className="font-mono text-[10px] text-rose-700 dark:text-rose-400">{transcript}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Document Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingDoc}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/40 transition-all text-sm flex items-center justify-center cursor-pointer"
                title="Upload Document / PDF / Image (Inline OCR)"
              >
                📎
              </button>

              <button
                onClick={toggleListening}
                className={`p-2.5 rounded-xl border transition-all text-sm flex items-center justify-center cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 text-white border-rose-400 shadow-md animate-bounce'
                    : 'bg-slate-100 dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/40'
                }`}
                title="Voice Input (Speech-to-Text)"
              >
                🎙️
              </button>

              <input
                type="text"
                placeholder="Ask an Ayurvedic IP question or upload a document..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
              />

              <button
                onClick={() => handleSendMessage()}
                disabled={loading || !inputMessage.trim()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white dark:text-slate-950 font-bold text-xs hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
              >
                Send ➔
              </button>
            </div>

            {/* INTEGRATED CLEAN DISCLAIMER FOOTNOTE */}
            <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center truncate pt-0.5">
              <strong className="text-slate-600 dark:text-slate-300">Legal Informational Disclaimer:</strong> IP-SAKTI Sahayak provides source-cited guidance under SIH PS-26045. It does not provide binding legal advice.
            </p>
          </div>
        </div>

        {/* RIGHT PANEL (Col 3): Evidence Coverage & Verified Citations */}
        <div className="lg:col-span-3 glass-panel p-3.5 rounded-2xl overflow-y-auto space-y-3 text-xs border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 shadow-xs">
          
          {/* Evidence Coverage Confidence */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[9px]">Coverage Confidence</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold font-mono ${
                latestResponse?.confidence_score && latestResponse.confidence_score >= 0.5
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
              }`}>
                {latestResponse ? `${Math.round(latestResponse.confidence_score * 100)}%` : 'N/A'}
              </span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug italic">
              {latestResponse?.confidence_explanation || 'Confidence reflects statutory section coverage.'}
            </p>
          </div>

          {/* Relevant IP Domains */}
          <div className="space-y-1.5">
            <h4 className="font-extrabold text-amber-600 dark:text-amber-400 uppercase text-[9px] tracking-wider flex items-center gap-1">
              <span>📊</span> IP Domains
            </h4>
            <div className="space-y-1">
              {allIpDomains.map((dom) => {
                const isRelevant = latestResponse?.relevant_ip_domains.includes(dom.id);
                return (
                  <div key={dom.id} className={`p-1.5 rounded-lg border transition-all flex items-center justify-between ${
                    isRelevant
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800/60 shadow-xs'
                      : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800/60 opacity-60'
                  }`}>
                    <span className="text-[10px] text-slate-800 dark:text-slate-200 font-medium flex items-center gap-1">
                      <span>{dom.icon}</span>
                      <span>{dom.label}</span>
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                      isRelevant ? 'bg-emerald-500 text-white dark:text-slate-950 font-black' : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {isRelevant ? 'ON' : 'Off'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Verified Citations List */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-1.5">
            <h4 className="font-extrabold text-slate-800 dark:text-slate-200 uppercase text-[10px] tracking-wider flex items-center gap-1">
              <span>📖</span> Verified Citations ({latestResponse?.citations?.length || 0}):
            </h4>
            {latestResponse?.citations && latestResponse.citations.length > 0 ? (
              latestResponse.citations.map((c, cIdx) => (
                <div key={cIdx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-[10px]">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-bold text-slate-900 dark:text-slate-200">{c.source}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${
                      c.is_authoritative
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                    }`}>
                      {c.is_authoritative ? '✓ Authoritative' : 'Reference'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 font-mono text-[9px]">
                    <span>{c.section_or_rule || 'Statute Section'}</span>
                    {c.support_status && (
                      <span className={`text-[8px] font-bold px-1 rounded ${
                        c.support_status === 'SUPPORTED'
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80'
                          : 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/80'
                      }`}>
                        {c.support_status}
                      </span>
                    )}
                  </div>
                  {c.snippet && (
                    <div className="text-slate-600 dark:text-slate-400 text-[9px] line-clamp-3 italic bg-white dark:bg-slate-900/60 p-1.5 rounded border border-slate-200 dark:border-slate-800/60 leading-relaxed">
                      &ldquo;{c.snippet}&rdquo;
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-[10px] italic p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
                Citations will appear upon submitting a query.
              </div>
            )}
          </div>
        </div>
      </div>

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
        chatHistory={chatHistory}
        jurisdiction={jurisdiction}
        country={country}
      />
    </div>
  );
}

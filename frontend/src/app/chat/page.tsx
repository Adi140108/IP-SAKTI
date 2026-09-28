'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createCase, sendChatMessage, getCase, uploadDocument, updateCase, listCases, translateText } from '@/lib/api';
import { ChatResponse, CaseState } from '@/types';
import { FORMULATION_TIERS, getTierFromClassification } from '@/lib/formulationTaxonomy';
import { getPersistedCases, persistCase, mergeAndPersistCases } from '@/lib/caseRegistry';
import { getTranslation } from '@/lib/translations';
import { findClientMatchingPatents } from '@/lib/patents';
import FormulationPathwayModal from '@/components/FormulationPathwayModal';
import OfficialFormsModal from '@/components/OfficialFormsModal';
import DossierExportModal from '@/components/DossierExportModal';
import AuthModal from '@/components/AuthModal';
import { useAuth } from '@/components/AuthProvider';
import {
  ScalesIcon,
  LandmarkIcon,
  GlobeIcon,
  PlusIcon,
  SlidersIcon,
  VolumeIcon,
  MuteIcon,
  MicIcon,
  PaperclipIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  CheckIcon,
  CircleIcon,
  StopIcon,
  XIcon,
  PencilIcon,
  FileTextIcon,
  ClipboardIcon,
  ScrollIcon,
  TagIcon,
  MapIcon,
  CopyrightIcon,
  PaletteIcon,
  SproutIcon,
  LockIcon,
  LibraryIcon,
  LeafIcon,
  PillIcon,
  AlertIcon,
  FolderIcon,
} from '@/components/Icons';

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
  const [language, setLanguage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ip_sakti_chat_language') || 'en';
    }
    return 'en';
  });
  const [inputMessage, setInputMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'assistant'; data?: ChatResponse; text?: string }>>([]);
  const [latestResponse, setLatestResponse] = useState<ChatResponse | null>(null);

  // Saved user cases list for quick switching (hydrated on mount)
  const [userCases, setUserCases] = useState<CaseState[]>([]);
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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ip_sakti_sound_enabled') === 'true';
    }
    return false;
  });
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
    { id: 'patent', label: 'Patent', icon: ScrollIcon },
    { id: 'trademark', label: 'Trademark', icon: TagIcon },
    { id: 'gi', label: 'Geographical Indication', icon: MapIcon },
    { id: 'copyright', label: 'Copyright', icon: CopyrightIcon },
    { id: 'design', label: 'Industrial Design', icon: PaletteIcon },
    { id: 'plant_variety', label: 'Plant Variety', icon: SproutIcon },
    { id: 'trade_secret', label: 'Trade Secret', icon: LockIcon },
    { id: 'tkdl_prior_art', label: 'TKDL / Prior Art', icon: LibraryIcon },
    { id: 'abs', label: 'Access & Benefit Sharing (ABS)', icon: LeafIcon },
    { id: 'regulatory', label: 'AYUSH / FSSAI Regulatory', icon: PillIcon },
  ];

  const fetchUserCases = useCallback(async () => {
    try {
      const cases = await listCases(user?.uid || undefined);
      const merged = mergeAndPersistCases(cases);
      setUserCases(merged);
    } catch (e) {
      console.warn('Failed to list user cases from remote API, falling back to local registry:', e);
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
      if (casePickerRef.current && !casePickerRef.current.contains(event.target as Node)) {
        setCasePickerOpen(false);
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

  // Escape closes the mobile context drawer
  useEffect(() => {
    if (!showMobileSidebar) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowMobileSidebar(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showMobileSidebar]);

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

  const handleLanguageChange = async (code: string) => {
    setLanguage(code);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ip_sakti_chat_language', code);
    }
    // If there is existing chat history, translate the assistant messages to the newly chosen language
    if (chatHistory.length > 0 && code !== 'en') {
      try {
        const updated = await Promise.all(
          chatHistory.map(async (item) => {
            if (item.sender === 'assistant' && item.data && item.data.answer) {
              const translatedAnswer = await translateText(item.data.answer, code, 'en');
              const translatedQuestion = item.data.next_question
                ? await translateText(item.data.next_question, code, 'en')
                : item.data.next_question;
              const translatedOptions = item.data.suggested_options
                ? await Promise.all(item.data.suggested_options.map((opt) => translateText(opt, code, 'en')))
                : item.data.suggested_options;

              return {
                ...item,
                data: {
                  ...item.data,
                  answer: translatedAnswer,
                  next_question: translatedQuestion,
                  suggested_options: translatedOptions,
                },
              };
            }
            return item;
          })
        );
        setChatHistory(updated);
        if (updated.length > 0 && updated[updated.length - 1].data) {
          setLatestResponse(updated[updated.length - 1].data!);
        }
      } catch (e) {
        console.error('Failed to translate existing chat history:', e);
      }
    }
  };


  // Helper: Find Natural Female Voice (preferring a voice for the active language)
  const getFemaleVoice = (targetLangCode?: string): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const prefix = (targetLangCode || language).slice(0, 2);
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

  // Master Global Audio Toggle
  const toggleGlobalSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ip_sakti_sound_enabled', String(next));
    }
    if (!next) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setSpeakingIdx(null);
    } else {
      // Find the latest assistant message to speak immediately upon unmuting
      let lastAssistantIdx = -1;
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].sender === 'assistant' && chatHistory[i].data?.answer) {
          lastAssistantIdx = i;
          break;
        }
      }
      if (lastAssistantIdx !== -1 && chatHistory[lastAssistantIdx]?.data?.answer) {
        speakText(
          chatHistory[lastAssistantIdx].data!.answer,
          lastAssistantIdx,
          chatHistory[lastAssistantIdx].data!.next_question
        );
      }
    }
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

      // Resilient fallback: If backend matches are empty or still deploying, check verified client catalog
      if (!res.prior_art_matches || res.prior_art_matches.length === 0) {
        const clientMatches = findClientMatchingPatents(textToSend);
        if (clientMatches.length > 0) {
          res.prior_art_matches = clientMatches;
        }
      }

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

  // Parameters count
  const knownCount = caseState?.known_information?.length || 0;
  const missingCount = caseState?.missing_information?.length || 0;
  const totalParams = knownCount + missingCount || 7;
  const completionPct = Math.round((knownCount / totalParams) * 100);

  const activeTier = getTierFromClassification(caseState?.formulation_classification || caseState?.product_type);
  const activeDomainsCount = latestResponse?.relevant_ip_domains?.length || 0;
  const citationsCount = latestResponse?.citations?.length || 0;

  // Only the newest few messages stagger in; older ones never re-animate.
  const staggerFor = (idx: number) => {
    const fromEnd = chatHistory.length - 1 - idx;
    if (fromEnd < 0 || fromEnd > 2) return undefined;
    return { animationDelay: `${fromEnd * 70}ms` };
  };

  const t = getTranslation(language);

  return (
    <div className="app-fill flex flex-col gap-3 sm:gap-4">

      {/* ========================================================================= */}
      {/* 1. COMPACT CASE CONTEXT BAR */}
      {/* ========================================================================= */}
      <div className="panel flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* New Case Button */}
          <button
            onClick={startNewConsultation}
            title="Start New Case Session"
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-accent hover:bg-accent hover:text-accent-fg"
          >
            <PlusIcon size={13} />
            <span className="hidden sm:inline">{t.newCaseButton || 'New Case'}</span>
          </button>

          {/* Regime Switcher */}
          <div
            className="inline-flex items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5"
            role="group"
            aria-label="Regime"
          >
            <button
              onClick={() => setJurisdiction('India')}
              aria-pressed={jurisdiction === 'India'}
              className={`inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                jurisdiction === 'India'
                  ? 'bg-surface text-ink shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <LandmarkIcon size={13} />
              India
            </button>
            <button
              onClick={() => setJurisdiction('International')}
              aria-pressed={jurisdiction === 'International'}
              className={`inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                jurisdiction === 'International'
                  ? 'bg-surface text-ink shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <GlobeIcon size={13} />
              International
            </button>
          </div>

          {/* International Country Input */}
          {jurisdiction === 'International' && (
            <input
              type="text"
              placeholder="Country (e.g. USA, Germany)"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-40 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-faint"
            />
          )}

          {/* Case Switcher — lets the user jump between their saved consultations */}
          {userCases.length > 0 && (
            <div className="relative" ref={casePickerRef}>
              <button
                onClick={() => setCasePickerOpen((v) => !v)}
                aria-expanded={casePickerOpen}
                aria-haspopup="true"
                title="Switch between your saved consultations"
                className="mono-caps inline-flex items-center gap-1.5 rounded-md border border-line bg-sunken px-2.5 py-1.5 text-faint transition-colors hover:border-accent-line hover:text-ink"
              >
                <FolderIcon size={12} />
                {t.casesButton || 'Case'} #{caseId ? caseId.slice(0, 8) : 'new'}
                <ChevronDownIcon
                  size={11}
                  className={`opacity-50 transition-transform duration-200 ${
                    casePickerOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {casePickerOpen && (
                <div className="animate-liftIn absolute left-0 z-50 mt-2 max-h-80 w-[300px] overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-lift">
                  <div className="eyebrow px-2.5 pb-1 pt-1.5">{t.casesButton || 'Your Consultations'}</div>
                  {userCases.map((c, idx) => {
                    const isActive = c.case_id === caseId;
                    const tierLabel = getTierFromClassification(
                      c.formulation_classification || c.product_type
                    ).shortLabel;
                    return (
                      <button
                        key={c.case_id}
                        onClick={() => switchActiveCase(c)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                          isActive ? 'bg-accent-soft' : 'hover:bg-subtle'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="mono-caps block text-[11px] text-faint">
                            #{c.case_id.slice(0, 8)} · {c.jurisdiction}
                          </span>
                          <span
                            className={`block truncate text-[12px] ${
                              isActive ? 'font-medium text-accent-ink' : 'text-ink'
                            }`}
                          >
                            {tierLabel}
                          </span>
                        </span>
                        {isActive ? (
                          <CheckIcon size={13} className="shrink-0 text-accent" />
                        ) : (
                          <span className="shrink-0 text-[10px] text-faint">
                            {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : 'Active'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <div className="mt-1 border-t border-line pt-1">
                    <button
                      onClick={() => {
                        setCasePickerOpen(false);
                        startNewConsultation();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-accent-ink transition-colors hover:bg-accent-soft"
                    >
                      <PlusIcon size={13} />
                      {t.newCaseButton || 'Start New Consultation'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Formulation Badge with Quick Change Modal Trigger */}
          <button
            onClick={() => setShowPathwayModal(true)}
            title="Click to change 6-Tier formulation classification"
            className="inline-flex max-w-[150px] items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-2.5 py-1.5 text-[12px] font-medium text-accent-ink transition-colors hover:border-accent sm:max-w-[220px]"
          >
            <span className="truncate">{activeTier.shortLabel || activeTier.label}</span>
            <PencilIcon size={11} className="shrink-0 opacity-60" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Actions Dropdown */}
          <div className="relative" ref={actionsMenuRef}>
            <button
              onClick={() => setActionsDropdownOpen(!actionsDropdownOpen)}
              aria-expanded={actionsDropdownOpen}
              aria-haspopup="true"
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-subtle"
            >
              <SlidersIcon size={13} />
              {t.actionsButton || 'Actions'}
              <ChevronDownIcon
                size={12}
                className={`opacity-50 transition-transform duration-200 ${
                  actionsDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {actionsDropdownOpen && (
              <div className="animate-liftIn absolute right-0 z-50 mt-2 w-[240px] rounded-lg border border-line bg-surface p-1.5 shadow-lift">
                <button
                  onClick={() => {
                    setShowPathwayModal(true);
                    setActionsDropdownOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-subtle"
                >
                  <ScalesIcon size={14} className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    <span className="block text-[12px] font-medium text-ink">6-Tier Legal Pathway</span>
                    <span className="block text-[10.5px] text-faint">Formulation roadmap &amp; ABS</span>
                  </span>
                </button>

                <button
                  onClick={() => {
                    setShowFormsModal(true);
                    setActionsDropdownOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-subtle"
                >
                  <LandmarkIcon size={14} className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    <span className="block text-[12px] font-medium text-ink">Official Forms &amp; Portals</span>
                    <span className="block text-[10.5px] text-faint">IPO, NBA, FSSAI, AYUSH</span>
                  </span>
                </button>

                <button
                  onClick={() => {
                    setShowDossierModal(true);
                    setActionsDropdownOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-subtle"
                >
                  <FileTextIcon size={14} className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    <span className="block text-[12px] font-medium text-ink">Export Legal Dossier</span>
                    <span className="block text-[10.5px] text-faint">Download diagnostic report</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Master Global Speaker Toggle (Outside in Top Bar) */}
          <button
            onClick={toggleGlobalSound}
            aria-label={soundEnabled ? 'Mute spoken audio' : 'Enable spoken audio'}
            title={soundEnabled ? 'Spoken audio is ON (Click to mute)' : 'Spoken audio is OFF (Click to unmute)'}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              soundEnabled
                ? 'border-accent-line bg-accent-soft text-accent-ink'
                : 'border-line text-faint hover:border-line-strong hover:text-ink'
            }`}
          >
            {soundEnabled ? (
              <>
                <VolumeIcon size={13} className="text-accent animate-pulse" />
                <span className="hidden sm:inline">Voice ON</span>
              </>
            ) : (
              <>
                <MuteIcon size={13} />
                <span className="hidden sm:inline">Muted</span>
              </>
            )}
          </button>

          {/* Response Language Selector (Outside in Top Bar) */}
          <select
            id="chat-language"
            aria-label="Response Language"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink focus:border-accent focus:outline-none"
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
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] font-medium text-ink lg:hidden"
          >
            <ClipboardIcon size={13} />
            {t.caseContextTitle || 'Context'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN 2-PANE WORKSPACE (CHAT ~72% | COMPACT SIDEBAR ~28%) */}
      {/* ========================================================================= */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 overflow-hidden">

        {/* ===================================================================== */}
        {/* DOMINANT CHAT AREA (Col 8 / ~72% on desktop) */}
        {/* ===================================================================== */}
        <div className="panel relative flex h-full min-h-0 flex-col overflow-hidden lg:col-span-8 xl:col-span-9">
          {/* Chat Card Header */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6 sm:py-5 lg:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-sunken">
                <ScalesIcon size={17} className="text-accent" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-[17px] leading-tight text-ink">
                  {t.aiConsultationTitle || 'AI Consultation'}
                </h2>
                <p className="mt-1 truncate text-[11.5px] text-faint">
                  {t.aiConsultationSubtitle || 'Source-cited IP & regulatory guidance under Indian statutory frameworks'}
                </p>
              </div>
            </div>
            <span className="chip chip-ok">
              <span className="status-dot status-dot-ok animate-pulse-soft" aria-hidden="true" />
              {t.ragSourcesReady || 'RAG Sources Ready'}
            </span>
          </div>

          {/* Hidden File Input for Document Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleDocumentSelected}
            accept=".pdf,.png,.jpg,.jpeg,.txt,.json,.docx"
            className="hidden"
          />

          {/* Scrollable Message History Area — scrollbar stays at the panel
              edge while the conversation itself is centred to a readable
              measure, so wide monitors don't get a lopsided left gutter. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-[860px] flex-col gap-5 px-4 py-5 sm:gap-7 sm:px-6 sm:py-7 xl:max-w-[960px] lg:px-8">

            {/* Clean Minimal Empty State — no duplicate title, the panel
                header above already says "AI Consultation". */}
            {chatHistory.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-sunken">
                  <ScalesIcon size={20} className="text-accent" />
                </div>

                {!user && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <p className="text-[12.5px] text-muted">
                      {t.aiConsultationSubtitle || 'Sign in to save & resume AI consultations.'}
                    </p>
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
                    >
                      {t.signInToSave || 'Sign In'}
                    </button>
                  </div>
                )}

                <div className="rounded-lg border border-line bg-sunken px-4 py-2 text-[11.5px] font-medium text-muted">
                  {t.emptyStateTitle || 'Query the 9-language Ayurvedic IP assistant'}
                </div>

                <p className="max-w-sm text-[13px] leading-relaxed text-muted">
                  {t.emptyStateSubtitle ||
                    'Ask about patents, traditional knowledge, ABS, GI, trademarks, regulatory classification, or international IP requirements.'}
                </p>

                {/* Suggested prompts */}
                <div className="flex w-full max-w-2xl flex-wrap justify-center gap-2">
                  {[
                    t.starterPrompt1 || 'Can I patent this Ayurvedic formulation?',
                    t.starterPrompt2 || 'Does this formulation require ABS clearance from NBA?',
                    t.starterPrompt3 || 'What IP protection is available for our Ayurvedic product?',
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(prompt)}
                      className="rounded-md border border-line bg-sunken px-3.5 py-2 text-[12px] leading-snug text-muted transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-ink"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            {chatHistory.map((item, idx) => (
              <div
                key={idx}
                className={`animate-enter flex ${item.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                style={staggerFor(idx)}
              >
                {item.sender === 'user' ? (
                  <div className="max-w-[88%] whitespace-pre-wrap rounded-lg bg-accent px-4 py-2.5 text-[13.5px] leading-relaxed text-accent-fg sm:max-w-[42ch]">
                    {item.text}
                  </div>
                ) : item.data ? (
                  <div className="w-full space-y-4 rounded-lg border border-line border-l-2 border-l-accent bg-surface p-4 sm:space-y-5 sm:p-5 lg:p-6">

                    {/* Message Header Bar with Voice Button */}
                    <div className="flex items-center justify-between gap-3 border-b border-line-subtle pb-3.5">
                      <div className="flex items-center gap-2">
                        <span className="status-dot status-dot-ok" aria-hidden="true" />
                        <span className="eyebrow">{t.aiConsultationTitle || 'IP-SAKTI Legal Guidance'}</span>
                      </div>
                      <button
                        onClick={() => speakText(item.data!.answer, idx)}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                          speakingIdx === idx
                            ? 'border-danger-line bg-danger-soft text-danger'
                            : 'border-line text-muted hover:border-line-strong hover:text-ink'
                        }`}
                      >
                        {speakingIdx === idx ? <StopIcon size={12} /> : <VolumeIcon size={12} />}
                        {speakingIdx === idx ? 'Stop' : 'Listen (TTS)'}
                      </button>
                    </div>

                    {/* Safe Abstention Warning */}
                    {item.data.safe_abstention && (
                      <div className="flex items-start gap-2.5 rounded-md border border-danger-line bg-danger-soft px-4 py-3.5 text-[12.5px] leading-relaxed text-danger">
                        <AlertIcon size={15} className="mt-0.5 shrink-0" />
                        <div>{item.data.confidence_explanation}</div>
                      </div>
                    )}

                    {/* Human Escalation Warning */}
                    {item.data.requires_human_escalation && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn-line bg-warn-soft px-4 py-3.5 text-[12.5px] leading-relaxed text-warn">
                        <div className="flex items-start gap-2.5">
                          <ScalesIcon size={15} className="mt-0.5 shrink-0" />
                          <div>
                            <strong className="font-semibold">Human Legal Review Recommended:</strong>{' '}
                            Novel biological claims or cross-border statutory considerations.
                          </div>
                        </div>
                        <button
                          onClick={() => setShowDossierModal(true)}
                          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-warn px-2.5 py-1.5 text-[11px] font-semibold text-canvas transition-opacity hover:opacity-90"
                        >
                          Export Dossier
                          <ArrowRightIcon size={12} />
                        </button>
                      </div>
                    )}

                    {/* Rendered Guidance Payload */}
                    <div className="legal-prose">{item.data.answer}</div>

                    {/* Prominent Dynamic Question Box with 1-Click Option Chips */}
                    {item.data.next_question && (
                      <div className="space-y-3.5 rounded-md border border-accent-line bg-accent-soft p-5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="eyebrow text-accent-ink">{t.caseClarification || 'Case Clarification'}</span>
                          <span className="mono-caps text-faint">{t.selectToProceed || 'Select to proceed'}</span>
                        </div>

                        <p className="text-[14px] font-medium leading-relaxed text-ink">
                          {item.data.next_question}
                        </p>

                        {/* Clickable Option Chips */}
                        {item.data.suggested_options && item.data.suggested_options.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {item.data.suggested_options.map((option, optIdx) => (
                              <button
                                key={optIdx}
                                onClick={() => handleOptionChipClick(option)}
                                className="rounded-md border border-accent-line bg-surface px-3.5 py-2 text-[12px] font-medium text-accent-ink transition-colors hover:border-accent hover:bg-accent hover:text-accent-fg"
                              >
                                {option}
                              </button>
                            ))}
                            <button
                              onClick={() => handleOptionChipClick('✏️ Type Custom Answer')}
                              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong bg-surface px-3.5 py-2 text-[12px] font-medium text-muted transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-ink"
                            >
                              <PencilIcon size={13} />
                              {t.typeCustomAnswer || 'Type Custom Answer'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-w-md rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-[12.5px] leading-relaxed text-danger">
                    {item.text}
                  </div>
                )}
              </div>
            ))}

            {(loading || isUploadingDoc) && (
              <div className="animate-liftIn space-y-3 rounded-md border border-line bg-sunken px-5 py-5">
                <div className="flex items-center gap-3 text-[12.5px] text-muted">
                  <span
                    className="h-3.5 w-3.5 shrink-0 animate-spin-slow rounded-full border-2 border-line-strong border-t-accent"
                    aria-hidden="true"
                  />
                  <span>
                    {isUploadingDoc
                      ? (t.extractingDoc || 'Extracting document text via OCR and updating case state...')
                      : (t.retrievingSources || 'Retrieving statutory RAG context & running Groq reasoning...')}
                  </span>
                </div>
                <div className="space-y-2" aria-hidden="true">
                  <div className="skeleton h-2.5 w-11/12 rounded-full" />
                  <div className="skeleton h-2.5 w-full rounded-full" />
                  <div className="skeleton h-2.5 w-7/12 rounded-full" />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
            </div>
          </div>

          {/* =================================================================== */}
          {/* STICKY CHAT INPUT BAR */}
          {/* =================================================================== */}
          <div className="shrink-0 border-t border-line px-4 py-4 sm:px-6 sm:py-5 lg:px-7">
            <div className="mx-auto w-full max-w-[860px] xl:max-w-[960px]">
            {isListening && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-[12px] text-danger">
                <div className="flex items-center gap-2">
                  <span className="status-dot status-dot-danger animate-pulse-soft" aria-hidden="true" />
                  <span>{t.listeningText || 'Listening... Speak your query clearly.'}</span>
                </div>
                <span className="mono-caps truncate opacity-80">{transcript}</span>
              </div>
            )}

            <div className="flex items-center gap-2.5">
              {/* Document Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingDoc}
                title="Upload Document / PDF / Image (Inline OCR)"
                aria-label="Upload document"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50 sm:h-10 sm:w-10"
              >
                <PaperclipIcon size={16} />
              </button>

              {/* Speech-to-Text Microphone Button */}
              <button
                onClick={toggleListening}
                title="Voice Input (Speech-to-Text)"
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors sm:h-10 sm:w-10 ${
                  isListening
                    ? 'border-danger-line bg-danger-soft text-danger'
                    : 'border-line bg-sunken text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <MicIcon size={16} />
              </button>

              {/* Query Text Input */}
              <input
                type="text"
                placeholder={t.inputPlaceholder || "Ask an Ayurvedic IP question or upload a document..."}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 py-2.5 text-[13.5px] text-ink placeholder:text-faint"
              />

              {/* Send Button */}
              <button
                onClick={() => handleSendMessage()}
                disabled={loading || !inputMessage.trim()}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-accent px-5 text-[13px] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:h-10"
              >
                {t.sendButton?.replace('➔', '').trim() || 'Send'}
                <ArrowRightIcon size={14} />
              </button>
            </div>

            {/* Clean Disclaimer Footnote */}
            <p className="mt-3.5 truncate text-center text-[10.5px] text-faint">
              {t.disclaimer || 'Disclaimer: IP-SAKTI Sahayak provides statutory information under SIH PS-26045. It does not replace professional legal counsel.'}
            </p>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* COMPACT CASE CONTEXT SIDEBAR (Col 4 / ~28% on desktop) */}
        {/* ===================================================================== */}
        {/* Mobile backdrop for the context drawer */}
        {showMobileSidebar && (
          <div
            onClick={() => setShowMobileSidebar(false)}
            aria-hidden="true"
            className="animate-fadeIn fixed inset-0 z-40 bg-ink/40 lg:hidden"
          />
        )}

        <aside
          className={`panel h-full min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)] lg:col-span-4 lg:flex lg:rounded-lg xl:col-span-3 ${
            showMobileSidebar
              ? 'animate-liftIn fixed inset-y-0 right-0 z-50 flex w-[min(380px,92vw)] rounded-l-lg border-y-0 border-r-0 p-4'
              : 'hidden lg:flex'
          } flex-col gap-4 p-4 text-[12.5px] sm:p-5`}
        >
          {/* Sidebar Header with Coverage Confidence */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line pb-4">
            <div className="flex items-center gap-2.5">
              <h3 className="eyebrow">{t.caseContextTitle || 'Case Context'}</h3>
              {showMobileSidebar && (
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  aria-label="Close case context"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] text-muted lg:hidden"
                >
                  <XIcon size={11} /> Close
                </button>
              )}
            </div>

            {/* Coverage Confidence Badge */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-faint">{t.coverageLabel || 'Coverage'}</span>
              <span
                className={`chip ${
                  latestResponse?.confidence_score && latestResponse.confidence_score >= 0.5
                    ? 'chip-ok'
                    : 'chip-warn'
                }`}
              >
                {latestResponse ? `${Math.round(latestResponse.confidence_score * 100)}%` : 'N/A'}
              </span>
            </div>
          </div>

          {/* SECTION 1: COMPACT CASE CONTEXT ROWS */}
          <div className="panel-sunken shrink-0 p-4">
            <Row label={t.jurisdictionLabel || 'Jurisdiction'}>
              {jurisdiction} {country ? `(${country})` : ''}
            </Row>
            <Row label={t.formulationLabel || 'Formulation'} last={false}>
              <button
                onClick={() => setShowPathwayModal(true)}
                className="inline-flex max-w-[150px] items-center gap-1.5 text-left font-medium text-accent-ink hover:underline"
                title="Change formulation tier"
              >
                <span className="truncate">{activeTier.shortLabel || activeTier.label}</span>
                <PencilIcon size={10} className="shrink-0 opacity-60" />
              </button>
            </Row>
            <Row label={t.classicalBasisLabel || 'Classical Basis'} warn={!caseState?.classical_reference}>
              {caseState?.classical_reference || t.unspecified || 'Unspecified'}
            </Row>
            <Row label={t.activeHerbsLabel || 'Active Herbs'} warn={!caseState?.ingredients?.length}>
              {caseState?.ingredients && caseState.ingredients.length > 0
                ? caseState.ingredients.join(', ')
                : (t.notSpecified || 'Not specified')}
            </Row>
            <Row label={t.tkInvolvedLabel || 'TK Involved'} last={false}>
              {caseState?.traditional_knowledge_involved === true
                ? (t.tkYes || 'Yes (Prior Art)')
                : caseState?.traditional_knowledge_involved === false
                  ? (t.tkNo || 'No (Novel)')
                  : (t.tkUncertain || 'Uncertain')}
            </Row>
            <Row label={t.bioResourcesLabel || 'Bio Resources (ABS)'} last>
              {caseState?.biological_resources_involved === true
                ? (t.bioYes || 'Yes (NBA Clearance)')
                : caseState?.biological_resources_involved === false
                  ? (t.bioNo || 'No Indian Bio')
                  : (t.bioUncertain || 'Uncertain')}
            </Row>
          </div>

          {/* SECTION 2: COLLAPSIBLE CASE PARAMETERS ACCORDION */}
          <Accordion
            open={isParamsOpen}
            onToggle={() => setIsParamsOpen(!isParamsOpen)}
            title={t.caseParametersTitle || 'Case Parameters'}
            trailing={
              <span className="text-[11px] text-faint">
                {isParamsOpen ? `${knownCount}/${totalParams} ${t.gatheredCount || 'gathered'}` : `${missingCount} ${t.neededCount || 'needed'}`}
              </span>
            }
          >
            <div className="space-y-3.5 p-4">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">{t.progressLabel || 'Progress'}</span>
                  <span className="mono-caps text-muted">{completionPct}%</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-valuenow={completionPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Case parameter coverage"
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>

              {/* Known items */}
              {caseState?.known_information && caseState.known_information.length > 0 && (
                <div className="space-y-1.5">
                  <span className="eyebrow text-ok">{t.gatheredLabel || 'Gathered'}</span>
                  {caseState.known_information.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[12px] leading-snug text-muted">
                      <CheckIcon size={12} className="mt-0.5 shrink-0 text-ok" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Missing items */}
              {caseState?.missing_information && caseState.missing_information.length > 0 && (
                <div className="space-y-1.5 border-t border-line-subtle pt-3">
                  <span className="eyebrow text-warn">{t.pendingClarificationLabel || 'Pending Clarification'}</span>
                  {caseState.missing_information.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[12px] leading-snug text-faint">
                      <CircleIcon size={12} className="mt-0.5 shrink-0 text-warn" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Accordion>

          {/* SECTION 3: COLLAPSIBLE IP DOMAINS ACCORDION */}
          <Accordion
            open={isIpDomainsOpen}
            onToggle={() => setIsIpDomainsOpen(!isIpDomainsOpen)}
            title={t.ipDomainsTitle || 'IP Domains'}
            trailing={
              <span className={activeDomainsCount > 0 ? 'chip chip-accent' : 'chip chip-neutral'}>
                {activeDomainsCount} {t.activeCount || 'active'}
              </span>
            }
          >
            <div className="space-y-1 p-2.5">
              {allIpDomains.map((dom) => {
                const isRelevant = latestResponse?.relevant_ip_domains.includes(dom.id);
                const Icon = dom.icon;
                return (
                  <div
                    key={dom.id}
                    className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[12px] transition-colors ${
                      isRelevant ? 'bg-accent-soft text-accent-ink' : 'text-faint'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon size={13} className="shrink-0" />
                      <span className="truncate">{dom.label}</span>
                    </span>
                    <span className="shrink-0">
                      {isRelevant ? (
                        <span className="chip chip-accent">ON</span>
                      ) : (
                        <span className="text-[11px] text-faint">Off</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </Accordion>

          {/* SECTION 4: COLLAPSIBLE VERIFIED CITATIONS ACCORDION */}
          <Accordion
            open={isSourcesOpen}
            onToggle={() => setIsSourcesOpen(!isSourcesOpen)}
            title={t.verifiedSourcesTitle || 'Verified Sources'}
            trailing={
              <span className={citationsCount > 0 ? 'chip chip-accent' : 'chip chip-neutral'}>
                {citationsCount}
              </span>
            }
          >
            <div className="space-y-2.5 p-3">
              {latestResponse?.citations && latestResponse.citations.length > 0 ? (
                latestResponse.citations.map((c, cIdx) => (
                  <div key={cIdx} className="panel-sunken space-y-2 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-medium leading-snug text-ink">{c.source}</span>
                      <span
                        className={`chip shrink-0 ${c.is_authoritative ? 'chip-ok' : 'chip-neutral'}`}
                      >
                        {c.is_authoritative ? (t.authBadge || 'Auth') : (t.refBadge || 'Ref')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="mono-caps truncate text-accent-ink">
                        {c.section_or_rule || 'Statutory Section'}
                      </span>
                      {c.support_status && (
                        <span
                          className={`chip shrink-0 ${
                            c.support_status === 'SUPPORTED'
                              ? 'chip-ok'
                              : c.support_status === 'PARTIALLY_SUPPORTED'
                                ? 'chip-warn'
                                : c.support_status === 'UNSUPPORTED'
                                  ? 'chip-danger'
                                  : 'chip-neutral'
                          }`}
                        >
                          {c.support_status}
                        </span>
                      )}
                    </div>
                    {c.snippet && (
                      <p className="border-l-2 border-line-strong pl-2.5 text-[11.5px] leading-relaxed text-faint italic">
                        &ldquo;{c.snippet}&rdquo;
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="p-3 text-center text-[11.5px] text-faint italic">
                  {t.citationsEmpty || 'Citations appear when a query is submitted.'}
                </p>
              )}
            </div>
          </Accordion>
        </aside>
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
          setShowAuthModal(false);
          fetchUserCases();
        }}
        title="Sign In to Save & Resume Consultations"
        subtitle="Sign in so your cases and chat history are saved to your account and can be resumed across devices."
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local presentational helpers                                       */
/* ------------------------------------------------------------------ */

function Row({
  label,
  children,
  warn,
  last,
}: {
  label: string;
  children: React.ReactNode;
  warn?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 py-2.5 text-[12px] ${
        last ? '' : 'border-b border-line-subtle'
      }`}
    >
      <span className="shrink-0 text-faint">{label}</span>
      <span
        className={`text-right font-medium leading-snug ${warn ? 'text-warn' : 'text-ink'}`}
      >
        {children}
      </span>
    </div>
  );
}

function Accordion({
  open,
  onToggle,
  title,
  trailing,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  trailing: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0 overflow-hidden rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 bg-sunken px-4 py-3 text-left transition-colors hover:bg-subtle"
      >
        <span className="flex items-center gap-2">
          <span
            className={`text-faint transition-transform duration-200 ${
              open ? 'rotate-0' : '-rotate-90'
            }`}
          >
            <ChevronDownIcon size={13} />
          </span>
          <span className="eyebrow">{title}</span>
        </span>
        {trailing}
      </button>
      {open && (
        <div className="border-t border-line bg-surface">
          {children}
        </div>
      )}
    </div>
  );
}

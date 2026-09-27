export interface Citation {
  source: string;
  source_id?: string;
  document_id?: string;
  section_or_rule?: string;
  jurisdiction: string;
  country?: string;
  region?: string;
  effective_date?: string;
  snippet?: string;
  is_authoritative: boolean;
  support_status?: 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED' | 'UNVERIFIED';
  source_url?: string;
}

export interface ChatResponse {
  case_id: string;
  message_id: string;
  answer: string;
  jurisdiction: string;
  country?: string;
  relevant_ip_domains: string[];
  product_classification: string;
  citations: Citation[];
  confidence_score: number;
  confidence_explanation: string;
  next_question?: string;
  suggested_options?: string[];
  audio_url?: string;
  requires_human_escalation: boolean;
  safe_abstention: boolean;
}

export interface PreviousAnswer {
  question_id?: string;
  question_text?: string;
  answer_text?: string;
  timestamp?: string;
}

export interface EvidenceReference {
  chunk_id?: string;
  source_id?: string;
  document_id?: string;
  section?: string;
  snippet?: string;
  relevance_score?: number;
}

export interface ConversationHistoryItem {
  id?: string;
  sender?: 'user' | 'assistant';
  content?: string;
  text?: string;
  user_message?: string;
  assistant_answer?: string;
  next_question?: string;
  suggested_options?: string[];
  citations?: Citation[];
  timestamp?: string;
  data?: ChatResponse;
}

export interface CaseState {
  case_id: string;
  user_id: string;
  language: string;
  jurisdiction: string;
  country?: string;
  region?: string;
  product_name?: string;
  product_type?: string;
  ingredients: string[];
  source_of_ingredients?: string;
  intended_use?: string;
  dosage_or_form?: string;
  manufacturing_context?: string;
  formulation_classification: string;
  classical_reference?: string;
  traditional_knowledge_involved?: boolean;
  biological_resources_involved?: boolean;
  access_and_benefit_sharing?: boolean;
  intellectual_property_objective: string[];
  international_market: string[];
  uploaded_documents: string[];
  previous_answers: PreviousAnswer[];
  known_information: string[];
  missing_information: string[];
  classification_confidence?: number;
  jurisdiction_confidence?: number;
  confidence?: number;
  evidence_references: EvidenceReference[];
  conversation_history: ConversationHistoryItem[];
  current_intent?: string;
  conversation_stage: string;
  created_at?: string;
  updated_at?: string;
}

export interface OCRResult {
  file_id: string;
  filename: string;
  ocr_engine: string;
  status: string;
  language: string;
  page_count: number;
  processed_time: string;
  extracted_text: string;
  error?: string;
}

export interface DocumentMetadata {
  file_id: string;
  case_id: string;
  filename: string;
  content_type: string;
  file_size_bytes: number;
  storage_provider: string;
  storage_url?: string;
  upload_timestamp: string;
  ocr_result?: OCRResult;
}

export interface ServiceStatus {
  name: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  details?: string;
}

export interface DiagnosticsStatus {
  backend: ServiceStatus;
  groq?: ServiceStatus;
  firestore: ServiceStatus;
  backblaze: ServiceStatus;
  ollama_gemma: ServiceStatus;
  bhashini: ServiceStatus;
  vector_db: ServiceStatus;
  timestamp: string;
}

export interface EscalationDossier {
  case_id: string;
  user_objective: string;
  product_classification: string;
  jurisdiction: string;
  country?: string;
  relevant_ip_domains: string[];
  known_information: string[];
  missing_information: string[];
  sources_found: EvidenceReference[];
  questions_requiring_human_review: string[];
  generated_at: string;
}

export interface LegalSourceItem {
  source_id: string;
  source_title: string;
  jurisdiction: string;
  authority?: string;
  ip_domain: string;
  sections: string[];
  effective_date?: string;
  sample_content: string;
}

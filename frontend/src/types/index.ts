export interface Citation {
  source: string;
  section_or_rule?: string;
  jurisdiction: string;
  effective_date?: string;
  snippet?: string;
  is_authoritative: boolean;
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
  previous_answers: any[];
  known_information: string[];
  missing_information: string[];
  classification_confidence?: number;
  jurisdiction_confidence?: number;
  evidence_references: any[];
  conversation_history: any[];
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
  sources_found: any[];
  questions_requiring_human_review: string[];
  generated_at: string;
}

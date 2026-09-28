export interface Citation {
  source: string;
  source_id?: string;
  document_id?: string;
  section_or_rule?: string;
  jurisdiction: string;
  country?: string;
  region?: string;
  effective_date?: string;
  authority?: string;
  snippet?: string;
  is_authoritative: boolean;
  support_status?: 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED' | 'UNVERIFIED';
  source_url?: string;
  checksum_sha256?: string;
  checksum?: string;
}

export interface PriorArtMatch {
  title: string;
  source_id?: string;
  source_type: string;
  jurisdiction: string;
  country?: string;
  publication_number?: string;
  filing_date?: string;
  matched_features: string[];
  relevance_score: number;
  match_category: string;
  provenance: string;
  source_url?: string;
  citation_metadata?: Record<string, any>;
  explanation?: string;
  disclaimer: string;
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
  prior_art_matches?: PriorArtMatch[];
  audio_url?: string;
  requires_human_escalation: boolean;
  safe_abstention: boolean;
  comparison_options?: string[];
}

export interface ComparisonDimension {
  dimension: string;
  india_law: string;
  target_law: string;
  key_difference: string;
  strategic_implication: string;
}

export interface ComparisonRequest {
  case_id: string;
  user_id?: string;
  target_country?: string;
  target_standard?: string;
  user_query?: string;
  language?: string;
}

export interface ComparisonResponse {
  case_id: string;
  target_jurisdiction: string;
  target_country: string;
  comparison_title: string;
  comparison_summary: string;
  indian_law_position: string;
  target_law_position: string;
  dimensions: ComparisonDimension[];
  filing_pathway_advice: string;
  citations: Citation[];
  confidence_score: number;
  confidence_explanation: string;
  available_countries: string[];
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
  classical_or_proprietary?: string;
  traditional_knowledge_involved?: boolean;
  biological_resources_involved?: boolean;
  access_and_benefit_sharing?: boolean;
  synergistic_efficacy_proven?: boolean;
  applicant_entity_type?: string;

  // Patent-specific intake fields
  composition_details?: string;
  novelty_aspect?: string;
  technical_improvement?: string;
  experimental_evidence?: string;
  public_disclosure?: boolean;
  public_disclosure_details?: string;
  prior_art_known?: boolean;
  prior_art_details?: string;

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
  dossier_id?: string;
  case_id: string;
  created_at?: string;
  submitted_at?: string;
  reviewed_at?: string;
  status?: 'draft' | 'ready_for_submission' | 'submitted' | 'under_review' | 'resolved' | 'cancelled';
  jurisdiction: string;
  country?: string;
  region?: string;
  language?: string;

  user_question?: string;
  case_summary?: string;
  product_name?: string;
  product_type?: string;
  formulation_classification?: string;
  classical_reference?: string;
  ingredients?: string[];
  composition_details?: string;
  intended_use?: string;
  dosage_or_form?: string;
  manufacturing_context?: string;

  intellectual_property_objective?: string[];
  relevant_ip_types?: string[];
  novelty_aspect?: string;
  technical_improvement?: string;
  experimental_evidence?: string;
  public_disclosure?: boolean;
  public_disclosure_details?: string;
  prior_art_known?: boolean;
  prior_art_details?: string;

  traditional_knowledge_involved?: boolean;
  biological_resources_involved?: boolean;
  access_and_benefit_sharing?: boolean;
  source_of_ingredients?: string;
  applicant_entity_type?: string;
  abs_assessment?: string;
  tkdl_pointers?: Record<string, any>;

  retrieved_sources?: Array<Record<string, any>>;
  authoritative_sources?: Array<Record<string, any>>;
  citations?: Citation[];
  relevant_sections?: string[];
  prior_art_matches?: PriorArtMatch[];

  confidence?: number;
  confidence_level?: string;
  confidence_reason?: string;
  unresolved_questions?: string[];
  abstention_reason?: string;
  escalation_reason?: string;
  user_note?: string;
  facilitator_notes?: string;

  audit_log?: Array<Record<string, any>>;
  disclaimer?: string;

  // Backward compatibility fields
  user_objective?: string;
  product_classification?: string;
  relevant_ip_domains?: string[];
  known_information?: string[];
  missing_information?: string[];
  sources_found?: EvidenceReference[];
  questions_requiring_human_review?: string[];
  generated_at?: string;
}

export interface EscalationSubmissionResponse {
  dossier_id: string;
  case_id: string;
  status: string;
  created_at: string;
  message: string;
  dossier?: EscalationDossier;
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

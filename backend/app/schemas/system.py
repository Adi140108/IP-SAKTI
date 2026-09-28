from typing import Dict, Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field

class ServiceStatus(BaseModel):
    name: str
    status: str  # "CONNECTED", "DISCONNECTED", "NOT_CONFIGURED", "ERROR", "PARTIAL", "READY"
    details: Optional[str] = None
    services: Optional[Dict[str, Any]] = None
    last_tested_at: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class DiagnosticsStatus(BaseModel):
    backend: ServiceStatus
    groq: Optional[ServiceStatus] = None
    firestore: ServiceStatus
    backblaze: ServiceStatus
    ollama_gemma: ServiceStatus
    bhashini: ServiceStatus
    vector_db: ServiceStatus
    timestamp: str


class EscalationDossier(BaseModel):
    # Core identifiers
    dossier_id: str = Field(default="")
    case_id: str
    created_at: str = Field(default="")
    submitted_at: Optional[str] = None
    reviewed_at: Optional[str] = None
    status: str = "draft"  # "draft", "ready_for_submission", "submitted", "under_review", "resolved", "cancelled"

    # Jurisdiction & Language
    jurisdiction: str = "India"
    country: Optional[str] = None
    region: Optional[str] = None
    language: str = "en"

    # Case Information
    user_question: Optional[str] = None
    case_summary: Optional[str] = None
    product_name: Optional[str] = None
    product_type: Optional[str] = None
    formulation_classification: str = "unknown"
    classical_reference: Optional[str] = None
    ingredients: List[str] = Field(default_factory=list)
    composition_details: Optional[str] = None
    intended_use: Optional[str] = None
    dosage_or_form: Optional[str] = None
    manufacturing_context: Optional[str] = None

    # IP Information
    intellectual_property_objective: List[str] = Field(default_factory=list)
    relevant_ip_types: List[str] = Field(default_factory=list)
    novelty_aspect: Optional[str] = None
    technical_improvement: Optional[str] = None
    experimental_evidence: Optional[str] = None
    public_disclosure: Optional[bool] = None
    public_disclosure_details: Optional[str] = None
    prior_art_known: Optional[bool] = None
    prior_art_details: Optional[str] = None

    # ABS / Traditional Knowledge
    traditional_knowledge_involved: Optional[bool] = None
    biological_resources_involved: Optional[bool] = None
    access_and_benefit_sharing: Optional[bool] = None
    source_of_ingredients: Optional[str] = None
    applicant_entity_type: Optional[str] = None
    abs_assessment: Optional[str] = None
    tkdl_pointers: Dict[str, Any] = Field(default_factory=dict)

    # Retrieved Evidence & Citations
    retrieved_sources: List[Dict[str, Any]] = Field(default_factory=list)
    authoritative_sources: List[Dict[str, Any]] = Field(default_factory=list)
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    relevant_sections: List[str] = Field(default_factory=list)

    # Prior Art Matches
    prior_art_matches: List[Dict[str, Any]] = Field(default_factory=list)

    # AI Assessment & Gaps
    confidence: float = 0.0
    confidence_level: str = "Medium"
    confidence_reason: str = ""
    unresolved_questions: List[str] = Field(default_factory=list)
    abstention_reason: Optional[str] = None
    escalation_reason: str = "User requested expert review"
    user_note: Optional[str] = None
    facilitator_notes: Optional[str] = None

    # Audit Trail
    audit_log: List[Dict[str, Any]] = Field(default_factory=list)
    disclaimer: str = "Informational case dossier for human IP facilitator review — not an AI legal verdict or determination of patentability."

    # Backward compatibility aliases
    user_objective: str = "Ayurvedic IP Protection & Regulatory Guidance"
    product_classification: str = "unknown"
    relevant_ip_domains: List[str] = Field(default_factory=list)
    known_information: List[str] = Field(default_factory=list)
    missing_information: List[str] = Field(default_factory=list)
    sources_found: List[Dict[str, Any]] = Field(default_factory=list)
    questions_requiring_human_review: List[str] = Field(default_factory=list)
    generated_at: str = Field(default="")

    model_config = ConfigDict(extra="allow")


class EscalationSubmissionRequest(BaseModel):
    case_id: str
    reason: str = "User requested expert review"
    user_note: Optional[str] = None
    trigger_type: str = "user"  # "user", "system_rule", "low_confidence", "public_disclosure"


class EscalationSubmissionResponse(BaseModel):
    dossier_id: str
    case_id: str
    status: str = "submitted"
    created_at: str
    message: str = "Human review request submitted."
    dossier: Optional[EscalationDossier] = None


class EscalationStatusUpdateRequest(BaseModel):
    status: str  # "under_review", "resolved", "cancelled", "submitted"
    facilitator_note: Optional[str] = None
    facilitator_id: Optional[str] = "facilitator_system"

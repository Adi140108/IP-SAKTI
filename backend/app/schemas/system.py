from typing import Dict, Any, List, Optional
from pydantic import BaseModel, ConfigDict

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
    case_id: str
    user_objective: str
    product_classification: str
    jurisdiction: str
    country: Optional[str] = None
    relevant_ip_domains: List[str]
    known_information: List[str]
    missing_information: List[str]
    sources_found: List[Dict[str, Any]]
    questions_requiring_human_review: List[str]
    generated_at: str

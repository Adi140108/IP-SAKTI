from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field

class Citation(BaseModel):
    source: str
    section_or_rule: Optional[str] = None
    jurisdiction: str
    effective_date: Optional[str] = None
    snippet: Optional[str] = None
    is_authoritative: bool = True

class EvidenceItem(BaseModel):
    id: str
    source_title: str
    jurisdiction: str
    ip_domain: str
    content: str
    relevance_score: float
    metadata: Dict[str, Any] = Field(default_factory=dict)

class ChatMessage(BaseModel):
    id: str
    sender: str  # "user" or "assistant"
    content: str
    timestamp: str
    language: Optional[str] = "en"
    audio_url: Optional[str] = None

class ChatRequest(BaseModel):
    case_id: str
    message: str
    language: str = "en"
    jurisdiction: str = "India"
    country: Optional[str] = None
    audio_base64: Optional[str] = None  # For BHASHINI ASR input

class ChatResponse(BaseModel):
    case_id: str
    message_id: str
    answer: str
    jurisdiction: str
    country: Optional[str] = None
    relevant_ip_domains: List[str]
    product_classification: str
    citations: List[Citation]
    confidence_score: float
    confidence_explanation: str
    next_question: Optional[str] = None
    suggested_options: Optional[List[str]] = None
    audio_url: Optional[str] = None  # For BHASHINI TTS output
    requires_human_escalation: bool = False
    safe_abstention: bool = False

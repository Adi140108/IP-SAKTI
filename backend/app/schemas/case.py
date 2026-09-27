from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field

from app.case.models import CaseState

class CaseStateUpdate(BaseModel):
    user_id: Optional[str] = None
    language: Optional[str] = None
    jurisdiction: Optional[str] = None
    country: Optional[str] = None
    product_type: Optional[str] = None
    ingredients: Optional[List[str]] = None
    intended_use: Optional[str] = None
    formulation_classification: Optional[str] = None
    classical_or_proprietary: Optional[str] = None
    traditional_knowledge_involved: Optional[bool] = None
    biological_resources_involved: Optional[bool] = None
    ip_objective: Optional[List[str]] = None
    international_market: Optional[List[str]] = None
    known_information: Optional[List[str]] = None
    missing_information: Optional[List[str]] = None
    conversation_stage: Optional[str] = None

class QuestioningResponse(BaseModel):
    next_question: str
    detected_missing_info: List[str]
    is_clarification_complete: bool
    suggested_options: Optional[List[str]] = None

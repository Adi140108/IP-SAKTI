from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class CaseState(BaseModel):
    case_id: str
    user_id: str = "guest_user"
    language: str = "en"
    jurisdiction: str = "India"          # "India" or "International"
    country: Optional[str] = None        # e.g., "Germany", "USA", "EU"
    region: Optional[str] = None

    product_name: Optional[str] = None
    product_type: Optional[str] = None
    ingredients: List[str] = Field(default_factory=list)
    source_of_ingredients: Optional[str] = None
    intended_use: Optional[str] = None
    dosage_or_form: Optional[str] = None
    manufacturing_context: Optional[str] = None

    formulation_classification: str = "unknown" # "classical", "proprietary", "new_non_classical", "phytopharmaceutical", "ayurveda_aahar", "nutraceutical", "cosmetic", "unknown"
    classical_reference: Optional[str] = None
    classical_or_proprietary: Optional[str] = None

    traditional_knowledge_involved: Optional[bool] = None
    biological_resources_involved: Optional[bool] = None
    access_and_benefit_sharing: Optional[bool] = None

    intellectual_property_objective: List[str] = Field(default_factory=list) # ["patent", "trademark", "gi", "copyright", "design", "plant_variety", "trade_secret", "tkdl_prior_art", "regulatory", "unknown"]
    international_market: List[str] = Field(default_factory=list)

    uploaded_documents: List[str] = Field(default_factory=list)
    previous_answers: List[Dict[str, Any]] = Field(default_factory=list)
    known_information: List[str] = Field(default_factory=list)
    missing_information: List[str] = Field(default_factory=list)

    classification_confidence: Optional[float] = None
    jurisdiction_confidence: Optional[float] = None
    confidence: Optional[float] = None

    evidence_references: List[Dict[str, Any]] = Field(default_factory=list)
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list)

    current_intent: str = "initial_query"
    conversation_stage: str = "intake"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @property
    def ip_objective(self) -> List[str]:
        return self.intellectual_property_objective

    @ip_objective.setter
    def ip_objective(self, value: List[str]):
        self.intellectual_property_objective = value

class ExtractionResult(BaseModel):
    extracted_updates: Dict[str, Any] = Field(default_factory=dict)
    uncertain_fields: List[str] = Field(default_factory=list)
    contradictions: List[str] = Field(default_factory=list)

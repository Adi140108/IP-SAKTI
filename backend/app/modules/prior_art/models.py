from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class PriorArtMatch(BaseModel):
    title: str
    source_id: Optional[str] = None
    source_type: str = "corpus_record"  # "statutory_record", "patent_record", "tkdl_record", "publication"
    jurisdiction: str = "India"
    country: Optional[str] = None
    publication_number: Optional[str] = None  # None unless explicitly verified in corpus
    filing_date: Optional[str] = None        # None unless explicitly verified in corpus
    matched_features: List[str] = Field(default_factory=list)
    relevance_score: float = 0.0
    match_category: str = "Related formulation/technology"  # "Strong potential prior-art relevance", "Related formulation/technology", "Related traditional knowledge", "Weak/partial similarity", "No meaningful match"
    provenance: str = "IP-SAKTI Statutory & Prior-Art Indexed Vector Corpus"
    source_url: Optional[str] = None
    citation_metadata: Dict[str, Any] = Field(default_factory=dict)
    explanation: Optional[str] = None
    disclaimer: str = "Potential match — not a legal determination."

class PriorArtSearchResult(BaseModel):
    query_used: str
    matches: List[PriorArtMatch] = Field(default_factory=list)
    total_matches: int = 0
    search_scope: str = "Indexed Statutory & Prior-Art Corpus"
    tkdl_pointers: Dict[str, Any] = Field(default_factory=dict)
    summary_message: str = "Potentially relevant prior-art/evidence found in our indexed corpus."
    public_disclosure_warning: Optional[str] = None
    requires_human_escalation: bool = False

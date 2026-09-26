from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class EvidenceChunk(BaseModel):
    chunk_id: str
    source_id: str
    document_id: Optional[str] = None
    checksum: Optional[str] = None
    title: str
    authority: str
    jurisdiction: str
    country: Optional[str] = None
    region: Optional[str] = None
    applicable_countries: List[str] = Field(default_factory=list)
    source_type: str = "statute"
    authority_level: str = "statutory"
    section: Optional[str] = ""
    article: Optional[str] = ""
    page_number: Optional[int] = None
    effective_date: Optional[str] = ""
    version: Optional[str] = ""
    retrieved_at: str = "2026-09-24"
    source_url: str = ""
    text: str
    relevance_score: float

class EvidenceContext(BaseModel):
    selected_chunks: List[EvidenceChunk] = Field(default_factory=list)
    source_metadata: List[Dict[str, Any]] = Field(default_factory=list)
    top_relevance_score: float = 0.0
    authority_level: str = "statutory" # "statutory", "regulatory_guideline", "public_pointer"
    jurisdiction: str = "India"
    version: str = "Current"
    source_url: str = ""

    def is_empty(self) -> bool:
        return len(self.selected_chunks) == 0

    def to_formatted_prompt_text(self) -> str:
        """Format evidence context into structured string for Gemma prompt."""
        if self.is_empty():
            return "No matching statutory evidence found in index."

        lines = []
        for idx, chunk in enumerate(self.selected_chunks, 1):
            sec = chunk.section or chunk.article or "General Provision"
            lines.append(
                f"[{idx}] Source: {chunk.title} ({sec})\n"
                f"    Authority: {chunk.authority} | Jurisdiction: {chunk.jurisdiction} | Version: {chunk.version}\n"
                f"    Statutory Text: \"{chunk.text}\"\n"
                f"    Source URL: {chunk.source_url}"
            )
        return "\n\n".join(lines)

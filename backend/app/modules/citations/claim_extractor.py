import re
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

logger = logging.getLogger("IP-SAKTI.ClaimExtractor")

class LegalClaim(BaseModel):
    claim_id: str
    statement: str
    cited_statute: Optional[str] = None
    cited_section: Optional[str] = None
    cited_jurisdiction: Optional[str] = None

class ClaimExtractor:
    """
    Extracts individual statutory and regulatory legal claims from generated answer text
    prior to independent citation verification against retrieved EvidenceContext.
    """

    def extract_claims_sync(self, answer_text: str) -> List[Dict[str, Any]]:
        """Synchronously extract individual material legal claims from answer text."""
        if isinstance(answer_text, list):
            text_str = "\n".join([str(item) for item in answer_text])
        else:
            text_str = str(answer_text or "")

        if not text_str.strip():
            return []

        # Split into bullets or non-empty lines
        raw_lines = [
            line.strip("- *1234567890.#> ")
            for line in text_str.split('\n')
            if len(line.strip("- *1234567890.#> ")) > 15
        ]

        # Extract explicit section references
        sec_pattern = re.compile(
            r'(?:Section|Sec\.|Article|Art\.|Rule|Monograph)\s+[0-9a-zA-Z\(\)\.\s\-]+',
            re.IGNORECASE
        )

        claims = []
        for idx, line in enumerate(raw_lines[:8]):
            sec_match = sec_pattern.search(line)
            cited_sec = sec_match.group(0).strip() if sec_match else None

            claims.append({
                "claim_id": f"CLM_{idx+1}",
                "statement": line,
                "cited_statute": None,
                "cited_section": cited_sec
            })

        return claims

    async def extract_claims(self, answer_text: str) -> List[Dict[str, Any]]:
        """Async wrapper for claim extraction."""
        return self.extract_claims_sync(answer_text)

claim_extractor = ClaimExtractor()

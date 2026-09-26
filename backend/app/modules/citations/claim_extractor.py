import logging
from typing import List, Dict, Any
from app.ai.gemma.provider import gemma_provider

logger = logging.getLogger("IP-SAKTI.ClaimExtractor")

class ClaimExtractor:
    """
    Extracts individual statutory and regulatory legal claims from generated answer text
    prior to citation verification.
    """

    async def extract_claims(self, answer_text: str) -> List[Dict[str, Any]]:
        """Extract individual material legal claims from answer text."""
        if isinstance(answer_text, list):
            text_str = "\n".join([str(item) for item in answer_text])
        else:
            text_str = str(answer_text or "")

        if not text_str.strip():
            return []

        lines = [line.strip("- *1234567890.# ") for line in text_str.split('\n') if len(line.strip()) > 15]
        claims = []
        for idx, line in enumerate(lines[:6]):
            claims.append({
                "claim_id": f"CLM_{idx+1}",
                "statement": line,
                "target_statute": "Statute",
                "target_section": ""
            })
        return claims

claim_extractor = ClaimExtractor()

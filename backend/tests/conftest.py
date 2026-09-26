import sys
import os
import pytest

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.ai.gemma.provider import gemma_provider

@pytest.fixture(autouse=True)
def mock_gemma_provider(monkeypatch):
    """Mock Gemma provider for instant, deterministic unit testing."""
    async def mock_generate_json(prompt, system_prompt):
        sp_lower = system_prompt.lower()
        p_lower = prompt.lower()

        if "structured legal information extractor" in sp_lower:
            return {
                "extracted_updates": {
                    "ingredients": ["Ashwagandha", "Ginger"],
                    "traditional_knowledge_involved": True,
                    "intellectual_property_objective": ["patent"]
                },
                "uncertain_fields": [],
                "contradictions": []
            }
        elif "routing engine" in sp_lower:
            return {
                "primary_route": "patent",
                "domains": ["patent", "abs", "tkdl_prior_art"],
                "domain_statuses": {"patent": "Relevant", "abs": "Potentially Relevant"},
                "explanation": "Test routing"
            }
        elif "classification engine" in sp_lower or "classify" in sp_lower:
            return {"classification": "PATENT_PROPRIETARY", "reasoning_factors": ["Test classification"], "confidence": "HIGH"}
        elif "questioning engine" in sp_lower:
            return {"next_question": "What is the classical reference source?", "suggested_options": ["Charaka", "Sushruta"]}
        else:
            return {
                "answer": "Under Section 3(p) of the Indian Patents Act 1970, traditional knowledge is not patentable unless synergistic efficacy is proven.",
                "citations": [
                    {
                        "source": "The Patents Act, 1970 (India)",
                        "section_or_rule": "Section 3(p)",
                        "jurisdiction": "India",
                        "effective_date": "1970"
                    }
                ]
            }

    monkeypatch.setattr(gemma_provider, "generate_structured_json", mock_generate_json)

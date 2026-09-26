import logging
from typing import Dict, Any, List
from app.ai.gemma.provider import gemma_provider
from app.case.models import CaseState

logger = logging.getLogger("IP-SAKTI.ClassificationEngine")

class FormulationClassificationEngine:
    """
    Cumulative Formulation Classifier evaluating product category based on complete CaseState history:
    - classical (Classical reference in First Schedule texts under Drugs & Cosmetics Act)
    - proprietary (Ayurvedic Patent/Proprietary medicine under Sec 3(h))
    - new_non_classical (Novel synthetic or non-classical drug entity)
    - phytopharmaceutical (Standardized plant extract with clinical trial data)
    - ayurveda_aahar (Food/dietary supplement under FSSAI Ayurveda Aahar Regs 2022)
    - cosmetic (Topical beauty/cleansing formulation)
    - unknown (Insufficient information)
    """

    VALID_CATEGORIES = [
        "classical",
        "proprietary",
        "new_non_classical",
        "phytopharmaceutical",
        "ayurveda_aahar",
        "cosmetic",
        "unknown"
    ]

    async def classify_cumulative(
        self,
        case_state: CaseState,
        latest_message: str = "",
        evidence_chunks: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Classify formulation based on cumulative CaseState history and evidence."""
        prompt = f"""
Analyze the CUMULATIVE case history and details for an Ayurvedic product formulation:

Cumulative Case Parameters:
- Product Name: {case_state.product_name or 'Unspecified'}
- Product Type: {case_state.product_type or 'Unspecified'}
- Classical Basis / Reference: {case_state.classical_reference or 'Unspecified'}
- Ingredients: {', '.join(case_state.ingredients) if case_state.ingredients else 'None listed'}
- Intended Use: {case_state.intended_use or 'Unspecified'}
- Traditional Knowledge Involved: {case_state.traditional_knowledge_involved}

Latest User Message: "{latest_message}"

Categories:
1. classical: Formulated strictly according to classical reference books listed in First Schedule of Drugs & Cosmetics Act.
2. proprietary: Contains classical ingredients in non-classical proportions or novel combinations (Sec 3(h)).
3. new_non_classical: Non-classical synthetic or new drug entity not recognized under AYUSH.
4. phytopharmaceutical: Purified, standardized extract of plant material with modern clinical validation.
5. ayurveda_aahar: Food/dietary supplement prepared under traditional Ayurvedic principles (FSSAI Ayurveda Aahar Regs 2022).
6. cosmetic: Topical beauty, cleansing, or skin application.
7. unknown: Insufficient information to determine classification.

STRICT RULE: If information is ambiguous or incomplete, classify as "unknown". Do NOT guess.

Return ONLY JSON:
{{
  "classification": "category_name",
  "reasoning_factors": ["Factor 1", "Factor 2"],
  "missing_information": ["Field needed"],
  "confidence": "high"
}}
"""
        system_prompt = "You are an expert regulatory pharmaceutical classifier for Ayurvedic products under Indian and International law."

        try:
            res = await gemma_provider.generate_structured_json(prompt, system_prompt)
            cat = str(res.get("classification", "unknown")).lower()
            if cat not in self.VALID_CATEGORIES:
                cat = "unknown"
            return {
                "classification": cat,
                "reasoning_factors": res.get("reasoning_factors", ["Evaluated cumulative case parameters"]),
                "missing_information": res.get("missing_information", []),
                "confidence": res.get("confidence", "limited")
            }
        except Exception as e:
            logger.warning(f"Classification error: {e}")
            return {
                "classification": "unknown",
                "reasoning_factors": ["Classification model unavailable; awaiting more parameters"],
                "missing_information": ["classical_reference", "ingredients"],
                "confidence": "limited"
            }

classification_engine = FormulationClassificationEngine()

import logging
from typing import Dict, Any, List
from app.ai.groq.provider import groq_provider
from app.case.models import CaseState

logger = logging.getLogger("IP-SAKTI.ClassificationEngine")

class FormulationClassificationEngine:
    """
    Cumulative Formulation Classifier evaluating product category based on complete CaseState history:
    - classical (Classical reference in First Schedule texts under Drugs & Cosmetics Act)
    - proprietary (Ayurvedic Patent/Proprietary medicine under Sec 3(h))
    - new_non_classical (Novel synthetic or non-classical drug entity)
    - phytopharmaceutical (Standardized plant extract with clinical trial data under Rule 122E)
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
1. classical: Formulated strictly according to classical reference books listed in First Schedule of Drugs & Cosmetics Act (e.g., Charaka Samhita, Sushruta Samhita, Ashtanga Hridaya, Sharngadhara Samhita, Bhavaprakasha).
2. proprietary: Contains classical ingredients in non-classical proportions or novel combinations/modern delivery forms (Sec 3(h)).
3. new_non_classical: Non-classical synthetic or new drug entity not recognized under AYUSH.
4. phytopharmaceutical: Purified, standardized extract of plant material with modern clinical validation (Rule 122E).
5. ayurveda_aahar: Food/dietary supplement prepared under traditional Ayurvedic principles (FSSAI Ayurveda Aahar Regs 2022).
6. cosmetic: Topical beauty, cleansing, or skin application.
7. unknown: No clear category, reference, or formulation parameters can be identified.

GUIDELINES:
- If a classical Ayurvedic text reference is specified, classify as "classical".
- If novel proportions, capsules, or proprietary combinations are indicated, classify as "proprietary".
- If standardized purified fractions or bioactive markers are indicated, classify as "phytopharmaceutical".
- If dietary nourishment, food recipe, or Ayurveda Aahar is indicated, classify as "ayurveda_aahar".
- If skin beauty, topical cleansing, face scrub/wash is indicated, classify as "cosmetic".
- Only classify as "unknown" if there are zero recognizable formulation traits or references provided.

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
            res = await groq_provider.generate_structured_json(prompt, system_prompt)
            raw_cat = str(res.get("classification", "unknown")).lower()
            if any(k in raw_cat for k in ["classical", "generic", "first schedule"]):
                cat = "classical"
            elif any(k in raw_cat for k in ["phyto", "phytopharmaceutical", "standardized fraction"]):
                cat = "phytopharmaceutical"
            elif any(k in raw_cat for k in ["ayurveda_aahar", "ayurveda aahar", "aahar", "nutraceutical", "food"]):
                cat = "ayurveda_aahar"
            elif any(k in raw_cat for k in ["cosmetic", "beauty", "cleansing"]):
                cat = "cosmetic"
            elif any(k in raw_cat for k in ["proprietary", "patent & proprietary", "3(h)", "synergistic"]):
                cat = "proprietary"
            elif any(k in raw_cat for k in ["new_non_classical", "new non-classical", "synthetic", "new drug"]):
                cat = "new_non_classical"
            else:
                cat = "unknown"

            if cat == "unknown":
                rule_eval = self._evaluate_rule_based(case_state, latest_message)
                if rule_eval["classification"] != "unknown":
                    return rule_eval

            return {
                "classification": cat,
                "reasoning_factors": res.get("reasoning_factors", ["Evaluated cumulative case parameters"]),
                "missing_information": res.get("missing_information", []),
                "confidence": res.get("confidence", "limited")
            }
        except Exception as e:
            logger.warning(f"LLM Classification unavailable: {e}. Running deterministic rule-based evaluation.")
            return self._evaluate_rule_based(case_state, latest_message)

    def _evaluate_rule_based(self, case_state: CaseState, latest_message: str) -> Dict[str, Any]:
        """Deterministic evaluation of cumulative CaseState parameters when LLM is unavailable."""
        combined_text = f"{case_state.product_name or ''} {case_state.product_type or ''} {case_state.intended_use or ''} {case_state.classical_reference or ''} {case_state.classical_or_proprietary or ''} {latest_message}".lower()

        # 1. Classical check
        if case_state.classical_reference and any(t in combined_text for t in ["samhita", "nighantu", "charaka", "sushruta", "vagbhata", "sharngadhara", "bhavaprakasha", "bhasma", "asava", "arishta", "classical"]):
            return {
                "classification": "classical",
                "reasoning_factors": ["Formulation references classical Ayurvedic pharmacopoeial text listed in First Schedule of Drugs & Cosmetics Act."],
                "missing_information": [],
                "confidence": "high"
            }

        # 2. Phytopharmaceutical check
        if any(w in combined_text for w in ["phytopharmaceutical", "standardized fraction", "bioactive marker", "purified fraction", "rule 122e"]):
            return {
                "classification": "phytopharmaceutical",
                "reasoning_factors": ["Standardized and purified fraction of medicinal plant with quantified biomarker profile per Rule 122E."],
                "missing_information": [],
                "confidence": "high"
            }

        # 3. Ayurveda Aahar check
        if any(w in combined_text for w in ["ayurveda aahar", "aahar", "dietary", "food", "fssai", "nutraceutical", "supplement", "nourishment", "soup"]):
            return {
                "classification": "ayurveda_aahar",
                "reasoning_factors": ["Prepared in accordance with traditional Ayurvedic food recipes under FSSAI Ayurveda Aahar Regulations 2022."],
                "missing_information": [],
                "confidence": "high"
            }

        # 4. Cosmetic check
        if any(w in combined_text for w in ["cosmetic", "face wash", "scrub", "skin cleansing", "beauty", "hair oil", "topical cleansing", "lotion"]):
            return {
                "classification": "cosmetic",
                "reasoning_factors": ["Formulated for topical application for cleansing, beautifying or altering skin appearance."],
                "missing_information": [],
                "confidence": "high"
            }

        # 5. Proprietary check
        if any(w in combined_text for w in ["proprietary", "patent & proprietary", "novel ratio", "capsule", "synergistic", "extract combination", "modern delivery"]):
            return {
                "classification": "proprietary",
                "reasoning_factors": ["Ayurvedic patent or proprietary medicine containing classical ingredients in non-classical proportions (Sec 3(h))."],
                "missing_information": [],
                "confidence": "medium"
            }

        # 6. New non-classical check
        if any(w in combined_text for w in ["synthetic", "new chemical", "new drug entity", "non-classical synthetic"]):
            return {
                "classification": "new_non_classical",
                "reasoning_factors": ["New synthetic or modified entity requiring clinical trial clearance under New Drugs & Clinical Trials Rules."],
                "missing_information": [],
                "confidence": "medium"
            }

        return {
            "classification": "unknown",
            "reasoning_factors": ["Classification pending — additional parameters required"],
            "missing_information": ["classical_reference", "dosage_form", "manufacturing_process"],
            "confidence": "limited"
        }

classification_engine = FormulationClassificationEngine()


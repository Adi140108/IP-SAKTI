import logging
from typing import Dict, Any, List, Optional
from app.ai.groq.provider import groq_provider
from app.case.models import CaseState
from app.case.state_manager import case_state_manager
from app.schemas.case import QuestioningResponse

logger = logging.getLogger("IP-SAKTI.QuestioningEngine")

class DynamicQuestioningEngine:
    """
    Genuinely dynamic, CaseState-driven Questioning Engine.
    
    Architecture:
    1. Single Source of Truth: Evaluates the active, updated CaseState.
    2. Deterministic Priority System: Selects exactly ONE highest-priority missing field based on strict dependency rules.
    3. Contradiction First: Prioritizes clarification if conflicting statements exist.
    4. Non-Repetition: Tracks question history to avoid re-asking previously addressed or declined topics.
    5. Groq for Natural Language Generation: Generates plain, non-jargon questions tailored to the specific case context.
    6. Deterministic Fallback: Reliable template fallback if Groq API is unavailable (Zero Ollama reasoning fallback).
    """

    # Deterministic Priority Ordering
    HIGH_PRIORITY_FIELDS = [
        "contradiction_clarification",
        "jurisdiction",
        "country",
        "product_type",
        "intellectual_property_objective",
        "classical_reference"
    ]
    MEDIUM_PRIORITY_FIELDS = [
        "ingredients",
        "traditional_knowledge_involved",
        "biological_resources_involved",
        "international_market"
    ]
    LOW_PRIORITY_FIELDS = [
        "intended_use",
        "dosage_or_form",
        "manufacturing_context"
    ]

    # Deterministic Fallback Question Templates (Clean, User-friendly, Non-jargon)
    FALLBACK_TEMPLATES_INDIA = {
        "contradiction_clarification": (
            "Could you clarify if your product is based on a classical Ayurvedic text or if it is a newly developed proprietary formulation?",
            ["Classical Ayurvedic Text Basis", "Novel Proprietary Formula", "Modified Classical Composition"]
        ),
        "jurisdiction": (
            "Are you seeking intellectual property protection primarily within India or for international export markets?",
            ["India (Domestic Law)", "International / Export Markets"]
        ),
        "country": (
            "Which target country or international region are you planning to enter?",
            ["United States (USPTO)", "Germany / European Union (EPO)", "United Kingdom (UKIPO)", "Global / Multi-country"]
        ),
        "product_type": (
            "What type of Ayurvedic product have you formulated?",
            ["Herbal Extract / Active Compound", "Classical Powder / Oil [Churnam / Taila]", "Capsule / Tablet Dosage Form", "Ayurveda-Aahar Health Food / Beverage"]
        ),
        "intellectual_property_objective": (
            "What primary type of legal protection or clearance are you seeking?",
            ["Patent Protection", "Trademark / Brand Registration", "Geographical Indication (GI)", "National Biodiversity Authority (NBA) Clearance"]
        ),
        "classical_reference": (
            "Is your formulation derived from a classical Ayurvedic text (such as Charaka Samhita or Sushruta Samhita), or is it a novel proprietary recipe?",
            ["Classical Ayurvedic Text Reference", "Novel Proprietary Formulation", "Modified Classical Preparation"]
        ),
        "ingredients": (
            "What are the main medicinal plants or biological ingredients in your formulation?",
            ["Ashwagandha & Turmeric", "Brahmi & Guduchi", "Tulsi & Ginger", "Other Botanical Ingredients"]
        ),
        "traditional_knowledge_involved": (
            "Does your formulation rely on publicly known traditional Ayurvedic knowledge, or have you demonstrated a new synergistic efficacy through testing?",
            ["Based on Traditional Knowledge", "Proven Synergistic Scientific Efficacy", "Novel Non-traditional Formula"]
        ),
        "biological_resources_involved": (
            "Are the medicinal plants or biological materials in your formulation sourced within India?",
            ["Yes, Sourced in India (Requires NBA Clearance)", "No, Sourced Outside India", "Not Applicable"]
        ),
        "international_market": (
            "Which specific foreign market or regulatory pathway are you targeting?",
            ["PCT International Patent Application", "US FDA / Dietary Supplement", "EU Traditional Herbal Medicinal Products (THMPD)"]
        )
    }

    FALLBACK_TEMPLATES_INTL = {
        "contradiction_clarification": (
            "Could you clarify if your product is documented in traditional Ayurvedic texts or developed as a novel proprietary formulation for foreign filing?",
            ["Classical Ayurvedic Basis", "Novel Proprietary Formulation", "Modified Traditional Recipe"]
        ),
        "country": (
            "Which target foreign country or region are you planning to protect your invention in?",
            ["Germany", "United States", "European Union (EPO)", "United Kingdom", "Japan"]
        ),
        "product_type": (
            "For foreign market clearance, what form does your product take?",
            ["Purified Botanical Extract", "Dietary Supplement / Natural Health Product", "Standardized Phytopharmaceutical", "Traditional Herbal Preparation"]
        ),
        "intellectual_property_objective": (
            "What international intellectual property pathway are you pursuing?",
            ["WIPO PCT Patent Application", "Direct National Patent Filing", "International Trademark (Madrid Protocol)", "Nagoya Protocol ABS Clearance"]
        ),
        "classical_reference": (
            "Under foreign patent rules, is your product documented in public traditional knowledge prior art or classical literature?",
            ["Documented in Classical Prior Art", "Novel Proprietary Formulation", "Synthetic / Bioactive Derivative"]
        ),
        "ingredients": (
            "Which botanical active ingredients in your formula require subject matter eligibility disclosure under foreign patent laws?",
            ["Ashwagandha & Turmeric", "Brahmi & Neem", "Tulsi & Ginger", "Other Botanical Actives"]
        ),
        "traditional_knowledge_involved": (
            "Under international Nagoya Protocol guidelines, does your product utilize genetic resources or traditional knowledge originating from India?",
            ["Yes, Traditional Knowledge Involved", "No, Novel Scientific Formula"]
        ),
        "biological_resources_involved": (
            "Do you require Nagoya Protocol Prior Informed Consent (PIC) or Mutually Agreed Terms (MAT) to export biological material?",
            ["Yes, Indian Biological Resources Used (ABS)", "No Biological Resources Sourced from India"]
        ),
        "international_market": (
            "What is your intended foreign distribution or filing strategy?",
            ["PCT International Phase", "Direct National Phase Entry", "Commercial Export Partnership"]
        )
    }

    async def detect_information_gaps(self, state: CaseState) -> List[str]:
        """Detect missing information gaps directly from the updated CaseState."""
        return case_state_manager.compute_missing_information(state)

    def _get_previously_asked_fields(self, state: CaseState) -> List[str]:
        """Identify fields or topics that have already been asked in previous conversation turns."""
        asked_topics = []
        for turn in state.conversation_history:
            if not isinstance(turn, dict):
                continue
            q_text = str(turn.get("question") or turn.get("next_question") or "").lower()
            if not q_text:
                continue

            if "jurisdiction" in q_text or "domestic" in q_text or "international" in q_text:
                asked_topics.append("jurisdiction")
            if "country" in q_text or "foreign" in q_text or "market" in q_text:
                asked_topics.append("country")
            if "dosage" in q_text or "delivery" in q_text or "form" in q_text or "type of ayurvedic" in q_text:
                asked_topics.append("product_type")
            if "objective" in q_text or "protection" in q_text or "trademark" in q_text or "patent" in q_text:
                asked_topics.append("intellectual_property_objective")
            if "classical" in q_text or "text" in q_text or "charaka" in q_text or "sushruta" in q_text or "samhita" in q_text:
                asked_topics.append("classical_reference")
            if "ingredient" in q_text or "herb" in q_text or "plant" in q_text:
                asked_topics.append("ingredients")
            if "traditional knowledge" in q_text or "prior art" in q_text or "3(p)" in q_text or "3(e)" in q_text:
                asked_topics.append("traditional_knowledge_involved")
            if "biological" in q_text or "nba" in q_text or "abs" in q_text or "pic" in q_text:
                asked_topics.append("biological_resources_involved")
            if "contradiction" in q_text or "clarify" in q_text:
                asked_topics.append("contradiction_clarification")

        return asked_topics

    def _detect_contradictions(self, state: CaseState) -> Optional[str]:
        """Detect if there is an active contradiction or ambiguity in the cumulative CaseState."""
        # 1. Check known_information for explicitly recorded contradiction
        for item in state.known_information:
            if "contradiction" in item.lower() or "ambiguity" in item.lower():
                return item

        # 2. Check logical conflicts in state
        if state.classical_reference and "classical" in state.classical_reference.lower():
            if state.traditional_knowledge_involved is False:
                return "Classical text basis claimed but traditional knowledge involvement marked False."
            if state.formulation_classification in ["proprietary", "new_non_classical"]:
                return "Classical text basis claimed while categorized as novel proprietary formulation."

        return None

    def select_highest_priority_missing_field(self, state: CaseState, missing_gaps: List[str]) -> Optional[str]:
        """
        Deterministically select the SINGLE highest-priority missing field based on CaseState dependencies.
        """
        asked_fields = self._get_previously_asked_fields(state)

        # 1. Critical Conflict / Contradiction Check
        contradiction = self._detect_contradictions(state)
        if contradiction and "contradiction_clarification" not in asked_fields:
            return "contradiction_clarification"

        # 2. Ordered priority candidate evaluation
        all_ordered_candidates = self.HIGH_PRIORITY_FIELDS + self.MEDIUM_PRIORITY_FIELDS + self.LOW_PRIORITY_FIELDS

        for candidate in all_ordered_candidates:
            if candidate not in missing_gaps:
                continue

            # Dependency rules
            if candidate == "country":
                # Do NOT ask country if jurisdiction is India
                if (state.jurisdiction or "").strip().lower() != "international":
                    continue
                # Do NOT ask country if country is already known
                if state.country and state.country.strip().lower() not in ["global", "international", "unknown", "unspecified", ""]:
                    continue

            if candidate == "biological_resources_involved":
                # Do not ask ABS before biological materials or jurisdiction are relevant
                if not state.ingredients and not state.product_type:
                    continue

            if candidate == "classical_reference":
                # Do not ask if formulation is already classified or known
                if state.formulation_classification and state.formulation_classification.lower() not in ["unknown", "unspecified"]:
                    continue

            # Skip if already asked in previous turns to avoid repetition
            if candidate in asked_fields:
                continue

            return candidate

        # If all unasked candidates were exhausted, pick the first unasked gap
        for gap in missing_gaps:
            if gap not in asked_fields:
                return gap

        return None

    async def generate_next_question(self, state: CaseState) -> QuestioningResponse:
        """
        Generate exactly ONE targeted question based on the cumulative CaseState.
        """
        # Re-compute fresh missing information gaps from updated CaseState
        missing_info = await self.detect_information_gaps(state)
        state.missing_information = missing_info

        # If no gaps remain, return completion
        if not missing_info and not self._detect_contradictions(state):
            logger.info(f"Case {state.case_id}: Clarification complete. All essential parameters gathered.")
            return QuestioningResponse(
                next_question="All key case parameters have been gathered. Ready to generate complete legal guidance.",
                detected_missing_info=[],
                is_clarification_complete=True,
                suggested_options=None
            )

        # Deterministically select the single target missing field
        target_field = self.select_highest_priority_missing_field(state, missing_info)

        if not target_field:
            # All available missing fields were already asked or addressed
            logger.info(f"Case {state.case_id}: All prioritized missing fields have been addressed.")
            return QuestioningResponse(
                next_question="All prioritized case parameters have been gathered. Ready to proceed with statutory analysis.",
                detected_missing_info=missing_info,
                is_clarification_complete=True,
                suggested_options=None
            )

        jur = (state.jurisdiction or "India").strip().lower()
        country_name = state.country or ("India" if jur == "india" else "Target International Market")

        # Get deterministic fallback templates
        template_map = self.FALLBACK_TEMPLATES_INTL if jur == "international" else self.FALLBACK_TEMPLATES_INDIA
        default_q, default_opts = template_map.get(
            target_field,
            (f"Could you clarify the details regarding {target_field.replace('_', ' ')} for {country_name}?", ["Classical Formula", "Novel Proprietary Formula", "Not Sure / Unspecified"])
        )

        # Build Groq Prompt for natural, context-aware phrasing
        contradiction_text = self._detect_contradictions(state) or "None"
        previously_asked = self._get_previously_asked_fields(state)

        prompt = f"""
You are the Dynamic Legal Intake Engine for an Ayurvedic Intellectual Property Assistant.

Current Cumulative Case State:
- Case ID: {state.case_id}
- Jurisdiction: {state.jurisdiction} ({country_name})
- Product Name: {state.product_name or 'Unspecified'}
- Product Type / Dosage: {state.product_type or 'Unspecified'}
- Formulation Category: {state.formulation_classification}
- Classical Reference: {state.classical_reference or 'Unspecified'}
- Ingredients: {', '.join(state.ingredients) if state.ingredients else 'None listed'}
- Traditional Knowledge: {state.traditional_knowledge_involved}
- Biological Resources (ABS): {state.biological_resources_involved}
- IP Objectives: {', '.join(state.intellectual_property_objective) if state.intellectual_property_objective else 'Unspecified'}
- Target Missing Field to Collect: "{target_field}"
- Active Contradictions: {contradiction_text}
- Previously Asked Topics: {', '.join(previously_asked) if previously_asked else 'None'}

STRICT TASK:
Generate EXACTLY ONE clear, friendly follow-up question to collect the missing parameter "{target_field}".

RULES:
1. Speak in plain, clear English understandable to an inventor or Ayurvedic practitioner.
2. Avoid dense legal or Ayurvedic jargon. If a legal term (e.g. Prior Art, ABS clearance) is essential, explain it briefly and simply.
3. If jurisdiction is International and country is {country_name}, make the question relevant to {country_name}.
4. Provide 2 to 4 realistic, clickable answer options / chips.
5. NEVER ask about a field that is already known in the Case State.

Return ONLY a JSON object:
{{
  "next_question": "Single clear question string",
  "field": "{target_field}",
  "reason": "Why this information is needed for statutory legal analysis",
  "priority": "high",
  "suggested_options": ["Option 1", "Option 2", "Option 3"]
}}
"""
        system_prompt = (
            "You are an expert, empathetic legal intake assistant specializing in Ayurvedic IP law. "
            "Formulate concise, natural questions without legal jargon."
        )

        try:
            res = await groq_provider.generate_structured_json(prompt, system_prompt)
            next_q = res.get("next_question") or res.get("question") or default_q
            options = res.get("suggested_options") or default_opts
            if isinstance(options, list) and len(options) > 0:
                clean_opts = [str(o) for o in options]
            else:
                clean_opts = default_opts

            logger.info(f"Dynamic Questioning Engine selected field '{target_field}': {next_q}")
            return QuestioningResponse(
                next_question=next_q,
                detected_missing_info=missing_info,
                is_clarification_complete=False,
                suggested_options=clean_opts
            )
        except Exception as e:
            logger.warning(f"Groq dynamic question generation error: {e}. Using deterministic fallback template for '{target_field}'.")
            return QuestioningResponse(
                next_question=default_q,
                detected_missing_info=missing_info,
                is_clarification_complete=False,
                suggested_options=default_opts
            )

questioning_engine = DynamicQuestioningEngine()



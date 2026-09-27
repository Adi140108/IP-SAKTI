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
    5. Max Question Cap (7 Questions): Hard ceiling of 7 intake questions to avoid endless interrogation.
    6. Early Stopping: Stops immediately as soon as all necessary legal & regulatory parameters are gathered.
    7. Groq for Natural Language Generation: Generates plain, non-jargon questions tailored to the specific case context.
    8. Deterministic Fallback: Reliable template fallback if Groq API is unavailable.
    """

    MAX_QUESTIONS_CAP = 7

    # Deterministic Priority Ordering
    HIGH_PRIORITY_FIELDS = [
        "contradiction_clarification",
        "jurisdiction",
        "country",
        "product_type",
        "classical_reference",
        "ingredients",
        "intellectual_property_objective"
    ]
    MEDIUM_PRIORITY_FIELDS = [
        "traditional_knowledge_involved",
        "synergistic_efficacy_proven",
        "biological_resources_involved",
        "applicant_entity_type",
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
            ["Classical Ayurvedic Text Basis", "Novel Proprietary Formula", "Modified Classical Composition", "✍️ Type custom basis..."]
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
            ["Herbal Extract / Active Compound", "Classical Powder / Oil [Churnam / Taila]", "Capsule / Tablet Dosage Form", "Ayurveda-Aahar Health Food / Beverage", "✍️ Type product form..."]
        ),
        "intellectual_property_objective": (
            "What primary type of legal protection or clearance are you seeking?",
            ["Patent Protection", "Trademark / Brand Registration", "Geographical Indication (GI)", "National Biodiversity Authority (NBA) Clearance", "✍️ Type IP objective..."]
        ),
        "classical_reference": (
            "Is your formulation derived from a classical Ayurvedic text (such as Charaka Samhita or Sushruta Samhita), or is it a novel proprietary recipe?",
            ["Classical Ayurvedic Text Reference", "Novel Proprietary Formulation", "Modified Classical Preparation", "✍️ Type classical text details..."]
        ),
        "ingredients": (
            "What are the main medicinal plants or biological ingredients in your formulation?",
            ["Ashwagandha & Curcumin", "Brahmi & Shankhpushpi", "Tulsi & Ginger", "✍️ Type custom ingredients..."]
        ),
        "traditional_knowledge_involved": (
            "Does your formulation rely on publicly known traditional Ayurvedic knowledge, or have you developed a novel composition?",
            ["Based on Traditional Knowledge", "Novel Non-traditional Formula", "Modified Classical Recipe", "✍️ Type details..."]
        ),
        "synergistic_efficacy_proven": (
            "Have you demonstrated proven synergistic efficacy or improved bioavailability through laboratory or clinical testing?",
            ["Proven Synergistic Scientific Efficacy", "Traditional Knowledge Combination Only", "Testing Currently in Progress", "✍️ Type lab test data..."]
        ),
        "biological_resources_involved": (
            "Are the medicinal plants or biological materials in your formulation sourced within India?",
            ["Yes, Sourced in India (Requires NBA Clearance)", "No, Sourced Outside India", "✍️ Type sourcing location..."]
        ),
        "applicant_entity_type": (
            "What is the legal status/nationality of the applicant entity under the Biological Diversity Act?",
            ["Indian Citizen / Indian Entity", "Foreign Company / NRI Collaboration", "Indian Startup / Micro Enterprise", "✍️ Type entity status..."]
        ),
        "intended_use": (
            "What is the primary intended therapeutic or commercial health use of your formulation?",
            ["Therapeutic Treatment (AYUSH Drug Lic Form 25D)", "Dietary Supplement (Ayurveda Aahar FSSAI)", "Cosmetic / Beauty Application", "Phytopharmaceutical Drug (CDSCO)", "✍️ Type health indication..."]
        ),
        "manufacturing_context": (
            "What manufacturing or extraction process is used in creating your formulation?",
            ["Novel Solvent / Supercritical CO2 Extraction", "Standard Classical Aqueous Kwatha Decoction", "Standardized Purified Fraction", "Conventional Dry Grinding", "✍️ Type extraction method..."]
        ),
        "international_market": (
            "Which specific foreign market or regulatory pathway are you targeting?",
            ["PCT International Patent Application", "US FDA / Dietary Supplement", "EU Traditional Herbal Medicinal Products (THMPD)", "✍️ Type target market..."]
        )
    }

    FALLBACK_TEMPLATES_INTL = {
        "contradiction_clarification": (
            "Could you clarify if your product is documented in traditional Ayurvedic texts or developed as a novel proprietary formulation for foreign filing?",
            ["Classical Ayurvedic Basis", "Novel Proprietary Formulation", "Modified Traditional Recipe", "✍️ Type custom basis..."]
        ),
        "country": (
            "Which target foreign country or region are you planning to protect your invention in?",
            ["Germany", "United States", "European Union (EPO)", "United Kingdom", "Japan"]
        ),
        "product_type": (
            "For foreign market clearance, what form does your product take?",
            ["Purified Botanical Extract", "Dietary Supplement / Natural Health Product", "Standardized Phytopharmaceutical", "Traditional Herbal Preparation", "✍️ Type product form..."]
        ),
        "intellectual_property_objective": (
            "What international intellectual property pathway are you pursuing?",
            ["WIPO PCT Patent Application", "Direct National Patent Filing", "International Trademark (Madrid Protocol)", "Nagoya Protocol ABS Clearance", "✍️ Type international pathway..."]
        ),
        "classical_reference": (
            "Under foreign patent rules, is your product documented in public traditional knowledge prior art or classical literature?",
            ["Documented in Classical Prior Art", "Novel Proprietary Formulation", "Synthetic / Bioactive Derivative", "✍️ Type prior art details..."]
        ),
        "ingredients": (
            "Which botanical active ingredients in your formula require subject matter eligibility disclosure under foreign patent laws?",
            ["Ashwagandha & Turmeric", "Brahmi & Neem", "Tulsi & Ginger", "✍️ Type custom ingredients..."]
        ),
        "traditional_knowledge_involved": (
            "Under international Nagoya Protocol guidelines, does your product utilize genetic resources or traditional knowledge originating from India?",
            ["Yes, Traditional Knowledge Involved", "No, Novel Scientific Formula", "✍️ Type traditional knowledge context..."]
        ),
        "synergistic_efficacy_proven": (
            "For foreign patent filings (e.g. USPTO/EPO), do you have experimental comparative data showing unexpected synergistic effects over known botanical combinations?",
            ["Proven Synergistic Experimental Data", "No Comparative Lab Data", "Testing in Progress", "✍️ Type comparative test data..."]
        ),
        "biological_resources_involved": (
            "Do you require Nagoya Protocol Prior Informed Consent (PIC) or Mutually Agreed Terms (MAT) to export biological material?",
            ["Yes, Indian Biological Resources Used (ABS)", "No Biological Resources Sourced from India", "✍️ Type genetic sourcing details..."]
        ),
        "applicant_entity_type": (
            "Under the Nagoya Protocol and international ABS frameworks, what is the incorporation status of the applicant entity?",
            ["Foreign Corporation / Multinational", "Joint Venture with Indian Partner", "Indian Entity Exporting Abroad", "✍️ Type applicant status..."]
        ),
        "intended_use": (
            "What regulatory product category are you targeting in foreign markets?",
            ["Dietary / Herbal Supplement (US FDA / EU)", "Traditional Herbal Medicine (THMPD)", "Phytomedicine / Drug Registration", "Cosmeceutical / Topical Application", "✍️ Type regulatory category..."]
        ),
        "manufacturing_context": (
            "What processing technology or standardized extraction method is utilized for international regulatory compliance?",
            ["Standardized Bioactive Marker Extraction", "Novel Supercritical Fluid Extraction", "Traditional Hydro-Alcoholic Method", "Cold-Pressed / Mechanical Processing", "✍️ Type manufacturing details..."]
        ),
        "international_market": (
            "What is your intended foreign distribution or filing strategy?",
            ["PCT International Phase", "Direct National Phase Entry", "Commercial Export Partnership", "✍️ Type export strategy..."]
        )
    }

    def count_questions_asked(self, state: CaseState) -> int:
        """Count how many dynamic clarification questions have been asked in this session."""
        count = 0
        for turn in state.conversation_history:
            if not isinstance(turn, dict):
                continue
            if turn.get("next_question") or turn.get("question"):
                count += 1
        return count

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
            if "target country" in q_text or "foreign country" in q_text or "enter" in q_text or "region are you planning" in q_text:
                asked_topics.append("country")
            if "dosage" in q_text or "delivery" in q_text or "type of ayurvedic" in q_text or "product have you formulated" in q_text or "form does your product take" in q_text:
                asked_topics.append("product_type")
            if "objective" in q_text or "type of legal protection" in q_text or "pathway are you pursuing" in q_text or "trademark" in q_text or "patent" in q_text:
                asked_topics.append("intellectual_property_objective")
            if "classical" in q_text or "charaka" in q_text or "sushruta" in q_text or "samhita" in q_text or "classical ayurvedic text" in q_text or "formulation derived" in q_text:
                asked_topics.append("classical_reference")
            if "ingredient" in q_text or "medicinal plant" in q_text or "botanical" in q_text or "biological ingredients" in q_text or "quantities or percentages" in q_text or "percentage composition" in q_text:
                asked_topics.append("ingredients")
            if "traditional knowledge" in q_text or "tkdl" in q_text or "genetic resources" in q_text or "traditional ayurvedic knowledge" in q_text:
                asked_topics.append("traditional_knowledge_involved")
            if "synergistic" in q_text or "bioavailability" in q_text or "unexpected synergistic" in q_text or "efficacy" in q_text:
                asked_topics.append("synergistic_efficacy_proven")
            if "sourced within india" in q_text or "biological materials" in q_text or "pic" in q_text or "nagoya" in q_text or "biological resources" in q_text or "abs" in q_text:
                asked_topics.append("biological_resources_involved")
            if "applicant" in q_text or "nationality" in q_text or "incorporation" in q_text or "entity" in q_text or "legal status" in q_text:
                asked_topics.append("applicant_entity_type")
            if "intended therapeutic" in q_text or "intended use" in q_text or "regulatory product category" in q_text or "commercial health use" in q_text or "health indication" in q_text:
                asked_topics.append("intended_use")
            if "manufacturing" in q_text or "extraction process" in q_text or "processing technology" in q_text or "extraction method" in q_text:
                asked_topics.append("manufacturing_context")
            if "foreign market" in q_text or "distribution or filing strategy" in q_text:
                asked_topics.append("international_market")
            if "contradiction" in q_text or "clarify" in q_text:
                asked_topics.append("contradiction_clarification")

        return list(set(asked_topics))

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

            if candidate == "applicant_entity_type":
                # Only ask if biological resources are involved or jurisdiction is relevant
                if state.biological_resources_involved is not True:
                    continue

            if candidate == "classical_reference":
                # Do not ask if formulation is already classified or known
                if state.classical_reference and state.classical_reference.strip().lower() not in ["unknown", "unspecified", ""]:
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
        Enforces a hard ceiling of MAX_QUESTIONS_CAP (7 questions) and stops early if all information is gathered.
        """
        questions_asked = self.count_questions_asked(state)
        state.questions_asked_count = questions_asked

        # Check Hard Max Questions Cap (7 Questions)
        if questions_asked >= self.MAX_QUESTIONS_CAP:
            logger.info(f"Case {state.case_id}: Max questions cap reached ({questions_asked}/{self.MAX_QUESTIONS_CAP}). Proceeding to complete assessment.")
            return QuestioningResponse(
                next_question="Maximum intake questions reached. All available case parameters gathered. Generating complete statutory assessment.",
                detected_missing_info=state.missing_information or [],
                is_clarification_complete=True,
                suggested_options=None
            )

        # Re-compute fresh missing information gaps from updated CaseState
        missing_info = await self.detect_information_gaps(state)
        state.missing_information = missing_info

        # Early Stop: If no gaps remain and no active contradictions exist, return completion
        if not missing_info and not self._detect_contradictions(state):
            logger.info(f"Case {state.case_id}: Clarification complete early ({questions_asked} questions asked). All essential parameters gathered.")
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
            logger.info(f"Case {state.case_id}: All prioritized missing fields have been addressed ({questions_asked} questions asked).")
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
- Questions Asked So Far: {questions_asked} / {self.MAX_QUESTIONS_CAP}
- Jurisdiction: {state.jurisdiction} ({country_name})
- Product Name: {state.product_name or 'Unspecified'}
- Product Type / Dosage: {state.product_type or 'Unspecified'}
- Formulation Category: {state.formulation_classification}
- Classical Reference: {state.classical_reference or 'Unspecified'}
- Ingredients: {', '.join(state.ingredients) if state.ingredients else 'None listed'}
- Traditional Knowledge: {state.traditional_knowledge_involved}
- Biological Resources (ABS): {state.biological_resources_involved}
- Synergistic Efficacy Proven: {state.synergistic_efficacy_proven}
- Applicant Entity: {state.applicant_entity_type or 'Unspecified'}
- Intended Use: {state.intended_use or 'Unspecified'}
- Manufacturing Process: {state.manufacturing_context or 'Unspecified'}
- IP Objectives: {', '.join(state.intellectual_property_objective) if state.intellectual_property_objective else 'Unspecified'}
- Target Missing Field to Collect: "{target_field}"
- Active Contradictions: {contradiction_text}
- Previously Asked Topics: {', '.join(previously_asked) if previously_asked else 'None'}

STRICT TASK:
Generate EXACTLY ONE clear, friendly follow-up question to collect the missing parameter "{target_field}".

RULES:
1. Language: {f"Formulate the question and options in {state.language} (e.g. Hindi, Tamil, Telugu, etc.) using clear Indic script." if getattr(state, "language", "en") != "en" else "Speak in plain, clear English understandable to an inventor or Ayurvedic practitioner."}
2. Avoid dense legal or Ayurvedic jargon. If a legal term (e.g. Prior Art, ABS clearance, Synergistic Efficacy) is essential, explain it briefly and simply.
3. If jurisdiction is International and country is {country_name}, make the question relevant to {country_name}.
4. Provide 2 to 4 realistic, selectable answer options / chips. ALWAYS provide real concrete answers (e.g. "Ashwagandha & Curcumin", "Novel Proprietary Formula", "India (Domestic Law)") or "✍️ Type custom details...". NEVER generate instructional meta-options like "List each ingredient with exact weight" or "Specify percentage composition".
5. NEVER ask about a field that is already known in the Case State or was previously asked.

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
            "Formulate concise, natural questions with concrete, selectable answer choices. Avoid instructional meta-options."
        )

        try:
            res = await groq_provider.generate_structured_json(prompt, system_prompt)
            next_q = res.get("next_question") or res.get("question") or default_q
            options = res.get("suggested_options") or default_opts
            if isinstance(options, list) and len(options) > 0:
                clean_opts = [str(o) for o in options]
                # Filter out generic instructional meta-options if generated
                clean_opts = [
                    o for o in clean_opts
                    if not any(bad in o.lower() for bad in ["list each", "specify the percentage", "identify any proprietary"])
                ]
                if not clean_opts:
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



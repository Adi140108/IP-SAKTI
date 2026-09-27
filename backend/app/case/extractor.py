import logging
from typing import Dict, Any, List, Optional
from app.ai.groq.provider import groq_provider
from app.case.models import CaseState, ExtractionResult

logger = logging.getLogger("IP-SAKTI.CaseExtractor")

class CaseStateExtractor:
    """
    Structured Information Extractor layer.
    Extracts structured parameters from user messages without mutating state or database directly.
    """

    async def extract_information(
        self,
        current_state: CaseState,
        latest_message: str,
        conversation_context: Optional[List[Dict[str, Any]]] = None
    ) -> ExtractionResult:
        """Extract structured updates from user message using Gemma 4 12B."""
        prompt = f"""
Analyze the latest user message in the context of an Ayurvedic Intellectual Property & Regulatory consultation.

Existing Case State Parameters:
- Jurisdiction: {current_state.jurisdiction} ({current_state.country or 'India'})
- Product Type: {current_state.product_type or 'Unknown'}
- Classical / Proprietary: {current_state.classical_reference or 'Unknown'}
- Ingredients: {', '.join(current_state.ingredients) if current_state.ingredients else 'None listed'}
- Traditional Knowledge: {current_state.traditional_knowledge_involved}
- Biological Resources: {current_state.biological_resources_involved}
- Synergistic Efficacy Data: {current_state.synergistic_efficacy_proven}
- Applicant Entity Type: {current_state.applicant_entity_type}
- IP Objectives: {', '.join(current_state.intellectual_property_objective) if current_state.intellectual_property_objective else 'None'}

Latest User Message:
"{latest_message}"

Task:
Extract any NEW or UPDATED parameters provided in the user message.
Map extracted fields precisely to:
- product_name (string)
- product_type (string)
- ingredients (list of string names of herbs/minerals)
- source_of_ingredients (string)
- intended_use (string)
- classical_reference (string, e.g., "Charaka Samhita", "Sushruta Samhita", or "Novel proprietary formula")
- traditional_knowledge_involved (boolean)
- synergistic_efficacy_proven (boolean)
- biological_resources_involved (boolean)
- applicant_entity_type (string)
- access_and_benefit_sharing (boolean)
- manufacturing_context (string)
- intellectual_property_objective (list from: ["patent", "trademark", "gi", "copyright", "design", "plant_variety", "trade_secret", "tkdl_prior_art", "regulatory"])
- international_market (list of country/region strings)
- country (string, if user specifies target country like "Germany", "USA", "EU")

Return ONLY a JSON object:
{{
  "extracted_updates": {{
    "ingredients": ["Ashwagandha"],
    "traditional_knowledge_involved": true
  }},
  "uncertain_fields": [],
  "contradictions": []
}}
"""
        system_prompt = (
            "You are a structured legal information extractor for Ayurvedic IP cases. "
            "Extract ONLY explicitly stated facts. Do not invent parameters."
        )

        # 0. Deterministic Rule Matching for Option Chips & Explicit Keywords
        lower_msg = latest_message.lower().strip()
        deterministic_updates: Dict[str, Any] = {}
        detected_contradictions: List[str] = []

        # Handle 'I don't know' / 'Not sure' / 'Skip'
        is_unknown_response = lower_msg in [
            "i don't know", "i dont know", "dont know", "not sure", "unknown", "n/a", "na",
            "not applicable", "skip", "prefer not to say", "no idea", "unspecified", "pass"
        ]

        if is_unknown_response:
            # Check what was previously asked
            prev_q = ""
            if current_state.conversation_history:
                last_turn = current_state.conversation_history[-1]
                if isinstance(last_turn, dict):
                    prev_q = str(last_turn.get("question") or last_turn.get("next_question") or "").lower()

            if "classical" in prev_q or "text" in prev_q or "traditional knowledge" in prev_q or "3(p)" in prev_q:
                deterministic_updates["classical_reference"] = "Unknown / Not Disclosed"
                deterministic_updates["traditional_knowledge_involved"] = False
            elif "synergistic" in prev_q or "bioavailability" in prev_q or "lab data" in prev_q or "3(e)" in prev_q:
                deterministic_updates["synergistic_efficacy_proven"] = False
            elif "biological" in prev_q or "abs" in prev_q or "nba" in prev_q or "pic" in prev_q or "mat" in prev_q:
                deterministic_updates["biological_resources_involved"] = False
            elif "entity type" in prev_q or "applicant" in prev_q:
                deterministic_updates["applicant_entity_type"] = "Indian Entity"
            elif "country" in prev_q or "foreign" in prev_q or "market" in prev_q or "pct" in prev_q:
                deterministic_updates["country"] = "General International Market"
            elif "ingredient" in prev_q or "herb" in prev_q:
                deterministic_updates["ingredients"] = ["Botanical Formulation (Ingredients Unspecified)"]
            elif "dosage" in prev_q or "form" in prev_q or "product" in prev_q:
                deterministic_updates["product_type"] = "Ayurvedic Product (Unspecified Form)"
            elif "objective" in prev_q or "protection" in prev_q:
                deterministic_updates["intellectual_property_objective"] = ["General Legal / IP Guidance"]
            elif "intended" in prev_q or "therapeutic" in prev_q or "application" in prev_q:
                deterministic_updates["intended_use"] = "General Ayurvedic Wellness"

        if "no, novel scientific formula" in lower_msg or "novel scientific formula" in lower_msg or "no traditional knowledge" in lower_msg or "no tk" in lower_msg or "novel proprietary" in lower_msg:
            deterministic_updates["traditional_knowledge_involved"] = False
            deterministic_updates["classical_reference"] = "Novel Proprietary Formula"
            if current_state.classical_reference and "classical" in current_state.classical_reference.lower():
                detected_contradictions.append("Contradiction: User previously stated classical Ayurvedic text basis, but now stated it is a novel proprietary formula.")

        elif "yes, traditional knowledge involved" in lower_msg or "traditional knowledge involved" in lower_msg or "classical text reference" in lower_msg:
            deterministic_updates["traditional_knowledge_involved"] = True
            deterministic_updates["classical_reference"] = "Classical Ayurvedic Text Reference"
            if current_state.classical_reference and "novel" in current_state.classical_reference.lower():
                detected_contradictions.append("Contradiction: User previously stated a novel proprietary formula, but now stated classical Ayurvedic traditional knowledge basis.")

        if any(term in lower_msg for term in ["proven synergistic efficacy", "proven synergistic", "synergistic efficacy", "proven 3x", "bioavailability", "lab data exists", "synergistic scientific efficacy"]):
            deterministic_updates["synergistic_efficacy_proven"] = True
        elif any(term in lower_msg for term in ["no lab data", "no synergistic", "traditional knowledge basis only", "no comparative efficacy"]):
            deterministic_updates["synergistic_efficacy_proven"] = False

        if "yes, indian biological resources" in lower_msg or "indian biological resources used" in lower_msg or "sourcing from india" in lower_msg:
            deterministic_updates["biological_resources_involved"] = True
        elif "no biological resources sourced from india" in lower_msg or "no indian bio" in lower_msg or "no biological resources" in lower_msg:
            deterministic_updates["biological_resources_involved"] = False

        if "indian citizen / indian entity" in lower_msg or "indian entity" in lower_msg or "indian citizen" in lower_msg:
            deterministic_updates["applicant_entity_type"] = "Indian Entity (Section 7 SBB Intimation)"
        elif "foreign company / nri" in lower_msg or "foreign company" in lower_msg or "nri" in lower_msg or "foreign collaboration" in lower_msg:
            deterministic_updates["applicant_entity_type"] = "Foreign Entity / NRI (NBA Section 3 Form I Approval)"
        elif "startup" in lower_msg or "micro enterprise" in lower_msg:
            deterministic_updates["applicant_entity_type"] = "Indian Startup / MSME"

        if "therapeutic treatment" in lower_msg or "therapeutic" in lower_msg or "ayush medicine form 25d" in lower_msg:
            deterministic_updates["intended_use"] = "Therapeutic Treatment (AYUSH Drug Licensing Form 25D)"
        elif "dietary supplement" in lower_msg or "ayurveda aahar" in lower_msg or "health food" in lower_msg or "nutrition" in lower_msg:
            deterministic_updates["intended_use"] = "Dietary Food / Nutrition (FSSAI Ayurveda Aahar Regulations 2022)"
        elif "skin / topical beauty" in lower_msg or "cosmetic" in lower_msg or "beauty" in lower_msg:
            deterministic_updates["intended_use"] = "Topical Beauty / Cleansing (Cosmetics Rules 2020)"
        elif "phytopharmaceutical drug" in lower_msg or "cdsco ind" in lower_msg:
            deterministic_updates["intended_use"] = "Phytopharmaceutical Drug (CDSCO Rule 122E IND)"

        if "novel hydro-alcoholic" in lower_msg or "supercritical extraction" in lower_msg or "solvent extraction" in lower_msg:
            deterministic_updates["manufacturing_context"] = "Novel Solvent / Supercritical Fluid Extraction"
        elif "standard classical decoction" in lower_msg or "kwatha" in lower_msg:
            deterministic_updates["manufacturing_context"] = "Classical Aqueous Kwatha Decoction"
        elif "standardized bioactive fraction" in lower_msg:
            deterministic_updates["manufacturing_context"] = "Standardized Purified Fraction with >= 4 Bioactive Markers"

        if "herbal extract" in lower_msg:
            deterministic_updates["product_type"] = "Herbal Extract / Active Compound"
        elif "classical powder" in lower_msg or "churnam" in lower_msg or "taila" in lower_msg:
            deterministic_updates["product_type"] = "Classical Ayurvedic Preparation [Churnam/Taila]"
        elif "capsule" in lower_msg or "tablet" in lower_msg:
            deterministic_updates["product_type"] = "Capsule / Tablet Dosage Form"

        # Check country extraction
        from app.modules.jurisdiction.engine import jurisdiction_engine
        country_det = jurisdiction_engine.detect_from_text(latest_message, current_state.jurisdiction, current_state.country)
        if country_det["jurisdiction"] == "International" and country_det["country"] != "Global":
            deterministic_updates["country"] = country_det["country"]
            deterministic_updates["jurisdiction"] = "International"

        try:
            res = await groq_provider.generate_structured_json(prompt, system_prompt)
            updates = res.get("extracted_updates", {})
            if not isinstance(updates, dict):
                updates = {}

            # Merge deterministic updates on top of LLM updates
            for k, v in deterministic_updates.items():
                updates[k] = v

            contradictions = res.get("contradictions", [])
            for c in detected_contradictions:
                if c not in contradictions:
                    contradictions.append(c)

            return ExtractionResult(
                extracted_updates=updates,
                uncertain_fields=res.get("uncertain_fields", []),
                contradictions=contradictions
            )
        except Exception as e:
            logger.warning(f"Structured extraction error: {e}. Using rule-based parameter extraction.")
            updates = dict(deterministic_updates)
            
            # Simple keyword fallback
            extracted_ings = []
            for herb in ["ashwagandha", "ginger", "turmeric", "tulsi", "neem", "guduchi", "triphala", "brahmi"]:
                if herb in lower_msg:
                    extracted_ings.append(herb.capitalize())
            if extracted_ings:
                updates["ingredients"] = extracted_ings

            if "patent" in lower_msg:
                updates["intellectual_property_objective"] = ["patent"]
            if "trademark" in lower_msg or "brand" in lower_msg:
                updates.setdefault("intellectual_property_objective", []).append("trademark")

            return ExtractionResult(
                extracted_updates=updates,
                uncertain_fields=[],
                contradictions=[]
            )

    async def extract_structured_info(self, message: str) -> ExtractionResult:
        """Helper method for direct text extraction without prior state."""
        empty_state = CaseState(case_id="temp_extract_id", user_id="guest_user")
        return await self.extract_information(empty_state, message)

case_extractor = CaseStateExtractor()
structured_extractor = case_extractor

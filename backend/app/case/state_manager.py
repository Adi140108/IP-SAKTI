import logging
from datetime import datetime
from typing import Dict, Any, List
from app.case.models import CaseState, ExtractionResult
from app.db.firestore import firestore_service

logger = logging.getLogger("IP-SAKTI.StateManager")

class CaseStateManager:
    """
    Case State Manager applying validated structured updates to CaseState
    and computing missing information gaps.
    """

    MANDATORY_FIELDS = {
        "jurisdiction": "Target Jurisdiction (India or International)",
        "product_type": "Formulation Product Type (e.g. churnam, taila, extract, tablet, capsule)",
        "classical_reference": "Classical text reference vs novel proprietary formula",
        "ingredients": "List of active biological resources or ingredients",
        "traditional_knowledge_involved": "Whether traditional knowledge is involved",
        "synergistic_efficacy_proven": "Whether synergistic efficacy / bioavailability lab data exists (Sec 3(e))",
        "biological_resources_involved": "Whether Indian biological resources are accessed (ABS trigger)",
        "applicant_entity_type": "Applicant entity nationality/type for NBA Form I vs Form III vs SBB",
        "intellectual_property_objective": "Primary IP objectives (e.g., patent, trademark, GI, ABS, AYUSH license)",
        "intended_use": "Primary therapeutic or nutritional health indication",
        "manufacturing_context": "Manufacturing / extraction process context"
    }

    def compute_missing_information(self, state: CaseState) -> List[str]:
        """Compute comprehensive list of missing legal, regulatory, and technical parameters based on current CaseState."""
        missing = []
        
        # 1. Jurisdiction & Country
        jur = (state.jurisdiction or "").strip().lower()
        if not jur or jur in ["unknown", "unspecified"]:
            missing.append("jurisdiction")
        elif jur == "international":
            country_val = (state.country or "").strip().lower()
            if not country_val or country_val in ["global", "international", "unknown", "unspecified", ""]:
                missing.append("country")

        # 2. Product Identity & Form
        if not state.product_type or state.product_type.strip().lower() in ["unknown", "unspecified", ""]:
            missing.append("product_type")

        # 3. Formulation Basis / Classical Reference
        has_explicit_basis = (
            bool(state.classical_reference and state.classical_reference.strip().lower() not in ["unknown", "unspecified", ""])
            or bool(state.classical_or_proprietary and state.classical_or_proprietary.strip().lower() not in ["unknown", "unspecified", ""])
        )
        if not has_explicit_basis:
            missing.append("classical_reference")

        # 4. Ingredients
        if not state.ingredients or len(state.ingredients) == 0:
            missing.append("ingredients")

        # 5. Traditional Knowledge
        if state.traditional_knowledge_involved is None and not state.classical_reference:
            missing.append("traditional_knowledge_involved")

        # 6. Synergistic Efficacy / Lab Data (Crucial for Section 3(e) / 3(p) Patent and Proprietary assessments)
        if state.synergistic_efficacy_proven is None:
            is_patent = any("patent" in o.lower() for o in state.intellectual_property_objective)
            is_prop = (state.formulation_classification or "").lower() in ["proprietary", "new_non_classical", "phytopharmaceutical"]
            if is_patent or is_prop or len(state.ingredients) >= 2:
                missing.append("synergistic_efficacy_proven")

        # 7. Biological Resources / ABS Sourcing (Biological Diversity Act 2002)
        if state.biological_resources_involved is None and (state.ingredients or state.product_type):
            missing.append("biological_resources_involved")

        # 8. Applicant Entity Type (Determines NBA Section 3 approval vs Section 7 State Biodiversity Board intimation)
        if state.biological_resources_involved is True and not state.applicant_entity_type:
            missing.append("applicant_entity_type")

        # 9. IP Objectives
        valid_objs = [o for o in state.intellectual_property_objective if o and o.lower() not in ["unknown", "unspecified", ""]]
        if not valid_objs:
            missing.append("intellectual_property_objective")

        # 10. Intended Use / Regulatory Indication (Distinguishes AYUSH Form 25D vs FSSAI Ayurveda-Aahar vs Cosmetic)
        if not state.intended_use or state.intended_use.strip().lower() in ["unknown", "unspecified", ""]:
            missing.append("intended_use")

        # 11. Manufacturing / Extraction Context
        if not state.manufacturing_context or state.manufacturing_context.strip().lower() in ["unknown", "unspecified", ""]:
            is_patent_goal = any("patent" in o.lower() for o in state.intellectual_property_objective)
            is_extract = "extract" in (state.product_type or "").lower() or (state.formulation_classification or "").lower() == "phytopharmaceutical"
            if is_patent_goal or is_extract:
                missing.append("manufacturing_context")

        return missing

    async def apply_updates(self, current_state: CaseState, extraction: ExtractionResult) -> CaseState:
        """Apply extraction updates cleanly to CaseState."""
        updates = extraction.extracted_updates

        if "product_name" in updates and updates["product_name"]:
            current_state.product_name = updates["product_name"]
            current_state.known_information.append(f"Product Name: {updates['product_name']}")

        if "product_type" in updates and updates["product_type"]:
            current_state.product_type = updates["product_type"]
            current_state.known_information.append(f"Product Type: {updates['product_type']}")

        if "dosage_or_form" in updates and updates["dosage_or_form"]:
            current_state.dosage_or_form = updates["dosage_or_form"]
            current_state.known_information.append(f"Dosage Form: {updates['dosage_or_form']}")

        if "intended_use" in updates and updates["intended_use"]:
            current_state.intended_use = updates["intended_use"]
            current_state.known_information.append(f"Intended Use: {updates['intended_use']}")

        if "manufacturing_context" in updates and updates["manufacturing_context"]:
            current_state.manufacturing_context = updates["manufacturing_context"]
            current_state.known_information.append(f"Manufacturing Process: {updates['manufacturing_context']}")

        if "ingredients" in updates and isinstance(updates["ingredients"], list):
            for ing in updates["ingredients"]:
                if ing not in current_state.ingredients:
                    current_state.ingredients.append(ing)
            current_state.known_information.append(f"Ingredients: {', '.join(updates['ingredients'])}")

        if "classical_reference" in updates and updates["classical_reference"]:
            current_state.classical_reference = updates["classical_reference"]
            current_state.known_information.append(f"Formulation Basis: {updates['classical_reference']}")

        if "classical_or_proprietary" in updates and updates["classical_or_proprietary"]:
            current_state.classical_or_proprietary = updates["classical_or_proprietary"]

        if "traditional_knowledge_involved" in updates and updates["traditional_knowledge_involved"] is not None:
            current_state.traditional_knowledge_involved = bool(updates["traditional_knowledge_involved"])
            tk_str = "Yes (Traditional Knowledge Involved)" if current_state.traditional_knowledge_involved else "No (Novel Invention)"
            current_state.known_information.append(f"Traditional Knowledge: {tk_str}")

        if "synergistic_efficacy_proven" in updates and updates["synergistic_efficacy_proven"] is not None:
            current_state.synergistic_efficacy_proven = bool(updates["synergistic_efficacy_proven"])
            syn_str = "Yes (Proven Synergistic Efficacy / Lab Data)" if current_state.synergistic_efficacy_proven else "No / Preliminary"
            current_state.known_information.append(f"Synergistic Efficacy: {syn_str}")

        if "biological_resources_involved" in updates and updates["biological_resources_involved"] is not None:
            current_state.biological_resources_involved = bool(updates["biological_resources_involved"])
            bio_str = "Yes (Indian Biological Resources Sourced)" if current_state.biological_resources_involved else "No (No Biological Resources Sourced from India)"
            current_state.known_information.append(f"Biological Resources / ABS: {bio_str}")

        if "applicant_entity_type" in updates and updates["applicant_entity_type"]:
            current_state.applicant_entity_type = updates["applicant_entity_type"]
            current_state.known_information.append(f"Applicant Entity: {updates['applicant_entity_type']}")

        if "country" in updates and updates["country"]:
            current_state.country = updates["country"]
            current_state.jurisdiction = "International"
            current_state.known_information.append(f"Target Country: {updates['country']}")

        if "jurisdiction" in updates and updates["jurisdiction"]:
            current_state.jurisdiction = updates["jurisdiction"]

        if "intellectual_property_objective" in updates and isinstance(updates["intellectual_property_objective"], list):
            for obj in updates["intellectual_property_objective"]:
                if obj not in current_state.intellectual_property_objective:
                    current_state.intellectual_property_objective.append(obj)
            current_state.known_information.append(f"IP Objectives: {', '.join(updates['intellectual_property_objective'])}")

        if extraction.contradictions:
            for cont in extraction.contradictions:
                if cont not in current_state.known_information:
                    current_state.known_information.append(f"Contradiction/Ambiguity: {cont}")

        current_state.updated_at = datetime.now().isoformat()
        current_state.missing_information = self.compute_missing_information(current_state)

        # Save to database
        await firestore_service.save_case_state(current_state.case_id, current_state.model_dump())
        return current_state

case_state_manager = CaseStateManager()

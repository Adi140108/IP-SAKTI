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
        "product_type": "Formulation Product Type (e.g. churnam, taila, extract, tablet)",
        "classical_reference": "Classical text reference vs novel proprietary formula",
        "ingredients": "List of active biological resources or ingredients",
        "traditional_knowledge_involved": "Whether traditional knowledge is involved",
        "biological_resources_involved": "Whether Indian biological resources are accessed (ABS trigger)",
        "intellectual_property_objective": "Primary IP objectives (e.g., patent, trademark, GI, ABS)"
    }

    def compute_missing_information(self, state: CaseState) -> List[str]:
        """Compute list of missing mandatory parameters based on current CaseState."""
        missing = []
        
        # 1. Jurisdiction & Country
        jur = (state.jurisdiction or "").strip().lower()
        if not jur or jur in ["unknown", "unspecified"]:
            missing.append("jurisdiction")
        elif jur == "international":
            country_val = (state.country or "").strip().lower()
            if not country_val or country_val in ["global", "international", "unknown", "unspecified"]:
                missing.append("country")

        # 2. Product Identity
        if not state.product_type or state.product_type.strip().lower() in ["unknown", "unspecified"]:
            missing.append("product_type")

        # 3. IP Objectives
        valid_objs = [o for o in state.intellectual_property_objective if o and o.lower() not in ["unknown", "unspecified"]]
        if not valid_objs:
            missing.append("intellectual_property_objective")

        # 4. Formulation Basis / Classical Reference
        has_formulation = (
            (state.formulation_classification and state.formulation_classification.lower() not in ["unknown", "unspecified"])
            or state.classical_reference
            or state.classical_or_proprietary
        )
        if not has_formulation:
            missing.append("classical_reference")

        # 5. Ingredients
        if not state.ingredients:
            missing.append("ingredients")

        # 6. Traditional Knowledge
        if state.traditional_knowledge_involved is None and not state.classical_reference and not has_formulation:
            missing.append("traditional_knowledge_involved")

        # 7. Biological Resources / ABS
        if state.biological_resources_involved is None and (state.ingredients or state.product_type):
            missing.append("biological_resources_involved")

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

        if "ingredients" in updates and isinstance(updates["ingredients"], list):
            for ing in updates["ingredients"]:
                if ing not in current_state.ingredients:
                    current_state.ingredients.append(ing)
            current_state.known_information.append(f"Ingredients: {', '.join(updates['ingredients'])}")

        if "classical_reference" in updates and updates["classical_reference"]:
            current_state.classical_reference = updates["classical_reference"]
            current_state.known_information.append(f"Formulation Basis: {updates['classical_reference']}")

        if "traditional_knowledge_involved" in updates and updates["traditional_knowledge_involved"] is not None:
            current_state.traditional_knowledge_involved = bool(updates["traditional_knowledge_involved"])
            tk_str = "Yes (Traditional Knowledge Involved)" if current_state.traditional_knowledge_involved else "No (Novel Invention)"
            current_state.known_information.append(f"Traditional Knowledge: {tk_str}")

        if "biological_resources_involved" in updates and updates["biological_resources_involved"] is not None:
            current_state.biological_resources_involved = bool(updates["biological_resources_involved"])
            bio_str = "Yes (Indian Biological Resources Sourced)" if current_state.biological_resources_involved else "No (No Biological Resources Sourced from India)"
            current_state.known_information.append(f"Biological Resources / ABS: {bio_str}")

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

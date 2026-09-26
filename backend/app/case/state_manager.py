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
        """Compute list of missing mandatory parameters."""
        missing = []
        if not state.jurisdiction:
            missing.append("jurisdiction")
        if not state.product_type:
            missing.append("product_type")
        if not state.classical_reference and state.formulation_classification in ["unknown", "UNKNOWN"]:
            missing.append("classical_reference")
        if not state.ingredients:
            missing.append("ingredients")
        if state.traditional_knowledge_involved is None:
            missing.append("traditional_knowledge_involved")
        if state.biological_resources_involved is None:
            missing.append("biological_resources_involved")
        if not state.intellectual_property_objective or "unknown" in state.intellectual_property_objective:
            missing.append("intellectual_property_objective")
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

        current_state.updated_at = datetime.now().isoformat()
        current_state.missing_information = self.compute_missing_information(current_state)

        # Save to database
        await firestore_service.save_case_state(current_state.case_id, current_state.model_dump())
        return current_state

case_state_manager = CaseStateManager()

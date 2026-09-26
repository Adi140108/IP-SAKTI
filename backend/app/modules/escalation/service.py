import logging
from datetime import datetime
from typing import Dict, Any, List
from app.case.models import CaseState
from app.schemas.system import EscalationDossier

logger = logging.getLogger("IP-SAKTI.Escalation")

class HumanEscalationService:
    """
    Generates structured Case Escalation Dossiers for legal counsel or AYUSH regulatory experts
    when AI confidence is low, evidence is conflicting, or upon user request.
    Includes explicit escalation reasons (Insufficient evidence, Complex jurisdiction, ABS uncertainty, etc.).
    """

    VALID_REASONS = [
        "Insufficient evidence",
        "Conflicting sources",
        "Complex jurisdiction",
        "Novel formulation",
        "ABS uncertainty",
        "User requested expert review",
        "Other"
    ]

    async def generate_dossier(
        self,
        case_state: CaseState,
        sources_found: List[Dict[str, Any]] = None,
        reason: str = "User requested expert review"
    ) -> EscalationDossier:
        """Construct structured Human Escalation Dossier."""
        questions_for_human = [f"Escalation Reason: {reason}"]

        if case_state.formulation_classification in ["unknown", "UNKNOWN"]:
            questions_for_human.append("Needs expert verification: Precise formulation classification under Drugs & Cosmetics Act vs FSSAI.")

        if "abs" in case_state.intellectual_property_objective or case_state.biological_resources_involved:
            questions_for_human.append("Needs NBA legal audit: Check Section 3 vs Section 7 approval workflows under BD Act 2002 (Amended 2023).")

        if "patent" in case_state.intellectual_property_objective:
            questions_for_human.append("Needs patent attorney review: Section 3(p) Traditional Knowledge exclusion audit and synergistic efficacy evidence.")

        return EscalationDossier(
            case_id=case_state.case_id,
            user_objective=", ".join(case_state.intellectual_property_objective) if case_state.intellectual_property_objective else "Ayurvedic IP Protection & Regulatory Guidance",
            product_classification=case_state.formulation_classification,
            jurisdiction=f"{case_state.jurisdiction} ({case_state.country or 'India'})",
            country=case_state.country,
            relevant_ip_domains=case_state.intellectual_property_objective or ["patent", "regulatory"],
            known_information=case_state.known_information or [f"Product Type: {case_state.product_type}"],
            missing_information=case_state.missing_information or [],
            sources_found=sources_found or [],
            questions_requiring_human_review=questions_for_human,
            generated_at=datetime.now().isoformat()
        )

human_escalation_service = HumanEscalationService()

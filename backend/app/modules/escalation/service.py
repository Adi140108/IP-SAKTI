import uuid
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.case.models import CaseState
from app.schemas.system import (
    EscalationDossier,
    EscalationSubmissionResponse
)
from app.db.firestore import firestore_service
from app.rag.retriever import rag_retriever
from app.modules.tkdl.service import tkdl_service
from app.modules.prior_art.matching import prior_art_matcher

logger = logging.getLogger("IP-SAKTI.Escalation")

class HumanEscalationService:
    """
    Generates and persists structured Case Escalation Dossiers for legal counsel or AYUSH regulatory experts.
    Captures complete authoritative CaseState, validated citations with provenance, prior art matches,
    TKDL classical pointers, ABS considerations, and confidence audit trails without AI legal verdicts.
    """

    VALID_REASONS = [
        "Insufficient authoritative evidence",
        "Low evidence confidence",
        "Conflicting statutory sources",
        "Complex cross-border jurisdiction",
        "Novel proprietary formulation",
        "ABS / NBA clearance uncertainty",
        "Public disclosure concern",
        "Significant prior-art record identified",
        "User requested expert review",
        "Other"
    ]

    async def generate_dossier(
        self,
        case_state: CaseState,
        sources_found: Optional[List[Dict[str, Any]]] = None,
        reason: str = "User requested expert review",
        user_note: Optional[str] = None,
        trigger_type: str = "user"
    ) -> EscalationDossier:
        """Construct structured Human Escalation Dossier from authoritative CaseState."""
        dossier_id = f"dos_{uuid.uuid4().hex[:10]}"
        now_iso = datetime.now().isoformat()

        # 1. Gather Questions Requiring Human Review / Unresolved Questions
        questions_for_human: List[str] = [f"Escalation Reason: {reason}"]

        if case_state.formulation_classification in ["unknown", "UNKNOWN", ""]:
            questions_for_human.append("Needs expert verification: Precise formulation classification under Drugs & Cosmetics Act vs FSSAI Ayurveda-Aahar.")

        if "abs" in case_state.intellectual_property_objective or case_state.biological_resources_involved:
            questions_for_human.append("Needs NBA legal audit: Check Section 3 vs Section 7 approval workflows under Biological Diversity Act 2002 (Amended 2023).")

        if any("patent" in o.lower() for o in case_state.intellectual_property_objective):
            questions_for_human.append("Needs patent attorney review: Section 3(p) Traditional Knowledge exclusion audit and Section 3(e) synergistic efficacy defense.")

        if case_state.public_disclosure:
            questions_for_human.append("Public Disclosure Warning: Invention details were reportedly disclosed/sold prior to filing. Review potential novelty bar under Sections 29–34.")

        if case_state.missing_information:
            for missing_field in case_state.missing_information:
                clean_field = missing_field.replace('_', ' ').capitalize()
                questions_for_human.append(f"Missing parameter for statutory assessment: {clean_field}")

        # 2. Extract Citations and Authoritative Sources
        citations: List[Dict[str, Any]] = []
        retrieved_sources: List[Dict[str, Any]] = []
        relevant_sections: List[str] = []

        # Pull citations from conversation_history if present
        for turn in case_state.conversation_history:
            if isinstance(turn, dict) and "citations" in turn:
                for cit in turn["citations"]:
                    if isinstance(cit, dict):
                        if not any(c.get("source") == cit.get("source") and c.get("section_or_rule") == cit.get("section_or_rule") for c in citations):
                            citations.append(cit)
                            if cit.get("section_or_rule"):
                                relevant_sections.append(cit["section_or_rule"])

        # If sources_found was passed or needs retrieval
        if sources_found:
            retrieved_sources = sources_found
            for s in sources_found:
                if s.get("section") and s["section"] not in relevant_sections:
                    relevant_sections.append(s["section"])
        else:
            try:
                evidence = await rag_retriever.retrieve_evidence(
                    query=case_state.product_type or (case_state.ingredients[0] if case_state.ingredients else "Ayurvedic statutory regulation"),
                    jurisdiction=case_state.jurisdiction,
                    country=case_state.country,
                    ip_domains=case_state.intellectual_property_objective,
                    top_k=4
                )
                retrieved_sources = evidence.source_metadata
                for s in evidence.source_metadata:
                    if s.get("section") and s["section"] not in relevant_sections:
                        relevant_sections.append(s["section"])
            except Exception as e:
                logger.warning(f"Dossier RAG retrieval fallback: {e}")

        # 3. Traditional Knowledge (TKDL) Classical Pointers
        tkdl_data = {}
        if case_state.traditional_knowledge_involved or case_state.ingredients:
            try:
                tkdl_data = tkdl_service.get_public_prior_art_pointers(
                    formulation_type=case_state.product_type or "Ayurvedic formulation",
                    ingredients=case_state.ingredients or []
                )
            except Exception as e:
                logger.warning(f"Dossier TKDL pointer lookup error: {e}")

        # 4. Prior Art Matches (Separated from TKDL evidence)
        prior_art_matches_list: List[Dict[str, Any]] = []
        is_patent_focused = (
            any("patent" in o.lower() for o in case_state.intellectual_property_objective) or
            case_state.formulation_classification in ["proprietary", "new_non_classical", "phytopharmaceutical"]
        )
        if is_patent_focused:
            try:
                pa_res = await prior_art_matcher.search_prior_art(case_state, top_k=4)
                for m in pa_res.matches:
                    prior_art_matches_list.append(m.model_dump())
            except Exception as e:
                logger.warning(f"Dossier prior art lookup error: {e}")

        # 5. ABS Assessment Notes
        abs_notes = None
        if case_state.biological_resources_involved:
            abs_notes = (
                "ABS Considerations Identified: Biological resources sourced from India require National Biodiversity Authority (NBA) approval. "
                "Indian entities file Form I for commercial utilization or Form III prior to patent grant; foreign entities/NRIs require prior approval under Section 3."
            )
        elif case_state.biological_resources_involved is False:
            abs_notes = "ABS Exemption / Non-Indian Sourcing: Biological materials reportedly not sourced from India or within exempted classical categories."

        # 6. Extract Latest User Question / Message
        user_msg = None
        if case_state.conversation_history:
            for turn in reversed(case_state.conversation_history):
                if isinstance(turn, dict) and turn.get("user_message"):
                    user_msg = turn["user_message"]
                    break

        # Confidence level derivation
        conf_score = case_state.confidence or 0.85
        conf_lvl = "High" if conf_score >= 0.8 else ("Medium" if conf_score >= 0.5 else "Low")
        conf_reason = "Evaluated against statutory index and verified legal citations."
        if conf_score < 0.5:
            conf_reason = "Insufficient statutory evidence in legal index to resolve formulation specifics."

        # Initial audit log
        audit_entry = {
            "action": "dossier_created",
            "timestamp": now_iso,
            "trigger": trigger_type,
            "reason": reason,
            "confidence_score": conf_score,
            "status": "draft"
        }

        # Case summary string
        summary = (
            f"{case_state.product_name or case_state.product_type or 'Ayurvedic Case'} under {case_state.jurisdiction} "
            f"({case_state.country or 'India'}). Objectives: {', '.join(case_state.intellectual_property_objective) if case_state.intellectual_property_objective else 'Unspecified'}."
        )

        return EscalationDossier(
            dossier_id=dossier_id,
            case_id=case_state.case_id,
            created_at=now_iso,
            status="draft",
            jurisdiction=case_state.jurisdiction,
            country=case_state.country,
            region=case_state.region,
            language=case_state.language or "en",
            user_question=user_msg,
            case_summary=summary,
            product_name=case_state.product_name,
            product_type=case_state.product_type,
            formulation_classification=case_state.formulation_classification or "unknown",
            classical_reference=case_state.classical_reference,
            ingredients=case_state.ingredients or [],
            composition_details=case_state.composition_details,
            intended_use=case_state.intended_use,
            dosage_or_form=case_state.dosage_or_form,
            manufacturing_context=case_state.manufacturing_context,
            intellectual_property_objective=case_state.intellectual_property_objective or [],
            relevant_ip_types=case_state.intellectual_property_objective or [],
            novelty_aspect=case_state.novelty_aspect,
            technical_improvement=case_state.technical_improvement,
            experimental_evidence=case_state.experimental_evidence,
            public_disclosure=case_state.public_disclosure,
            public_disclosure_details=case_state.public_disclosure_details,
            prior_art_known=case_state.prior_art_known,
            prior_art_details=case_state.prior_art_details,
            traditional_knowledge_involved=case_state.traditional_knowledge_involved,
            biological_resources_involved=case_state.biological_resources_involved,
            access_and_benefit_sharing=case_state.access_and_benefit_sharing,
            source_of_ingredients=case_state.source_of_ingredients,
            applicant_entity_type=case_state.applicant_entity_type,
            abs_assessment=abs_notes,
            tkdl_pointers=tkdl_data,
            retrieved_sources=retrieved_sources,
            authoritative_sources=[s for s in retrieved_sources if s.get("authority")],
            citations=citations,
            relevant_sections=list(set(relevant_sections)),
            prior_art_matches=prior_art_matches_list,
            confidence=round(conf_score, 2),
            confidence_level=conf_lvl,
            confidence_reason=conf_reason,
            unresolved_questions=questions_for_human,
            escalation_reason=reason,
            user_note=user_note,
            audit_log=[audit_entry],
            # Backward compatibility fields
            user_objective=", ".join(case_state.intellectual_property_objective) if case_state.intellectual_property_objective else "Ayurvedic IP Protection & Regulatory Guidance",
            product_classification=case_state.formulation_classification or "unknown",
            relevant_ip_domains=case_state.intellectual_property_objective or ["patent", "regulatory"],
            known_information=case_state.known_information or [f"Product Type: {case_state.product_type}"],
            missing_information=case_state.missing_information or [],
            sources_found=retrieved_sources,
            questions_requiring_human_review=questions_for_human,
            generated_at=now_iso
        )

    async def submit_dossier(
        self,
        case_id: str,
        reason: str = "User requested expert review",
        user_note: Optional[str] = None,
        trigger_type: str = "user"
    ) -> EscalationSubmissionResponse:
        """Construct, submit, and persist a human review request."""
        case_data = await firestore_service.get_case_state(case_id)
        if not case_data:
            raise ValueError(f"Case state not found for ID: {case_id}")

        case_state = CaseState(**case_data)
        dossier = await self.generate_dossier(
            case_state=case_state,
            reason=reason,
            user_note=user_note,
            trigger_type=trigger_type
        )

        now_iso = datetime.now().isoformat()
        dossier.status = "submitted"
        dossier.submitted_at = now_iso

        # Append submission audit entry
        dossier.audit_log.append({
            "action": "dossier_submitted",
            "timestamp": now_iso,
            "trigger": trigger_type,
            "reason": reason,
            "status": "submitted",
            "user_note": user_note
        })

        # Persist to database
        await firestore_service.save_escalation_dossier(dossier.dossier_id, dossier.model_dump())

        return EscalationSubmissionResponse(
            dossier_id=dossier.dossier_id,
            case_id=case_id,
            status="submitted",
            created_at=dossier.created_at,
            message="Human review request submitted successfully. An IP Facilitator will inspect your case dossier.",
            dossier=dossier
        )

    async def get_dossier(self, dossier_id: str) -> Optional[EscalationDossier]:
        """Retrieve persisted escalation dossier by ID."""
        data = await firestore_service.get_escalation_dossier(dossier_id)
        if data:
            return EscalationDossier(**data)
        return None

    async def list_dossiers(self, limit: int = 50, status: Optional[str] = None) -> List[EscalationDossier]:
        """List submitted escalation dossiers for facilitator dashboard."""
        records = await firestore_service.list_escalation_dossiers(limit=limit, status=status)
        return [EscalationDossier(**r) for r in records]

    async def update_status(
        self,
        dossier_id: str,
        new_status: str,
        facilitator_note: Optional[str] = None,
        facilitator_id: Optional[str] = "facilitator_system"
    ) -> Optional[EscalationDossier]:
        """Update dossier lifecycle status with facilitator audit entry."""
        audit_entry = {
            "action": f"status_updated_to_{new_status}",
            "timestamp": datetime.now().isoformat(),
            "facilitator_id": facilitator_id,
            "note": facilitator_note,
            "status": new_status
        }
        res_dict = await firestore_service.update_escalation_status(dossier_id, new_status, audit_entry)
        if res_dict:
            if facilitator_note:
                res_dict["facilitator_notes"] = facilitator_note
            if new_status == "under_review":
                res_dict["reviewed_at"] = datetime.now().isoformat()
            await firestore_service.save_escalation_dossier(dossier_id, res_dict)
            return EscalationDossier(**res_dict)
        return None

human_escalation_service = HumanEscalationService()

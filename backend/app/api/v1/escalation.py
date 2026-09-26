from fastapi import APIRouter, HTTPException
from app.db.firestore import firestore_service
from app.schemas.case import CaseState
from app.schemas.system import EscalationDossier
from app.modules.escalation.service import human_escalation_service
from app.rag.retriever import rag_retriever

router = APIRouter(tags=["Escalation"])

@router.post("/escalation/dossier", response_model=EscalationDossier)
async def generate_escalation_dossier(case_id: str, reason: str = "User request"):
    case_data = await firestore_service.get_case_state(case_id)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case state not found")

    case_state = CaseState(**case_data)
    evidence = await rag_retriever.retrieve_evidence(
        query=case_state.product_type or "Ayurvedic legal consultation",
        jurisdiction=case_state.jurisdiction,
        ip_domains=case_state.ip_objective,
        top_k=3
    )

    return await human_escalation_service.generate_dossier(
        case_state=case_state,
        sources_found=evidence.source_metadata,
        reason=reason
    )

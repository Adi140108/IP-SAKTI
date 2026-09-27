from fastapi import APIRouter, HTTPException, Query, Body
from typing import Optional, List, Dict, Any
from app.db.firestore import firestore_service
from app.schemas.case import CaseState
from app.schemas.system import (
    EscalationDossier,
    EscalationSubmissionRequest,
    EscalationSubmissionResponse,
    EscalationStatusUpdateRequest
)
from app.modules.escalation.service import human_escalation_service
from app.rag.retriever import rag_retriever

router = APIRouter(tags=["Escalation"])

@router.post("/escalation/dossier", response_model=EscalationDossier)
async def create_or_submit_escalation_dossier(
    request_data: Optional[EscalationSubmissionRequest] = Body(default=None),
    case_id: Optional[str] = Query(default=None),
    reason: Optional[str] = Query(default=None),
    user_note: Optional[str] = Query(default=None)
):
    """
    Generate, construct, and return or submit a structured Human Escalation Dossier.
    Supports both JSON body and query parameters for full interoperability.
    """
    effective_case_id = (request_data.case_id if request_data else None) or case_id
    effective_reason = (request_data.reason if request_data else None) or reason or "User requested expert review"
    effective_note = (request_data.user_note if request_data else None) or user_note
    effective_trigger = request_data.trigger_type if request_data else "user"

    if not effective_case_id:
        raise HTTPException(status_code=400, detail="case_id is required to generate an escalation dossier.")

    case_data = await firestore_service.get_case_state(effective_case_id)
    if not case_data:
        case_state = CaseState(case_id=effective_case_id)
        await firestore_service.save_case_state(effective_case_id, case_state.model_dump())
    else:
        case_state = CaseState(**case_data)

    # If this is an explicit submission request (has request body or explicit submit intention), submit and persist
    dossier = await human_escalation_service.generate_dossier(
        case_state=case_state,
        reason=effective_reason,
        user_note=effective_note,
        trigger_type=effective_trigger
    )

    # Persist dossier in ready/submitted status
    dossier.status = "submitted"
    await firestore_service.save_escalation_dossier(dossier.dossier_id, dossier.model_dump())

    return dossier


@router.post("/escalation/submit", response_model=EscalationSubmissionResponse)
async def submit_escalation_request(request: EscalationSubmissionRequest):
    """Explicit endpoint for submitting an escalation request."""
    try:
        res = await human_escalation_service.submit_dossier(
            case_id=request.case_id,
            reason=request.reason,
            user_note=request.user_note,
            trigger_type=request.trigger_type
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit escalation request: {str(e)}")


@router.get("/escalation/dossier", response_model=EscalationDossier)
async def get_escalation_dossier_by_case(
    case_id: Optional[str] = Query(default=None),
    dossier_id: Optional[str] = Query(default=None)
):
    """Retrieve or dynamically compile an escalation dossier for a case."""
    if dossier_id:
        dossier = await human_escalation_service.get_dossier(dossier_id)
        if dossier:
            return dossier
        raise HTTPException(status_code=404, detail="Escalation dossier not found")

    if case_id:
        case_data = await firestore_service.get_case_state(case_id)
        if not case_data:
            case_state = CaseState(case_id=case_id)
            await firestore_service.save_case_state(case_id, case_state.model_dump())
        else:
            case_state = CaseState(**case_data)
        return await human_escalation_service.generate_dossier(case_state=case_state)

    raise HTTPException(status_code=400, detail="Either case_id or dossier_id must be provided")


@router.get("/escalation/requests", response_model=List[EscalationDossier])
async def list_escalation_requests(
    limit: int = Query(default=50, ge=1, le=100),
    status: Optional[str] = Query(default=None)
):
    """List submitted escalation dossiers for the Human Facilitator Dashboard."""
    return await human_escalation_service.list_dossiers(limit=limit, status=status)


@router.patch("/escalation/dossier/{dossier_id}/status", response_model=EscalationDossier)
async def update_escalation_status(
    dossier_id: str,
    update_data: EscalationStatusUpdateRequest
):
    """Update escalation review status (e.g. submitted -> under_review -> resolved)."""
    updated = await human_escalation_service.update_status(
        dossier_id=dossier_id,
        new_status=update_data.status,
        facilitator_note=update_data.facilitator_note,
        facilitator_id=update_data.facilitator_id
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Dossier not found")
    return updated

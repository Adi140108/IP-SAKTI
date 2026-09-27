import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.schemas.case import CaseState, CaseStateUpdate
from app.db.firestore import firestore_service
from app.modules.questioning.engine import questioning_engine

router = APIRouter(tags=["Cases"])

@router.get("/cases", response_model=List[CaseState])
async def list_cases(user_id: Optional[str] = Query(None, description="Filter cases by user ID")):
    cases = await firestore_service.list_cases(user_id=user_id)
    return [CaseState(**c) for c in cases]

@router.post("/cases", response_model=CaseState)
async def create_case(state_init: CaseStateUpdate):
    case_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    
    new_state = CaseState(
        case_id=case_id,
        user_id=state_init.user_id or "guest_user",
        language=state_init.language or "en",
        jurisdiction=state_init.jurisdiction or "India",
        country=state_init.country,
        product_type=state_init.product_type,
        ingredients=state_init.ingredients or [],
        intended_use=state_init.intended_use,
        formulation_classification=state_init.formulation_classification or "UNKNOWN",
        classical_or_proprietary=state_init.classical_or_proprietary,
        traditional_knowledge_involved=state_init.traditional_knowledge_involved,
        biological_resources_involved=state_init.biological_resources_involved,
        ip_objective=state_init.ip_objective or [],
        created_at=now,
        updated_at=now
    )

    missing = await questioning_engine.detect_information_gaps(new_state)
    new_state.missing_information = missing

    await firestore_service.save_case_state(case_id, new_state.model_dump())
    return new_state

@router.get("/cases/{case_id}", response_model=CaseState)
async def get_case(case_id: str):
    data = await firestore_service.get_case_state(case_id)
    if not data:
        raise HTTPException(status_code=404, detail="Case state not found")
    return CaseState(**data)

@router.put("/cases/{case_id}", response_model=CaseState)
async def update_case(case_id: str, update: CaseStateUpdate):
    existing = await firestore_service.get_case_state(case_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")

    state_obj = CaseState(**existing)
    
    # Apply updates
    for field, value in update.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(state_obj, field, value)

    state_obj.updated_at = datetime.now().isoformat()
    state_obj.missing_information = await questioning_engine.detect_information_gaps(state_obj)

    await firestore_service.save_case_state(case_id, state_obj.model_dump())
    return state_obj

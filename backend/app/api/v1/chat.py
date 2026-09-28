from typing import List
import logging
from fastapi import APIRouter
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    TranslateRequest,
    TranslateResponse,
    ComparisonRequest,
    ComparisonResponse
)
from app.orchestration.conversation_pipeline import conversation_pipeline, robust_translate
from app.modules.comparison.engine import comparative_law_engine, AVAILABLE_COMPARISON_TARGETS
from app.db.firestore import firestore_service
from app.case.models import CaseState

router = APIRouter(tags=["Chat"])
logger = logging.getLogger("IP-SAKTI.ChatAPI")

@router.post("/chat/message", response_model=ChatResponse)
async def process_chat_message(request: ChatRequest):
    """
    Thin API Endpoint for Chat Messages.
    Delegates processing to the decoupled ConversationPipeline orchestrator.
    """
    return await conversation_pipeline.execute_conversation_turn(request)

@router.post("/chat/translate", response_model=TranslateResponse)
async def translate_chat_text(request: TranslateRequest):
    """
    Translates legal or chat text into target Indic language using Bhashini NMT / Groq.
    """
    translated = await robust_translate(
        text=request.text,
        source_lang=request.source_lang or "en",
        target_lang=request.target_lang
    )
    return TranslateResponse(
        translated_text=translated,
        source_lang=request.source_lang or "en",
        target_lang=request.target_lang
    )

@router.post("/chat/compare", response_model=ComparisonResponse)
async def compare_statutes(request: ComparisonRequest):
    """
    Performs dual-jurisdiction statutory comparison between Indian IP law and
    International Standard Law or specific foreign country statutes (USA, EPO, DPMA, etc.).
    """
    existing_data = await firestore_service.get_case_state(request.case_id)
    if existing_data:
        case_state = CaseState(**existing_data)
    else:
        case_state = CaseState(case_id=request.case_id, user_id=request.user_id or "guest_user")
    
    return await comparative_law_engine.compare_jurisdictions(request, case_state)

@router.get("/chat/comparison-targets", response_model=List[str])
async def list_comparison_targets():
    """
    Returns list of supported international treaties and foreign countries available for comparative analysis.
    """
    return AVAILABLE_COMPARISON_TARGETS



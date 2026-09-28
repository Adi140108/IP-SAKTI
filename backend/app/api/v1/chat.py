import logging
from fastapi import APIRouter
from app.schemas.chat import ChatRequest, ChatResponse, TranslateRequest, TranslateResponse
from app.orchestration.conversation_pipeline import conversation_pipeline, robust_translate

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


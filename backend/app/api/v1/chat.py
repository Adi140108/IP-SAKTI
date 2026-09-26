import logging
from fastapi import APIRouter
from app.schemas.chat import ChatRequest, ChatResponse
from app.orchestration.conversation_pipeline import conversation_pipeline

router = APIRouter(tags=["Chat"])
logger = logging.getLogger("IP-SAKTI.ChatAPI")

@router.post("/chat/message", response_model=ChatResponse)
async def process_chat_message(request: ChatRequest):
    """
    Thin API Endpoint for Chat Messages.
    Delegates processing to the decoupled ConversationPipeline orchestrator.
    """
    return await conversation_pipeline.execute_conversation_turn(request)

from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.diagnostics import router as diagnostics_router
from app.api.v1.cases import router as cases_router
from app.api.v1.chat import router as chat_router
from app.api.v1.documents import router as documents_router
from app.api.v1.sources import router as sources_router
from app.api.v1.escalation import router as escalation_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(diagnostics_router)
api_v1_router.include_router(cases_router)
api_v1_router.include_router(chat_router)
api_v1_router.include_router(documents_router)
api_v1_router.include_router(sources_router)
api_v1_router.include_router(escalation_router)

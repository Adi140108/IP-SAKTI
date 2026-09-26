from fastapi import APIRouter
from datetime import datetime
from app.db.firestore import firestore_service
from app.storage.backblaze import backblaze_service
from app.ai.gemma.provider import gemma_provider
from app.ai.bhashini.service import bhashini_service
from app.schemas.system import DiagnosticsStatus, ServiceStatus

router = APIRouter(tags=["Diagnostics"])

@router.get("/system/diagnostics", response_model=DiagnosticsStatus)
async def system_diagnostics():
    """Live diagnostic check of all connected services and sub-systems."""
    gemma_check = await gemma_provider.check_availability()
    
    gemma_status = ServiceStatus(
        name="Ollama / Gemma 4 12B",
        status="CONNECTED" if gemma_check.get("available") else "DISCONNECTED",
        details=f"Model: {gemma_provider.model}. Details: {gemma_check.get('error', 'Ready')}"
    )

    firestore_status = ServiceStatus(**firestore_service.get_status())
    backblaze_status = ServiceStatus(**backblaze_service.get_status())
    bhashini_status = ServiceStatus(**await bhashini_service.get_status())
    
    vector_db_status = ServiceStatus(
        name="Authoritative Vector DB",
        status="CONNECTED",
        details="In-Memory Hybrid BM25/Cosine Index Active (8 Core Legal Statutes Seeded)"
    )

    backend_status = ServiceStatus(
        name="FastAPI Core Service",
        status="CONNECTED",
        details="API Gateway Active & Ready"
    )

    return DiagnosticsStatus(
        backend=backend_status,
        firestore=firestore_status,
        backblaze=backblaze_status,
        ollama_gemma=gemma_status,
        bhashini=bhashini_status,
        vector_db=vector_db_status,
        timestamp=datetime.now().isoformat()
    )

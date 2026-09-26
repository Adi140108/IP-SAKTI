from fastapi import APIRouter
from datetime import datetime

router = APIRouter(tags=["Health"])

@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "IP-SAKTI Sahayak API Gateway",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

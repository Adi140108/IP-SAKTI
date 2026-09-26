import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.v1.router import api_v1_router

logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("IP-SAKTI.Main")

app = FastAPI(
    title="IP-SAKTI Sahayak API Gateway",
    description="Multilingual RAG-based, source-cited AI assistant for Intellectual Property & Regulatory Guidance in Ayurveda.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS for Next.js frontend
raw_origins = getattr(settings, "CORS_ORIGINS", "*")
cors_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
is_wildcard = cors_origins == ["*"] or "*" in cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if is_wildcard else cors_origins,
    allow_credentials=not is_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router, prefix="/api/v1")

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "IP-SAKTI API Gateway"}

@app.get("/")
async def root():
    return {
        "title": "IP-SAKTI Sahayak",
        "description": "Multilingual AI assistant for Ayurvedic Intellectual Property & Regulatory Guidance (PS-26045)",
        "docs": "/docs",
        "health": "/api/v1/health",
        "diagnostics": "/api/v1/system/diagnostics"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)

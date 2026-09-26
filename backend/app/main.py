import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.v1.router import api_v1_router
from app.security import (
    parse_cors_origins,
    security_headers_middleware,
    sanitized_exception_handler
)

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

# 1. Register HTTP Security Headers Middleware
app.middleware("http")(security_headers_middleware)

# 2. Configure Hardened CORS Middleware
cors_origins, allow_creds = parse_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_creds,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
)

# 3. Register Global Sanitized Exception Handler
app.add_exception_handler(Exception, sanitized_exception_handler)

# 4. Include API Routers
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


import logging
from typing import List, Tuple
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from app.config import settings

logger = logging.getLogger("IP-SAKTI.Security")


def parse_cors_origins() -> Tuple[List[str], bool]:
    """
    Parse and validate CORS origins based on environment (development vs production).
    Returns (allowed_origins_list, allow_credentials_boolean).
    
    Security Rules:
    1. In production, wildcard '*' with credentials is strictly disallowed.
    2. In production, explicit origins MUST be configured via CORS_ALLOWED_ORIGINS or CORS_ORIGINS.
    3. In development, localhost origins are provided as a safe default if unspecified.
    """
    raw_origins = settings.CORS_ALLOWED_ORIGINS or settings.CORS_ORIGINS
    is_production = settings.APP_ENV == "production"

    if not raw_origins or not raw_origins.strip():
        if is_production:
            logger.warning("CORS: No explicit origins configured in production! Rejecting all cross-origin requests.")
            return ([], False)
        # Development defaults
        return (["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8000"], True)

    origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
    has_wildcard = "*" in origins

    if is_production:
        if has_wildcard:
            logger.error("CORS: Wildcard '*' origin is strictly forbidden in production mode with credentials!")
            # Filter out wildcard in production to enforce strict security
            filtered = [o for o in origins if o != "*"]
            if not filtered:
                raise ValueError("PRODUCTION SECURITY ERROR: Wildcard '*' CORS origin is not permitted in production. Set explicit origins in CORS_ALLOWED_ORIGINS.")
            return (filtered, True)
        return (origins, True)

    # Development mode
    if has_wildcard:
        return (["*"], False)
    return (origins, True)


async def security_headers_middleware(request: Request, call_next):
    """
    Attach standard HTTP security headers to all incoming responses.
    """
    response = await call_next(request)
    
    if getattr(settings, "SECURITY_HEADERS_ENABLED", True):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"

        # Content-Security-Policy
        if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self' https: 'unsafe-inline' data:; img-src 'self' data: https:;"
            )
        else:
            response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"

    return response


async def sanitized_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler ensuring internal stack traces, system paths,
    and credentials are never leaked in production responses.
    """
    logger.error(
        f"Unhandled exception during {request.method} {request.url.path}: {type(exc).__name__}: {exc}",
        exc_info=True
    )

    if settings.APP_ENV == "production":
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "message": "An unexpected error occurred while processing your request.",
                "status_code": 500
            }
        )

    # Development mode: return readable message
    return JSONResponse(
        status_code=500,
        content={
            "error": type(exc).__name__,
            "message": str(exc),
            "status_code": 500
        }
    )

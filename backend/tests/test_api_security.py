import io
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.security import parse_cors_origins


client = TestClient(app)


def test_1_allowed_cors_origin_receives_cors_headers():
    """Verify that an allowed CORS origin receives appropriate CORS headers."""
    with patch.object(settings, "CORS_ALLOWED_ORIGINS", "https://ip-sakti.vercel.app,http://localhost:3000"), \
         patch.object(settings, "APP_ENV", "production"):
        
        origins, creds = parse_cors_origins()
        assert "https://ip-sakti.vercel.app" in origins
        assert creds is True


def test_2_disallowed_cors_origin_rejected():
    """Verify that a disallowed origin is not included in the allowed list."""
    with patch.object(settings, "CORS_ALLOWED_ORIGINS", "https://ip-sakti.vercel.app"), \
         patch.object(settings, "APP_ENV", "production"):
        
        origins, _ = parse_cors_origins()
        assert "https://evil-attacker-site.com" not in origins
        assert "https://ip-sakti.vercel.app" in origins


def test_3_production_wildcard_cors_rejected():
    """Verify that wildcard '*' CORS with credentials is strictly disallowed in production."""
    with patch.object(settings, "CORS_ALLOWED_ORIGINS", "*"), \
         patch.object(settings, "APP_ENV", "production"):
        
        with pytest.raises(ValueError) as exc_info:
            parse_cors_origins()
        assert "PRODUCTION SECURITY ERROR" in str(exc_info.value)
        assert "Wildcard '*' CORS origin is not permitted in production" in str(exc_info.value)


def test_4_cors_configuration_parsing_development():
    """Verify that development mode provides safe defaults when origins are not explicitly configured."""
    with patch.object(settings, "CORS_ALLOWED_ORIGINS", None), \
         patch.object(settings, "CORS_ORIGINS", None), \
         patch.object(settings, "APP_ENV", "development"):
        
        origins, creds = parse_cors_origins()
        assert "http://localhost:3000" in origins
        assert creds is True


def test_5_sanitized_production_error_response():
    """Verify that unhandled server exceptions in production return sanitized responses without stack traces."""
    from fastapi import FastAPI
    from app.security import sanitized_exception_handler
    
    test_app = FastAPI()
    test_app.add_exception_handler(Exception, sanitized_exception_handler)

    @test_app.get("/trigger-secret-crash")
    def crash():
        # Simulate an internal crash with sensitive paths and tokens
        raise RuntimeError("Database connection to /etc/secrets/db_password_123 failed at line 42")

    test_client = TestClient(test_app, raise_server_exceptions=False)

    with patch.object(settings, "APP_ENV", "production"):
        res = test_client.get("/trigger-secret-crash")
        assert res.status_code == 500
        data = res.json()
        assert data["error"] == "Internal Server Error"
        assert "db_password_123" not in str(data)
        assert "/etc/secrets" not in str(data)
        assert "An unexpected error occurred" in data["message"]


def test_6_diagnostics_endpoint_does_not_expose_secrets():
    """Verify that diagnostics endpoint does not expose sensitive credentials, API keys, or JSON blobs."""
    res = client.get("/api/v1/system/diagnostics")
    assert res.status_code == 200
    text_data = res.text

    # Verify no credentials or private key tokens exist in diagnostics output
    assert "private_key" not in text_data
    assert "service_account" not in text_data
    assert "FIREBASE_CREDENTIALS" not in text_data
    assert "B2_APPLICATION_KEY" not in text_data
    assert "GROQ_API_KEY" not in text_data


def test_7_security_headers_present():
    """Verify that standard HTTP security headers are attached to responses."""
    res = client.get("/health")
    assert res.status_code == 200
    headers = res.headers

    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert headers.get("x-xss-protection") == "1; mode=block"
    assert "default-src 'self'" in headers.get("content-security-policy", "")


def test_8_upload_size_limit_protection():
    """Verify that uploads exceeding MAX_UPLOAD_SIZE_BYTES are rejected with HTTP 413."""
    case_res = client.post("/api/v1/cases", json={"jurisdiction": "India", "product_type": "Extract"})
    case_id = case_res.json()["case_id"]

    # Temporarily set max limit to 1 KB for test verification
    with patch.object(settings, "MAX_UPLOAD_SIZE_BYTES", 1024):
        oversized_data = b"A" * 2048  # 2 KB file
        file_obj = io.BytesIO(oversized_data)

        res = client.post(
            "/api/v1/documents/upload",
            data={"case_id": case_id},
            files={"file": ("large_file.pdf", file_obj, "application/pdf")}
        )

        assert res.status_code == 413
        assert "exceeds maximum allowed limit" in res.json()["detail"]

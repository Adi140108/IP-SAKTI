# IP-SAKTI Security & Hardening Status

## 1. Overview
This document outlines the API security, Cross-Origin Resource Sharing (CORS) policy, HTTP security headers, error sanitization, secret management, and request protection mechanisms for the IP-SAKTI Sahayak backend.

---

## 2. CORS Policy

### Development Mode (`APP_ENV=development`)
- Safe local defaults are automatically enabled: `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:8000`.
- Supports credentials (`allow_credentials=True`) for local developer workflows.

### Production Mode (`APP_ENV=production`)
- **Strict Allowed Origins**: Only origins explicitly defined in `CORS_ALLOWED_ORIGINS` (or `CORS_ORIGINS`) are permitted (e.g. `https://ip-sakti.vercel.app`).
- **Wildcard Prohibition**: Wildcard `*` origins with credentials are strictly forbidden in production. Any attempt to use `*` as an allowed origin raises an immediate `ValueError` during startup.
- **Explicit HTTP Methods**: Restricted to `["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"]`.
- **Explicit HTTP Headers**: Restricted to `["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]`.

---

## 3. HTTP Security Headers
Every HTTP response issued by the FastAPI gateway is augmented with standard security headers via `security_headers_middleware`:

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Protects against Clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Protects referral privacy |
| `X-XSS-Protection` | `1; mode=block` | Enables browser XSS filters |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=()` | Restricts privileged browser APIs |
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none';` | Restricts resource loading |

*(Note: CSP is dynamically relaxed for `/docs` and `/redoc` to allow OpenAPI Swagger UI assets).*

---

## 4. Error Handling & Sanitization
- **Production Mode**: Unhandled server exceptions (`HTTP 500`) are intercepted by `sanitized_exception_handler`. Internal Python tracebacks, filesystem paths, and configuration details are logged privately in the server console and NEVER sent to the client. Responses return clean, generic error messages:
  ```json
  {
    "error": "Internal Server Error",
    "message": "An unexpected error occurred while processing your request.",
    "status_code": 500
  }
  ```
- **Development Mode**: Detailed exception names and messages are returned to assist debugging.

---

## 5. Secret Handling & Credentials Protection
- **No Tracked Secrets**: All `.env` and `firebase_credentials.json` files are listed in `.gitignore` and excluded from source control.
- **Sanitized Templates**: `.env.example` and `.env.render.example` contain placeholder names only and no actual secret keys.
- **Redacted Diagnostics**: `/api/v1/system/diagnostics` and all service status methods report operational status (`CONNECTED`, `READY`, `MOCK_STORAGE`, `ERROR`) without exposing API keys, private tokens, or database connection strings.

---

## 6. Request & Upload Protection
- **Maximum Upload Size Limit**: Document uploads via `/api/v1/documents/upload` are strictly checked against `MAX_UPLOAD_SIZE_BYTES` (default: 25 MB). Requests exceeding this limit receive an immediate `HTTP 413 Payload Too Large`.
- **Empty File Rejection**: Zero-byte file uploads are rejected with `HTTP 400 Bad Request`.
- **Path Traversal Sanitization**: All uploaded filenames and document identifiers are sanitized before storage (`_sanitize_filename` / `_sanitize_id`) to prevent directory traversal (`../`) and cloud namespace escapes.

---

## 7. Rate Limiting Status
- **Current Status**: Application-level in-memory rate limiting is currently not implemented to avoid state synchronization bottlenecks across multi-worker server deployments.
- **Recommendation**: Deploy reverse proxy / CDN rate limiting (e.g. Cloudflare, Vercel Edge Firewall, or Render DDoS protection) for IP-level throttling in production.

---

## 8. Summary Status
- **CORS Hardening**: Complete
- **Security Headers**: Complete
- **Error Sanitization**: Complete
- **Secret Isolation**: Complete
- **Upload Protection**: Complete

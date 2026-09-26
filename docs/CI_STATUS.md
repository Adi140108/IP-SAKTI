# IP-SAKTI CI/CD Status & Workflow Documentation

## 1. Overview
Continuous Integration (CI) for the IP-SAKTI Sahayak repository is automated via GitHub Actions. It validates bytecode compilation and runs the complete test suite on every code commit and pull request.

---

## 2. CI Workflow Details

| Parameter | Configuration |
|---|---|
| **Workflow File** | [`.github/workflows/backend-ci.yml`](file:///c:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/.github/workflows/backend-ci.yml) |
| **Runner OS** | `ubuntu-latest` |
| **Python Version** | `3.12` |
| **Dependency Manager** | `pip` using [`backend/requirements.txt`](file:///c:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/requirements.txt) |
| **Dependency Caching** | Enabled (`cache: 'pip'`, `cache-dependency-path: backend/requirements.txt`) |
| **Triggers** | `push` and `pull_request` on branches `main`, `master`, `develop` |

---

## 3. Workflow Steps & Commands

1. **Checkout Repository**: Uses `actions/checkout@v4`.
2. **Environment Setup**: Installs Python 3.12 with pip caching via `actions/setup-python@v5`.
3. **Dependency Installation**:
   ```bash
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```
4. **Bytecode Compilation Check**:
   ```bash
   python -m compileall app
   ```
5. **Backend Pytest Execution**:
   ```bash
   pytest -v
   ```

---

## 4. Secret & Production Isolation

- **No Production Credentials Required**: The CI pipeline runs completely offline from external cloud services.
- **Mocks & Fixtures**: LLM providers (Groq and Gemma) are mocked deterministically via `conftest.py`.
- **Database & Storage Modes**: Set to `mock` in the CI environment (`DATABASE_MODE=mock`, `STORAGE_MODE=mock`, `RAG_MODE=mock`), ensuring zero writes to Firebase Firestore or Backblaze B2 during automated testing.
- **Zero Committed Secrets**: No `.env` or credential files are present in the CI workflow or tracked in Git.

---

## 5. Frontend CI Status

- **Status**: Excluded from blocking CI.
- **Rationale**: The frontend codebase currently has ESLint rules (`@typescript-eslint/no-explicit-any`, unescaped JSX characters, React 19 hook linting) that fail the build step. In accordance with task guidelines ("do NOT force it into CI / do not rewrite frontend just to make CI pass"), frontend CI is deferred until a dedicated frontend linting pass is performed.

---

## 6. Verification Summary

- **Local Compilation**: `python -m compileall app` completed cleanly (0 errors).
- **Local Test Suite**: All 115 tests passed (`pytest -v`).
- **YAML Syntax**: Validated against GitHub Actions schema.

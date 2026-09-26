# IP-SAKTI LLM Provider Architecture Status

## PRIMARY LLM:
Groq

## USED FOR:
- reasoning
- extraction
- classification
- questioning
- routing
- query planning
- final answer
- claim extraction

---

## GEMMA/OLLAMA:
Used only for:
- vision
- OCR fallback

---

## Exact Files Changed

1. **`backend/app/config.py`**
   - Unified default `GROQ_MODEL` to `"openai/gpt-oss-120b"`.

2. **`backend/app/ai/gemma/provider.py`**
   - Cleaned to isolate local Ollama Gemma strictly for multimodal vision/OCR fallback.
   - Removed Groq imports and text reasoning fallback. If Groq fails in reasoning modules, controlled failure is returned rather than silent fallback to Ollama.

3. **`backend/app/case/extractor.py`**
   - Replaced `gemma_provider` import and calls with `groq_provider.generate_structured_json` for case information and CaseState extraction.

4. **`backend/app/modules/classification/engine.py`**
   - Removed `gemma_provider` dependency; now invokes `groq_provider.generate_structured_json` directly for 6-tier formulation classification.

5. **`backend/app/modules/ip_router/engine.py`**
   - Replaced `gemma_provider` with `groq_provider.generate_structured_json` for multi-domain IP routing.

6. **`backend/app/modules/questioning/engine.py`**
   - Replaced `gemma_provider` with `groq_provider.generate_structured_json` for dynamic clarification question generation.

7. **`backend/app/rag/query_planner.py`**
   - Replaced `gemma_provider` with `groq_provider.generate_structured_json` for statutory vector search query planning.

8. **`backend/app/orchestration/conversation_pipeline.py`**
   - Replaced `gemma_provider` with `groq_provider.generate_structured_json` for final legal guidance and citation assembly.

9. **`backend/app/modules/citations/claim_extractor.py`**
   - Removed unused `gemma_provider` import.

10. **`backend/tests/conftest.py`**
    - Updated mock fixtures to mock both `groq_provider` and `gemma_provider` for deterministic unit and integration test execution.

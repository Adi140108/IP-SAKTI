# Dynamic Questioning Engine Architecture & Status

## 1. How CaseState Drives Questioning
`CaseState` is the single source of truth for the entire dynamic questioning process. The Questioning Engine evaluates the cumulative, newly updated parameters extracted during the current turn before deciding what information gap to target. It never maintains a parallel or disconnected questioning state.

## 2. How Missing Fields Are Detected
`CaseStateManager.compute_missing_information(state)` and `DynamicQuestioningEngine.detect_information_gaps(state)` dynamically inspect all active fields of `CaseState`:
- **`jurisdiction`**: Flagged as missing if empty or unspecified.
- **`country`**: Flagged as missing only when `jurisdiction == "International"` and target country is unspecified (or "Global"). For India cases, country is not missing.
- **`product_type`**: Flagged as missing if dosage form / delivery mechanism is absent.
- **`intellectual_property_objective`**: Flagged as missing if no valid IP goals (Patent, Trademark, GI, NBA/ABS) are set.
- **`classical_reference`**: Flagged as missing only if the formulation classification is completely unknown and no classical or proprietary reference exists.
- **`ingredients`**: Flagged as missing if the botanical / active ingredients list is empty.
- **`traditional_knowledge_involved`**: Flagged as missing if TK prior art involvement is unknown and formulation is unclassified.
- **`biological_resources_involved`**: Flagged as missing if biological material sourcing from India is unverified (ABS trigger).

## 3. How Priorities Are Selected
A strict, deterministic priority evaluation ensures questions are asked in logical legal dependency order:
- **Tier 0 (Conflict / Contradiction)**: `contradiction_clarification` (Highest Priority).
- **Tier 1 (Foundational - High Priority)**:
  1. `jurisdiction`
  2. `country` (if International)
  3. `product_type`
  4. `intellectual_property_objective`
  5. `classical_reference`
- **Tier 2 (Substantive - Medium Priority)**:
  6. `ingredients`
  7. `traditional_knowledge_involved`
  8. `biological_resources_involved`
  9. `international_market`
- **Tier 3 (Contextual - Low Priority)**:
  10. `intended_use`, `dosage_or_form`, `manufacturing_context`.

Dependency constraints prevent invalid questions:
- Country questions are never asked when jurisdiction is India.
- ABS / biological resource questions are never asked before biological materials are established.
- Formulation classification questions are never repeated once classified.

## 4. How Question History Is Handled
- `_get_previously_asked_fields(state)` analyzes `state.conversation_history` to identify topics already queried.
- If the highest-priority field was previously asked, the engine automatically advances to the next unasked missing field.
- If the user provides an "I don't know", "Not sure", or "Skip" response, the extractor records the field as unresolvable/skipped so the system never gets stuck in repetitive inquiry loops.
- When all prioritized missing fields have been addressed, the engine sets `is_clarification_complete = True`.

## 5. How Contradictions Are Handled
- When a user's statement conflicts with previous case parameters (e.g. stating classical text reference from Charaka Samhita earlier, but later stating novel proprietary synthesis with no traditional herbal basis), the contradiction is flagged.
- The engine prioritizes a gentle, neutral clarification question with option chips to resolve the conflict before proceeding with deeper statutory analysis.

## 6. How Groq Is Used
- Deterministic logic selects the exact single target field to ask.
- Groq is then invoked to generate natural language phrasing tailored to the user's specific context (country, product type, ingredients) in plain, user-friendly English without dense legal or Ayurvedic jargon.
- Groq returns structured JSON:
  ```json
  {
    "next_question": "...",
    "field": "...",
    "reason": "...",
    "priority": "high",
    "suggested_options": ["Option 1", "Option 2", "Option 3"]
  }
  ```

## 7. How Deterministic Fallback Works
- If Groq is unavailable, rate-limited, or network-disconnected, the engine immediately falls back to built-in deterministic question templates and clickable option chips for that specific field and jurisdiction.
- Zero fallback to local Gemma/Ollama for reasoning (Ollama is strictly reserved for multimodal OCR/Vision).

## 8. Test Results
Comprehensive test suite verified:
- **`tests/test_questioning.py`**: 12/12 passed (covering empty CaseState, known jurisdiction, international countries, known IP objectives, formulation sufficiency, non-repetition, contradictions, "I don't know" handling, updated state propagation, single question constraint, and Germany case).
- **`tests/test_api.py`**: 7/7 passed.
- **`tests/test_scenarios.py`**: 8/8 passed.
- **Total**: 27/27 tests passed (100% pass rate).

## 9. Files Changed
1. `backend/app/modules/questioning/engine.py`: Full CaseState-driven dynamic questioning engine implementation.
2. `backend/app/case/state_manager.py`: Updated `compute_missing_information` and `apply_updates` with international country detection and gap tracking.
3. `backend/app/case/extractor.py`: Enhanced unknown response handling and contradiction detection.
4. `backend/tests/conftest.py`: Updated mock fixtures for questioning engine prompts.
5. `backend/tests/test_questioning.py`: Created 12 targeted unit tests.

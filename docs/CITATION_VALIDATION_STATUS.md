# IP-SAKTI Citation Validation Architecture & Status (Step 5)

> **Core Principle**: *LLM-generated citations are never trusted as authoritative without independent evidence validation.*

---

## 1. Overview & Architecture

In legal and regulatory AI systems, an LLM producing text that resembles a legal citation (e.g., citing a section number, statute title, or official URL) is **not** evidence of statutory authority.

The IP-SAKTI Citation Validation Engine enforces a deterministic multi-stage verification pipeline:

```text
RAG Retrieval
      ↓
EvidenceContext (Retrieved EvidenceChunks)
      ↓
Groq Generates Reasoning / Answer
      ↓
Claim Extraction (LegalClaim parsing)
      ↓
For Each Claim / Citation:
      ├── 1. Source Identity Match (Chunk MUST exist in retrieved EvidenceContext)
      ├── 2. Jurisdiction & Country Compatibility (CaseState & Treaty alignment)
      ├── 3. Statutory Section/Article Verification (Token & regex validation)
      ├── 4. Substantive Textual & Semantic Support Verification
      └── 5. Contradiction & IP Subject Matter Checks
      ↓
Validated Citation Object (is_authoritative = True only if ALL 5 pass)
      ↓
Confidence Calculation & Safe Abstention Decision
```

---

## 2. Validation Stages

### 1. Claim Extraction
- The [`ClaimExtractor`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/modules/citations/claim_extractor.py) parses the LLM-generated response into discrete [`LegalClaim`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/modules/citations/claim_extractor.py) units.
- Extracts explicit statutory references (e.g., `Section 3(p)`, `Article 52(2)`, `Rule 12`, `Section 6`) using regex patterns.

### 2. Evidence Matching & Source Identity
- A citation's `source_id` or normalized title must match a chunk present in the turn's retrieved `EvidenceContext.selected_chunks`.
- **Global Registry Fallback Prohibited**: A source that merely exists in the global `SourceRegistry` or vector store is **rejected** if it was not retrieved in the active `EvidenceContext`.

### 3. Section / Article Validation
- If a citation or claim references a specific section/article, the section tokens are verified against:
  1. Chunk metadata (`chunk.section` / `chunk.article`)
  2. Chunk textual content (`chunk.text`)
- Hallucinated or mismatched sections (e.g., claiming `Section 999`) cause validation to fail (`SECTION_MISMATCH`).

### 4. Jurisdiction & Country Compatibility
- Citations must be legally applicable to the `CaseState` jurisdiction and country:
  - **India Cases**: Only Indian statutes (e.g. *Patents Act 1970*, *Biological Diversity Act 2002*) or applicable international treaties apply; foreign domestic laws (e.g. *German PatG*, *US CFR*) are rejected.
  - **International Germany Cases**: German national law (*PatG*, *DPMA Guidelines*) and applicable international treaties (*PCT*, *EPC*, *TRIPS*) are validated; foreign domestic laws (e.g. *US 35 U.S.C.*) are rejected.
  - Uses [`vector_store.is_source_applicable(...)`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/vector_store.py) to guarantee consistency between retrieval and citation validation.

### 5. Textual Support & Contradiction Detection
- Substantive legal terms are extracted with stopword filtering.
- **Contradiction Detection**: Statements that negate statutory requirements (e.g. *"allows synthetic additives without First Schedule compliance"* or *"exempted from NBA approval"*) are flagged as `CONTRADICTORY_EVIDENCE` and rejected.
- **IP Domain Mismatch**: Prevents cross-domain misattribution (e.g., asserting trademark protection using patent statute evidence).

---

## 3. Strict Authoritative Flag (`is_authoritative`)

The `is_authoritative` flag defaults to `False` on the [`Citation`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/schemas/chat.py) schema.

It is set to `True` **ONLY** when:
1. An `EvidenceChunk` exists in the retrieved context.
2. The source identity matches the retrieved chunk.
3. The jurisdiction is compatible with the case.
4. Country/region applicability is verified.
5. The section/article is verified if cited.
6. The evidence text substantively supports the claim.

The LLM cannot set `is_authoritative = True` directly under any circumstances.

---

## 4. Support States

Each validated citation and claim is categorized into explicit support states:
- `SUPPORTED`: Full statutory and textual alignment with retrieved evidence chunk.
- `PARTIALLY_SUPPORTED`: General subject matter match but specific sub-clause unverified.
- `UNSUPPORTED`: Claim asserts rights or rules contradicted or absent from evidence.
- `UNVERIFIED`: Citation references a source not retrieved in the active evidence context.

---

## 5. No-Evidence Behavior & Safe Abstention

When retrieval yields no supporting evidence:
- **Zero Authoritative Citations**: The system outputs an empty citation list or marks claims unverified.
- **Safe Abstention**: The [`ConfidenceEngine`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/modules/confidence/engine.py) triggers safe abstention with a clear disclaimer recommending professional AYUSH IP legal counsel.

---

## 6. Test Suite & Verification Matrix

The test suite in [`backend/tests/test_citation_validation.py`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/tests/test_citation_validation.py) covers all 15 validation scenarios:

| Test Case | Scenario | Expected Outcome | Result |
|---|---|---|---|
| `test_1` | Claim has directly supporting EvidenceChunk | `SUPPORTED`, authoritative citation created | **PASSED** |
| `test_2` | Claim has no evidence | `UNSUPPORTED` / `UNVERIFIED`, authoritative = False | **PASSED** |
| `test_3` | Citation source_id not in retrieved EvidenceContext | Validation failure, rejected | **PASSED** |
| `test_4` | Source exists globally in registry but NOT retrieved | Validation failure, rejected | **PASSED** |
| `test_5` | Correct source but non-existent section number | `SECTION_MISMATCH`, rejected | **PASSED** |
| `test_6` | Correct claim but wrong jurisdiction | `JURISDICTION_MISMATCH`, rejected | **PASSED** |
| `test_7` | Germany case + US domestic law evidence | Country mismatch, rejected | **PASSED** |
| `test_8` | Germany case + German PatG evidence | Validated authoritative | **PASSED** |
| `test_9` | Germany case + International treaty (PCT/EPC) | Validated authoritative | **PASSED** |
| `test_10` | India case + German domestic law | Country mismatch, rejected | **PASSED** |
| `test_11` | LLM outputs authoritative=True without evidence backing | Overridden to False | **PASSED** |
| `test_12` | Official-looking URL but no EvidenceChunk | Rejected | **PASSED** |
| `test_13` | Multiple EvidenceChunks supporting one claim | Multi-chunk mapping valid | **PASSED** |
| `test_14` | Contradictory evidence | `CONTRADICTORY_EVIDENCE`, rejected | **PASSED** |
| `test_15` | No evidence retrieved | Safe abstention triggered, low confidence | **PASSED** |

**Full Backend Regression**: **77 / 77 tests passing** across all modules.

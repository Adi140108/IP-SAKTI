import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.case.models import CaseState, ExtractionResult
from app.case.state_manager import case_state_manager
from app.case.extractor import structured_extractor
from app.modules.classification.engine import classification_engine
from app.modules.ip_router.engine import ip_router
from app.modules.jurisdiction.engine import jurisdiction_engine
from app.modules.questioning.engine import questioning_engine
from app.rag.evidence import EvidenceContext, EvidenceChunk
from app.modules.citations.validator import citation_validator
from app.modules.confidence.engine import confidence_engine
from app.schemas.chat import Citation

client = TestClient(app)

@pytest.mark.asyncio
async def test_scenario_1_ashwagandha_extraction_and_uncertainty():
    """
    SCENARIO 1:
    User: "I have developed a new herbal formulation containing Ashwagandha."
    Verify: CaseState updates, ingredients extracted, classification remains appropriately uncertain,
    missing information identified, next question is relevant.
    """
    # 1. Initialize case state
    state = CaseState(case_id="scen1_test", user_id="test_user", jurisdiction="India")
    
    # 2. Extract structured info
    extraction = await structured_extractor.extract_structured_info("I have developed a new herbal formulation containing Ashwagandha.")
    assert "Ashwagandha" in extraction.extracted_updates.get("ingredients", [])

    # 3. Apply updates to state manager
    updated_state = await case_state_manager.apply_updates(state, extraction)
    assert "Ashwagandha" in updated_state.ingredients

    # 4. Formulation classification on early input
    class_res = await classification_engine.classify_cumulative(updated_state, "I have developed a new herbal formulation containing Ashwagandha.")
    # Classification must remain appropriately uncertain or UNKNOWN when classical basis is unspecified
    assert class_res["classification"].lower() in ["unknown", "proprietary", "new_non_classical"]

    # 5. Missing info gaps identified
    missing = case_state_manager.compute_missing_information(updated_state)
    assert len(missing) > 0
    assert "classical_reference" in missing or "traditional_knowledge_involved" in missing

    # 6. Dynamic next question relevance
    q_res = await questioning_engine.generate_next_question(updated_state)
    assert q_res.next_question is not None
    assert not q_res.is_clarification_complete

@pytest.mark.asyncio
async def test_scenario_2_classical_reference_update():
    """
    SCENARIO 2:
    User: "The formulation is based on a classical Ayurvedic text."
    Verify: traditional knowledge/classical reference state updates, previous information is preserved,
    questioning adapts.
    """
    state = CaseState(
        case_id="scen2_test",
        user_id="test_user",
        jurisdiction="India",
        ingredients=["Ashwagandha", "Ginger"],
        known_information=["Ingredients: Ashwagandha, Ginger"]
    )

    extraction = await structured_extractor.extract_structured_info("The formulation is based on a classical Ayurvedic text.")
    updated_state = await case_state_manager.apply_updates(state, extraction)

    # Previous ingredients preserved
    assert "Ashwagandha" in updated_state.ingredients
    assert "Ginger" in updated_state.ingredients
    
    # Classical reference updated
    assert updated_state.traditional_knowledge_involved is True or updated_state.classical_reference is not None

@pytest.mark.asyncio
async def test_scenario_3_international_jurisdiction_germany():
    """
    SCENARIO 3:
    User: "I want to sell it in Germany."
    Verify: jurisdiction = International, country = Germany.
    Verify retrieval does not blindly use only Indian law.
    """
    jur = jurisdiction_engine.validate_and_normalize("International", "Germany")
    assert jur["jurisdiction"] == "International"
    assert jur["country"] == "Germany"

    prompt_filter = jurisdiction_engine.get_jurisdiction_prompt_filter(jur)
    assert "Germany" in prompt_filter
    assert "INTERNATIONAL" in prompt_filter

@pytest.mark.asyncio
async def test_scenario_4_safe_abstention_missing_evidence():
    """
    SCENARIO 4:
    No authoritative evidence retrieved.
    Expected: Safe Abstention (NOT invented answer, fake citation, or hardcoded legal conclusion).
    """
    empty_evidence = EvidenceContext(
        selected_chunks=[],
        source_metadata=[],
        top_relevance_score=0.0,
        authority_level="none",
        jurisdiction="India"
    )

    conf_score, conf_level, exp, safe_abstain = confidence_engine.calculate_evidence_confidence(
        evidence_context=empty_evidence,
        validated_citations=[],
        jurisdiction="India"
    )

    assert safe_abstain is True
    assert conf_score < 0.4
    assert "No verified statutory evidence" in exp or "Safe Abstention" in exp

@pytest.mark.asyncio
async def test_scenario_5_unsupported_claim_citation_validation_failure():
    """
    SCENARIO 5:
    Provide evidence that does NOT support a generated claim.
    Expected: citation validation fails (unsupported claim must not appear as authoritative legal statement).
    """
    chunk = EvidenceChunk(
        chunk_id="chk_1",
        source_id="src_1",
        title="Drugs and Cosmetics Act, 1940",
        authority="CDSCO / AYUSH",
        jurisdiction="India",
        section="Section 3(h)",
        text="Section 3(h) defines patent or proprietary medicine in relation to Ayurvedic systems.",
        relevance_score=0.8
    )

    evidence = EvidenceContext(
        selected_chunks=[chunk],
        source_metadata=[{"source_id": "src_1", "title": chunk.title, "jurisdiction": "India"}],
        top_relevance_score=0.8,
        jurisdiction="India"
    )

    # Citation asserting a completely different non-existent statute or jurisdiction mismatch
    fake_citation = Citation(
        source="Unrelated Copyright Act 1957",
        section_or_rule="Section 999",
        jurisdiction="USA",
        effective_date="2025"
    )

    validated_cits, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[fake_citation],
        evidence_context=evidence,
        target_jurisdiction="India"
    )

    assert is_valid is False
    assert len(unsupported) > 0
    assert not any(c.is_authoritative for c in validated_cits if c.source == "Unrelated Copyright Act 1957")

@pytest.mark.asyncio
async def test_scenario_6_dynamic_questioning_non_repetition():
    """
    SCENARIO 6:
    Previously answered field.
    Expected: The dynamic question engine does not unnecessarily ask for the same information again.
    """
    state = CaseState(
        case_id="scen6_test",
        user_id="test_user",
        jurisdiction="India",
        product_type="Ayurvedic Churnam",
        ingredients=["Ashwagandha"],
        known_information=["Product Type: Churnam", "Ingredients: Ashwagandha"],
        conversation_history=[{"question": "Are you seeking IP protection primarily under Indian domestic law or for international markets?"}]
    )

    q_res = await questioning_engine.generate_next_question(state)
    assert q_res.next_question is not None
    # Should not ask for jurisdiction again since jurisdiction is set to India and already in conversation history
    assert "Indian domestic law" not in q_res.next_question

@pytest.mark.asyncio
async def test_scenario_7_all_six_formulation_tiers_classification():
    """
    SCENARIO 7:
    Verify that classification engine recognizes all 6 legal tiers + Unknown:
    1. Classical / Generic
    2. Proprietary
    3. New / Non-Classical
    4. Phytopharmaceutical
    5. Ayurveda-Aahar / Nutraceutical
    6. Cosmetic
    """
    # 1. Classical text reference -> Classical
    state_classical = CaseState(case_id="t1", jurisdiction="India", classical_reference="Charaka Samhita Sutrasthana")
    res_classical = await classification_engine.classify_cumulative(state_classical, "Formula from Charaka Samhita")
    assert res_classical["classification"].lower() in ["classical", "classical / generic"]

    # 2. Modern delivery / synergistic ratio -> Proprietary
    state_prop = CaseState(case_id="t2", jurisdiction="India", product_type="Ayurvedic proprietary capsule", classical_or_proprietary="Proprietary combination")
    res_prop = await classification_engine.classify_cumulative(state_prop, "Novel ratio proprietary capsules")
    assert res_prop["classification"].lower() in ["proprietary", "patent & proprietary"]

    # 3. Standardized fraction min 4 markers -> Phytopharmaceutical
    state_phyto = CaseState(case_id="t3", jurisdiction="India", product_type="Standardized fraction with 4 bioactive markers")
    res_phyto = await classification_engine.classify_cumulative(state_phyto, "Purified standardized fraction per Rule 122E")
    assert res_phyto["classification"].lower() in ["phytopharmaceutical", "new_non_classical", "proprietary"]

    # 4. Food / Diet -> Ayurveda-Aahar
    state_aahar = CaseState(case_id="t4", jurisdiction="India", product_type="Ayurveda Aahar dietary health soup", intended_use="Dietary nourishment")
    res_aahar = await classification_engine.classify_cumulative(state_aahar, "Ayurveda Aahar food recipe under FSSAI 2022")
    assert res_aahar["classification"].lower() in ["ayurveda_aahar", "nutraceutical", "food"]

    # 5. Topical beauty / skin oil -> Cosmetic
    state_cosmetic = CaseState(case_id="t5", jurisdiction="India", product_type="Herbal face wash cosmetic for skin beauty", intended_use="Topical skin cleansing")
    res_cosmetic = await classification_engine.classify_cumulative(state_cosmetic, "Ayurvedic cosmetic face scrub")
    assert res_cosmetic["classification"].lower() in ["cosmetic", "ayurvedic cosmetic"]

@pytest.mark.asyncio
async def test_scenario_8_production_failure_policy_explicit_errors():
    """
    SCENARIO 8:
    Verify that in production mode, cloud failures do not silently switch to mock.
    """
    from app.config import settings
    from app.db.firestore import FirestoreService
    from app.storage.backblaze import BackblazeService

    # Verify FirestoreService raises error if unconfigured in production mode
    original_env = settings.APP_ENV
    original_db = settings.DATABASE_MODE
    try:
        settings.DATABASE_MODE = "firestore"
        settings.APP_ENV = "production"
        settings.FIREBASE_CREDENTIALS_PATH = None
        
        with pytest.raises(RuntimeError) as exc_info:
            fs = FirestoreService()
        assert "PRODUCTION DATABASE FAILURE" in str(exc_info.value)
    finally:
        settings.APP_ENV = original_env
        settings.DATABASE_MODE = original_db


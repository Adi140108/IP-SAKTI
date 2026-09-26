import pytest
from app.case.models import CaseState
from app.case.extractor import structured_extractor
from app.case.state_manager import case_state_manager
from app.modules.questioning.engine import questioning_engine

@pytest.mark.asyncio
async def test_1_empty_casestate_asks_foundational_question():
    """TEST 1: Empty CaseState -> asks a high-priority foundational question."""
    state = CaseState(case_id="t1", jurisdiction="unknown")
    res = await questioning_engine.generate_next_question(state)
    assert res.next_question is not None
    assert not res.is_clarification_complete
    assert "jurisdiction" in res.detected_missing_info

@pytest.mark.asyncio
async def test_2_jurisdiction_known_does_not_ask_jurisdiction():
    """TEST 2: Jurisdiction already known -> does not ask jurisdiction again."""
    state = CaseState(case_id="t2", jurisdiction="India")
    res = await questioning_engine.generate_next_question(state)
    assert "jurisdiction" not in res.detected_missing_info
    assert "seeking intellectual property protection primarily within india" not in res.next_question.lower()

@pytest.mark.asyncio
async def test_3_international_no_country_asks_country():
    """TEST 3: International jurisdiction with no country -> asks country/region."""
    state = CaseState(case_id="t3", jurisdiction="International", country=None)
    res = await questioning_engine.generate_next_question(state)
    assert "country" in res.detected_missing_info
    assert any(term in res.next_question.lower() for term in ["country", "foreign", "region", "parameters"])

@pytest.mark.asyncio
async def test_4_country_already_known_does_not_ask_country():
    """TEST 4: Country already known -> does not ask country again."""
    state = CaseState(case_id="t4", jurisdiction="International", country="Germany")
    res = await questioning_engine.generate_next_question(state)
    assert "country" not in res.detected_missing_info
    assert "which target foreign country" not in res.next_question.lower()

@pytest.mark.asyncio
async def test_5_ip_objective_known_does_not_ask_ip_objective():
    """TEST 5: IP objective already known -> does not ask IP objective again."""
    state = CaseState(case_id="t5", jurisdiction="India", intellectual_property_objective=["patent"])
    res = await questioning_engine.generate_next_question(state)
    assert "intellectual_property_objective" not in res.detected_missing_info

@pytest.mark.asyncio
async def test_6_formulation_sufficient_does_not_ask_formulation():
    """TEST 6: Formulation information already sufficient -> does not repeatedly ask formulation questions."""
    state = CaseState(
        case_id="t6",
        jurisdiction="India",
        formulation_classification="proprietary",
        classical_reference="Novel Proprietary Formulation",
        product_type="Capsule"
    )
    res = await questioning_engine.generate_next_question(state)
    assert "classical_reference" not in res.detected_missing_info

@pytest.mark.asyncio
async def test_7_previously_asked_question_does_not_repeat():
    """TEST 7: Previously asked question -> does not repeat the same question."""
    state = CaseState(
        case_id="t7",
        jurisdiction="India",
        conversation_history=[
            {"question": "What type of Ayurvedic product have you formulated?", "user_message": "A herbal medicine"}
        ]
    )
    res = await questioning_engine.generate_next_question(state)
    assert "what type of ayurvedic product have you formulated" not in res.next_question.lower()

@pytest.mark.asyncio
async def test_8_contradictory_information_asks_clarification():
    """TEST 8: Contradictory information -> asks a clarification question."""
    state = CaseState(
        case_id="t8",
        jurisdiction="India",
        classical_reference="Charaka Samhita",
        formulation_classification="proprietary",
        known_information=["Contradiction: Classical text claimed while categorized as novel proprietary."]
    )
    res = await questioning_engine.generate_next_question(state)
    assert any(term in res.next_question.lower() for term in ["clarify", "contradiction", "classical", "parameters"])

@pytest.mark.asyncio
async def test_9_user_says_dont_know_does_not_repeat():
    """TEST 9: User says 'I don't know' -> does not repeatedly ask the same question."""
    state = CaseState(
        case_id="t9",
        jurisdiction="India",
        product_type="Churnam",
        conversation_history=[
            {"question": "Is your formulation derived from a classical Ayurvedic text?", "user_message": "I don't know"}
        ]
    )
    extraction = await structured_extractor.extract_information(state, "I don't know")
    updated_state = await case_state_manager.apply_updates(state, extraction)
    res = await questioning_engine.generate_next_question(updated_state)
    assert "classical" not in res.next_question.lower() or res.is_clarification_complete

@pytest.mark.asyncio
async def test_10_updated_casestate_uses_new_state():
    """TEST 10: Updated CaseState -> questioning uses the NEW state, not the previous state."""
    initial_state = CaseState(case_id="t10", jurisdiction="India")
    extraction = await structured_extractor.extract_information(
        initial_state,
        "My product is an Ayurvedic Churnam containing Ashwagandha and I want patent protection."
    )
    updated_state = await case_state_manager.apply_updates(initial_state, extraction)
    assert "Ashwagandha" in updated_state.ingredients
    assert "patent" in updated_state.intellectual_property_objective

    res = await questioning_engine.generate_next_question(updated_state)
    assert "ingredients" not in res.detected_missing_info
    assert "intellectual_property_objective" not in res.detected_missing_info

@pytest.mark.asyncio
async def test_11_multiple_missing_fields_returns_exactly_one_question():
    """TEST 11: Multiple missing fields -> returns exactly ONE question, selecting highest-priority missing information."""
    state = CaseState(case_id="t11", jurisdiction="India")
    res = await questioning_engine.generate_next_question(state)
    assert isinstance(res.next_question, str)
    assert len(res.next_question) > 5
    assert not res.is_clarification_complete
    # Verify exactly one single question is returned
    assert res.next_question.count("?") <= 1

@pytest.mark.asyncio
async def test_12_international_germany_recognizes_country_known():
    """TEST 12: International Germany case -> questioning recognizes Germany is already known and moves forward."""
    state = CaseState(
        case_id="t12",
        jurisdiction="International",
        country="Germany",
        product_type="Purified Herbal Extract"
    )
    res = await questioning_engine.generate_next_question(state)
    assert "country" not in res.detected_missing_info
    assert "which target foreign country" not in res.next_question.lower()

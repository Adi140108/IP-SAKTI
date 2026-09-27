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

@pytest.mark.asyncio
async def test_13_questioning_continues_beyond_2_turns_for_missing_legal_parameters():
    """TEST 13: Questioning continues past turn 2 when critical legal parameters (e.g. synergistic efficacy, biological sourcing) remain uncollected."""
    state = CaseState(
        case_id="t13",
        jurisdiction="India",
        product_name="Ashwa-Curcumin Plus",
        product_type="Capsule",
        classical_reference="Novel Proprietary Formulation",
        ingredients=["Ashwagandha", "Curcumin"],
        intellectual_property_objective=["patent"],
        conversation_history=[
            {"question": "What type of Ayurvedic product have you formulated?", "user_message": "Capsule"},
            {"question": "What are the main medicinal plants or biological ingredients?", "user_message": "Ashwagandha and Curcumin"}
        ]
    )
    # Turn 3: Should ask about synergistic efficacy lab data (Section 3(e))
    res = await questioning_engine.generate_next_question(state)
    assert not res.is_clarification_complete
    assert res.next_question is not None
    assert "synergistic_efficacy_proven" in res.detected_missing_info

@pytest.mark.asyncio
async def test_14_max_questions_cap_at_7():
    """TEST 14: Hard cap at 7 questions -> stops asking questions when 7 questions have been asked."""
    dummy_history = [
        {"question": f"Question {i}", "user_message": f"Answer {i}"}
        for i in range(7)
    ]
    state = CaseState(
        case_id="t14",
        jurisdiction="India",
        conversation_history=dummy_history
    )
    res = await questioning_engine.generate_next_question(state)
    assert res.is_clarification_complete
    assert "Maximum intake questions reached" in res.next_question or "gathered" in res.next_question.lower()

@pytest.mark.asyncio
async def test_15_early_stopping_when_all_parameters_met_before_7():
    """TEST 15: Early stopping -> if all critical legal & regulatory parameters are met before 7 questions, stop immediately."""
    state = CaseState(
        case_id="t15",
        jurisdiction="India",
        product_name="AyurShield",
        product_type="Capsule",
        classical_reference="Novel Proprietary Formulation",
        ingredients=["Ashwagandha", "Tulsi", "Giloy"],
        traditional_knowledge_involved=False,
        synergistic_efficacy_proven=True,
        biological_resources_involved=True,
        applicant_entity_type="Indian Entity",
        intended_use="Therapeutic Treatment (Form 25D)",
        manufacturing_context="Novel Supercritical Fluid Extraction",
        intellectual_property_objective=["patent", "trademark"],
        conversation_history=[
            {"question": "What type of Ayurvedic product have you formulated?", "user_message": "Capsule"}
        ]
    )
    res = await questioning_engine.generate_next_question(state)
    assert res.is_clarification_complete
    assert res.detected_missing_info == []
    assert "All key case parameters have been gathered" in res.next_question

@pytest.mark.asyncio
async def test_16_multiturn_dialogue_stops_at_3_to_4_questions():
    """
    SCENARIO: User provides moderate info initially (Product type, Ingredients, IP Objective, Manufacturing).
    Intake requires 3 to 4 clarification questions to gather:
    1. Classical vs Proprietary formulation basis
    2. Synergistic efficacy / Section 3(e) lab data
    3. Biological resources sourcing in India
    4. Applicant entity type
    Then immediately stops (is_clarification_complete = True) at question 4.
    """
    state = CaseState(
        case_id="t16_moderate",
        jurisdiction="India",
        product_name="AyurBrain Tablet",
        product_type="Capsule / Tablet Dosage Form",
        ingredients=["Ashwagandha", "Brahmi"],
        intellectual_property_objective=["patent"],
        intended_use="Therapeutic Treatment (AYUSH Drug Licensing Form 25D)",
        manufacturing_context="Novel Solvent / Supercritical Fluid Extraction"
    )

    # Turn 1: Engine detects missing classical_reference
    q1_res = await questioning_engine.generate_next_question(state)
    assert not q1_res.is_clarification_complete
    assert "classical_reference" in q1_res.detected_missing_info
    
    # User responds to Turn 1
    ext1 = await structured_extractor.extract_information(state, "Novel proprietary formula")
    state = await case_state_manager.apply_updates(state, ext1)
    state.conversation_history.append({"question": q1_res.next_question, "user_message": "Novel proprietary formula"})

    # Turn 2: Engine detects missing synergistic_efficacy_proven
    q2_res = await questioning_engine.generate_next_question(state)
    assert not q2_res.is_clarification_complete
    assert "synergistic_efficacy_proven" in q2_res.detected_missing_info
    
    # User responds to Turn 2
    ext2 = await structured_extractor.extract_information(state, "Proven synergistic efficacy with 3x bioavailability in preclinical lab data")
    state = await case_state_manager.apply_updates(state, ext2)
    state.conversation_history.append({"question": q2_res.next_question, "user_message": "Proven synergistic scientific efficacy"})

    # Turn 3: Engine detects missing biological_resources_involved
    q3_res = await questioning_engine.generate_next_question(state)
    assert not q3_res.is_clarification_complete
    assert "biological_resources_involved" in q3_res.detected_missing_info

    # User responds to Turn 3
    ext3 = await structured_extractor.extract_information(state, "Yes, biological materials are sourced from Kerala, India")
    state = await case_state_manager.apply_updates(state, ext3)
    state.conversation_history.append({"question": q3_res.next_question, "user_message": "Yes, Indian biological resources used"})

    # Turn 4: Engine detects missing applicant_entity_type
    q4_res = await questioning_engine.generate_next_question(state)
    assert not q4_res.is_clarification_complete
    assert "applicant_entity_type" in q4_res.detected_missing_info

    # User responds to Turn 4
    ext4 = await structured_extractor.extract_information(state, "Indian citizen / Indian entity startup")
    state = await case_state_manager.apply_updates(state, ext4)
    state.conversation_history.append({"question": q4_res.next_question, "user_message": "Indian citizen / Indian entity"})

    # Turn 5 Check: All required parameters gathered in 4 questions -> Early Stopping!
    q5_res = await questioning_engine.generate_next_question(state)
    assert q5_res.is_clarification_complete
    assert len(state.conversation_history) == 4
    assert state.questions_asked_count == 4

@pytest.mark.asyncio
async def test_17_vague_initial_query_requires_full_questioning_up_to_7_cap():
    """
    SCENARIO: Extremely vague user input initially ("Hello, I need legal help for a new Ayurvedic product").
    System requires multi-turn questioning through 7 questions to extract all essential legal and technical parameters:
    Q1: Jurisdiction
    Q2: Product Type
    Q3: Classical Reference vs Proprietary
    Q4: Active Botanical Ingredients
    Q5: IP Protection Objective
    Q6: Synergistic Efficacy / Section 3(e) Lab Data
    Q7: Biological Resources / Sourcing (ABS)
    -> Then hits max 7-question cap ceiling and triggers completion.
    """
    state = CaseState(case_id="t17_vague", jurisdiction="unknown")

    # Q1: Asks Jurisdiction
    q1 = await questioning_engine.generate_next_question(state)
    assert not q1.is_clarification_complete
    assert "jurisdiction" in q1.detected_missing_info
    ext1 = await structured_extractor.extract_information(state, "India (Domestic Law)")
    state = await case_state_manager.apply_updates(state, ext1)
    state.conversation_history.append({"question": q1.next_question, "user_message": "India (Domestic Law)"})

    # Q2: Asks Product Type
    q2 = await questioning_engine.generate_next_question(state)
    assert not q2.is_clarification_complete
    assert "product_type" in q2.detected_missing_info
    ext2 = await structured_extractor.extract_information(state, "Herbal Extract / Active Compound")
    state = await case_state_manager.apply_updates(state, ext2)
    state.conversation_history.append({"question": q2.next_question, "user_message": "Herbal Extract / Active Compound"})

    # Q3: Asks Classical Reference
    q3 = await questioning_engine.generate_next_question(state)
    assert not q3.is_clarification_complete
    assert "classical_reference" in q3.detected_missing_info
    ext3 = await structured_extractor.extract_information(state, "Novel proprietary formula")
    state = await case_state_manager.apply_updates(state, ext3)
    state.conversation_history.append({"question": q3.next_question, "user_message": "Novel proprietary formula"})

    # Q4: Asks Ingredients
    q4 = await questioning_engine.generate_next_question(state)
    assert not q4.is_clarification_complete
    assert "ingredients" in q4.detected_missing_info
    ext4 = await structured_extractor.extract_information(state, "Curcumin and Piperine")
    state = await case_state_manager.apply_updates(state, ext4)
    state.conversation_history.append({"question": q4.next_question, "user_message": "Curcumin and Piperine"})

    # Q5: Asks IP Objective
    q5 = await questioning_engine.generate_next_question(state)
    assert not q5.is_clarification_complete
    assert "intellectual_property_objective" in q5.detected_missing_info
    ext5 = await structured_extractor.extract_information(state, "Patent Protection")
    state = await case_state_manager.apply_updates(state, ext5)
    state.conversation_history.append({"question": q5.next_question, "user_message": "Patent Protection"})

    # Q6: Asks Synergistic Efficacy
    q6 = await questioning_engine.generate_next_question(state)
    assert not q6.is_clarification_complete
    assert "synergistic_efficacy_proven" in q6.detected_missing_info
    ext6 = await structured_extractor.extract_information(state, "Proven synergistic efficacy lab data exists")
    state = await case_state_manager.apply_updates(state, ext6)
    state.conversation_history.append({"question": q6.next_question, "user_message": "Proven synergistic scientific efficacy"})

    # Q7: Asks Biological Resources
    q7 = await questioning_engine.generate_next_question(state)
    assert not q7.is_clarification_complete
    assert "biological_resources_involved" in q7.detected_missing_info
    ext7 = await structured_extractor.extract_information(state, "Yes, Indian biological resources used")
    state = await case_state_manager.apply_updates(state, ext7)
    state.conversation_history.append({"question": q7.next_question, "user_message": "Yes, Indian biological resources used"})

    # Check: Exactly 7 questions asked. Next invocation must enforce the 7 question cap.
    assert len(state.conversation_history) == 7
    q8 = await questioning_engine.generate_next_question(state)
    assert q8.is_clarification_complete
    assert "Maximum intake questions reached" in q8.next_question or "gathered" in q8.next_question.lower()

@pytest.mark.asyncio
async def test_18_international_export_intake_stops_at_3_questions():
    """
    SCENARIO: International Export Case with 3 questions.
    User starts with: "I want to export an Ayurvedic tablet formulation to the United States."
    Gathering needed:
    1. Classical Reference vs Novel
    2. Active Botanical Ingredients
    3. International IP Pathway
    Stops at exactly 3 questions.
    """
    state = CaseState(
        case_id="t18_intl",
        jurisdiction="International",
        country="USA",
        product_type="Capsule / Tablet Dosage Form",
        intended_use="Dietary / Herbal Supplement (US FDA / EU)",
        manufacturing_context="Standardized Bioactive Marker Extraction"
    )

    # Q1: Classical Reference / Formulation Basis
    q1 = await questioning_engine.generate_next_question(state)
    assert not q1.is_clarification_complete
    ext1 = await structured_extractor.extract_information(state, "Novel proprietary formulation")
    state = await case_state_manager.apply_updates(state, ext1)
    state.conversation_history.append({"question": q1.next_question, "user_message": "Novel proprietary formulation"})

    # Q2: Ingredients
    q2 = await questioning_engine.generate_next_question(state)
    assert not q2.is_clarification_complete
    ext2 = await structured_extractor.extract_information(state, "Ashwagandha and Turmeric")
    state = await case_state_manager.apply_updates(state, ext2)
    state.conversation_history.append({"question": q2.next_question, "user_message": "Ashwagandha and Turmeric"})

    # Q3: IP Objectives
    q3 = await questioning_engine.generate_next_question(state)
    assert not q3.is_clarification_complete
    ext3 = await structured_extractor.extract_information(state, "WIPO PCT Patent Application")
    state = await case_state_manager.apply_updates(state, ext3)
    state.conversation_history.append({"question": q3.next_question, "user_message": "WIPO PCT Patent Application"})

    # User also provides synergistic and biological resource status in Q3 answer context
    ext_bonus = await structured_extractor.extract_information(state, "Proven synergistic experimental data and no biological resources sourced from India")
    state = await case_state_manager.apply_updates(state, ext_bonus)

    # Q4 Check: 3 questions asked -> Early stopping satisfied!
    q4 = await questioning_engine.generate_next_question(state)
    assert q4.is_clarification_complete
    assert len(state.conversation_history) == 3



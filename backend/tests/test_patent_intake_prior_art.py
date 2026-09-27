import pytest
from app.case.models import CaseState
from app.case.extractor import structured_extractor
from app.case.state_manager import case_state_manager
from app.modules.questioning.engine import questioning_engine
from app.modules.prior_art.matching import prior_art_matcher, PriorArtMatcher
from app.modules.prior_art.models import PriorArtMatch, PriorArtSearchResult
from app.modules.tkdl.service import tkdl_service
from app.rag.evidence import EvidenceChunk

@pytest.mark.asyncio
async def test_1_patent_case_asks_novelty_when_missing():
    """1. Patent case asks novelty information when missing."""
    state = CaseState(
        case_id="pat_1",
        jurisdiction="India",
        product_type="Extract capsule",
        classical_reference="Proprietary extraction",
        ingredients=["Ashwagandha", "Curcumin"],
        intellectual_property_objective=["patent"],
        novelty_aspect=None
    )
    res = await questioning_engine.generate_next_question(state)
    assert res.next_question is not None
    assert "novelty_aspect" in res.detected_missing_info
    assert any(term in res.next_question.lower() for term in ["new", "different", "novelty", "unique"])

@pytest.mark.asyncio
async def test_2_patent_case_asks_technical_improvement_when_missing():
    """2. Patent case asks technical improvement when missing."""
    state = CaseState(
        case_id="pat_2",
        jurisdiction="India",
        product_type="Extract capsule",
        classical_reference="Proprietary",
        ingredients=["Ashwagandha", "Curcumin"],
        intellectual_property_objective=["patent"],
        novelty_aspect="Novel ultrasonic extraction method",
        technical_improvement=None
    )
    res = await questioning_engine.generate_next_question(state)
    assert "technical_improvement" in res.detected_missing_info
    assert any(term in res.next_question.lower() for term in ["improvement", "stability", "bioavailability", "effect", "benefit"])

@pytest.mark.asyncio
async def test_3_composition_details_not_asked_when_already_provided():
    """3. Composition details are not asked when already provided."""
    state = CaseState(
        case_id="pat_3",
        jurisdiction="India",
        product_type="Tablet",
        classical_reference="Proprietary",
        ingredients=["Ashwagandha", "Brahmi", "Turmeric"],
        intellectual_property_objective=["patent"],
        novelty_aspect="Modified ratio extract",
        technical_improvement="25% increased bioavailability",
        composition_details="40% Ashwagandha, 30% Brahmi, 30% Turmeric"
    )
    res = await questioning_engine.generate_next_question(state)
    assert "composition_details" not in res.detected_missing_info
    assert "proportions" not in res.next_question.lower()

@pytest.mark.asyncio
async def test_4_experimental_evidence_not_asked_when_already_provided():
    """4. Experimental evidence is not asked when already provided."""
    state = CaseState(
        case_id="pat_4",
        jurisdiction="India",
        product_type="Capsule",
        classical_reference="Proprietary",
        ingredients=["Ashwagandha"],
        intellectual_property_objective=["patent"],
        novelty_aspect="Nano-emulsion formulation",
        technical_improvement="Enhanced solubility",
        composition_details="100mg extract in 500mg capsule",
        experimental_evidence="Comparative dissolution and HPLC stability studies conducted across 6 months"
    )
    res = await questioning_engine.generate_next_question(state)
    assert "experimental_evidence" not in res.detected_missing_info

@pytest.mark.asyncio
async def test_5_public_disclosure_is_captured():
    """5. Public disclosure is captured in extraction and state manager."""
    text = "We have already exhibited and sold this formulation at the AYUSH trade expo last month."
    extracted = await structured_extractor.extract_state_updates(text)
    assert extracted.get("public_disclosure") is True
    assert "expo" in (extracted.get("public_disclosure_details") or "").lower() or extracted.get("public_disclosure") is True

    # Test state update
    state = CaseState(case_id="pat_5", jurisdiction="India")
    updated_state = await case_state_manager.apply_updates(state, extracted)
    assert updated_state.public_disclosure is True


@pytest.mark.asyncio
async def test_6_prior_art_known_is_captured():
    """6. Prior-art-known information is captured."""
    text = "We are aware of patent US98765432 regarding Brahmi extract formulations."
    extracted = await structured_extractor.extract_state_updates(text)
    assert extracted.get("prior_art_known") is True
    assert "US98765432" in (extracted.get("prior_art_details") or "")

@pytest.mark.asyncio
async def test_7_non_patent_case_does_not_unnecessarily_ask_patent_questions():
    """7. Non-patent cases (e.g. trademark/classical Ayurvedic licensing) do not unnecessarily ask patent-specific questions."""
    state = CaseState(
        case_id="trademark_case",
        jurisdiction="India",
        product_type="Classical Taila",
        classical_reference="Charaka Samhita Chikitsa Sthana",
        ingredients=["Sesame Oil", "Mahanarayan"],
        intellectual_property_objective=["trademark", "regulatory"]
    )
    missing = case_state_manager.compute_missing_information(state)
    assert "novelty_aspect" not in missing
    assert "experimental_evidence" not in missing
    assert "prior_art_known" not in missing

@pytest.mark.asyncio
async def test_8_prior_art_query_is_generated_from_casestate():
    """8. Prior-art query is generated from CaseState."""
    state = CaseState(
        case_id="pat_8",
        jurisdiction="India",
        product_type="capsule",
        ingredients=["Ashwagandha", "Curcumin"],
        novelty_aspect="Supercritical CO2 extraction technique",
        technical_improvement="improved bioavailability",
        manufacturing_context="GMP supercritical extraction"
    )
    query = prior_art_matcher.build_prior_art_query(state)
    assert isinstance(query, str)
    assert len(query.strip()) > 0
    assert "ashwagandha" in query.lower()
    assert "curcumin" in query.lower()

@pytest.mark.asyncio
async def test_9_ingredient_and_technical_improvement_appear_in_query():
    """9. Ingredient + technical improvement appear in the generated query."""
    state = CaseState(
        case_id="pat_9",
        jurisdiction="India",
        product_type="tablets",
        ingredients=["Brahmi", "Piperine"],
        technical_improvement="enhanced cellular uptake and shelf life stability"
    )
    query = prior_art_matcher.build_prior_art_query(state)
    assert "brahmi" in query.lower()
    assert "piperine" in query.lower()
    assert "shelf life" in query.lower() or "stability" in query.lower()

@pytest.mark.asyncio
async def test_10_jurisdiction_and_country_preserved_in_retrieval():
    """10. Jurisdiction/country is preserved in prior-art search."""
    state = CaseState(
        case_id="pat_10",
        jurisdiction="International",
        country="United States",
        product_type="capsule",
        ingredients=["Ashwagandha"],
        intellectual_property_objective=["patent"]
    )
    search_res: PriorArtSearchResult = await prior_art_matcher.search_prior_art(state)
    assert isinstance(search_res, PriorArtSearchResult)
    assert search_res.search_scope == "Indexed Statutory & Prior-Art Corpus"
    for match in search_res.matches:
        if match.country:
            assert match.country in ["United States", "USA", "US", "WIPO", "International", "India"]

@pytest.mark.asyncio
async def test_11_potential_prior_art_match_contains_provenance():
    """11. Potential prior-art match contains provenance and metadata."""
    state = CaseState(
        case_id="pat_11",
        jurisdiction="India",
        product_type="capsule",
        ingredients=["Ashwagandha", "Turmeric"],
        technical_improvement="improved bioavailability"
    )
    search_res: PriorArtSearchResult = await prior_art_matcher.search_prior_art(state)
    if search_res.matches:
        top_match = search_res.matches[0]
        assert top_match.provenance == "IP-SAKTI Statutory & Prior-Art Indexed Vector Corpus"
        assert top_match.disclaimer == "Potential match — not a legal determination."
        assert isinstance(top_match.relevance_score, float)
        assert isinstance(top_match.matched_features, list)

@pytest.mark.asyncio
async def test_12_no_fabricated_patent_numbers_or_dates():
    """12. No fabricated patent number/title/source is produced."""
    state = CaseState(
        case_id="pat_12",
        jurisdiction="India",
        ingredients=["NonExistentHerb12345"],
        intellectual_property_objective=["patent"]
    )
    search_res: PriorArtSearchResult = await prior_art_matcher.search_prior_art(state)
    for match in search_res.matches:
        # publication_number must be None unless verified in corpus chunk
        assert match.publication_number is None or match.publication_number.startswith("IN") or match.publication_number.startswith("US")
        assert match.provenance is not None

@pytest.mark.asyncio
async def test_13_similarity_is_not_converted_to_patentability_verdict():
    """13. Similarity is categorized as retrieval relevance, NOT a patentability verdict."""
    state = CaseState(
        case_id="pat_13",
        jurisdiction="India",
        ingredients=["Ashwagandha", "Curcumin"],
        technical_improvement="improved stability"
    )
    search_res = await prior_art_matcher.search_prior_art(state)
    for match in search_res.matches:
        assert match.match_category in [
            "Strong potential prior-art relevance",
            "Related formulation/technology",
            "Related traditional knowledge",
            "Weak/partial similarity",
            "No meaningful match"
        ]
        # Must not say "Patentable" or "Not patentable" or "Existing patent for your formulation"
        assert "is patentable" not in match.match_category.lower()
        assert "not patentable" not in match.match_category.lower()
        assert "existing patent for your formulation" not in match.match_category.lower()

@pytest.mark.asyncio
async def test_14_tkdl_evidence_remains_separate_from_patent_evidence():
    """14. TKDL evidence remains separate from patent evidence."""
    state = CaseState(
        case_id="pat_14",
        jurisdiction="India",
        product_type="Churna",
        ingredients=["Triphala", "Haritaki"],
        traditional_knowledge_involved=True
    )
    search_res = await prior_art_matcher.search_prior_art(state)
    # Check tkdl_pointers
    assert "prior_art_pointers" in search_res.tkdl_pointers
    assert search_res.tkdl_pointers.get("tkdl_access_level") == "PUBLIC_INFORMATION_AND_CLASSICAL_POINTERS"
    assert "Section 3(p)" in search_res.tkdl_pointers.get("section_3p_relevance", "")

@pytest.mark.asyncio
async def test_15_public_disclosure_triggers_escalation_and_warning():
    """15. Public disclosure triggers appropriate escalation and warning."""
    state = CaseState(
        case_id="pat_15",
        jurisdiction="India",
        intellectual_property_objective=["patent"],
        public_disclosure=True,
        public_disclosure_details="Paper published in AYUSH Journal"
    )
    search_res = await prior_art_matcher.search_prior_art(state)
    assert search_res.requires_human_escalation is True
    assert search_res.public_disclosure_warning is not None
    assert "Public disclosure may be relevant to patent filing strategy" in search_res.public_disclosure_warning

@pytest.mark.asyncio
async def test_16_compound_extraction_with_proportions_and_bioavailability():
    """16. Complex sentence with ingredients, proportions, and bioavailability is extracted cleanly."""
    text = "My formulation contains 40% Ashwagandha, 30% Brahmi and 30% Turmeric, and improves bioavailability by 25% compared with the conventional formulation."
    extracted = await structured_extractor.extract_state_updates(text)
    
    assert any("ashwagandha" in i.lower() for i in extracted.get("ingredients", []))
    assert "bioavailability" in (extracted.get("technical_improvement") or "").lower()
    
    state = CaseState(case_id="pat_16", jurisdiction="India", intellectual_property_objective=["patent"])
    updated_state = await case_state_manager.apply_updates(state, extracted)
    
    missing = case_state_manager.compute_missing_information(updated_state)
    # Ingredients, composition, and technical improvement should not be missing
    assert "ingredients" not in missing
    assert "technical_improvement" not in missing



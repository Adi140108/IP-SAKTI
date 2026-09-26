import pytest
from app.case.models import CaseState
from app.rag.query_planner import QueryPlan, query_planner
from app.rag.retriever import rag_retriever
from app.rag.vector_store import vector_store
from app.rag.reranker import evidence_reranker
from app.rag.evidence import EvidenceChunk
from app.rag.source_registry import source_registry

@pytest.mark.asyncio
async def test_1_international_germany_query_plan():
    """TEST 1: International + Germany -> QueryPlan country must be Germany."""
    state = CaseState(
        case_id="case-de-1",
        session_id="test-de-1",
        jurisdiction="International",
        country="Germany",
        formulation_classification="classical_ayurvedic",
        intellectual_property_objective=["patent"]
    )
    plan = await query_planner.plan_query("Can I patent an Ayurvedic herbal extract in Germany?", state)
    assert plan.jurisdiction.lower() == "international"
    assert plan.country == "Germany"

@pytest.mark.asyncio
async def test_2_international_usa_query_plan():
    """TEST 2: International + USA -> QueryPlan country must be USA."""
    state = CaseState(
        case_id="case-us-2",
        session_id="test-us-2",
        jurisdiction="International",
        country="USA",
        formulation_classification="herbal_nutraceutical",
        intellectual_property_objective=["patent", "regulatory"]
    )
    plan = await query_planner.plan_query("Filing herbal formulation patent in the United States under 35 USC", state)
    assert plan.jurisdiction.lower() == "international"
    assert plan.country in ["USA", "United States", "US"]

@pytest.mark.asyncio
async def test_3_international_germany_eligible_and_ineligible():
    """
    TEST 3: International + Germany ->
    Germany-specific source should be eligible.
    USA-only source should NOT be treated as a Germany-specific applicable source.
    """
    state = CaseState(
        case_id="case-de-3",
        session_id="test-de-3",
        jurisdiction="International",
        country="Germany",
        intellectual_property_objective=["patent"]
    )
    evidence_ctx = await rag_retriever.execute_rag_pipeline("Patent requirements under German Patent Act", state)
    
    retrieved_sources = [c.source_id for c in evidence_ctx.selected_chunks]
    
    # Germany-specific source or EU/Treaty should be retrieved
    assert "SRC_DE_PATENT_ACT_PATG" in retrieved_sources or any(c.country == "Germany" for c in evidence_ctx.selected_chunks)
    
    # USA-only source must NOT be retrieved
    assert "SRC_US_PATENT_ACT_35USC" not in retrieved_sources
    assert not any(c.country == "USA" for c in evidence_ctx.selected_chunks)

@pytest.mark.asyncio
async def test_4_international_germany_treaties_eligible():
    """TEST 4: International + Germany -> International treaty source should remain eligible."""
    state = CaseState(
        case_id="case-de-4",
        session_id="test-de-4",
        jurisdiction="International",
        country="Germany",
        intellectual_property_objective=["patent", "abs"]
    )
    # Search for international PCT filing / Nagoya protocol compliance for Germany
    evidence_ctx = await rag_retriever.execute_rag_pipeline("PCT international phase filing and Nagoya Protocol compliance in Germany", state)
    
    retrieved_sources = [c.source_id for c in evidence_ctx.selected_chunks]
    
    # Universal treaties must be eligible
    treaty_sources = {"SRC_INT_WIPO_PCT_1970", "SRC_INT_NAGOYA_PROTOCOL_2010", "SRC_INT_TRIPS_1994", "SRC_INT_CBD_1992"}
    assert any(s in retrieved_sources for s in treaty_sources)

@pytest.mark.asyncio
async def test_5_international_germany_eu_regional_eligible():
    """TEST 5: International + Germany -> EU/regional source should remain eligible when metadata indicates applicability."""
    state = CaseState(
        case_id="case-de-5",
        session_id="test-de-5",
        jurisdiction="International",
        country="Germany",
        intellectual_property_objective=["patent"]
    )
    evidence_ctx = await rag_retriever.execute_rag_pipeline("European Patent Convention Article 53 exceptions for medicinal inventions", state)
    
    retrieved_sources = [c.source_id for c in evidence_ctx.selected_chunks]
    
    # European Patent Convention (EPC) is regionally applicable to Germany
    assert "SRC_EU_EPC_1973" in retrieved_sources or any(c.region == "EU" for c in evidence_ctx.selected_chunks)

@pytest.mark.asyncio
async def test_6_international_unknown_country():
    """TEST 6: International + unknown country -> System must not invent a country."""
    state = CaseState(
        case_id="case-intl-6",
        session_id="test-intl-unknown",
        jurisdiction="International",
        country=None,
        intellectual_property_objective=["patent"]
    )
    plan = await query_planner.plan_query("General international patent filing options for herbal formulations", state)
    assert plan.country is None or plan.country == "None" or plan.country == ""
    
    evidence_ctx = await rag_retriever.execute_rag_pipeline("PCT international patent filing procedures", state)
    # When country is unknown, retrieval should retrieve treaties/international frameworks without crashing
    assert len(evidence_ctx.selected_chunks) > 0
    # Domestic US or Indian specific statutes must not be prioritized as a forced domestic match
    for c in evidence_ctx.selected_chunks:
        assert c.jurisdiction in ["International", "international", "global"] or c.source_type in ["treaty", "standard"]

@pytest.mark.asyncio
async def test_7_india_retrieval_intact():
    """TEST 7: India -> Existing India retrieval must continue working."""
    state = CaseState(
        case_id="case-in-7",
        session_id="test-in-7",
        jurisdiction="India",
        country="India",
        formulation_classification="classical_ayurvedic",
        intellectual_property_objective=["patent", "tkdl_prior_art"]
    )
    evidence_ctx = await rag_retriever.execute_rag_pipeline("Section 3(p) patent eligibility and TKDL citation", state)
    
    retrieved_sources = [c.source_id for c in evidence_ctx.selected_chunks]
    
    # Must retrieve Indian Patents Act or TKDL or BDA
    assert "SRC_IN_PATENTS_ACT_1970" in retrieved_sources or "SRC_IN_TKDL_GUIDELINES" in retrieved_sources or "SRC_IN_BIOLOGICAL_DIVERSITY_ACT_2002" in retrieved_sources
    
    # Must NOT retrieve US or German domestic laws
    assert "SRC_US_PATENT_ACT_35USC" not in retrieved_sources
    assert "SRC_DE_PATENT_ACT_PATG" not in retrieved_sources

def test_8_country_reaches_vector_retrieval():
    """TEST 8: Country value must actually reach vector retrieval (verifying the retrieval filter receives and applies country)."""
    # Directly invoke vector_store.search_chunks with country="Germany" vs country="USA"
    de_results = vector_store.search_chunks(
        query="Patent eligibility and novelty requirements for natural medicine",
        jurisdiction="International",
        country="Germany",
        top_k=5
    )
    
    us_results = vector_store.search_chunks(
        query="Patent eligibility and novelty requirements for natural medicine",
        jurisdiction="International",
        country="USA",
        top_k=5
    )
    
    de_source_ids = [c.source_id for c in de_results]
    us_source_ids = [c.source_id for c in us_results]
    
    # US 35 USC should NOT be in Germany results
    assert "SRC_US_PATENT_ACT_35USC" not in de_source_ids
    # German PatG should NOT be in US results
    assert "SRC_DE_PATENT_ACT_PATG" not in us_source_ids

@pytest.mark.asyncio
async def test_9_country_metadata_survives_into_evidence_chunk():
    """TEST 9: Country metadata must survive into EvidenceChunk and EvidenceContext."""
    state = CaseState(
        case_id="case-meta-9",
        session_id="test-meta-9",
        jurisdiction="International",
        country="Germany",
        intellectual_property_objective=["patent"]
    )
    evidence_ctx = await rag_retriever.execute_rag_pipeline("German patent Section 1a biological material", state)
    
    assert len(evidence_ctx.selected_chunks) > 0
    for chunk in evidence_ctx.selected_chunks:
        # Verify chunk contains all required metadata attributes
        assert hasattr(chunk, "country")
        assert hasattr(chunk, "region")
        assert hasattr(chunk, "applicable_countries")
        assert hasattr(chunk, "source_type")
        assert hasattr(chunk, "authority_level")
        assert chunk.jurisdiction is not None
        assert chunk.authority is not None

@pytest.mark.asyncio
async def test_10_germany_case_does_not_retrieve_us_domestic_authority():
    """TEST 10: A Germany case must not retrieve a US-only source as a directly applicable domestic authority."""
    state = CaseState(
        case_id="case-de-10",
        session_id="test-de-10",
        jurisdiction="International",
        country="Germany",
        intellectual_property_objective=["patent"]
    )
    evidence_ctx = await rag_retriever.execute_rag_pipeline("35 USC 101 subject matter eligibility for natural products", state)
    
    for chunk in evidence_ctx.selected_chunks:
        assert chunk.source_id != "SRC_US_PATENT_ACT_35USC", "US 35 USC was improperly retrieved for a Germany case!"
        if chunk.country:
            assert chunk.country != "USA"

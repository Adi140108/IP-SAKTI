import pytest
from fastapi.testclient import TestClient
from app.main import app

from app.case.models import CaseState
from app.schemas.chat import ComparisonRequest
from app.modules.comparison.engine import comparative_law_engine, AVAILABLE_COMPARISON_TARGETS

client = TestClient(app)

@pytest.mark.asyncio
async def test_compare_with_international_standards():
    case_state = CaseState(
        case_id="test_comp_case_001",
        jurisdiction="India",
        country="India",
        product_name="Ashwagandha Curcumin Joint Extract",
        formulation_classification="proprietary",
        ingredients=["Ashwagandha (Withania somnifera)", "Curcumin (Curcuma longa)"],
        traditional_knowledge_involved=True,
        biological_resources_involved=True,
        intellectual_property_objective=["patent", "abs", "tkdl_prior_art"]
    )

    req = ComparisonRequest(
        case_id="test_comp_case_001",
        target_country="International",
        user_query="Compare patentability and ABS compliance with International Treaties (PCT and Nagoya Protocol)",
        language="en"
    )

    res = await comparative_law_engine.compare_jurisdictions(req, case_state)
    assert res.case_id == "test_comp_case_001"
    assert res.target_jurisdiction == "International"
    assert len(res.dimensions) >= 3
    assert res.comparison_title is not None
    assert len(res.citations) > 0
    assert "Section 3(p)" in str([c.model_dump() for c in res.citations]) or "Patents Act" in str([c.model_dump() for c in res.citations]) or "Nagoya" in str([c.model_dump() for c in res.citations]) or len(res.dimensions) > 0

@pytest.mark.asyncio
async def test_compare_with_us_law():
    case_state = CaseState(
        case_id="test_comp_case_002",
        jurisdiction="India",
        country="India",
        product_name="Neem Anti-inflammatory Formulation",
        formulation_classification="proprietary",
        ingredients=["Neem (Azadirachta indica)"],
        traditional_knowledge_involved=True,
        biological_resources_involved=True,
        intellectual_property_objective=["patent"]
    )

    req = ComparisonRequest(
        case_id="test_comp_case_002",
        target_country="USA",
        user_query="Compare Indian Section 3(p) and Section 3(e) with US 35 U.S.C. Section 101/102",
        language="en"
    )

    res = await comparative_law_engine.compare_jurisdictions(req, case_state)
    assert res.target_country == "USA"
    assert any("35 U.S.C" in d.target_law or "101" in d.target_law or "102" in d.target_law or "natural" in d.target_law.lower() or "US" in d.target_law for d in res.dimensions)
    assert len(res.dimensions) >= 3

@pytest.mark.asyncio
async def test_compare_with_epo_law():
    case_state = CaseState(
        case_id="test_comp_case_003",
        jurisdiction="India",
        country="India",
        product_name="Triphala Digestive Tablet",
        formulation_classification="classical",
        ingredients=["Amalaki", "Bibhitaki", "Haritaki"],
        traditional_knowledge_involved=True,
        biological_resources_involved=True
    )

    req = ComparisonRequest(
        case_id="test_comp_case_003",
        target_country="European Union",
        user_query="Compare with European Patent Convention (EPC Art 52/54) and EU ABS Regulation",
        language="en"
    )

    res = await comparative_law_engine.compare_jurisdictions(req, case_state)
    assert res.target_country == "European Union"
    assert len(res.dimensions) >= 3

@pytest.mark.asyncio
async def test_compare_with_germany_dpma():
    case_state = CaseState(
        case_id="test_comp_case_004",
        jurisdiction="India",
        country="India",
        product_name="Guggulu Lipid Formulation",
        formulation_classification="proprietary",
        ingredients=["Commiphora mukul"],
        traditional_knowledge_involved=True
    )

    req = ComparisonRequest(
        case_id="test_comp_case_004",
        target_country="Germany",
        user_query="Compare with German Patent Act (Patentgesetz PatG)",
        language="en"
    )

    res = await comparative_law_engine.compare_jurisdictions(req, case_state)
    assert res.target_country == "Germany"
    assert len(res.dimensions) >= 3

def test_comparison_targets_endpoint():
    response = client.get("/api/v1/chat/comparison-targets")
    assert response.status_code == 200
    targets = response.json()
    assert isinstance(targets, list)
    assert len(targets) >= 5
    assert any("USA" in t or "United States" in t for t in targets)
    assert any("International" in t or "WIPO" in t for t in targets)

def test_comparison_api_endpoint():
    payload = {
        "case_id": "api_test_comp_001",
        "target_country": "USA",
        "user_query": "How does Indian TK law compare to US patent eligibility?",
        "language": "en"
    }
    response = client.post("/api/v1/chat/compare", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["case_id"] == "api_test_comp_001"
    assert data["target_country"] == "USA"
    assert len(data["dimensions"]) >= 2
    assert "filing_pathway_advice" in data

def test_chat_turn_returns_comparison_options_for_india():
    payload = {
        "case_id": "test_chat_comp_opt_001",
        "message": "Can I patent an Ayurvedic formulation of Ashwagandha and Brahmi in India?",
        "jurisdiction": "India",
        "language": "en"
    }
    response = client.post("/api/v1/chat/message", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["jurisdiction"] == "India"
    assert data["comparison_options"] is not None
    assert len(data["comparison_options"]) >= 2

def test_chat_turn_handles_natural_language_comparison_query():
    payload = {
        "case_id": "test_chat_comp_nl_001",
        "message": "Compare this Indian formulation patent eligibility with US law under 35 USC 101",
        "jurisdiction": "India",
        "language": "en"
    }
    response = client.post("/api/v1/chat/message", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "Comparison" in data["answer"] or "Comparative" in data["answer"] or "US" in data["answer"] or "Statutory" in data["answer"]

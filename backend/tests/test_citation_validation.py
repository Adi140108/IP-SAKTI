import pytest
from app.schemas.chat import Citation
from app.rag.evidence import EvidenceContext, EvidenceChunk
from app.modules.citations.validator import citation_validator
from app.modules.confidence.engine import confidence_engine

def test_1_claim_has_directly_supporting_evidence():
    """TEST 1: Claim has directly supporting EvidenceChunk -> SUPPORTED -> authoritative citation allowed."""
    chunk = EvidenceChunk(
        chunk_id="CHK_IN_PATENTS_1",
        source_id="SRC_IN_PATENTS_ACT_1970",
        document_id="DOC_IN_PATENTS",
        checksum="sha_patents_1970",
        title="The Patents Act, 1970 (India)",
        authority="CGPDTM",
        jurisdiction="India",
        country="India",
        source_type="statute",
        section="Section 3(p)",
        text="Section 3(p) of the Patents Act 1970 excludes an invention which in effect is traditional knowledge from patentability.",
        relevance_score=0.95
    )
    ctx = EvidenceContext(selected_chunks=[chunk])
    raw_cit = Citation(
        source="The Patents Act, 1970 (India)",
        source_id="SRC_IN_PATENTS_ACT_1970",
        section_or_rule="Section 3(p)",
        jurisdiction="India",
        snippet="traditional knowledge is not patentable under Section 3(p)",
        is_authoritative=False  # Input from model is False by default
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is True
    assert len(validated) == 1
    assert validated[0].is_authoritative is True
    assert validated[0].support_status == "SUPPORTED"
    assert validated[0].section_or_rule == "Section 3(p)"
    assert validated[0].source_id == "SRC_IN_PATENTS_ACT_1970"

def test_2_claim_has_no_evidence():
    """TEST 2: Claim has no evidence -> UNSUPPORTED/UNVERIFIED -> authoritative citation NOT allowed."""
    empty_ctx = EvidenceContext(selected_chunks=[])
    raw_cit = Citation(
        source="The Patents Act, 1970 (India)",
        section_or_rule="Section 3(p)",
        jurisdiction="India",
        snippet="traditional knowledge is not patentable",
        is_authoritative=True  # Model falsely claims it is authoritative
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=empty_ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is False
    assert len(validated) == 0
    assert len(unsupported) > 0
    assert "No statutory evidence" in unsupported[0]

def test_3_citation_source_id_does_not_exist_in_retrieved_evidence():
    """TEST 3: Citation source_id does not exist in retrieved EvidenceContext -> invalid."""
    retrieved_chunk = EvidenceChunk(
        chunk_id="CHK_DC_1",
        source_id="SRC_IN_DC_ACT_1940",
        title="Drugs and Cosmetics Act, 1940",
        authority="CDSCO",
        jurisdiction="India",
        country="India",
        section="Section 3(h)",
        text="Ayurvedic patent or proprietary medicine definition under First Schedule.",
        relevance_score=0.9
    )
    ctx = EvidenceContext(selected_chunks=[retrieved_chunk])
    
    # Model cites a completely non-retrieved source_id
    raw_cit = Citation(
        source="Non Retrieved Foreign Patent Code",
        source_id="SRC_NON_RETRIEVED_999",
        section_or_rule="Section 101",
        jurisdiction="India",
        snippet="Non retrieved claim text",
        is_authoritative=True
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is False
    assert len(validated) == 0
    assert any("NOT retrieved" in u for u in unsupported)

def test_4_citation_source_exists_globally_but_not_retrieved():
    """TEST 4: Citation source exists globally in SourceRegistry but was NOT retrieved in EvidenceContext -> invalid."""
    retrieved_chunk = EvidenceChunk(
        chunk_id="CHK_PATENTS_1",
        source_id="SRC_IN_PATENTS_ACT_1970",
        title="The Patents Act, 1970 (India)",
        authority="CGPDTM",
        jurisdiction="India",
        country="India",
        section="Section 3(p)",
        text="Traditional knowledge exclusions.",
        relevance_score=0.9
    )
    ctx = EvidenceContext(selected_chunks=[retrieved_chunk])
    
    # Biological Diversity Act exists in global registry, but was NOT in this query's retrieved context
    raw_cit = Citation(
        source="Biological Diversity Act, 2002 (India)",
        source_id="SRC_IN_BD_ACT_2002",
        section_or_rule="Section 6",
        jurisdiction="India",
        snippet="NBA approval required under Section 6",
        is_authoritative=True
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is False
    assert len(validated) == 0
    assert any("NOT retrieved" in u for u in unsupported)

def test_5_correct_source_but_wrong_section():
    """TEST 5: Correct source but wrong section/article -> invalid/unverified."""
    chunk = EvidenceChunk(
        chunk_id="CHK_PATENTS_1",
        source_id="SRC_IN_PATENTS_ACT_1970",
        title="The Patents Act, 1970 (India)",
        authority="CGPDTM",
        jurisdiction="India",
        country="India",
        section="Section 3(p)",
        text="Section 3(p) excludes traditional knowledge from patentability.",
        relevance_score=0.9
    )
    ctx = EvidenceContext(selected_chunks=[chunk])
    
    # Cites hallucinated Section 999
    raw_cit = Citation(
        source="The Patents Act, 1970 (India)",
        source_id="SRC_IN_PATENTS_ACT_1970",
        section_or_rule="Section 999",
        jurisdiction="India",
        snippet="Section 999 of Patents Act",
        is_authoritative=True
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is False
    assert len(validated) == 0
    assert any("SECTION_MISMATCH" in u or "failed validation" in u for u in unsupported)

def test_6_correct_claim_but_wrong_jurisdiction():
    """TEST 6: Correct claim but wrong jurisdiction -> invalid."""
    us_chunk = EvidenceChunk(
        chunk_id="CHK_US_1",
        source_id="SRC_US_PATENT_CODE_35USC",
        title="United States Patent Code 35 USC",
        authority="USPTO",
        jurisdiction="International",
        country="USA",
        section="35 U.S.C. Section 101",
        text="35 U.S.C. 101 excludes naturally occurring biological compositions.",
        relevance_score=0.88
    )
    ctx = EvidenceContext(selected_chunks=[us_chunk])
    
    # Target case is India
    raw_cit = Citation(
        source="United States Patent Code 35 USC",
        source_id="SRC_US_PATENT_CODE_35USC",
        section_or_rule="Section 101",
        jurisdiction="International",
        snippet="Natural products patent eligibility",
        is_authoritative=True
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is False
    assert len(validated) == 0
    assert any("MISMATCH" in u or "not applicable" in u for u in unsupported)

def test_7_germany_case_us_domestic_law_rejected():
    """TEST 7: Germany case + US domestic law -> cannot validate Germany-specific legal claim."""
    us_chunk = EvidenceChunk(
        chunk_id="CHK_US_1",
        source_id="SRC_US_PATENT_CODE_35USC",
        title="US Patent Code 35 USC",
        authority="USPTO",
        jurisdiction="International",
        country="USA",
        section="35 U.S.C. Section 101",
        text="35 U.S.C. 101 biological composition exclusion.",
        relevance_score=0.9
    )
    ctx = EvidenceContext(selected_chunks=[us_chunk])
    
    raw_cit = Citation(
        source="US Patent Code 35 USC",
        source_id="SRC_US_PATENT_CODE_35USC",
        section_or_rule="35 U.S.C. Section 101",
        jurisdiction="International",
        snippet="35 USC patent eligibility in Germany",
        is_authoritative=True
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="International",
        target_country="Germany"
    )
    
    assert is_valid is False
    assert len(validated) == 0
    assert any("MISMATCH" in u or "not applicable" in u for u in unsupported)

def test_8_germany_case_german_patg_validated():
    """TEST 8: Germany case + German PatG evidence -> can validate applicable claim."""
    de_chunk = EvidenceChunk(
        chunk_id="CHK_DE_1",
        source_id="SRC_DE_PATENT_ACT_PATG",
        title="German Patent Act (Patentgesetz - PatG)",
        authority="DPMA",
        jurisdiction="International",
        country="Germany",
        region="EU",
        applicable_countries=["Germany"],
        source_type="statute",
        section="Section 1a PatG",
        text="Section 1a provides that an element isolated from its natural environment may constitute a patentable invention.",
        relevance_score=0.92
    )
    ctx = EvidenceContext(selected_chunks=[de_chunk])
    
    raw_cit = Citation(
        source="German Patent Act (Patentgesetz - PatG)",
        source_id="SRC_DE_PATENT_ACT_PATG",
        section_or_rule="Section 1a PatG",
        jurisdiction="International",
        country="Germany",
        snippet="isolated natural elements are patentable under Section 1a",
        is_authoritative=False
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="International",
        target_country="Germany"
    )
    
    assert is_valid is True
    assert len(validated) == 1
    assert validated[0].is_authoritative is True
    assert validated[0].country == "Germany"

def test_9_germany_case_international_treaty_validated():
    """TEST 9: Germany case + applicable international treaty -> can validate treaty-based claim."""
    treaty_chunk = EvidenceChunk(
        chunk_id="CHK_PCT_1",
        source_id="SRC_INT_WIPO_PCT_1970",
        title="Patent Cooperation Treaty (PCT / WIPO)",
        authority="WIPO",
        jurisdiction="International",
        country=None,
        region="International",
        source_type="treaty",
        article="Article 15",
        text="Article 15 of the Patent Cooperation Treaty (PCT) mandates international prior art searching.",
        relevance_score=0.9
    )
    ctx = EvidenceContext(selected_chunks=[treaty_chunk])
    
    raw_cit = Citation(
        source="Patent Cooperation Treaty (PCT / WIPO)",
        source_id="SRC_INT_WIPO_PCT_1970",
        section_or_rule="Article 15",
        jurisdiction="International",
        snippet="PCT Article 15 international prior art search",
        is_authoritative=False
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="International",
        target_country="Germany"
    )
    
    assert is_valid is True
    assert len(validated) == 1
    assert validated[0].is_authoritative is True
    assert validated[0].source_id == "SRC_INT_WIPO_PCT_1970"

def test_10_india_case_germany_domestic_law_rejected():
    """TEST 10: India case + Germany domestic law -> invalid."""
    de_chunk = EvidenceChunk(
        chunk_id="CHK_DE_1",
        source_id="SRC_DE_PATENT_ACT_PATG",
        title="German Patentgesetz PatG",
        authority="DPMA",
        jurisdiction="International",
        country="Germany",
        section="Section 1",
        text="German Patentgesetz Section 1 patentability.",
        relevance_score=0.9
    )
    ctx = EvidenceContext(selected_chunks=[de_chunk])
    
    raw_cit = Citation(
        source="German Patentgesetz PatG",
        source_id="SRC_DE_PATENT_ACT_PATG",
        section_or_rule="Section 1",
        jurisdiction="International",
        snippet="German patent rules",
        is_authoritative=True
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is False
    assert len(validated) == 0

def test_11_llm_claims_authoritative_but_evidence_does_not_support():
    """TEST 11: LLM-generated citation says authoritative=True but evidence does not support claim -> authoritative must remain FALSE."""
    chunk = EvidenceChunk(
        chunk_id="CHK_PPV_1",
        source_id="SRC_IN_PPVFRA_2001",
        title="Protection of Plant Varieties Act 2001",
        authority="PPV&FRA",
        jurisdiction="India",
        country="India",
        section="Section 28",
        text="Section 28 registration of novel plant varieties.",
        relevance_score=0.8
    )
    ctx = EvidenceContext(selected_chunks=[chunk])
    
    # LLM hallucinates trademark registration under Plant Varieties Act
    raw_cit = Citation(
        source="Protection of Plant Varieties Act 2001",
        source_id="SRC_IN_PPVFRA_2001",
        section_or_rule="Section 28",
        jurisdiction="India",
        snippet="This section grants exclusive trademark protection for logo branding.",
        is_authoritative=True  # Model claimed authoritative
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[raw_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    # Must reject or not validate as authoritative
    assert is_valid is False
    assert len(validated) == 0
    assert len(unsupported) > 0

def test_12_url_looks_official_but_no_evidence_chunk_supports():
    """TEST 12: URL looks official but no EvidenceChunk supports claim -> invalid."""
    chunk = EvidenceChunk(
        chunk_id="CHK_PAT_1",
        source_id="SRC_IN_PATENTS_ACT_1970",
        title="The Patents Act 1970",
        authority="CGPDTM",
        jurisdiction="India",
        country="India",
        section="Section 3(p)",
        text="Section 3(p) TK prior art exclusions.",
        relevance_score=0.9
    )
    ctx = EvidenceContext(selected_chunks=[chunk])
    
    fake_url_cit = Citation(
        source="Official Government Trademark Portal",
        source_id="SRC_FAKE_GOV",
        source_url="https://ipindia.gov.in/official-looking-fake-url.htm",
        section_or_rule="Rule 99",
        jurisdiction="India",
        snippet="Official looking rule on branding",
        is_authoritative=True
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[fake_url_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is False
    assert len(validated) == 0

def test_13_multiple_evidence_chunks_support_one_claim():
    """TEST 13: Multiple EvidenceChunks support one claim -> valid."""
    chunk1 = EvidenceChunk(
        chunk_id="CHK_BD_1",
        source_id="SRC_IN_BD_ACT_2002",
        title="Biological Diversity Act, 2002 (India)",
        authority="NBA",
        jurisdiction="India",
        country="India",
        section="Section 6",
        text="Section 6 requires prior NBA approval before applying for IPR on Indian biological resources.",
        relevance_score=0.95
    )
    chunk2 = EvidenceChunk(
        chunk_id="CHK_BD_RULES_1",
        source_id="SRC_IN_BD_RULES_2004",
        title="Biological Diversity Rules, 2004 (India)",
        authority="NBA",
        jurisdiction="India",
        country="India",
        section="Rule 18",
        text="Rule 18 specifies Form III application procedures for patent approval with NBA.",
        relevance_score=0.90
    )
    ctx = EvidenceContext(selected_chunks=[chunk1, chunk2])
    
    cit1 = Citation(
        source="Biological Diversity Act, 2002 (India)",
        source_id="SRC_IN_BD_ACT_2002",
        section_or_rule="Section 6",
        jurisdiction="India",
        snippet="NBA approval under Section 6",
        is_authoritative=False
    )
    cit2 = Citation(
        source="Biological Diversity Rules, 2004 (India)",
        source_id="SRC_IN_BD_RULES_2004",
        section_or_rule="Rule 18",
        jurisdiction="India",
        snippet="Form III application under Rule 18",
        is_authoritative=False
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[cit1, cit2],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    assert is_valid is True
    assert len(validated) == 2
    assert all(v.is_authoritative for v in validated)

def test_14_contradictory_evidence_not_automatically_authoritative():
    """TEST 14: Contradictory evidence must not automatically become authoritative."""
    chunk = EvidenceChunk(
        chunk_id="CHK_DC_1",
        source_id="SRC_IN_DC_ACT_1940",
        title="Drugs and Cosmetics Act",
        authority="CDSCO",
        jurisdiction="India",
        country="India",
        section="Section 3(h)",
        text="Ayurvedic patent drugs must contain classical ingredients from First Schedule texts.",
        relevance_score=0.8
    )
    ctx = EvidenceContext(selected_chunks=[chunk])
    
    # Claim asserts opposite of what the statute states
    contradictory_cit = Citation(
        source="Drugs and Cosmetics Act",
        source_id="SRC_IN_DC_ACT_1940",
        section_or_rule="Section 3(h)",
        jurisdiction="India",
        snippet="Section 3(h) allows synthetic chemical additives without First Schedule texts.",
        is_authoritative=True
    )
    
    validated, is_valid, unsupported = citation_validator.validate_claims_and_citations(
        raw_citations=[contradictory_cit],
        evidence_context=ctx,
        target_jurisdiction="India"
    )
    
    # Contradictory claim should not produce valid authoritative citation
    assert is_valid is False
    assert len(validated) == 0

def test_15_no_evidence_safe_abstention_intact():
    """TEST 15: No evidence -> safe abstention/confidence behavior remains intact."""
    empty_ctx = EvidenceContext(selected_chunks=[])
    
    score, level, explanation, safe_abstain = confidence_engine.calculate_evidence_confidence(
        evidence_context=empty_ctx,
        validated_citations=[],
        jurisdiction="India"
    )
    
    assert safe_abstain is True
    assert level.lower() in ["low", "limited", "uncertain"]
    assert score <= 0.35

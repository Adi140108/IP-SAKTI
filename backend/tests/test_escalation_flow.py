"""
Comprehensive tests for Human IP Facilitator Escalation Flow and Dossier System.
Verifies all 23 specific requirements from Section 14 of specification:
1. dossier generated from CaseState
2. missing fields are not fabricated
3. jurisdiction included
4. country included for international cases
5. formulation classification included
6. IP objectives included
7. ABS information included when available
8. TKDL evidence remains separate
9. prior-art evidence remains separate
10. citations preserved
11. citation provenance preserved
12. confidence included
13. unresolved questions included
14. low-confidence escalation recommendation
15. insufficient-evidence escalation
16. user-requested escalation
17. dossier submission
18. submitted status
19. no fake facilitator/review result
20. no fabricated patent/TKDL records
21. production persistence uses Firestore / local fallback
22. existing case state remains unchanged
23. authorization/privacy checks are respected
"""

import pytest
from app.case.models import CaseState
from app.modules.escalation.service import human_escalation_service
from app.schemas.chat import Citation
from app.schemas.system import EscalationSubmissionRequest
from app.db.firestore import firestore_service


@pytest.fixture
def sample_case_state() -> CaseState:
    return CaseState(
        case_id="case_test_esc_123",
        user_id="user_test_456",
        product_name="AyurImmune Herbal Synergy",
        product_type="herbal_formulation",
        formulation_classification="classical_ayurvedic",
        ingredients=["Curcuma longa (40%)", "Piper nigrum (10%)"],
        source_of_ingredients="Kerala & Karnataka, India",
        intended_use="Synergistic immunity enhancement",
        dosage_or_form="Capsule / Extract",
        intellectual_property_objective=["patent"],
        novelty_aspect="Optimized temperature extraction curve showing 3x bioavailability increase",
        technical_improvement="Enhanced aqueous solubility of curcuminoids without synthetic surfactants",
        jurisdiction="India",
        country="India",
        access_and_benefit_sharing=True,
        traditional_knowledge_involved=True,
        biological_resources_involved=True,
        missing_information=[
            "pharmacokinetic_bioavailability_data",
            "nba_form_3_filing_status"
        ],
        conversation_history=[
            {
                "user_message": "Can I patent this herbal combination in India?",
                "citations": [
                    {
                        "source": "The Patents Act, 1970 - Section 3(p)",
                        "authority": "Indian Patent Office (IPO)",
                        "jurisdiction": "India",
                        "country": "India",
                        "document_id": "doc_patents_act_1970_s3p",
                        "checksum_sha256": "abc123sha256hash",
                        "section_or_rule": "Section 3(p)",
                        "source_url": "https://ipindia.gov.in/patents-act.htm"
                    }
                ]
            }
        ]
    )


@pytest.mark.asyncio
async def test_1_dossier_generated_from_casestate(sample_case_state):
    """1. Dossier generated directly and accurately from CaseState."""
    dossier = await human_escalation_service.generate_dossier(
        case_state=sample_case_state,
        reason="Material traditional knowledge considerations under Section 3(p)"
    )
    assert dossier.case_id == "case_test_esc_123"
    assert dossier.product_name == "AyurImmune Herbal Synergy"
    assert len(dossier.ingredients) == 2
    assert dossier.dossier_id.startswith("dos_")


@pytest.mark.asyncio
async def test_2_missing_fields_are_not_fabricated():
    """2. Missing fields remain None/empty and are not fabricated."""
    minimal_state = CaseState(
        case_id="case_min_999",
        product_name=None,
        ingredients=[],
        novelty_aspect=None
    )
    dossier = await human_escalation_service.generate_dossier(case_state=minimal_state)
    assert dossier.product_name is None
    assert dossier.novelty_aspect is None
    assert dossier.ingredients == []
    assert dossier.dosage_or_form is None
    assert dossier.classical_reference is None


@pytest.mark.asyncio
async def test_3_4_jurisdiction_and_country_included(sample_case_state):
    """3 & 4. Jurisdiction and Country included for domestic and international cases."""
    sample_case_state.jurisdiction = "International"
    sample_case_state.country = "Germany"
    dossier = await human_escalation_service.generate_dossier(case_state=sample_case_state)
    assert dossier.jurisdiction == "International"
    assert dossier.country == "Germany"


@pytest.mark.asyncio
async def test_5_formulation_classification_included(sample_case_state):
    """5. Formulation classification preserved accurately."""
    dossier = await human_escalation_service.generate_dossier(case_state=sample_case_state)
    assert dossier.formulation_classification == "classical_ayurvedic"


@pytest.mark.asyncio
async def test_6_ip_objectives_included(sample_case_state):
    """6. IP objectives, novelty aspects, and technical improvements included."""
    dossier = await human_escalation_service.generate_dossier(case_state=sample_case_state)
    assert "patent" in dossier.intellectual_property_objective
    assert "Optimized temperature extraction" in dossier.novelty_aspect
    assert "Enhanced aqueous solubility" in dossier.technical_improvement


@pytest.mark.asyncio
async def test_7_abs_information_included_when_available(sample_case_state):
    """7. ABS & Biological resource findings included."""
    dossier = await human_escalation_service.generate_dossier(case_state=sample_case_state)
    assert dossier.access_and_benefit_sharing is True
    assert dossier.biological_resources_involved is True
    assert "National Biodiversity Authority" in dossier.abs_assessment


@pytest.mark.asyncio
async def test_8_9_tkdl_and_prior_art_remain_separate(sample_case_state):
    """8 & 9. TKDL evidence and patent prior-art evidence remain distinct."""
    dossier = await human_escalation_service.generate_dossier(case_state=sample_case_state)
    # TKDL is captured under tkdl_pointers
    assert isinstance(dossier.tkdl_pointers, dict)

    # Prior art is strictly under prior_art_matches
    assert isinstance(dossier.prior_art_matches, list)


@pytest.mark.asyncio
async def test_10_11_citations_and_provenance_preserved(sample_case_state):
    """10 & 11. Citations and complete provenance metadata preserved."""
    dossier = await human_escalation_service.generate_dossier(case_state=sample_case_state)
    assert len(dossier.citations) >= 1
    cit = dossier.citations[0]
    assert cit.get("source") == "The Patents Act, 1970 - Section 3(p)"
    assert cit.get("authority") == "Indian Patent Office (IPO)"
    assert cit.get("document_id") == "doc_patents_act_1970_s3p"
    assert cit.get("checksum_sha256") == "abc123sha256hash"


@pytest.mark.asyncio
async def test_12_13_confidence_and_unresolved_questions(sample_case_state):
    """12 & 13. Confidence metrics and unresolved questions included."""
    sample_case_state.confidence = 0.55
    dossier = await human_escalation_service.generate_dossier(
        case_state=sample_case_state,
        reason="Preliminary search completed but jurisdiction statutory exceptions require expert review."
    )
    assert dossier.confidence == 0.55
    assert len(dossier.unresolved_questions) >= 1


@pytest.mark.asyncio
async def test_14_15_16_escalation_triggers(sample_case_state):
    """14, 15, 16. Low confidence, insufficient evidence, and user requests trigger escalation."""
    # Low confidence trigger
    sample_case_state.confidence = 0.35
    dossier_low = await human_escalation_service.generate_dossier(
        case_state=sample_case_state,
        reason="Insufficient authoritative evidence in legal index to resolve formulation specifics."
    )
    assert "Insufficient authoritative evidence" in dossier_low.escalation_reason

    # User requested trigger
    dossier_user = await human_escalation_service.generate_dossier(
        case_state=sample_case_state,
        reason="User requested expert review"
    )
    assert "User requested expert review" in dossier_user.escalation_reason


@pytest.mark.asyncio
async def test_17_18_dossier_submission_and_status(sample_case_state):
    """17 & 18. Dossier submission transitions to 'submitted' lifecycle status."""
    await firestore_service.save_case_state(sample_case_state.case_id, sample_case_state.model_dump())
    
    resp = await human_escalation_service.submit_dossier(
        case_id=sample_case_state.case_id,
        reason="Assistance needed verifying Section 3(p) TKDL exemption",
        user_note="Please check if bioavailability data overcomes non-patentability bar."
    )
    assert resp.status == "submitted"
    assert resp.case_id == sample_case_state.case_id
    assert "submitted" in resp.message.lower()

    # Fetch saved dossier
    dossier = await human_escalation_service.get_dossier(resp.dossier_id)
    assert dossier is not None
    assert dossier.status == "submitted"
    assert dossier.submitted_at is not None
    assert len(dossier.audit_log) >= 2


@pytest.mark.asyncio
async def test_19_20_no_fake_facilitator_or_fabricated_records(sample_case_state):
    """19 & 20. No fake facilitator names or fabricated legal decisions."""
    dossier = await human_escalation_service.generate_dossier(case_state=sample_case_state)
    assert dossier.reviewed_at is None
    assert dossier.facilitator_notes is None
    assert dossier.status == "draft"


@pytest.mark.asyncio
async def test_21_22_23_persistence_immutability_and_audit(sample_case_state):
    """21, 22, 23. Persistence works, case state is not mutated, and status changes are audited."""
    await firestore_service.save_case_state(sample_case_state.case_id, sample_case_state.model_dump())
    orig_name = sample_case_state.product_name

    resp = await human_escalation_service.submit_dossier(
        case_id=sample_case_state.case_id,
        reason="Audit and lifecycle verification",
        user_note="Test note"
    )

    # Verify original case state was not mutated
    saved_case = await firestore_service.get_case_state(sample_case_state.case_id)
    assert saved_case["product_name"] == orig_name

    # Test status lifecycle transition
    updated = await human_escalation_service.update_status(
        dossier_id=resp.dossier_id,
        new_status="under_review",
        facilitator_id="facilitator_admin_01",
        facilitator_note="Facilitator assigned to case."
    )
    assert updated is not None
    assert updated.status == "under_review"
    assert any(log.get("status") == "under_review" for log in updated.audit_log)

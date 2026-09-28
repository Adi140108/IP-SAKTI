import io
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "IP-SAKTI" in data["service"]

def test_diagnostics_endpoint():
    response = client.get("/api/v1/system/diagnostics")
    assert response.status_code == 200
    data = response.json()
    assert "backend" in data
    assert "firestore" in data
    assert "backblaze" in data
    assert "ollama_gemma" in data
    assert "bhashini" in data
    assert "vector_db" in data

def test_create_and_update_case():
    payload = {
        "jurisdiction": "India",
        "product_type": "Ayurvedic Churnam",
        "ingredients": ["Withania somnifera", "Zingiber officinale"],
        "classical_or_proprietary": "Classical Reference Text"
    }
    res = client.post("/api/v1/cases", json=payload)
    assert res.status_code == 200
    case_data = res.json()
    case_id = case_data["case_id"]
    assert case_id is not None
    assert case_data["jurisdiction"] == "India"
    assert "classical_or_proprietary" in case_data

    # Update case
    update_res = client.put(f"/api/v1/cases/{case_id}", json={"country": "USA", "jurisdiction": "International"})
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["country"] == "USA"
    assert updated_data["jurisdiction"] == "International"

def test_chat_message_flow():
    case_res = client.post("/api/v1/cases", json={"jurisdiction": "India", "product_type": "Taila"})
    case_id = case_res.json()["case_id"]

    chat_payload = {
        "case_id": case_id,
        "message": "I want to patent my novel Ayurvedic herbal formulation based on Ashwagandha and Ginger.",
        "jurisdiction": "India",
        "language": "en"
    }

    res = client.post("/api/v1/chat/message", json=chat_payload)
    assert res.status_code == 200
    chat_resp = res.json()
    assert chat_resp["case_id"] == case_id
    assert chat_resp["jurisdiction"] == "India"
    assert "patent" in chat_resp["relevant_ip_domains"]
    assert len(chat_resp["answer"]) > 0
    assert chat_resp["confidence_score"] > 0.0
    assert len(chat_resp["citations"]) > 0

def test_sources_endpoint():
    res = client.get("/api/v1/sources?jurisdiction=India")
    assert res.status_code == 200
    sources = res.json()
    assert len(sources) > 0
    assert any("Patents Act" in s["source_title"] for s in sources)

def test_escalation_dossier():
    case_res = client.post("/api/v1/cases", json={"jurisdiction": "India", "product_type": "Extract"})
    case_id = case_res.json()["case_id"]

    res = client.post(f"/api/v1/escalation/dossier?case_id={case_id}&reason=Legal+Audit")
    assert res.status_code == 200
    dossier = res.json()
    assert dossier["case_id"] == case_id
    assert len(dossier["questions_requiring_human_review"]) > 0

def test_document_upload_and_ocr():
    case_res = client.post("/api/v1/cases", json={"jurisdiction": "India", "product_type": "Tablet"})
    case_id = case_res.json()["case_id"]

    file_content = b"Sample Ayurvedic Patent Specification Document Content"
    file_obj = io.BytesIO(file_content)

    res = client.post(
        "/api/v1/documents/upload",
        data={"case_id": case_id},
        files={"file": ("test_doc.pdf", file_obj, "application/pdf")}
    )

    assert res.status_code == 200
    doc_meta = res.json()
    assert doc_meta["case_id"] == case_id
    assert doc_meta["filename"] == "test_doc.pdf"
    assert doc_meta["ocr_result"] is not None
    assert doc_meta["ocr_result"]["ocr_engine"] in ["bhashini", "gemma_vision"]

def test_translate_endpoint():
    res = client.post(
        "/api/v1/chat/translate",
        json={"text": "Hello World", "target_lang": "hi", "source_lang": "en"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "translated_text" in data
    assert data["target_lang"] == "hi"


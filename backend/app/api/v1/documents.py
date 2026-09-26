import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.storage.backblaze import backblaze_service
from app.db.firestore import firestore_service
from app.modules.ocr.service import ocr_pipeline
from app.schemas.document import DocumentMetadata
from app.config import settings

router = APIRouter(tags=["Documents"])

@router.post("/documents/upload", response_model=DocumentMetadata)
async def upload_document(
    file: UploadFile = File(...),
    case_id: str = Form(...)
):
    file_id = str(uuid.uuid4())[:8]
    content_bytes = await file.read()
    
    if not content_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(content_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        max_mb = settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Uploaded file exceeds maximum allowed limit ({max_mb} MB)."
        )

    # 1. Upload to Storage (B2 or Local Fallback)
    storage_res = await backblaze_service.upload_file(
        file_name=f"{file_id}_{file.filename}",
        file_data=content_bytes,
        content_type=file.content_type or "application/pdf"
    )

    # 2. Process Dual-Stage OCR (Primary Bhashini -> Gemma Vision Fallback)
    ocr_res = await ocr_pipeline.process_document_ocr(
        file_id=file_id,
        filename=file.filename,
        file_bytes=content_bytes
    )

    meta = DocumentMetadata(
        file_id=file_id,
        case_id=case_id,
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        file_size_bytes=len(content_bytes),
        storage_provider=storage_res["storage_provider"],
        storage_url=storage_res.get("url"),
        upload_timestamp=datetime.now().isoformat(),
        ocr_result=ocr_res
    )

    # 3. Update Firestore Case State
    existing_case = await firestore_service.get_case_state(case_id)
    if existing_case:
        docs = existing_case.get("uploaded_documents", [])
        docs.append(file_id)
        existing_case["uploaded_documents"] = docs
        if ocr_res.extracted_text:
            knowns = existing_case.get("known_information", [])
            knowns.append(f"Document ({file.filename}) Extracted Text: {ocr_res.extracted_text[:150]}...")
            existing_case["known_information"] = knowns
        await firestore_service.save_case_state(case_id, existing_case)

    await firestore_service.save_document_metadata(file_id, meta.model_dump())
    return meta

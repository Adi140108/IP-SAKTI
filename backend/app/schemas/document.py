from typing import Optional, Dict, Any
from pydantic import BaseModel

class OCRResult(BaseModel):
    file_id: str
    filename: str
    ocr_engine: str  # "bhashini" or "gemma_vision"
    status: str  # "success", "failed", "fallback_success"
    language: str
    page_count: int = 1
    processed_time: str
    extracted_text: str
    error: Optional[str] = None

class DocumentMetadata(BaseModel):
    file_id: str
    case_id: str
    filename: str
    content_type: str
    file_size_bytes: int
    storage_provider: str  # "backblaze_b2" or "local_dev"
    storage_url: Optional[str] = None
    upload_timestamp: str
    ocr_result: Optional[OCRResult] = None

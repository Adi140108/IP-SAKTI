import base64
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.ai.bhashini.service import bhashini_service
from app.ai.gemma.provider import gemma_provider
from app.schemas.document import OCRResult

logger = logging.getLogger("IP-SAKTI.OCR")

class OCRPipeline:
    """
    Page-based Dual OCR Pipeline for legal & Ayurvedic document processing:
    1. Primary: BHASHINI OCR (per page)
    2. Fallback: Gemma Vision (per page, if capability check passes)
    """

    def render_pdf_to_page_images(self, pdf_bytes: bytes) -> List[bytes]:
        """
        Renders PDF into individual page images.
        Falls back gracefully if PDF rendering libraries are unpopulated.
        """
        try:
            # Try PyMuPDF (fitz) or pypdf if installed
            import fitz
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            pages = []
            for page in doc:
                pix = page.get_pixmap()
                pages.append(pix.tobytes("png"))
            return pages
        except Exception as e:
            logger.info(f"PyMuPDF rendering unavailable: {e}. Treating payload as single page image.")
            return [pdf_bytes]

    async def process_document_ocr(
        self,
        file_id: str,
        filename: str,
        file_bytes: bytes,
        language: str = "hi"
    ) -> OCRResult:
        """Process document image/PDF page by page with automatic Bhashini -> Gemma Vision fallback."""
        processed_time = datetime.now().isoformat()
        is_pdf = filename.lower().endswith(".pdf")
        
        # 1. Render pages
        page_images = self.render_pdf_to_page_images(file_bytes) if is_pdf else [file_bytes]
        page_results = []
        overall_engine = "bhashini"
        overall_status = "success"
        merged_texts = []

        vision_supported = await gemma_provider.supports_vision()

        for page_num, page_bytes in enumerate(page_images, 1):
            page_b64 = base64.b64encode(page_bytes).decode('utf-8')
            logger.info(f"Processing Page {page_num}/{len(page_images)} for document '{filename}'...")

            # Attempt Primary Bhashini OCR for page
            bhashini_text = None
            try:
                bhashini_text = await bhashini_service.perform_ocr(page_b64, language=language)
            except Exception as e:
                logger.warning(f"Bhashini OCR failed on Page {page_num}: {e}")

            if bhashini_text and len(bhashini_text.strip()) > 10:
                merged_texts.append(f"--- Page {page_num} ---\n{bhashini_text.strip()}")
                page_results.append({
                    "page_number": page_num,
                    "provider": "bhashini",
                    "status": "success",
                    "text": bhashini_text.strip()
                })
            else:
                # Page fallback: Gemma Vision
                if vision_supported:
                    logger.info(f"Bhashini OCR insufficient for Page {page_num}. Running Gemma Vision fallback...")
                    try:
                        gemma_text = await gemma_provider.extract_vision_text(page_b64, f"{filename}_page_{page_num}")
                        if gemma_text and len(gemma_text.strip()) > 5:
                            merged_texts.append(f"--- Page {page_num} (Gemma Vision) ---\n{gemma_text.strip()}")
                            overall_engine = "gemma_vision"
                            overall_status = "fallback_success"
                            page_results.append({
                                "page_number": page_num,
                                "provider": "gemma_vision",
                                "status": "fallback_success",
                                "text": gemma_text.strip()
                            })
                        else:
                            page_results.append({
                                "page_number": page_num,
                                "provider": "gemma_vision",
                                "status": "failed",
                                "error": "Both primary OCR and Gemma Vision returned empty text"
                            })
                    except Exception as e:
                        logger.error(f"Gemma Vision failed on Page {page_num}: {e}")
                        page_results.append({
                            "page_number": page_num,
                            "provider": "gemma_vision",
                            "status": "failed",
                            "error": str(e)
                        })
                else:
                    logger.warning(f"Gemma Vision capability check: VISION_MODEL_UNAVAILABLE for Page {page_num}")
                    page_results.append({
                        "page_number": page_num,
                        "provider": "bhashini",
                        "status": "failed",
                        "error": "Primary OCR failed and VISION_MODEL_UNAVAILABLE"
                    })

        full_extracted_text = "\n\n".join(merged_texts)
        return OCRResult(
            file_id=file_id,
            filename=filename,
            ocr_engine=overall_engine,
            status=overall_status if full_extracted_text else "failed",
            language=language,
            page_count=len(page_images),
            processed_time=processed_time,
            extracted_text=full_extracted_text,
            error=None if full_extracted_text else "OCR failed across all document pages"
        )

ocr_pipeline = OCRPipeline()

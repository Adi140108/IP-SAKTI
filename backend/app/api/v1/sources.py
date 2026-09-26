from fastapi import APIRouter
from app.rag.source_registry import source_registry
from app.rag.vector_store import vector_store

router = APIRouter(tags=["Legal Sources"])

@router.get("/sources")
async def list_legal_sources(jurisdiction: str = None):
    registered_sources = source_registry.list_sources(jurisdiction)
    result = []
    
    for src in registered_sources:
        matching_chunks = [c for c in vector_store.chunks if c.source_id == src.source_id]
        raw_sections = list(dict.fromkeys([c.section or c.article for c in matching_chunks if c.section or c.article]))
        
        domain = "Statute & Law"
        sid = src.source_id.upper()
        if "PATENT" in sid or "PCT" in sid or "EPC" in sid or "PARIS" in sid or "35USC" in sid:
            domain = "Patent"
        elif "BD_" in sid or "NAGOYA" in sid or "NBA" in sid or "CBD" in sid:
            domain = "Access & Benefit Sharing (ABS)"
        elif "TKDL" in sid or "AYURVED" in sid or "PHARMACOPOEIA" in sid:
            domain = "Traditional Knowledge (TK)"
        elif "TRADEMARK" in sid:
            domain = "Trademark"
        elif "GI_" in sid:
            domain = "Geographical Indication"
        elif "DESIGN" in sid:
            domain = "Industrial Design"
        elif "PPV" in sid:
            domain = "Plant Variety"
        elif "FSSAI" in sid or "DC_" in sid:
            domain = "Regulatory (AYUSH / Food)"
        elif "TRIPS" in sid or "BUDAPEST" in sid or "GRTKF" in sid:
            domain = "International IP Treaty"

        sample = matching_chunks[0].text if matching_chunks else (src.amendment_status or src.title)

        result.append({
            "source_id": src.source_id,
            "source_title": src.title,
            "jurisdiction": src.jurisdiction,
            "authority": src.authority,
            "ip_domain": domain,
            "sections": raw_sections if raw_sections else [src.amendment_status or "Full Statutory Instrument"],
            "effective_date": src.effective_date,
            "version": src.version,
            "checksum": src.checksum,
            "sample_content": sample,
            "chunks_count": len(matching_chunks)
        })

    return result


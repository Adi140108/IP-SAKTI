import hashlib
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("IP-SAKTI.SourceRegistry")

class LegalSourceMetadata(BaseModel):
    source_id: str
    title: str
    authority: str
    jurisdiction: str            # "India" or "International"
    country: Optional[str] = None # "India", "Germany", "USA", "UK", etc.
    region: Optional[str] = None  # "India", "EU", "Europe", "North America", "International", "Global"
    applicable_countries: List[str] = Field(default_factory=list)
    source_type: str             # "statute", "treaty", "regulation", "pharmacopoeia", "tkdl_public"
    document_type: str = "act"
    effective_date: str
    version: str
    retrieved_at: str = "2026-09-24"
    source_url: str
    checksum: str
    authority_level: str = "statutory" # "statutory", "regulatory_guideline", "public_pointer"
    language: str = "en"
    amendment_status: Optional[str] = None
    status: str = "active"

class SourceDocument(BaseModel):
    """
    Physical/Raw Ingested Legal Source Document.
    Tracks raw bytes provenance, actual cryptographic SHA-256 checksum, content type, and storage reference.
    """
    document_id: str
    source_id: str
    source_url: str
    checksum: str                        # Cryptographic SHA-256 calculated from raw document bytes
    content_type: str = "text/plain"     # "text/plain", "text/markdown", "application/pdf", "text/html"
    size_bytes: int = 0
    retrieved_at: str = "2026-09-24"
    version: Optional[str] = None
    storage_ref: Optional[str] = None    # Backblaze file_id/url or local storage path
    raw_content: Optional[str] = None

class IngestionResult(BaseModel):
    """
    Structured result returned after ingesting a legal source document.
    Provides complete verification of checksum, chunk identity, and extraction status.
    """
    success: bool
    source_id: str
    document_id: Optional[str] = None
    checksum: Optional[str] = None
    total_sections: int = 0
    chunks_generated: int = 0
    chunk_ids: List[str] = Field(default_factory=list)
    is_duplicate: bool = False
    error: Optional[str] = None


class OfficialSourceDefinition(BaseModel):
    """
    Specification for approved official authoritative sources.
    Defines canonical endpoints, jurisdiction, authority metadata, and update rules.
    """
    source_id: str
    title: str
    authority: str
    canonical_url: str
    jurisdiction: str            # "India" or "International"
    country: Optional[str] = None # "India", "Germany", "USA", "UK", etc.
    region: Optional[str] = None  # "India", "EU", "Europe", "North America", "International", "Global"
    applicable_countries: List[str] = Field(default_factory=list)
    source_type: str             # "statute", "treaty", "regulation", "pharmacopoeia", "tkdl_public"
    authority_level: str = "statutory" # "statutory", "regulatory_guideline", "public_pointer"
    enabled: bool = True
    update_strategy: str = "checksum_diff"
    expected_content_type: str = "text/plain"
    version: str = "1.0"
    latest_known_checksum: Optional[str] = None
    last_checked_at: Optional[str] = None
    last_updated_at: Optional[str] = None

ALLOWED_AUTHORITY_DOMAINS = [
    # Indian Government & Statutory IP Portals
    "ipindia.gov.in",
    "indiacode.nic.in",
    "nbaindia.org",
    "cdsco.gov.in",
    "fssai.gov.in",
    "tkdl.res.in",
    "ayush.gov.in",
    "main.sci.gov.in",
    "delhihighcourt.nic.in",
    # International Treaties & Official IP Authorities
    "wipo.int",
    "cbd.int",
    "epo.org",
    "uspto.gov",
    "dpma.de",
    "gesetze-im-internet.de",
    "eur-lex.europa.eu",
    "wto.org",
    "who.int",
    # Local dev test domains
    "localhost",
    "127.0.0.1",
    "testserver"
]

def is_authority_allowed(url: str) -> bool:
    """Validate that a source URL belongs to an approved government or treaty authority."""
    if not url:
        return False
    from urllib.parse import urlparse
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return False
    return any(hostname == domain or hostname.endswith("." + domain) for domain in ALLOWED_AUTHORITY_DOMAINS)

class SourceRegistry:
    """
    Authoritative Legal Source Registry managing metadata, versions, and checksums
    for Indian and International legal corpora (India Code, WIPO, CBD, TKDL Public, DPMA, EPO, USPTO).
    """

    def __init__(self):
        self.sources: Dict[str, LegalSourceMetadata] = {}
        self.source_versions: Dict[str, List[LegalSourceMetadata]] = {} # Immutable historical versions
        self.official_definitions: Dict[str, OfficialSourceDefinition] = {}
        self.documents: Dict[str, SourceDocument] = {}
        self.checksum_to_source_id: Dict[str, str] = {}
        self.checksum_to_document_id: Dict[str, str] = {}
        self.register_authoritative_seed_sources()

    def register_official_definition(self, definition: OfficialSourceDefinition):
        """Register an approved official canonical source definition."""
        self.official_definitions[definition.source_id] = definition

    def list_official_definitions(self, enabled_only: bool = True) -> List[OfficialSourceDefinition]:
        """List all configured official source specifications."""
        if enabled_only:
            return [d for d in self.official_definitions.values() if d.enabled]
        return list(self.official_definitions.values())

    def get_official_definition(self, source_id: str) -> Optional[OfficialSourceDefinition]:
        return self.official_definitions.get(source_id)

    def register_source(self, source: LegalSourceMetadata):
        """Register a source in the official registry and maintain immutable historical versions."""
        self.sources[source.source_id] = source
        if source.checksum:
            self.checksum_to_source_id[source.checksum.lower()] = source.source_id
        
        # Track immutable version history
        history = self.source_versions.setdefault(source.source_id, [])
        if not any(v.version == source.version and v.checksum == source.checksum for v in history):
            history.append(source.model_copy())

    def get_source(self, source_id: str) -> Optional[LegalSourceMetadata]:
        return self.sources.get(source_id)

    def get_source_versions(self, source_id: str) -> List[LegalSourceMetadata]:
        """Return all historical versions registered for a given source_id."""
        return self.source_versions.get(source_id, [])

    def get_by_checksum(self, checksum: str) -> Optional[LegalSourceMetadata]:
        """Lookup legal source by actual document SHA-256 checksum."""
        if not checksum:
            return None
        sid = self.checksum_to_source_id.get(checksum.lower().strip())
        return self.sources.get(sid) if sid else None

    def register_document(self, doc: SourceDocument):
        """Register an ingested raw document and track its SHA-256 checksum."""
        self.documents[doc.document_id] = doc
        if doc.checksum:
            self.checksum_to_document_id[doc.checksum.lower().strip()] = doc.document_id

    def get_document(self, document_id: str) -> Optional[SourceDocument]:
        return self.documents.get(document_id)

    def get_document_by_checksum(self, checksum: str) -> Optional[SourceDocument]:
        """Detect identical document content via byte-level SHA-256 checksum."""
        if not checksum:
            return None
        doc_id = self.checksum_to_document_id.get(checksum.lower().strip())
        return self.documents.get(doc_id) if doc_id else None

    def list_sources(self, jurisdiction: Optional[str] = None) -> List[LegalSourceMetadata]:
        if jurisdiction:
            return [s for s in self.sources.values() if s.jurisdiction.lower() == jurisdiction.lower()]
        return list(self.sources.values())

    def list_documents(self, source_id: Optional[str] = None) -> List[SourceDocument]:
        if source_id:
            return [d for d in self.documents.values() if d.source_id == source_id]
        return list(self.documents.values())

    def register_authoritative_seed_sources(self):
        """Register official seed statutes with full version and metadata tracking."""
        seed_sources = [
            # 1. Patents Act 1970 (India)
            LegalSourceMetadata(
                source_id="SRC_IN_PATENTS_ACT_1970",
                title="The Patents Act, 1970 (India)",
                authority="Parliament of India / Controller General of Patents, Designs and Trade Marks (CGPDTM)",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="statute",
                effective_date="1970-09-19",
                version="Act 39 of 1970 (Amended 2005)",
                amendment_status="Amended by Patents (Amendment) Act 2005 (Sec 3(p) TK & Sec 3(e) Admixture)",
                source_url="https://ipindia.gov.in/patents-act-1970.htm",
                checksum=hashlib.sha256(b"The Patents Act 1970 India").hexdigest(),
                authority_level="statutory"
            ),
            # 2. Biological Diversity Act 2002 (India)
            LegalSourceMetadata(
                source_id="SRC_IN_BD_ACT_2002",
                title="Biological Diversity Act, 2002 (India)",
                authority="National Biodiversity Authority (NBA) / Ministry of Environment, Forest and Climate Change",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="statute",
                effective_date="2002-02-05",
                version="Act 18 of 2003 (Amended 2023)",
                amendment_status="Amended by Biological Diversity (Amendment) Act 2023 (Sec 3 & Sec 6 NBA Approval)",
                source_url="https://nbaindia.org/act/",
                checksum=hashlib.sha256(b"Biological Diversity Act 2002").hexdigest(),
                authority_level="statutory"
            ),
            # 3. Drugs & Cosmetics Act 1940 (India)
            LegalSourceMetadata(
                source_id="SRC_IN_DC_ACT_1940",
                title="The Drugs and Cosmetics Act, 1940 (India)",
                authority="Central Drugs Standard Control Organization (CDSCO) / Ministry of AYUSH",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="statute",
                effective_date="1940-04-10",
                version="Act 23 of 1940 (First Schedule Ayurvedic Texts)",
                amendment_status="Includes Section 3(h) Ayurvedic Patent/Proprietary Definition & First Schedule Texts",
                source_url="https://cdsco.gov.in/opencms/opencms/en/Drugs/Ayush/",
                checksum=hashlib.sha256(b"Drugs and Cosmetics Act 1940").hexdigest(),
                authority_level="statutory"
            ),
            # 4. FSSAI Ayurveda Aahar Regulations 2022 (India)
            LegalSourceMetadata(
                source_id="SRC_IN_FSSAI_AYURVEDA_AAHAR_2022",
                title="Food Safety and Standards (Ayurveda Aahar) Regulations, 2022",
                authority="Food Safety and Standards Authority of India (FSSAI) / Ministry of AYUSH",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="regulation",
                effective_date="2022-05-05",
                version="F. No. Stds/SP-05/Aahar-Reg/FSSAI-2021",
                amendment_status="Schedule A Authoritative Texts & mandatory logo packaging regulations",
                source_url="https://www.fssai.gov.in/notifications.php",
                checksum=hashlib.sha256(b"FSSAI Ayurveda Aahar Regs 2022").hexdigest(),
                authority_level="regulatory_guideline"
            ),
            # 5. Nagoya Protocol 2014 (International)
            LegalSourceMetadata(
                source_id="SRC_INT_NAGOYA_PROTOCOL_2014",
                title="Nagoya Protocol on Access to Genetic Resources and Benefit-Sharing",
                authority="United Nations Convention on Biological Diversity (CBD)",
                jurisdiction="International",
                country=None,
                region="International",
                applicable_countries=[],
                source_type="treaty",
                effective_date="2014-10-12",
                version="UNTS Vol. 3008",
                amendment_status="International treaty on Access and Benefit Sharing (ABS) for genetic resources & TK",
                source_url="https://www.cbd.int/abs/",
                checksum=hashlib.sha256(b"Nagoya Protocol CBD 2014").hexdigest(),
                authority_level="statutory"
            ),
            # 6. WIPO PCT 1970 (International)
            LegalSourceMetadata(
                source_id="SRC_INT_WIPO_PCT_1970",
                title="Patent Cooperation Treaty (PCT / WIPO)",
                authority="World Intellectual Property Organization (WIPO)",
                jurisdiction="International",
                country=None,
                region="International",
                applicable_countries=[],
                source_type="treaty",
                effective_date="1978-01-24",
                version="WIPO Publication 274 (Amended 2001)",
                amendment_status="International Patent System prior-art search framework (Article 15)",
                source_url="https://www.wipo.int/pct/en/",
                checksum=hashlib.sha256(b"WIPO PCT Treaty 1970").hexdigest(),
                authority_level="statutory"
            ),
            # 7. Public TKDL Guidelines & Prior-Art Pointers
            LegalSourceMetadata(
                source_id="SRC_IN_TKDL_PUBLIC_GUIDELINES",
                title="Traditional Knowledge Digital Library (TKDL) Public Access Guidelines",
                authority="Council of Scientific and Industrial Research (CSIR) / Ministry of AYUSH",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="tkdl_public",
                effective_date="2001-02-01",
                version="CSIR-TKDL Public Specification 2022",
                amendment_status="Public prior-art pointers & classical text references (Charaka, Sushruta, Vagbhata)",
                source_url="https://www.tkdl.res.in/",
                checksum=hashlib.sha256(b"TKDL Public Guidelines CSIR").hexdigest(),
                authority_level="public_pointer"
            ),
            # 8. Trade Marks Act 1999 (India Code)
            LegalSourceMetadata(
                source_id="SRC_IN_TRADEMARKS_ACT_1999",
                title="The Trade Marks Act, 1999 (India)",
                authority="Controller General of Patents, Designs and Trade Marks (CGPDTM) / Ministry of Commerce",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="statute",
                effective_date="1999-12-30",
                version="Act 47 of 1999 (Amended 2010)",
                amendment_status="Section 9 Absolute grounds prohibiting generic Ayurvedic terms & Section 11 Relative grounds",
                source_url="https://ipindia.gov.in/trade-marks-act-1999.htm",
                checksum=hashlib.sha256(b"Trade Marks Act 1999 India").hexdigest(),
                authority_level="statutory"
            ),
            # 9. Geographical Indications of Goods Act 1999 (India Code)
            LegalSourceMetadata(
                source_id="SRC_IN_GI_ACT_1999",
                title="Geographical Indications of Goods (Registration & Protection) Act, 1999",
                authority="GI Registry, Chennai / CGPDTM",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="statute",
                effective_date="1999-12-30",
                version="Act 48 of 1999",
                amendment_status="Section 2(1)(e) GI definition for regional Ayurvedic flora & traditional products",
                source_url="https://ipindia.gov.in/gi-act-1999.htm",
                checksum=hashlib.sha256(b"GI Goods Act 1999 India").hexdigest(),
                authority_level="statutory"
            ),
            # 10. Designs Act 2000 (India Code)
            LegalSourceMetadata(
                source_id="SRC_IN_DESIGNS_ACT_2000",
                title="The Designs Act, 2000 (India)",
                authority="Patent Office Design Wing / CGPDTM",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="statute",
                effective_date="2000-05-25",
                version="Act 16 of 2000",
                amendment_status="Section 4 & 5 Protection for novel non-functional Ayurvedic packaging & delivery containers",
                source_url="https://ipindia.gov.in/designs-act-2000.htm",
                checksum=hashlib.sha256(b"Designs Act 2000 India").hexdigest(),
                authority_level="statutory"
            ),
            # 11. Protection of Plant Varieties & Farmers' Rights Act 2001 (India Code)
            LegalSourceMetadata(
                source_id="SRC_IN_PPVFRA_2001",
                title="Protection of Plant Varieties and Farmers' Rights Act, 2001",
                authority="PPV&FRA Authority / Ministry of Agriculture & Farmers Welfare",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="statute",
                effective_date="2001-10-30",
                version="Act 53 of 2001",
                amendment_status="Section 28 registration of novel medicinal plant varieties & Section 30 Gene Fund benefit sharing",
                source_url="https://plantauthority.gov.in/",
                checksum=hashlib.sha256(b"PPVFRA 2001 India").hexdigest(),
                authority_level="statutory"
            ),
            # 12. IP India Patent Examination Guidelines for TK & Bio-Material (ipindia.gov.in)
            LegalSourceMetadata(
                source_id="SRC_IN_IPINDIA_TK_GUIDELINES",
                title="IP India Guidelines for Examination of Patent Applications relating to TK & Biological Material",
                authority="Controller General of Patents, Designs and Trade Marks (CGPDTM)",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="regulation",
                effective_date="2012-12-18",
                version="CGPDTM Examination Manual Version 2.0",
                amendment_status="Detailed examination criteria for Section 3(p) TK rejection & Section 3(e) synergistic data",
                source_url="https://ipindia.gov.in/guidelines-patents.htm",
                checksum=hashlib.sha256(b"IP India TK Examination Guidelines").hexdigest(),
                authority_level="regulatory_guideline"
            ),
            # 13. NBA Access and Benefit Sharing Guidelines & Regulations (nbaindia.org)
            LegalSourceMetadata(
                source_id="SRC_IN_NBA_ABS_GUIDELINES",
                title="National Biodiversity Authority (NBA) Access and Benefit Sharing (ABS) Guidelines",
                authority="National Biodiversity Authority (NBA)",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="regulation",
                effective_date="2014-11-21",
                version="G.S.R. 827(E) (Amended 2023)",
                amendment_status="Form I, Form III, Form IV procedures & benefit sharing percentage slabs (0.1% - 0.5% ex-factory sales)",
                source_url="https://nbaindia.org/abs_guidelines/",
                checksum=hashlib.sha256(b"NBA ABS Guidelines Regulations").hexdigest(),
                authority_level="regulatory_guideline"
            ),
            # 14. Biological Diversity Rules, 2004 (India)
            LegalSourceMetadata(
                source_id="SRC_IN_BD_RULES_2004",
                title="Biological Diversity Rules, 2004 (India)",
                authority="Ministry of Environment, Forest and Climate Change / NBA",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="regulation",
                effective_date="2004-04-15",
                version="G.S.R. 261(E)",
                amendment_status="Rule 14 (Form I), Rule 18 (Form III approval for IP), Rule 19 (Form IV transfer)",
                source_url="https://nbaindia.org/rules_2004/",
                checksum=hashlib.sha256(b"Biological Diversity Rules 2004").hexdigest(),
                authority_level="regulatory_guideline"
            ),
            # 15. The Patents Rules, 2003 (India)
            LegalSourceMetadata(
                source_id="SRC_IN_PATENTS_RULES_2003",
                title="The Patents Rules, 2003 (India)",
                authority="CGPDTM / Ministry of Commerce and Industry",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="regulation",
                effective_date="2003-05-20",
                version="G.S.R. 417(E) (Amended 2024)",
                amendment_status="Rule 13 (Specification), Rule 24B (Examination), Form 18A (Expedited Examination for AYUSH Startups)",
                source_url="https://ipindia.gov.in/patents-rules-2003.htm",
                checksum=hashlib.sha256(b"Patents Rules 2003 India").hexdigest(),
                authority_level="regulatory_guideline"
            ),
            # 16. US Patent Code 35 U.S.C. (United States)
            LegalSourceMetadata(
                source_id="SRC_US_PATENT_CODE_35USC",
                title="United States Patent Code (35 U.S.C. Sections 101, 102, 103)",
                authority="United States Patent and Trademark Office (USPTO)",
                jurisdiction="International",
                country="USA",
                region="North America",
                applicable_countries=["USA", "United States"],
                source_type="statute",
                effective_date="1952-07-19",
                version="35 U.S.C. (Amended 2022)",
                amendment_status="Section 101 Subject Matter Eligibility for Natural Extracts & Section 102 Prior Art",
                source_url="https://www.uspto.gov/patents/laws/title-35-united-states-code",
                checksum=hashlib.sha256(b"US Patent Code 35 USC").hexdigest(),
                authority_level="statutory"
            ),
            # 17. European Patent Convention (EPC / EPO)
            LegalSourceMetadata(
                source_id="SRC_EU_EPC_EPO",
                title="European Patent Convention (EPC Article 52, 54, 56)",
                authority="European Patent Office (EPO)",
                jurisdiction="International",
                country=None,
                region="EU",
                applicable_countries=[
                    "Germany", "France", "UK", "Italy", "Spain", "Netherlands", "Switzerland", "Austria",
                    "Sweden", "Belgium", "Denmark", "Poland", "Ireland", "Portugal", "Finland", "Greece",
                    "Czech Republic", "Hungary", "Romania", "Bulgaria", "Slovakia", "Croatia", "Slovenia"
                ],
                source_type="treaty",
                effective_date="1977-10-05",
                version="EPC 16th Edition",
                amendment_status="Article 52(2) Discoveries vs Inventions & Article 54 Novelty / Prior Art",
                source_url="https://www.epo.org/law-practice/legal-texts/html/epc/2020/e/ar52.html",
                checksum=hashlib.sha256(b"European Patent Convention EPO").hexdigest(),
                authority_level="statutory"
            ),
            # 18. German Patent Act (Patentgesetz - PatG)
            LegalSourceMetadata(
                source_id="SRC_DE_PATENT_ACT_PATG",
                title="German Patent Act (Patentgesetz - PatG)",
                authority="German Patent and Trade Mark Office (DPMA) / Federal Ministry of Justice",
                jurisdiction="International",
                country="Germany",
                region="EU",
                applicable_countries=["Germany"],
                source_type="statute",
                effective_date="1980-12-16",
                version="PatG (Amended 2021)",
                amendment_status="Section 1 (Patentability), Section 1a (Biological discoveries vs technical inventions), Section 2a (Biotechnological inventions & TK prior art)",
                source_url="https://www.gesetze-im-internet.de/patg/",
                checksum=hashlib.sha256(b"German Patent Act PatG DPMA").hexdigest(),
                authority_level="statutory"
            ),
            # 19. Ayurvedic Pharmacopoeia of India (API / AFI)
            LegalSourceMetadata(
                source_id="SRC_IN_AYURVEDIC_PHARMACOPOEIA",
                title="Ayurvedic Pharmacopoeia of India (API) & Ayurvedic Formulary of India (AFI)",
                authority="Pharmacopoeia Commission for Indian Medicine & Homoeopathy (PCIM&H) / Ministry of AYUSH",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="pharmacopoeia",
                effective_date="1989-01-01",
                version="API Volumes I-VI & AFI Parts I-III",
                amendment_status="Official monographs for 600+ single drugs & 1500+ classical compound formulations",
                source_url="https://pcimh.gov.in/",
                checksum=hashlib.sha256(b"Ayurvedic Pharmacopoeia of India API").hexdigest(),
                authority_level="statutory"
            ),
            # 20. Paris Convention 1883 (International)
            LegalSourceMetadata(
                source_id="SRC_INT_PARIS_CONVENTION_1883",
                title="Paris Convention for the Protection of Industrial Property",
                authority="World Intellectual Property Organization (WIPO)",
                jurisdiction="International",
                country=None,
                region="International",
                applicable_countries=[],
                source_type="treaty",
                effective_date="1883-03-20",
                version="Stockholm Revision 1967",
                amendment_status="Article 4 Right of Priority (12-month priority period for international patent filings)",
                source_url="https://www.wipo.int/treaties/en/ip/paris/",
                checksum=hashlib.sha256(b"Paris Convention WIPO 1883").hexdigest(),
                authority_level="statutory"
            ),
            # 21. TRIPS Agreement 1994 (International)
            LegalSourceMetadata(
                source_id="SRC_INT_WTO_TRIPS_1994",
                title="TRIPS Agreement (WTO Trade-Related Aspects of Intellectual Property Rights)",
                authority="World Trade Organization (WTO)",
                jurisdiction="International",
                country=None,
                region="International",
                applicable_countries=[],
                source_type="treaty",
                effective_date="1995-01-01",
                version="Marrakesh Agreement Annex 1C",
                amendment_status="Article 27 Patentable Subject Matter & Article 39 Protection of Undisclosed Information",
                source_url="https://www.wto.org/english/tratop_e/trips_e/trips_e.htm",
                checksum=hashlib.sha256(b"WTO TRIPS Agreement 1994").hexdigest(),
                authority_level="statutory"
            ),
            # 22. Convention on Biological Diversity 1992 (International)
            LegalSourceMetadata(
                source_id="SRC_INT_CBD_1992",
                title="Convention on Biological Diversity (CBD)",
                authority="United Nations Environment Programme (UNEP)",
                jurisdiction="International",
                country=None,
                region="International",
                applicable_countries=[],
                source_type="treaty",
                effective_date="1993-12-29",
                version="Rio Earth Summit Instrument",
                amendment_status="Article 8(j) Traditional Knowledge Preservation & Article 15 Sovereign Access to Genetic Resources",
                source_url="https://www.cbd.int/convention/",
                checksum=hashlib.sha256(b"UN CBD Treaty 1992").hexdigest(),
                authority_level="statutory"
            ),
            # 23. WIPO GRTKF Treaty 2024 (International)
            LegalSourceMetadata(
                source_id="SRC_INT_WIPO_GRTKF_2024",
                title="WIPO Diplomatic Treaty on IP, Genetic Resources and Associated Traditional Knowledge",
                authority="World Intellectual Property Organization (WIPO)",
                jurisdiction="International",
                country=None,
                region="International",
                applicable_countries=[],
                source_type="treaty",
                effective_date="2024-05-24",
                version="WIPO GRATK Final Act 2024",
                amendment_status="Mandatory international patent disclosure of origin for inventions using biological material & TK",
                source_url="https://www.wipo.int/diplomatic-conferences/en/genetic-resources/",
                checksum=hashlib.sha256(b"WIPO GRTKF Treaty 2024").hexdigest(),
                authority_level="statutory"
            ),
            # 24. Budapest Treaty 1977 (International)
            LegalSourceMetadata(
                source_id="SRC_INT_BUDAPEST_TREATY_1977",
                title="Budapest Treaty on the International Recognition of the Deposit of Microorganisms",
                authority="World Intellectual Property Organization (WIPO)",
                jurisdiction="International",
                country=None,
                region="International",
                applicable_countries=[],
                source_type="treaty",
                effective_date="1980-08-19",
                version="WIPO Budapest Treaty 1977",
                amendment_status="International depositary authorities for biological microorganisms & medicinal cell lines",
                source_url="https://www.wipo.int/budapest/en/",
                checksum=hashlib.sha256(b"Budapest Treaty WIPO 1977").hexdigest(),
                authority_level="statutory"
            ),
            # 25. Drugs and Cosmetics Rules 1945 (India)
            LegalSourceMetadata(
                source_id="SRC_IN_DC_RULES_1945",
                title="The Drugs and Cosmetics Rules, 1945 (Schedule T & Rule 158B)",
                authority="Ministry of AYUSH / CDSCO",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="regulation",
                effective_date="1945-12-21",
                version="D&C Rules (Amended 2023)",
                amendment_status="Schedule T Good Manufacturing Practices (GMP) & Rule 158B licensing for Ayurvedic formulations",
                source_url="https://cdsco.gov.in/",
                checksum=hashlib.sha256(b"Drugs and Cosmetics Rules 1945").hexdigest(),
                authority_level="regulatory_guideline"
            ),
            # 26. TKDL Classification Standard (India)
            LegalSourceMetadata(
                source_id="SRC_IN_TKDL_CLASSIFICATION_STANDARD",
                title="TKDL Digital Database Classification Standard (CSIR-AYUSH 2024)",
                authority="CSIR-TKDL / Ministry of AYUSH",
                jurisdiction="India",
                country="India",
                region="India",
                applicable_countries=["India"],
                source_type="tkdl_public",
                effective_date="2024-01-01",
                version="TKDL Specification 2024",
                amendment_status="350,000+ classical formulations categorized under IPC/CPC international patent classifications",
                source_url="https://www.tkdl.res.in/",
                checksum=hashlib.sha256(b"TKDL Classification Standard 2024").hexdigest(),
                authority_level="public_pointer"
            )
        ]

        for src in seed_sources:
            self.register_source(src)
            self.register_official_definition(
                OfficialSourceDefinition(
                    source_id=src.source_id,
                    title=src.title,
                    authority=src.authority,
                    canonical_url=src.source_url,
                    jurisdiction=src.jurisdiction,
                    country=src.country,
                    region=src.region,
                    applicable_countries=src.applicable_countries,
                    source_type=src.source_type,
                    authority_level=src.authority_level,
                    enabled=True,
                    version=src.version,
                    latest_known_checksum=src.checksum,
                    last_checked_at=src.retrieved_at,
                    last_updated_at=src.retrieved_at
                )
            )
        logger.info(f"Registered {len(self.sources)} authoritative seed sources in SourceRegistry.")

source_registry = SourceRegistry()

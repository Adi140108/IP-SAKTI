import os
import json
import math
import logging
from typing import List, Dict, Any, Optional, Set
from datetime import datetime
from app.config import settings
from app.rag.evidence import EvidenceChunk
from app.rag.source_registry import source_registry, LegalSourceMetadata, IngestionResult
from app.rag.ingestion import ingestion_pipeline
from app.rag.embeddings import embeddings_provider

logger = logging.getLogger("IP-SAKTI.VectorStore")

class VectorStoreInterface:
    """
    Persistent & Memory-capable Hybrid Vector Store for Legal & Statutory Evidence.
    Supports persistent disk storage (JSON/Vector index), idempotent ingestion,
    document replacement, BM25 + Cosine similarity, and deterministic country filtering.
    """

    def __init__(self, db_type: Optional[str] = None, persist_path: Optional[str] = None):
        self.db_type = (db_type or settings.VECTOR_DB_TYPE or "memory").strip().lower()
        self.persist_path = persist_path or settings.VECTOR_DB_PERSIST_PATH or "./data/vector_index"
        
        # In-memory indices
        self.chunks: List[EvidenceChunk] = []
        self.chunk_embeddings: List[List[float]] = []
        self.indexed_chunk_keys: Set[str] = set() # (chunk_id:checksum) for idempotency
        self.corpus_status: str = "DEV_SEED_CORPUS"

        self.initialize_store()

    def _get_index_file_path(self) -> str:
        """Resolve full index json file path."""
        if self.persist_path.endswith(".json"):
            return os.path.abspath(self.persist_path)
        return os.path.abspath(os.path.join(self.persist_path, "vector_index.json"))

    def initialize_store(self):
        """Initialize vector store in either persistent or in-memory mode with strict production safeguards."""
        is_production = settings.APP_ENV == "production"

        if is_production:
            # Production requirement: MUST use persistent vector store
            if self.db_type not in ["persistent", "disk"]:
                err = "PRODUCTION_VECTOR_STORE_CONFIG_ERROR: Production environment requires VECTOR_DB_TYPE=persistent and VECTOR_DB_PERSIST_PATH."
                logger.error(err)
                raise RuntimeError(err)

            file_path = self._get_index_file_path()
            dir_name = os.path.dirname(file_path)
            try:
                os.makedirs(dir_name, exist_ok=True)
                test_file = os.path.join(dir_name, ".write_test")
                with open(test_file, "w") as f:
                    f.write("ok")
                if os.path.exists(test_file):
                    os.remove(test_file)
            except Exception as e:
                err = f"PERSISTENT_VECTOR_INIT_FAILURE: Cannot create/access persistent directory {dir_name}: {e}"
                logger.error(err)
                raise RuntimeError(err)

            if os.path.exists(file_path):
                self.load_from_disk(file_path)
                if len(self.chunks) == 0:
                    self.corpus_status = "PRODUCTION_RAG_CORPUS_EMPTY"
                    logger.warning("PRODUCTION_RAG_CORPUS_EMPTY: Production persistent vector index exists but contains 0 chunks.")
                else:
                    self.corpus_status = "OFFICIAL_PRODUCTION_CORPUS"
                    logger.info(f"Loaded {len(self.chunks)} official production chunks from {file_path}")
            else:
                self.chunks = []
                self.chunk_embeddings = []
                self.indexed_chunk_keys = set()
                self.persist(file_path)
                self.corpus_status = "PRODUCTION_RAG_CORPUS_EMPTY"
                logger.warning(f"PRODUCTION_RAG_CORPUS_EMPTY: Initialized new empty persistent vector index at {file_path}. Ingest official corpus before serving queries.")
        else:
            # Development / Test mode
            if self.db_type in ["persistent", "disk"]:
                file_path = self._get_index_file_path()
                dir_name = os.path.dirname(file_path)
                try:
                    os.makedirs(dir_name, exist_ok=True)
                    test_file = os.path.join(dir_name, ".write_test")
                    with open(test_file, "w") as f:
                        f.write("ok")
                    if os.path.exists(test_file):
                        os.remove(test_file)
                except Exception as e:
                    err = f"PERSISTENT_VECTOR_INIT_FAILURE: Cannot create/access persistent directory {dir_name}: {e}"
                    logger.error(err)
                    raise RuntimeError(err)

                if os.path.exists(file_path):
                    self.load_from_disk(file_path)
                    self.corpus_status = "PERSISTENT_CORPUS" if len(self.chunks) > 0 else "PERSISTENT_CORPUS_EMPTY"
                    logger.info(f"Loaded {len(self.chunks)} persistent chunks from {file_path}")
                else:
                    self.chunks = []
                    self.chunk_embeddings = []
                    self.indexed_chunk_keys = set()
                    self.persist(file_path)
                    self.corpus_status = "PERSISTENT_CORPUS_EMPTY"
                    logger.info(f"Initialized new empty persistent vector index at {file_path}")
            else:
                # In-memory development mode: load baseline seed corpus
                self.load_dev_seed_corpus()
                self.corpus_status = "DEV_SEED_CORPUS"
                logger.info(f"Initialized in-memory vector store with {len(self.chunks)} baseline development seed statutory chunks.")

    def persist(self, path: Optional[str] = None):
        """Persist current chunks, embeddings, and metadata to disk."""
        target_file = path or self._get_index_file_path()
        os.makedirs(os.path.dirname(target_file), exist_ok=True)

        payload = {
            "version": "1.0",
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_chunks": len(self.chunks),
            "chunks": [c.model_dump() for c in self.chunks],
            "embeddings": self.chunk_embeddings
        }

        temp_file = target_file + ".tmp"
        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            if os.path.exists(target_file):
                os.remove(target_file)
            os.rename(temp_file, target_file)
            logger.info(f"Persisted {len(self.chunks)} chunks to {target_file}")
        except Exception as e:
            if os.path.exists(temp_file):
                os.remove(temp_file)
            err = f"VECTOR_PERSIST_ERROR: Failed to persist vector index to {target_file}: {e}"
            logger.error(err)
            raise RuntimeError(err)

    def load_from_disk(self, path: Optional[str] = None):
        """Load chunks and embeddings from persistent disk file."""
        target_file = path or self._get_index_file_path()
        if not os.path.exists(target_file):
            return

        try:
            with open(target_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_chunks = data.get("chunks", [])
            raw_embeddings = data.get("embeddings", [])

            self.chunks = [EvidenceChunk(**c) for c in raw_chunks]
            self.chunk_embeddings = raw_embeddings
            self.indexed_chunk_keys = {
                f"{c.chunk_id}:{c.checksum or ''}" for c in self.chunks
            }
        except Exception as e:
            err = f"VECTOR_LOAD_ERROR: Could not load vector index from {target_file}: {e}"
            logger.error(err)
            raise RuntimeError(err)

    def add_chunks(self, chunks: List[EvidenceChunk]) -> int:
        """
        Idempotently add new chunks to the vector store.
        Calculates embeddings and persists to disk if persistent mode is active.
        """
        added_count = 0
        for chunk in chunks:
            key = f"{chunk.chunk_id}:{chunk.checksum or ''}"
            if key in self.indexed_chunk_keys:
                # Already indexed with same checksum (idempotent)
                continue

            vec = embeddings_provider.generate_embedding(chunk.text)
            self.chunks.append(chunk)
            self.chunk_embeddings.append(vec)
            self.indexed_chunk_keys.add(key)
            added_count += 1

        if added_count > 0 and self.db_type in ["persistent", "disk"]:
            self.persist()

        return added_count
        
    def ingest_source_chunks(self, chunks: List[EvidenceChunk]) -> int:
        """Alias for add_chunks."""
        return self.add_chunks(chunks)

    def delete_by_document_id(self, document_id: str) -> int:
        """Delete all indexed chunks associated with a specific document_id."""
        if not document_id:
            return 0

        initial_len = len(self.chunks)
        keep_indices = [
            i for i, c in enumerate(self.chunks) if c.document_id != document_id
        ]

        self.chunks = [self.chunks[i] for i in keep_indices]
        self.chunk_embeddings = [self.chunk_embeddings[i] for i in keep_indices]
        self.indexed_chunk_keys = {
            f"{c.chunk_id}:{c.checksum or ''}" for c in self.chunks
        }

        deleted_count = initial_len - len(self.chunks)
        if deleted_count > 0 and self.db_type in ["persistent", "disk"]:
            self.persist()

        logger.info(f"Deleted {deleted_count} chunks for document_id '{document_id}'")
        return deleted_count

    def delete_by_source_id(self, source_id: str) -> int:
        """Delete all indexed chunks associated with a source_id."""
        if not source_id:
            return 0

        initial_len = len(self.chunks)
        keep_indices = [
            i for i, c in enumerate(self.chunks) if c.source_id != source_id
        ]

        self.chunks = [self.chunks[i] for i in keep_indices]
        self.chunk_embeddings = [self.chunk_embeddings[i] for i in keep_indices]
        self.indexed_chunk_keys = {
            f"{c.chunk_id}:{c.checksum or ''}" for c in self.chunks
        }

        deleted_count = initial_len - len(self.chunks)
        if deleted_count > 0 and self.db_type in ["persistent", "disk"]:
            self.persist()

        logger.info(f"Deleted {deleted_count} chunks for source_id '{source_id}'")
        return deleted_count

    def ingest_document(
        self,
        source: LegalSourceMetadata,
        raw_bytes: bytes,
        content_type: str = "text/plain",
        storage_ref: Optional[str] = None
    ) -> IngestionResult:
        """
        Complete lifecycle: Ingest raw bytes -> compute SHA-256 -> chunk -> index embeddings -> persist.
        """
        res = ingestion_pipeline.ingest_document_bytes(
            source=source,
            raw_bytes=raw_bytes,
            content_type=content_type,
            storage_ref=storage_ref
        )

        if not res.success:
            return res

        if res.is_duplicate:
            # Already indexed and identical
            return res

        # Generate fresh chunks from parsed sections
        parsed_sections = ingestion_pipeline.parse_document_text(raw_bytes, content_type=content_type)
        chunks = ingestion_pipeline.process_and_chunk_source(
            source=source,
            raw_text_sections=parsed_sections,
            document_id=res.document_id,
            checksum=res.checksum
        )

        self.add_chunks(chunks)
        return res

    def load_dev_seed_corpus(self):
        """Loads and ingests baseline development seed legal chunks. STRICTLY FORBIDDEN IN PRODUCTION."""
        if settings.APP_ENV == "production":
            err = "FORBIDDEN_DEV_SEED_IN_PRODUCTION: Cannot load hardcoded dev seed corpus in production environment."
            logger.error(err)
            raise RuntimeError(err)

        self.chunks.clear()
        self.chunk_embeddings.clear()
        self.indexed_chunk_keys.clear()

        # Baseline seed corpora
        statutory_corpus = {
            "SRC_IN_PATENTS_ACT_1970": [
                {
                    "section": "Section 3(p)",
                    "content": "Section 3(p) of the Patents Act 1970 excludes an invention which in effect is traditional knowledge or which is an aggregation or duplication of known properties of traditionally known component or components from patentability."
                },
                {
                    "section": "Section 3(e)",
                    "content": "Section 3(e) of the Patents Act 1970 excludes a substance obtained by a mere admixture resulting only in the aggregation of the properties of the components thereof or a process for producing such substance from patentability unless synergistic efficacy is proven."
                },
                {
                    "section": "Section 10(4)",
                    "content": "Section 10(4) of the Patents Act 1970 mandates that if the complete specification mentions a biological material used in an invention, the applicant must disclose the source and geographical origin of the biological material obtained from India."
                },
                {
                    "section": "Section 2(1)(j)",
                    "content": "Section 2(1)(j) defines an invention as a new product or process involving an inventive step and capable of industrial application, requiring a technical advance compared to existing traditional knowledge prior art."
                }
            ],
            "SRC_IN_BD_ACT_2002": [
                {
                    "section": "Section 6",
                    "content": "Section 6 of the Biological Diversity Act 2002 mandates that no person shall apply for any intellectual property right in or outside India for any invention based on any research or information on a biological resource obtained from India without obtaining prior approval of the National Biodiversity Authority (NBA)."
                },
                {
                    "section": "Section 3",
                    "content": "Section 3 of the Biological Diversity Act 2002 requires non-citizens, NRIs, and foreign bodies corporate to obtain prior NBA approval before accessing biological resources or associated traditional knowledge for research or commercial utilization."
                },
                {
                    "section": "Section 7 & 19",
                    "content": "Section 7 & 19 require Indian citizens and local entities to give prior intimation to the State Biodiversity Board (SBB) before accessing biological resources for commercial utilization, subject to NBA Form I/Form III regulations."
                }
            ],
            "SRC_IN_DC_ACT_1940": [
                {
                    "section": "Section 3(h)",
                    "content": "Section 3(h) of Drugs and Cosmetics Act 1940 defines Patent or Proprietary medicine in relation to Ayurvedic systems to include formulations containing ingredients mentioned in the First Schedule authoritative texts, administered via non-parenteral routes."
                },
                {
                    "section": "Rule 158B & First Schedule",
                    "content": "Rule 158B of Drugs and Cosmetics Rules 1945 details proof of safety and effectiveness required for licensing patent or proprietary Ayurvedic drugs, distinguishing classical formulations from modified proprietary extracts."
                }
            ],
            "SRC_IN_TRADEMARKS_ACT_1999": [
                {
                    "section": "Section 9 (Absolute Grounds)",
                    "content": "Section 9 of the Trade Marks Act 1999 prohibits registration of trade marks which consist exclusively of marks or indications designating the kind, quality, or generic traditional names (e.g. Churnam, Taila, Kashayam, Bhasma) of Ayurvedic goods."
                },
                {
                    "section": "Section 11 (Relative Grounds)",
                    "content": "Section 11 prohibits trade mark registration if it causes a likelihood of confusion with an earlier trade mark or well-known Ayurvedic brand in India."
                }
            ],
            "SRC_IN_GI_ACT_1999": [
                {
                    "section": "Section 2(1)(e) & Section 9",
                    "content": "Section 2(1)(e) & 9 of the Geographical Indications of Goods Act 1999 define GI protection for traditional regional flora and Ayurvedic goods (e.g. Navara Rice, Kangra Tea) originating from specific geographical territories in India."
                }
            ],
            "SRC_IN_DESIGNS_ACT_2000": [
                {
                    "section": "Section 4 & Section 5",
                    "content": "Section 4 & 5 of the Designs Act 2000 provide industrial design registration for novel, non-functional visual shapes, packaging, and delivery containers of Ayurvedic formulations."
                }
            ],
            "SRC_IN_PPVFRA_2001": [
                {
                    "section": "Section 28 & Section 30",
                    "content": "Section 28 & 30 of PPV&FRA 2001 govern the registration of novel medicinal plant varieties and mandatory contribution to the National Gene Fund for benefit sharing with local farmers."
                }
            ],
            "SRC_IN_IPINDIA_TK_GUIDELINES": [
                {
                    "section": "CGPDTM Examination Manual",
                    "content": "IP India Guidelines for Examination of Patent Applications relating to Traditional Knowledge mandate that combinations of known plants with known therapeutic effects are non-patentable under Section 3(e) and 3(p) unless synergistic quantitative efficacy is demonstrated via pharmacological assay data."
                }
            ],
            "SRC_IN_NBA_ABS_GUIDELINES": [
                {
                    "section": "Regulation 2 & 3",
                    "content": "Regulation 2 & 3 of NBA ABS Guidelines define benefit-sharing percentages for commercial utilization of biological resources: 0.1% to 0.5% of ex-factory sale price, or 3.0% to 5.0% of upfront fee received for transfer of IP rights."
                }
            ],
            "SRC_IN_FSSAI_AYURVEDA_AAHAR_2022": [
                {
                    "section": "Regulation 3 & Schedule A",
                    "content": "Regulation 3 of FSSAI (Ayurveda Aahar) Regulations 2022 defines Ayurveda Aahar as food prepared in accordance with recipes or processes described in the authoritative books of Ayurveda listed in Schedule A. Formulations must display the official Ayurveda Aahar logo and cannot claim synthetic medicinal drug efficacy."
                }
            ],
            "SRC_INT_NAGOYA_PROTOCOL_2014": [
                {
                    "article": "Article 5 & 6",
                    "content": "Article 5 & 6 of the Nagoya Protocol obligates contracting parties to take legislative measures for fair and equitable benefit-sharing arising from genetic resources and traditional knowledge associated with genetic resources."
                }
            ],
            "SRC_INT_WIPO_PCT_1970": [
                {
                    "article": "Article 15",
                    "content": "Article 15 of the Patent Cooperation Treaty (PCT) mandates international prior art searching, consisting of everything made available to the public anywhere in the world by written disclosure prior to the filing date."
                }
            ],
            "SRC_IN_TKDL_PUBLIC_GUIDELINES": [
                {
                    "section": "Public Prior Art Pointers",
                    "content": "The Traditional Knowledge Digital Library (TKDL) translates classical Ayurvedic text disclosures into international patent classification standards. Public prior art pointers provide verifiable citations to classical texts (Charaka Samhita, Sushruta Samhita, Astanga Hridaya) to establish prior art under Section 3(p)."
                }
            ],
            "SRC_IN_BD_RULES_2004": [
                {
                    "section": "Rule 14 & Rule 18",
                    "content": "Rule 14 (Form I) specifies the procedure for accessing biological resources and associated traditional knowledge. Rule 18 (Form III) mandates prior approval of the National Biodiversity Authority before applying for any intellectual property right inside or outside India for biological resources obtained from India."
                }
            ],
            "SRC_IN_PATENTS_RULES_2003": [
                {
                    "section": "Rule 13 & Form 18A",
                    "content": "Rule 13 of Patents Rules 2003 governs specification requirements for biological material origin disclosures. Form 18A provides expedited examination of patent applications for recognized AYUSH startups and small enterprises."
                }
            ],
            "SRC_US_PATENT_CODE_35USC": [
                {
                    "section": "35 U.S.C. Section 101 & 102",
                    "content": "35 U.S.C. 101 excludes naturally occurring biological compositions from patent eligibility unless significantly modified. 35 U.S.C. 102 establishes prior art rejection for public disclosures, printed publications, and TKDL classical text citations worldwide."
                }
            ],
            "SRC_EU_EPC_EPO": [
                {
                    "article": "Article 52 & Article 54",
                    "content": "Article 52(2)(a) of the European Patent Convention excludes mere discoveries of natural substances from patentability. Article 54 defines state of the art as anything made available to the public by means of written or oral description anywhere in the world before European filing date."
                }
            ],
            "SRC_DE_PATENT_ACT_PATG": [
                {
                    "section": "Section 1 & 1a PatG",
                    "content": "Section 1 of the German Patent Act (Patentgesetz - PatG) grants patents for inventions in all fields of technology that are new, involve an inventive step, and are susceptible of industrial application. Section 1a provides that the human body and simple discoveries of natural elements or substances are not patentable, whereas an element isolated from its natural environment or technically produced may constitute a patentable invention."
                },
                {
                    "section": "Section 2a PatG",
                    "content": "Section 2a of the German Patent Act excludes plant and animal varieties and essentially biological processes from patentability, while allowing biotechnological inventions concerning biological material if technical feasibility is not confined to a specific variety, subject to EU Directive 98/44/EC and prior art disclosures."
                }
            ],
            "SRC_IN_AYURVEDIC_PHARMACOPOEIA": [
                {
                    "section": "Monographs & Quality Standards",
                    "content": "The Ayurvedic Pharmacopoeia of India (API) sets official legal quality and identity standards for 600+ single herbal drugs and 1500+ classical compound formulations under the Drugs and Cosmetics Act 1940."
                }
            ],
            "SRC_INT_PARIS_CONVENTION_1883": [
                {
                    "article": "Article 4 (Right of Priority)",
                    "content": "Article 4 of the Paris Convention grants applicants a 12-month right of priority from the initial domestic filing date (e.g. Indian Patent Office filing) to file corresponding patent applications in any member country worldwide."
                }
            ],
            "SRC_INT_WTO_TRIPS_1994": [
                {
                    "article": "Article 27 & Article 39",
                    "content": "Article 27 of the TRIPS Agreement provides that patents shall be available for any inventions, whether products or processes, in all fields of technology, provided that they are new, involve an inventive step and are capable of industrial application. Article 39 protects undisclosed proprietary formulation know-how and trade secrets."
                }
            ],
            "SRC_INT_CBD_1992": [
                {
                    "article": "Article 8(j) & Article 15",
                    "content": "Article 8(j) of the Convention on Biological Diversity (CBD) requires contracting parties to respect, preserve and maintain knowledge, innovations and practices of indigenous and local communities. Article 15 recognizes sovereign rights of states over their natural resources and mandates prior informed consent and mutually agreed terms for access."
                }
            ],
            "SRC_INT_WIPO_GRTKF_2024": [
                {
                    "article": "Article 3 (Mandatory Patent Disclosure)",
                    "content": "Article 3 of the WIPO Diplomatic Treaty on IP, Genetic Resources and Associated Traditional Knowledge (2024) establishes a mandatory international patent disclosure requirement: patent applications claiming inventions based on genetic resources and associated traditional knowledge must disclose the country of origin or indigenous source."
                }
            ],
            "SRC_INT_BUDAPEST_TREATY_1977": [
                {
                    "article": "Article 3 & 7",
                    "content": "Article 3 of the Budapest Treaty establishes that the deposit of a biological microorganism or cell line with an International Depositary Authority (IDA) suffices for the purposes of patent procedure before the national patent offices of all contracting states."
                }
            ],
            "SRC_GB_PATENTS_ACT_1977": [
                {
                    "section": "Section 1 & Section 14",
                    "content": "Section 1 of the UK Patents Act 1977 sets out patentability requirements (novelty, inventive step, industrial application). Inventions derived from biological material must satisfy UK Nagoya Protocol Due Diligence Regulations 2015."
                }
            ],
            "SRC_JP_PATENT_ACT": [
                {
                    "section": "Section 29(1) & 29(2)",
                    "content": "Section 29 of the Japan Patent Act governs novelty and inventive step. Under JPO Examination Guidelines for Kampo and Traditional Medicines, combinations of known natural ingredients must demonstrate non-obvious synergistic therapeutic efficacy over classical literature."
                }
            ],
            "SRC_AU_PATENTS_ACT_1990": [
                {
                    "section": "Section 18 & EPBC Act",
                    "content": "Section 18 of the Australian Patents Act 1990 requires a manner of manufacture involving an inventive step. Access to native biological resources requires compliance with the Environment Protection and Biodiversity Conservation Act 1999 (EPBC Act) benefit-sharing rules."
                }
            ],
            "SRC_CN_PATENT_LAW": [
                {
                    "section": "Article 25 & Article 26(5)",
                    "content": "Article 25 of the Chinese Patent Law excludes scientific discoveries from patentability. Article 26(5) mandates that for inventions relying on genetic resources, applicants must disclose the direct and original source; patents will not be granted if acquisition or utilization violated relevant laws."
                }
            ]
        }

        for source_id, raw_sections in statutory_corpus.items():
            src = source_registry.get_source(source_id)
            if src:
                ingested = ingestion_pipeline.process_and_chunk_source(src, raw_sections)
                for chunk in ingested:
                    self.chunks.append(chunk)
                    vec = embeddings_provider.generate_embedding(chunk.text)
                    self.chunk_embeddings.append(vec)
                    self.indexed_chunk_keys.add(f"{chunk.chunk_id}:{chunk.checksum or ''}")

        self.corpus_status = "DEV_SEED_CORPUS"
        logger.info(f"Loaded {len(self.chunks)} development seed chunks into VectorStore.")

    def load_registered_statutory_chunks(self):
        """Backward-compatible alias for load_dev_seed_corpus. Marked DEV ONLY."""
        return self.load_dev_seed_corpus()

    def get_corpus_inspection_summary(self) -> Dict[str, Any]:
        """
        Inspectable corpus summary for diagnostics and sources UI.
        Distinguishes OFFICIAL_PRODUCTION_CORPUS vs DEV_SEED_CORPUS.
        """
        source_ids = sorted(list({c.source_id for c in self.chunks if c.source_id}))
        doc_ids = sorted(list({c.document_id for c in self.chunks if c.document_id}))
        countries = sorted(list({c.country for c in self.chunks if c.country}))
        jurisdictions = sorted(list({c.jurisdiction for c in self.chunks if c.jurisdiction}))
        checksums = sorted(list({c.checksum for c in self.chunks if c.checksum}))
        versions = sorted(list({c.version for c in self.chunks if c.version}))
        source_titles = sorted(list({c.title for c in self.chunks if c.title}))
        retrieved_dates = sorted(list({c.retrieved_at for c in self.chunks if c.retrieved_at}))

        mode = getattr(self, "corpus_status", "DEV_SEED_CORPUS")
        return {
            "corpus_mode": mode,
            "is_production": settings.APP_ENV == "production",
            "db_type": self.db_type,
            "persist_path": self.persist_path if self.db_type in ["persistent", "disk"] else None,
            "total_chunks": len(self.chunks),
            "total_documents": len(doc_ids),
            "source_count": len(source_ids),
            "source_ids": source_ids,
            "source_titles": source_titles,
            "jurisdictions": jurisdictions,
            "countries": countries,
            "versions": versions,
            "checksums": checksums,
            "retrieved_at": retrieved_dates,
            "status": "READY" if len(self.chunks) > 0 else "EMPTY"
        }

    def is_source_applicable(
        self,
        chunk: EvidenceChunk,
        target_jurisdiction: str = "India",
        target_country: Optional[str] = None
    ) -> bool:
        """
        Determines whether a legal source chunk is legally applicable to the target jurisdiction and country.
        """
        norm_jur = (target_jurisdiction or "India").strip().lower()
        norm_country = (target_country or "").strip().lower() if target_country else None
        if norm_country in ["", "none", "null", "global", "unknown", "unspecified"]:
            norm_country = None

        chunk_jur = (chunk.jurisdiction or "").strip().lower()
        chunk_country = (chunk.country or "").strip().lower() if chunk.country else None
        chunk_region = (chunk.region or "").strip().lower() if chunk.region else None
        chunk_applicable = [c.lower() for c in (chunk.applicable_countries or [])]
        chunk_type = (chunk.source_type or "").strip().lower()

        # 1. India Domestic Jurisdiction
        if norm_jur == "india":
            # Allow India-specific statutory sources
            if chunk_jur == "india" or chunk_country == "india":
                return True
            # Allow international treaties applicable to India
            if chunk_type == "treaty" or chunk_region in ["international", "global"]:
                return True
            # Disallow foreign country domestic statutes (e.g. US 35 USC or German PatG)
            return False

        # 2. International Jurisdiction
        if norm_jur == "international":
            # Disallow pure Indian domestic statutes/guidelines unless international treaty
            if chunk_jur == "india" and chunk_type not in ["treaty"]:
                return False

            # If specific target country is given (e.g., Germany, USA, UK)
            if norm_country:
                # Direct country match
                if chunk_country and chunk_country == norm_country:
                    return True

                # Direct list of applicable countries (e.g. Germany in EPC)
                if norm_country in chunk_applicable:
                    return True

                # Regional applicability (e.g. Germany in EU/Europe)
                eu_countries = [
                    "germany", "france", "uk", "italy", "spain", "netherlands", "switzerland",
                    "austria", "sweden", "belgium", "denmark", "poland", "ireland", "portugal",
                    "finland", "greece", "czech republic", "hungary", "romania", "bulgaria",
                    "slovakia", "croatia", "slovenia", "eu", "europe"
                ]
                if norm_country in eu_countries and chunk_region in ["eu", "europe", "european union"]:
                    return True

                # Genuinely International Treaties & Global Regimes (WIPO PCT, Nagoya Protocol, TRIPS, CBD, etc.)
                if chunk_type == "treaty" or chunk_region in ["international", "global"]:
                    return True

                # Mismatched foreign domestic law (e.g. US 35 USC for Germany, or German PatG for USA)
                if chunk_country and chunk_country != norm_country:
                    return False

                return False

            # If target country is unknown / unspecified
            else:
                # Allow genuinely international treaties and global regimes
                if chunk_type == "treaty" or chunk_region in ["international", "global"]:
                    return True
                # Disallow country-specific domestic statutes when no country is specified
                return False

        return True

    def search_chunks(
        self,
        query: str,
        jurisdiction: str = "India",
        country: Optional[str] = None,
        ip_domains: List[str] = None,
        source_types: List[str] = None,
        top_k: int = 4
    ) -> List[EvidenceChunk]:
        """Execute hybrid search (BM25 keyword + cosine similarity) filtered by jurisdiction and country."""
        if not self.chunks:
            return []

        query_vec = embeddings_provider.generate_embedding(query)
        query_words = set(query.lower().split())
        scored_results = []

        for idx, chunk in enumerate(self.chunks):
            # 1. Jurisdiction & Country Metadata Applicability Filter
            if not self.is_source_applicable(chunk, target_jurisdiction=jurisdiction, target_country=country):
                continue

            # Calculate BM25 keyword score
            chunk_words = set(chunk.text.lower().split())
            intersection = query_words.intersection(chunk_words)
            bm25_score = len(intersection) / math.sqrt(len(query_words) * len(chunk_words) + 1.0) if chunk_words else 0.0

            # Calculate Cosine Vector score
            cosine_score = embeddings_provider.compute_cosine_similarity(query_vec, self.chunk_embeddings[idx])

            # Section, article, and title boost
            boost = 0.0
            if any(w in chunk.title.lower() for w in query_words):
                boost += 0.3
            if chunk.section and any(w in chunk.section.lower() for w in query_words):
                boost += 0.3
            if chunk.article and any(w in chunk.article.lower() for w in query_words):
                boost += 0.3

            # Country-specific relevance boost
            norm_country = (country or "").strip().lower()
            if norm_country and norm_country not in ["", "none", "null", "global", "unknown"]:
                if chunk.country and chunk.country.lower() == norm_country:
                    boost += 0.25
                elif norm_country in [c.lower() for c in (chunk.applicable_countries or [])]:
                    boost += 0.20
                elif chunk.source_type == "treaty" or (chunk.region and chunk.region.lower() in ["international", "global"]):
                    boost += 0.18
            elif jurisdiction.lower() == "international" and (chunk.source_type == "treaty" or (chunk.region and chunk.region.lower() in ["international", "global"])):
                boost += 0.20

            final_score = (0.5 * bm25_score) + (0.3 * cosine_score) + boost

            scored_results.append((chunk, final_score))

        scored_results.sort(key=lambda x: x[1], reverse=True)
        top_chunks = []
        for chunk, score in scored_results[:top_k]:
            chunk_copy = chunk.model_copy()
            chunk_copy.relevance_score = round(score, 4)
            top_chunks.append(chunk_copy)

        return top_chunks

vector_store = VectorStoreInterface()

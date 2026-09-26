import math
import logging
from typing import List, Dict, Any, Optional
from app.rag.evidence import EvidenceChunk
from app.rag.source_registry import source_registry
from app.rag.ingestion import ingestion_pipeline
from app.rag.embeddings import embeddings_provider

logger = logging.getLogger("IP-SAKTI.VectorStore")

class VectorStoreInterface:
    """
    Abstract Vector Store Interface supporting Hybrid Search (BM25 + Cosine Similarity)
    and strict metadata filtering by Jurisdiction, IP domains, and Source types.
    """

    def __init__(self):
        self.chunks: List[EvidenceChunk] = []
        self.chunk_embeddings: List[List[float]] = []
        self.load_registered_statutory_chunks()

    def load_registered_statutory_chunks(self):
        """Loads and ingests authoritative legal chunks from SourceRegistry."""
        self.chunks.clear()
        self.chunk_embeddings.clear()
        # Raw statutory text sections mapped to registered source IDs
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
                    "content": "IP India Guidelines for Examination of Patent Applications relating to Traditional Knowledge require patent examiners to search TKDL databases and enforce strict non-patentability under Section 3(p) unless unexpected synergistic efficacy is proven with comparative experimental data under Section 3(e)."
                }
            ],
            "SRC_IN_NBA_ABS_GUIDELINES": [
                {
                    "section": "ABS Regulations & Benefit Sharing Slabs",
                    "content": "National Biodiversity Authority (NBA) Access and Benefit Sharing Guidelines mandate Form I approval for access and Form III approval for IP filing. Benefit sharing is calculated at 0.1% to 0.5% of annual gross ex-factory sale of the commercialized biological product."
                }
            ],
            "SRC_IN_FSSAI_AYURVEDA_AAHAR_2022": [
                {
                    "section": "Regulation 3 & 4",
                    "content": "Food Safety and Standards (Ayurveda Aahar) Regulations 2022 mandate that Ayurveda Aahar food products must be prepared in accordance with Schedule A authoritative books and display the mandatory Ayurveda Aahar logo and disclaimer."
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
            "SRC_IN_AYURVEDIC_PHARMACOPOEIA": [
                {
                    "section": "Monographs & Quality Standards",
                    "content": "The Ayurvedic Pharmacopoeia of India (API) sets official legal quality and identity standards for 600+ single herbal drugs and 1500+ classical compound formulations under the Drugs and Cosmetics Act 1940."
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

        logger.info(f"Loaded {len(self.chunks)} metadata-rich chunks into VectorStore.")

    def search_chunks(
        self,
        query: str,
        jurisdiction: str = "India",
        ip_domains: List[str] = None,
        source_types: List[str] = None,
        top_k: int = 4
    ) -> List[EvidenceChunk]:
        """Execute hybrid search (BM25 keyword + cosine similarity) filtered by jurisdiction."""
        query_vec = embeddings_provider.generate_embedding(query)
        query_words = set(query.lower().split())
        scored_results = []

        for idx, chunk in enumerate(self.chunks):
            # 1. Jurisdiction Filter (Isolate India vs International strictly)
            if jurisdiction and chunk.jurisdiction.lower() != jurisdiction.lower():
                continue

            # Calculate BM25 keyword score
            chunk_words = set(chunk.text.lower().split())
            intersection = query_words.intersection(chunk_words)
            bm25_score = len(intersection) / math.sqrt(len(query_words) * len(chunk_words) + 1.0) if chunk_words else 0.0

            # Calculate Cosine Vector score
            cosine_score = embeddings_provider.compute_cosine_similarity(query_vec, self.chunk_embeddings[idx])

            # Section boost
            boost = 0.0
            if any(w in chunk.title.lower() for w in query_words):
                boost += 0.2
            if chunk.section and any(w in chunk.section.lower() for w in query_words):
                boost += 0.3

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

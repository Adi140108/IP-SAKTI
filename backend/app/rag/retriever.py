import logging
from typing import List, Dict, Any
from app.rag.query_planner import QueryPlan, query_planner
from app.rag.vector_store import vector_store
from app.rag.reranker import evidence_reranker
from app.rag.evidence import EvidenceContext, EvidenceChunk
from app.case.models import CaseState

logger = logging.getLogger("IP-SAKTI.Retriever")

class RAGRetriever:
    """
    RAG Retriever orchestrating Query Planning, Vector Search, Reranking,
    and EvidenceContext object assembly.
    """

    async def retrieve_evidence(self, query: str, jurisdiction: str = "India", ip_domains: List[str] = None, top_k: int = 3) -> EvidenceContext:
        """Direct evidence retrieval for escalation dossiers or standalone queries."""
        raw_chunks = vector_store.search_chunks(
            query=query,
            jurisdiction=jurisdiction,
            ip_domains=ip_domains,
            top_k=top_k
        )
        reranked = evidence_reranker.rerank_evidence(raw_chunks, query)
        sources_meta = [{
            "source_id": c.source_id,
            "title": c.title,
            "authority": c.authority,
            "section": c.section,
            "jurisdiction": c.jurisdiction,
            "version": c.version,
            "source_url": c.source_url
        } for c in reranked]
        top_score = reranked[0].relevance_score if reranked else 0.0
        return EvidenceContext(
            selected_chunks=reranked,
            source_metadata=sources_meta,
            top_relevance_score=top_score,
            authority_level="statutory",
            jurisdiction=jurisdiction,
            version="Current"
        )

    async def execute_rag_pipeline(self, user_query: str, case_state: CaseState) -> EvidenceContext:
        """Execute full RAG retrieval pipeline and return EvidenceContext object."""
        # 1. Query Planning
        plan: QueryPlan = await query_planner.plan_query(user_query, case_state)
        logger.info(f"Query Plan constructed for jurisdiction={plan.jurisdiction}, domains={plan.ip_domains}")

        # 2. Vector Search with Metadata Filtering
        search_query = f"{user_query} {' '.join(plan.search_terms)}"
        raw_chunks: List[EvidenceChunk] = vector_store.search_chunks(
            query=search_query,
            jurisdiction=plan.jurisdiction,
            ip_domains=plan.ip_domains,
            source_types=plan.source_types,
            top_k=4
        )

        # 3. Reranking
        reranked_chunks: List[EvidenceChunk] = evidence_reranker.rerank_evidence(raw_chunks, user_query)

        if not reranked_chunks:
            return EvidenceContext(
                selected_chunks=[],
                source_metadata=[],
                top_relevance_score=0.0,
                authority_level="none",
                jurisdiction=plan.jurisdiction,
                version="N/A",
                source_url=""
            )

        top_score = reranked_chunks[0].relevance_score if reranked_chunks else 0.0
        sources_meta = []
        for c in reranked_chunks:
            sources_meta.append({
                "source_id": c.source_id,
                "title": c.title,
                "authority": c.authority,
                "section": c.section,
                "jurisdiction": c.jurisdiction,
                "version": c.version,
                "source_url": c.source_url
            })

        return EvidenceContext(
            selected_chunks=reranked_chunks,
            source_metadata=sources_meta,
            top_relevance_score=top_score,
            authority_level="statutory",
            jurisdiction=plan.jurisdiction,
            version=reranked_chunks[0].version if reranked_chunks else "Current",
            source_url=reranked_chunks[0].source_url if reranked_chunks else ""
        )

rag_retriever = RAGRetriever()

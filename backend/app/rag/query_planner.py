import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from app.ai.gemma.provider import gemma_provider
from app.case.models import CaseState

logger = logging.getLogger("IP-SAKTI.QueryPlanner")

class QueryPlan(BaseModel):
    jurisdiction: str                  # "India" or "International"
    country: Optional[str] = None      # e.g., "Germany", "USA", "EU"
    ip_domains: List[str] = Field(default_factory=list)
    formulation_category: str = "unknown"
    regulatory_domain: Optional[str] = None
    search_terms: List[str] = Field(default_factory=list)
    source_types: List[str] = Field(default_factory=list)

class QueryPlanner:
    """
    RAG Query Planner determining jurisdiction, target country, IP domains, and search terms
    BEFORE executing statutory vector search.
    """

    async def plan_query(self, user_query: str, case_state: CaseState) -> QueryPlan:
        """Construct structured QueryPlan from user query and cumulative CaseState."""
        prompt = f"""
Analyze the legal RAG query in the context of an Ayurvedic IP consultation.

User Query: "{user_query}"
Current Case State:
- Jurisdiction: {case_state.jurisdiction} ({case_state.country or 'India'})
- Product Type: {case_state.product_type or 'Unknown'}
- Formulation Category: {case_state.formulation_classification}
- Stated IP Objectives: {', '.join(case_state.intellectual_property_objective) if case_state.intellectual_property_objective else 'Unspecified'}

Task:
Formulate an optimized statutory retrieval Query Plan.
Determine:
1. jurisdiction: "India" or "International"
2. country: Specific target country (e.g., "Germany", "USA") if International, else null
3. ip_domains: List from ["patent", "trademark", "gi", "copyright", "design", "plant_variety", "trade_secret", "tkdl_prior_art", "abs", "regulatory"]
4. search_terms: List of specific key terms (e.g. "Section 3(p)", "admixture", "prior approval", "Ayurveda Aahar")
5. source_types: List from ["statute", "treaty", "regulation", "tkdl_public"]

Return ONLY JSON:
{{
  "jurisdiction": "{case_state.jurisdiction}",
  "country": {f'"{case_state.country}"' if case_state.country else "null"},
  "ip_domains": ["patent", "abs"],
  "formulation_category": "{case_state.formulation_classification}",
  "search_terms": ["Section 3(p)", "traditional knowledge", "synergistic efficacy"],
  "source_types": ["statute", "regulation"]
}}
"""
        system_prompt = "You are a legal RAG query planning engine specializing in IP law and Ayurvedic regulation."

        try:
            res = await gemma_provider.generate_structured_json(prompt, system_prompt)
            return QueryPlan(
                jurisdiction=res.get("jurisdiction", case_state.jurisdiction),
                country=res.get("country", case_state.country),
                ip_domains=res.get("ip_domains", case_state.intellectual_property_objective or ["patent", "regulatory"]),
                formulation_category=res.get("formulation_category", case_state.formulation_classification),
                search_terms=res.get("search_terms", user_query.split()[:5]),
                source_types=res.get("source_types", ["statute", "treaty"])
            )
        except Exception as e:
            logger.warning(f"Query planner error: {e}. Using fallback query plan.")
            return QueryPlan(
                jurisdiction=case_state.jurisdiction,
                country=case_state.country,
                ip_domains=case_state.intellectual_property_objective or ["patent", "regulatory"],
                formulation_category=case_state.formulation_classification,
                search_terms=[w for w in user_query.split() if len(w) > 3],
                source_types=["statute", "treaty"]
            )

query_planner = QueryPlanner()

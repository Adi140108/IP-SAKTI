import logging
from typing import List, Dict, Any
from app.ai.groq.provider import groq_provider
from app.case.models import CaseState

logger = logging.getLogger("IP-SAKTI.IPRouter")

class IPRouterEngine:
    """
    Evidence and CaseState-aware Multi-Domain IP Router.
    Routes queries across applicable IP & Regulatory domains:
    - patent (Indian Patents Act 1970 Sec 3(p), Sec 3(e), PCT)
    - trademark (Brand names, logos)
    - gi (Geographical Indications for regional Ayurvedic products)
    - copyright (Literary works, compilations)
    - design (Packaging, delivery containers)
    - plant_variety (Protection of Plant Varieties & Farmers' Rights Act)
    - trade_secret (Proprietary extraction processes)
    - tkdl_prior_art (Traditional Knowledge Digital Library pointers)
    - abs (Access and Benefit Sharing under BD Act 2002 / Nagoya Protocol)
    - regulatory (AYUSH, FDA, FSSAI approvals)
    - multiple (Multiple simultaneous domains)
    - unknown (Insufficient evidence/state to determine route)
    """

    SUPPORTED_DOMAINS = [
        "patent",
        "trademark",
        "gi",
        "copyright",
        "design",
        "plant_variety",
        "trade_secret",
        "tkdl_prior_art",
        "abs",
        "regulatory",
        "multiple",
        "unknown"
    ]

    async def route_case_domains(self, case_state: CaseState, latest_message: str = "") -> Dict[str, Any]:
        """Determine applicable IP domains based on cumulative CaseState."""
        prompt = f"""
Analyze the cumulative Ayurvedic IP case parameters and determine applicable legal domains.

Case Parameters:
- Jurisdiction: {case_state.jurisdiction} ({case_state.country or 'India'})
- Formulation Category: {case_state.formulation_classification}
- Ingredients: {', '.join(case_state.ingredients) if case_state.ingredients else 'None listed'}
- Traditional Knowledge: {case_state.traditional_knowledge_involved}
- Biological Resources: {case_state.biological_resources_involved}
- Stated Objectives: {', '.join(case_state.intellectual_property_objective) if case_state.intellectual_property_objective else 'None'}

Latest User Message: "{latest_message}"

Allowed Domains: patent, trademark, gi, copyright, design, plant_variety, trade_secret, tkdl_prior_art, abs, regulatory, multiple, unknown.

STRICT RULE: Do NOT invent a domain based on simple keywords. If details are insufficient, return domain list with "unknown".

Return ONLY JSON:
{{
  "primary_route": "patent",
  "domains": ["patent", "abs", "tkdl_prior_art"],
  "domain_statuses": {{
    "patent": "Relevant",
    "abs": "Potentially Relevant",
    "trademark": "Not Identified",
    "gi": "Unknown"
  }},
  "explanation": "Brief reasoning based on case parameters"
}}
"""
        system_prompt = "You are an expert multi-domain IP routing engine for Ayurveda and biotechnology."

        try:
            res = await groq_provider.generate_structured_json(prompt, system_prompt)
            detected = res.get("domains", ["unknown"])
            valid = [d for d in detected if d in self.SUPPORTED_DOMAINS]
            if not valid:
                valid = ["unknown"]

            return {
                "primary_route": res.get("primary_route", valid[0]),
                "domains": valid,
                "domain_statuses": res.get("domain_statuses", {d: "Relevant" for d in valid}),
                "explanation": res.get("explanation", "Routed based on cumulative case parameters")
            }
        except Exception as e:
            logger.warning(f"IP Router error: {e}. Falling back to deterministic rule-based evaluation.")
            return self._evaluate_rule_based_routing(case_state, latest_message)

    def _evaluate_rule_based_routing(self, case_state: CaseState, message: str = "") -> Dict[str, Any]:
        """Deterministic keyword and parameter-based routing when LLM is unavailable."""
        text = f"{case_state.product_name or ''} {case_state.product_type or ''} {' '.join(case_state.ingredients)} {' '.join(case_state.intellectual_property_objective)} {message}".lower()
        domains = []

        if any(w in text for w in ["patent", "synergistic", "novel", "extract", "formulation", "process", "invention", "3(p)", "3(e)"]):
            domains.append("patent")
        if any(w in text for w in ["trademark", "brand", "logo", "name", "trade name", "mark"]):
            domains.append("trademark")
        if case_state.biological_resources_involved or any(w in text for w in ["biological", "nba", "abs", "forest", "sourced in india", "herbs", "plant material", "nagoya"]):
            domains.append("abs")
        if case_state.traditional_knowledge_involved or any(w in text for w in ["classical", "samhita", "charaka", "traditional knowledge", "tkdl", "prior art"]):
            domains.append("tkdl_prior_art")
        if any(w in text for w in ["gi", "geographical indication", "regional", "kerala", "kashmir", "origin"]):
            domains.append("gi")
        if any(w in text for w in ["design", "bottle", "packaging", "container", "shape"]):
            domains.append("design")
        if any(w in text for w in ["fssai", "ayurveda aahar", "drug license", "form 25d", "cdsco", "regulatory"]):
            domains.append("regulatory")

        # Also incorporate any explicitly stated objectives in CaseState
        for obj in case_state.intellectual_property_objective:
            if obj in self.SUPPORTED_DOMAINS and obj not in domains and obj != "unknown":
                domains.append(obj)

        if not domains:
            domains = ["unknown"]

        return {
            "primary_route": domains[0],
            "domains": domains,
            "domain_statuses": {d: "Relevant" for d in domains},
            "explanation": "Routed based on cumulative case parameters and statutory keyword heuristics."
        }

ip_router = IPRouterEngine()


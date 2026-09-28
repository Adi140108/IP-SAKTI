import sys
import os
import pytest

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.ai.gemma.provider import gemma_provider
from app.ai.groq.provider import groq_provider

@pytest.fixture(autouse=True)
def mock_llm_providers(monkeypatch):
    """Mock Groq and Gemma providers for instant, deterministic unit testing."""
    async def mock_generate_json(prompt, system_prompt):
        sp_lower = system_prompt.lower()
        p_lower = prompt.lower()

        if "structured legal information extractor" in sp_lower:
            extracted_msg = ""
            lines = prompt.split("\n")
            for idx, l in enumerate(lines):
                if "Latest User Message:" in l and idx + 1 < len(lines):
                    extracted_msg = lines[idx + 1].strip().strip('"')
            if not extracted_msg:
                extracted_msg = prompt

            u_lower = extracted_msg.lower()
            ext_updates = {}

            # Detect herbs
            ings = []
            for herb in ["ashwagandha", "ginger", "turmeric", "curcumin", "piperine", "brahmi", "guduchi", "tulsi", "neem", "giloy", "triphala"]:
                if herb in u_lower:
                    ings.append(herb.capitalize())
            if ings:
                ext_updates["ingredients"] = ings

            # Detect classical vs proprietary
            if any(k in u_lower for k in ["classical", "charaka", "sushruta", "samhita"]):
                ext_updates["classical_reference"] = "Classical Ayurvedic Text Reference"
                ext_updates["traditional_knowledge_involved"] = True
            elif any(k in u_lower for k in ["novel", "proprietary"]):
                ext_updates["classical_reference"] = "Novel Proprietary Formulation"
                ext_updates["traditional_knowledge_involved"] = False

            # Detect IP objective
            if "patent" in u_lower:
                ext_updates["intellectual_property_objective"] = ["patent"]
            elif "trademark" in u_lower:
                ext_updates["intellectual_property_objective"] = ["trademark"]

            # Detect jurisdiction & country
            if "india" in u_lower and "germany" not in u_lower and "usa" not in u_lower:
                ext_updates["jurisdiction"] = "India"
            elif "germany" in u_lower:
                ext_updates["jurisdiction"] = "International"
                ext_updates["country"] = "Germany"
            elif "usa" in u_lower or "united states" in u_lower:
                ext_updates["jurisdiction"] = "International"
                ext_updates["country"] = "USA"

            return {
                "extracted_updates": ext_updates,
                "uncertain_fields": [],
                "contradictions": []
            }
        elif "routing engine" in sp_lower:
            return {
                "primary_route": "patent",
                "domains": ["patent", "abs", "tkdl_prior_art"],
                "domain_statuses": {"patent": "Relevant", "abs": "Potentially Relevant"},
                "explanation": "Test routing"
            }
        elif "classification engine" in sp_lower or "classify" in sp_lower:
            return {"classification": "PATENT_PROPRIETARY", "reasoning_factors": ["Test classification"], "confidence": "HIGH"}
        elif "legal intake assistant" in sp_lower or "questioning" in sp_lower or "dynamic legal intake" in p_lower:
            # Extract target field from prompt if present
            target_field = "parameters"
            for line in prompt.split('\n'):
                if "Target Missing Field to Collect:" in line:
                    target_field = line.split('"')[1] if '"' in line else "parameters"
            return {
                "next_question": f"Could you provide more details regarding {target_field.replace('_', ' ')}?",
                "field": target_field,
                "reason": "Required for statutory analysis",
                "priority": "high",
                "suggested_options": ["Option A", "Option B", "Option C"]
            }
        elif "query planning engine" in sp_lower or "query planner" in sp_lower:
            jur = "India"
            country = None
            for line in prompt.split("\n"):
                line_clean = line.strip()
                if line_clean.startswith("- Jurisdiction:"):
                    if "international" in line_clean.lower():
                        jur = "International"
                    if "(" in line_clean and ")" in line_clean:
                        extracted_c = line_clean.split("(")[1].split(")")[0].strip()
                        if extracted_c.lower() not in ["unspecified", "null", "none", "india"] and jur == "International":
                            country = extracted_c
            
            s_terms = []
            for line in prompt.split("\n"):
                if line.strip().startswith('User Query: "'):
                    uq = line.split('User Query: "')[1].rstrip('"')
                    s_terms = [w for w in uq.replace("?", "").replace(",", "").split() if len(w) > 3][:4]
            if not s_terms:
                s_terms = ["patent", "eligibility"]

            return {
                "jurisdiction": jur,
                "country": country,
                "ip_domains": ["patent", "abs"],
                "formulation_category": "proprietary",
                "search_terms": s_terms,
                "source_types": ["statute", "regulation", "treaty"]
            }
        else:
            return {
                "answer": "Under Section 3(p) of the Indian Patents Act 1970, traditional knowledge is not patentable unless synergistic efficacy is proven.",
                "citations": [
                    {
                        "source": "The Patents Act, 1970 (India)",
                        "section_or_rule": "Section 3(p)",
                        "jurisdiction": "India",
                        "effective_date": "1970"
                    }
                ]
            }

    monkeypatch.setattr(groq_provider, "generate_structured_json", mock_generate_json)
    monkeypatch.setattr(gemma_provider, "generate_structured_json", mock_generate_json)

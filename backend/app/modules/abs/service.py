import logging
from typing import Dict, Any, List

logger = logging.getLogger("IP-SAKTI.ABS")

class ABSService:
    """
    Access and Benefit Sharing (ABS) Engine under Biological Diversity Act 2002 (India)
    and Nagoya Protocol (International CBD).
    Evaluates bio-resource utilization, commercial intent, and NBA/SBB approval requirements.
    """

    def evaluate_abs_triggers(
        self,
        ingredients: List[str],
        jurisdiction: str,
        user_type: str = "Indian entity",  # "Indian entity" or "Foreign entity / NRI"
        commercial_intent: bool = True
    ) -> Dict[str, Any]:
        """Evaluate ABS clearance requirements based on Biological Diversity Act 2002."""
        requires_nba_approval = False
        requires_sbb_intimation = False
        regulatory_authority = "National Biodiversity Authority (NBA)" if jurisdiction == "India" else "National Competent Authority under Nagoya Protocol"

        if user_type != "Indian entity" or "foreign" in user_type.lower():
            # Section 3 of BD Act: Foreign entities must seek prior NBA approval for accessing bio-resources
            requires_nba_approval = True
            nba_section = "Section 3, Biological Diversity Act 2002"
        elif commercial_intent:
            # Section 7 of BD Act: Indian entities using bio-resources for commercial utilization must intimate SBB
            requires_sbb_intimation = True
            nba_section = "Section 7, Biological Diversity Act 2002"
        else:
            nba_section = "Section 5 (Exemptions for collaborative research projects)"

        return {
            "abs_applicable": True if ingredients else False,
            "regulatory_authority": regulatory_authority,
            "requires_nba_approval": requires_nba_approval,
            "requires_sbb_intimation": requires_sbb_intimation,
            "relevant_statute": nba_section,
            "guidance_summary": (
                "Prior approval from National Biodiversity Authority (NBA) is mandatory under Section 6 of BD Act 2002 "
                "before applying for any IPR (patent) based on biological resources or traditional knowledge obtained from India."
            )
        }

abs_service = ABSService()

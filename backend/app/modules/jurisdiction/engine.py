import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("IP-SAKTI.JurisdictionEngine")

import re

class JurisdictionEngine:
    """
    Jurisdiction Engine enforcing strict isolation between Indian domestic statutes
    and International legal regimes (WIPO, PCT, TRIPS, Nagoya Protocol, Germany, USA, etc.).
    Extracts countries from natural language messages.
    """

    SUPPORTED_JURISDICTIONS = ["India", "International"]

    COUNTRY_MAP = {
        "germany": "Germany",
        "deutschland": "Germany",
        "usa": "USA",
        "us": "USA",
        "united states": "USA",
        "america": "USA",
        "uk": "United Kingdom",
        "united kingdom": "United Kingdom",
        "britain": "United Kingdom",
        "japan": "Japan",
        "france": "France",
        "australia": "Australia",
        "canada": "Canada",
        "singapore": "Singapore",
        "switzerland": "Switzerland",
        "swiss": "Switzerland",
        "china": "China",
        "brazil": "Brazil",
        "eu": "European Union",
        "europe": "European Union",
        "european union": "European Union"
    }

    def detect_from_text(self, text: str, current_jur: str = "India", current_country: Optional[str] = None) -> Dict[str, str]:
        """Extract country or international jurisdiction from natural language message text."""
        lower_msg = text.lower()

        for key, country_name in self.COUNTRY_MAP.items():
            if re.search(r'\b' + re.escape(key) + r'\b', lower_msg):
                logger.info(f"Natural language country detected: '{country_name}' from message '{text}'")
                return {"jurisdiction": "International", "country": country_name}

        if any(w in lower_msg for w in ["international", "foreign", "global", "pct", "wipo", "nagoya"]):
            return {"jurisdiction": "International", "country": current_country if current_country and current_country != "India" else "Global"}

        norm_jur = "International" if current_jur and current_jur.lower() == "international" else "India"
        norm_country = current_country or ("India" if norm_jur == "India" else "Global")
        return {"jurisdiction": norm_jur, "country": norm_country}

    def validate_and_normalize(self, jurisdiction: str, country: Optional[str] = None) -> Dict[str, str]:
        """Normalize jurisdiction selection."""
        norm_jur = "India"
        if jurisdiction and jurisdiction.strip().lower() in ["international", "global", "foreign", "wipo", "us", "usa", "eu", "germany"]:
            norm_jur = "International"

        target_country = country.strip() if country else ("India" if norm_jur == "India" else "Global")

        return {
            "jurisdiction": norm_jur,
            "country": target_country
        }

    def get_jurisdiction_prompt_filter(self, normalized_jur: Dict[str, str]) -> str:
        """Generate strict system instructions for LLM response generation."""
        if normalized_jur["jurisdiction"] == "India":
            return (
                "STRICT JURISDICTION FILTER: Active Jurisdiction is INDIA. "
                "Reference ONLY Indian legal statutes (e.g. Indian Patents Act 1970, Biological Diversity Act 2002, "
                "Drugs & Cosmetics Act 1940, Trade Marks Act 1999). Do NOT cite foreign domestic statutes as primary law."
            )
        else:
            country_name = normalized_jur.get("country", "Global")
            return (
                f"STRICT JURISDICTION FILTER: Active Jurisdiction is INTERNATIONAL ({country_name}). "
                "Reference official international treaties (WIPO, PCT, TRIPS, Nagoya Protocol, CBD) "
                f"and relevant foreign regional frameworks for {country_name}. Clearly distinguish international treaties from Indian domestic laws."
            )

jurisdiction_engine = JurisdictionEngine()


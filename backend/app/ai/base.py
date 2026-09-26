from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class LLMProvider(ABC):
    """
    Abstract Base Interface for LLM Providers.
    """

    @abstractmethod
    async def check_availability(self) -> Dict[str, Any]:
        """Check if provider credentials exist and endpoint is reachable."""
        pass

    @abstractmethod
    async def generate_text(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Generate raw text response."""
        pass

    @abstractmethod
    async def generate_structured_json(self, prompt: str, system_prompt: str) -> Dict[str, Any]:
        """Generate validated structured JSON dictionary."""
        pass

    def supports_vision(self) -> bool:
        """Indicates whether this provider natively supports image/multimodal input."""
        return False

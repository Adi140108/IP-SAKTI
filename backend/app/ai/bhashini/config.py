from typing import Optional
from pydantic_settings import BaseSettings

class BhashiniSettings(BaseSettings):
    BHASHINI_UDYAT_KEY: Optional[str] = None
    BHASHINI_INFERENCE_KEY: Optional[str] = None
    BHASHINI_BASE_URL: str = "https://dhruva-api.bhashini.gov.in/services/inference"
    BHASHINI_PIPELINE_ID: Optional[str] = None

bhashini_config = BhashiniSettings()

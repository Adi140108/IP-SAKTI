import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Server & Environment
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    APP_ENV: str = "development"  # "development" or "production"

    # Explicit Operational Modes
    DATABASE_MODE: str = "mock"    # "mock" or "firestore"
    STORAGE_MODE: str = "mock"     # "mock" or "backblaze"
    RAG_MODE: str = "mock"         # "mock" or "production"

    # Groq API Configuration (Primary LLM Engine)
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "qwen/qwen3.8-27b"
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"

    # Ollama / Gemma 4 12B (Fallback LLM Engine)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "gemma4:12b"
    OLLAMA_TIMEOUT_SECONDS: float = 120.0

    # BHASHINI API Credentials
    BHASHINI_UDYAT_KEY: Optional[str] = None
    BHASHINI_INFERENCE_KEY: Optional[str] = None
    BHASHINI_BASE_URL: str = "https://dhruva-api.bhashini.gov.in/services/inference"
    BHASHINI_PIPELINE_ID: Optional[str] = None

    # CORS configuration
    CORS_ORIGINS: str = "*"

    # Firebase Firestore
    FIREBASE_PROJECT_ID: Optional[str] = None
    FIREBASE_CREDENTIALS_PATH: Optional[str] = None
    FIREBASE_CREDENTIALS_JSON: Optional[str] = None

    # Backblaze B2
    B2_APPLICATION_KEY_ID: Optional[str] = None
    B2_APPLICATION_KEY: Optional[str] = None
    B2_BUCKET_NAME: str = "IP-SAKTI"
    B2_ENDPOINT_URL: str = "https://s3.us-west-004.backblazeb2.com"

    # Vector DB / Knowledge Base
    VECTOR_DB_TYPE: str = "memory"
    VECTOR_DB_PERSIST_PATH: str = "./data/vector_index"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

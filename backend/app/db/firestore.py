import os
import json
import logging
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger("IP-SAKTI.Firestore")

class FirestoreService:
    """
    Firebase Firestore Repository for persisting case states, documents, citations, and audit logs.
    Supports DATABASE_MODE = "firestore" (production) vs "mock" (development).
    In production mode, cloud failures raise explicit un-swallowed exceptions.
    """

    def __init__(self):
        self.db = None
        self.local_storage_dir = os.path.abspath("./data/local_db")
        os.makedirs(self.local_storage_dir, exist_ok=True)
        self.initialize_firestore()

    def initialize_firestore(self):
        """Initialize Firebase Admin SDK based on DATABASE_MODE."""
        cred_path = settings.FIREBASE_CREDENTIALS_PATH
        cred_json = settings.FIREBASE_CREDENTIALS_JSON
        is_firestore_mode = settings.DATABASE_MODE == "firestore"

        cred_obj = None
        if cred_json:
            try:
                import firebase_admin
                from firebase_admin import credentials
                cred_dict = json.loads(cred_json) if isinstance(cred_json, str) else cred_json
                cred_obj = credentials.Certificate(cred_dict)
            except Exception as e:
                logger.error(f"Failed to parse FIREBASE_CREDENTIALS_JSON: {e}")
                if is_firestore_mode:
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Invalid FIREBASE_CREDENTIALS_JSON: {e}")
        elif cred_path and (cred_path.strip().startswith("{") or "service_account" in cred_path):
            try:
                import firebase_admin
                from firebase_admin import credentials
                cred_dict = json.loads(cred_path.strip())
                cred_obj = credentials.Certificate(cred_dict)
            except Exception as e:
                logger.error(f"Failed to parse JSON string in FIREBASE_CREDENTIALS_PATH: {e}")
                if is_firestore_mode:
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Invalid JSON in FIREBASE_CREDENTIALS_PATH: {e}")
        elif cred_path and os.path.exists(cred_path):
            try:
                import firebase_admin
                from firebase_admin import credentials
                cred_obj = credentials.Certificate(cred_path)
            except Exception as e:
                logger.error(f"Failed to load credentials from {cred_path}: {e}")
                if is_firestore_mode:
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Could not load {cred_path}: {e}")

        if cred_obj:
            try:
                import firebase_admin
                from firebase_admin import firestore
                if not firebase_admin._apps:
                    firebase_admin.initialize_app(cred_obj, {'projectId': settings.FIREBASE_PROJECT_ID} if settings.FIREBASE_PROJECT_ID else {})
                self.db = firestore.client()
                logger.info("Successfully connected to Firebase Firestore")
            except Exception as e:
                logger.error(f"Firestore connection failure: {e}")
                if is_firestore_mode:
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore initialization failed: {e}")
                self.db = None
        else:
            if is_firestore_mode:
                raise RuntimeError("PRODUCTION DATABASE FAILURE: Neither FIREBASE_CREDENTIALS_PATH nor FIREBASE_CREDENTIALS_JSON provided when DATABASE_MODE=firestore.")
            logger.info("DATABASE_MODE=mock active. Operating using development local DB storage adapter.")

    def is_cloud_connected(self) -> bool:
        return self.db is not None

    def get_status(self) -> Dict[str, Any]:
        if self.is_cloud_connected():
            return {
                "name": "Firebase Firestore",
                "status": "CONNECTED",
                "details": f"MODE: firestore | Project ID: {settings.FIREBASE_PROJECT_ID}"
            }
        return {
            "name": "Firebase Firestore",
            "status": "NOT_CONFIGURED",
            "details": f"MODE: mock | Local DB Storage Active at {self.local_storage_dir}"
        }

    async def save_case_state(self, case_id: str, case_data: Dict[str, Any]) -> bool:
        """Save or update Case State."""
        if self.db:
            try:
                doc_ref = self.db.collection("case_states").document(case_id)
                doc_ref.set(case_data, merge=True)
                return True
            except Exception as e:
                logger.error(f"Firestore write error: {e}")
                if settings.APP_ENV == "production" or settings.DATABASE_MODE == "firestore":
                    raise RuntimeError(f"Firestore write error: {e}")

        file_path = os.path.join(self.local_storage_dir, f"case_{case_id}.json")
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(case_data, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Local DB write error: {e}")
            return False

    async def get_case_state(self, case_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve Case State by ID."""
        if self.db:
            try:
                doc_ref = self.db.collection("case_states").document(case_id)
                doc = doc_ref.get()
                if doc.exists:
                    return doc.to_dict()
            except Exception as e:
                logger.error(f"Firestore read error: {e}")
                if settings.APP_ENV == "production" or settings.DATABASE_MODE == "firestore":
                    raise RuntimeError(f"Firestore read error: {e}")

        file_path = os.path.join(self.local_storage_dir, f"case_{case_id}.json")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Local DB read error: {e}")
        return None

    async def save_document_metadata(self, file_id: str, metadata: Dict[str, Any]) -> bool:
        """Save document metadata."""
        if self.db:
            try:
                self.db.collection("uploaded_file_metadata").document(file_id).set(metadata, merge=True)
                return True
            except Exception as e:
                logger.error(f"Firestore doc metadata write error: {e}")
                if settings.APP_ENV == "production" or settings.DATABASE_MODE == "firestore":
                    raise RuntimeError(f"Firestore doc metadata write error: {e}")

        file_path = os.path.join(self.local_storage_dir, f"doc_{file_id}.json")
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Local doc metadata error: {e}")
            return False

firestore_service = FirestoreService()

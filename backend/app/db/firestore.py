import os
import json
import re
import logging
from typing import Dict, Any, Optional, List
from app.config import settings

logger = logging.getLogger("IP-SAKTI.Firestore")


class FirestoreService:
    """
    Firebase Firestore Repository for persisting case states, documents, citations, and audit logs.
    Supports DATABASE_MODE = "firestore" (production) vs "mock" (development).
    In production mode, cloud failures raise explicit un-swallowed exceptions and NEVER fall back to local disk.
    """

    def __init__(self):
        self.db = None
        self.local_storage_dir = os.path.abspath("./data/local_db")
        if not self.is_production_mode():
            os.makedirs(self.local_storage_dir, exist_ok=True)
        self.initialize_firestore()

    @staticmethod
    def is_production_mode() -> bool:
        return settings.APP_ENV == "production" or settings.DATABASE_MODE == "firestore"

    @staticmethod
    def _sanitize_id(identifier: str) -> str:
        """Validate and sanitize document / case IDs to prevent path traversal or malformed document paths."""
        if not identifier or not isinstance(identifier, str):
            raise ValueError("Identifier must be a non-empty string.")
        cleaned = re.sub(r"[^a-zA-Z0-9_\-]", "_", identifier.strip())
        if not cleaned:
            raise ValueError("Identifier contains no valid characters.")
        return cleaned

    def initialize_firestore(self):
        """Initialize Firebase Admin SDK based on DATABASE_MODE and APP_ENV."""
        cred_path = settings.FIREBASE_CREDENTIALS_PATH
        cred_json = settings.FIREBASE_CREDENTIALS_JSON
        prod_mode = self.is_production_mode()

        cred_obj = None
        if cred_json:
            try:
                import firebase_admin
                from firebase_admin import credentials
                cred_dict = json.loads(cred_json) if isinstance(cred_json, str) else cred_json
                cred_obj = credentials.Certificate(cred_dict)
            except Exception as e:
                logger.error(f"Failed to parse FIREBASE_CREDENTIALS_JSON: {type(e).__name__}")
                if prod_mode:
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Invalid FIREBASE_CREDENTIALS_JSON: {type(e).__name__}")
        elif cred_path and (cred_path.strip().startswith("{") or "service_account" in cred_path):
            try:
                import firebase_admin
                from firebase_admin import credentials
                cred_dict = json.loads(cred_path.strip())
                cred_obj = credentials.Certificate(cred_dict)
            except Exception as e:
                logger.error(f"Failed to parse JSON string in FIREBASE_CREDENTIALS_PATH: {type(e).__name__}")
                if prod_mode:
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Invalid JSON in FIREBASE_CREDENTIALS_PATH: {type(e).__name__}")
        elif cred_path and os.path.exists(cred_path):
            try:
                import firebase_admin
                from firebase_admin import credentials
                cred_obj = credentials.Certificate(cred_path)
            except Exception as e:
                logger.error(f"Failed to load credentials from path: {type(e).__name__}")
                if prod_mode:
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Could not load credentials from path: {type(e).__name__}")

        if cred_obj:
            try:
                import firebase_admin
                from firebase_admin import firestore
                if not firebase_admin._apps:
                    firebase_admin.initialize_app(
                        cred_obj,
                        {"projectId": settings.FIREBASE_PROJECT_ID} if settings.FIREBASE_PROJECT_ID else {}
                    )
                self.db = firestore.client()
                logger.info("Successfully connected to Firebase Firestore")
            except Exception as e:
                logger.error(f"Firestore connection failure: {type(e).__name__}")
                if prod_mode:
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore initialization failed: {type(e).__name__}")
                self.db = None
        else:
            if prod_mode:
                raise RuntimeError(
                    "PRODUCTION DATABASE FAILURE: Neither FIREBASE_CREDENTIALS_PATH nor FIREBASE_CREDENTIALS_JSON "
                    "provided when DATABASE_MODE=firestore or APP_ENV=production."
                )
            logger.info("DATABASE_MODE=mock active. Operating using development local DB storage adapter.")

    def is_cloud_connected(self) -> bool:
        return self.db is not None

    def get_status(self) -> Dict[str, Any]:
        if self.is_cloud_connected():
            return {
                "name": "Firebase Firestore",
                "status": "CONNECTED",
                "details": f"MODE: {settings.DATABASE_MODE} | Project ID: {settings.FIREBASE_PROJECT_ID or 'auto-detected'}"
            }
        if self.is_production_mode():
            return {
                "name": "Firebase Firestore",
                "status": "ERROR",
                "details": f"PRODUCTION FAILURE: Firestore is disconnected while in production mode (DATABASE_MODE={settings.DATABASE_MODE}, APP_ENV={settings.APP_ENV})"
            }
        return {
            "name": "Firebase Firestore",
            "status": "MOCK_STORAGE",
            "details": f"MODE: mock | Local DB Storage Active at {self.local_storage_dir}"
        }

    async def save_case_state(self, case_id: str, case_data: Dict[str, Any]) -> bool:
        """Save or update Case State."""
        clean_id = self._sanitize_id(case_id)
        if self.is_production_mode():
            if not self.db:
                raise RuntimeError("PRODUCTION DATABASE FAILURE: Firestore client is not connected.")
            try:
                doc_ref = self.db.collection("case_states").document(clean_id)
                doc_ref.set(case_data, merge=True)
                return True
            except Exception as e:
                logger.error(f"Firestore write error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore write failed: {type(e).__name__}")

        # Development / Mock Mode
        if self.db:
            try:
                doc_ref = self.db.collection("case_states").document(clean_id)
                doc_ref.set(case_data, merge=True)
                return True
            except Exception as e:
                logger.warning(f"Firestore write failed in mock mode, falling back to local DB: {e}")

        file_path = os.path.join(self.local_storage_dir, f"case_{clean_id}.json")
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(case_data, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Local DB write error: {type(e).__name__}")
            return False

    async def get_case_state(self, case_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve Case State by ID."""
        clean_id = self._sanitize_id(case_id)
        if self.is_production_mode():
            if not self.db:
                raise RuntimeError("PRODUCTION DATABASE FAILURE: Firestore client is not connected.")
            try:
                doc_ref = self.db.collection("case_states").document(clean_id)
                doc = doc_ref.get()
                if doc.exists:
                    return doc.to_dict()
                return None
            except Exception as e:
                logger.error(f"Firestore read error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore read failed: {type(e).__name__}")

        # Development / Mock Mode
        if self.db:
            try:
                doc_ref = self.db.collection("case_states").document(clean_id)
                doc = doc_ref.get()
                if doc.exists:
                    return doc.to_dict()
            except Exception as e:
                logger.warning(f"Firestore read failed in mock mode, checking local DB: {e}")

        file_path = os.path.join(self.local_storage_dir, f"case_{clean_id}.json")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Local DB read error: {type(e).__name__}")
        return None

    async def list_cases(self, user_id: Optional[str] = None, limit: int = 50) -> list[Dict[str, Any]]:
        """List case states, optionally filtered by user_id with guest fallback and deduplication."""
        results: list[Dict[str, Any]] = []
        seen_ids = set()

        if self.db:
            try:
                coll_ref = self.db.collection("case_states")
                if user_id and user_id != "guest_user":
                    query = coll_ref.where("user_id", "==", user_id).limit(limit)
                    for doc in query.stream():
                        data = doc.to_dict()
                        if data and data.get("case_id") and data["case_id"] not in seen_ids:
                            seen_ids.add(data["case_id"])
                            results.append(data)

                    # Also include unassigned or guest cases so ongoing consultations are never lost
                    if len(results) < limit:
                        fallback_query = coll_ref.limit(limit)
                        for doc in fallback_query.stream():
                            data = doc.to_dict()
                            if data and data.get("case_id") and data["case_id"] not in seen_ids:
                                if data.get("user_id") in [user_id, "guest_user", None]:
                                    seen_ids.add(data["case_id"])
                                    results.append(data)
                else:
                    query = coll_ref.limit(limit)
                    for doc in query.stream():
                        data = doc.to_dict()
                        if data and data.get("case_id") and data["case_id"] not in seen_ids:
                            seen_ids.add(data["case_id"])
                            results.append(data)

                results.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
                return results[:limit]
            except Exception as e:
                logger.warning(f"Firestore list cases error: {e}")
                if self.is_production_mode():
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore list failed: {type(e).__name__}")

        if os.path.exists(self.local_storage_dir):
            try:
                for fname in os.listdir(self.local_storage_dir):
                    if fname.startswith("case_") and fname.endswith(".json"):
                        fpath = os.path.join(self.local_storage_dir, fname)
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            cid = data.get("case_id")
                            if cid and cid not in seen_ids:
                                if not user_id or data.get("user_id") in [user_id, "guest_user", None]:
                                    seen_ids.add(cid)
                                    results.append(data)
                results.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
            except Exception as e:
                logger.error(f"Local DB list cases error: {e}")
        return results[:limit]

    async def save_document_metadata(self, file_id: str, metadata: Dict[str, Any]) -> bool:
        """Save document metadata."""
        clean_id = self._sanitize_id(file_id)
        if self.is_production_mode():
            if not self.db:
                raise RuntimeError("PRODUCTION DATABASE FAILURE: Firestore client is not connected.")
            try:
                self.db.collection("uploaded_file_metadata").document(clean_id).set(metadata, merge=True)
                return True
            except Exception as e:
                logger.error(f"Firestore doc metadata write error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore doc metadata write failed: {type(e).__name__}")

        # Development / Mock Mode
        if self.db:
            try:
                self.db.collection("uploaded_file_metadata").document(clean_id).set(metadata, merge=True)
                return True
            except Exception as e:
                logger.warning(f"Firestore doc metadata write failed in mock mode, falling back to local DB: {e}")

        file_path = os.path.join(self.local_storage_dir, f"doc_{clean_id}.json")
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Local doc metadata error: {type(e).__name__}")
            return False

    async def get_document_metadata(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve document metadata by ID."""
        clean_id = self._sanitize_id(file_id)
        if self.is_production_mode():
            if not self.db:
                raise RuntimeError("PRODUCTION DATABASE FAILURE: Firestore client is not connected.")
            try:
                doc = self.db.collection("uploaded_file_metadata").document(clean_id).get()
                if doc.exists:
                    return doc.to_dict()
                return None
            except Exception as e:
                logger.error(f"Firestore doc metadata read error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore doc metadata read failed: {type(e).__name__}")

        if self.db:
            try:
                doc = self.db.collection("uploaded_file_metadata").document(clean_id).get()
                if doc.exists:
                    return doc.to_dict()
            except Exception:
                pass

        file_path = os.path.join(self.local_storage_dir, f"doc_{clean_id}.json")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Local doc metadata read error: {type(e).__name__}")
        return None

    async def delete_case_state(self, case_id: str) -> bool:
        """Delete case state by ID."""
        clean_id = self._sanitize_id(case_id)
        if self.is_production_mode():
            if not self.db:
                raise RuntimeError("PRODUCTION DATABASE FAILURE: Firestore client is not connected.")
            try:
                self.db.collection("case_states").document(clean_id).delete()
                return True
            except Exception as e:
                logger.error(f"Firestore delete error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore delete failed: {type(e).__name__}")

        if self.db:
            try:
                self.db.collection("case_states").document(clean_id).delete()
            except Exception:
                pass

        file_path = os.path.join(self.local_storage_dir, f"case_{clean_id}.json")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                return True
            except Exception:
                return False
        return True

    async def save_escalation_dossier(self, dossier_id: str, dossier_data: Dict[str, Any]) -> bool:
        """Save human review escalation dossier to human_review_requests collection."""
        clean_id = self._sanitize_id(dossier_id)
        if self.is_production_mode():
            if not self.db:
                raise RuntimeError("PRODUCTION DATABASE FAILURE: Firestore client is not connected.")
            try:
                self.db.collection("human_review_requests").document(clean_id).set(dossier_data, merge=True)
                return True
            except Exception as e:
                logger.error(f"Firestore escalation dossier write error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore escalation dossier write failed: {type(e).__name__}")

        # Development / Mock Mode
        if self.db:
            try:
                self.db.collection("human_review_requests").document(clean_id).set(dossier_data, merge=True)
                return True
            except Exception as e:
                logger.warning(f"Firestore escalation dossier write failed in mock mode, falling back to local DB: {e}")

        file_path = os.path.join(self.local_storage_dir, f"escalation_{clean_id}.json")
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(dossier_data, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Local escalation dossier error: {type(e).__name__}")
            return False

    async def get_escalation_dossier(self, dossier_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve escalation dossier by ID."""
        clean_id = self._sanitize_id(dossier_id)
        if self.is_production_mode():
            if not self.db:
                raise RuntimeError("PRODUCTION DATABASE FAILURE: Firestore client is not connected.")
            try:
                doc = self.db.collection("human_review_requests").document(clean_id).get()
                if doc.exists:
                    return doc.to_dict()
                return None
            except Exception as e:
                logger.error(f"Firestore escalation dossier read error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore escalation dossier read failed: {type(e).__name__}")

        if self.db:
            try:
                doc = self.db.collection("human_review_requests").document(clean_id).get()
                if doc.exists:
                    return doc.to_dict()
            except Exception:
                pass

        file_path = os.path.join(self.local_storage_dir, f"escalation_{clean_id}.json")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Local escalation dossier read error: {type(e).__name__}")
        return None

    async def list_escalation_dossiers(self, limit: int = 50, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List escalation dossiers with optional status filter."""
        results = []
        seen_ids = set()

        if self.db:
            try:
                coll_ref = self.db.collection("human_review_requests")
                query = coll_ref
                if status:
                    query = query.where("status", "==", status)
                docs = query.limit(limit).stream()
                for doc in docs:
                    data = doc.to_dict()
                    did = data.get("dossier_id") or doc.id
                    if did not in seen_ids:
                        seen_ids.add(did)
                        results.append(data)
                results.sort(key=lambda x: x.get("submitted_at") or x.get("created_at") or "", reverse=True)
                return results[:limit]
            except Exception as e:
                logger.warning(f"Firestore list escalation dossiers error: {e}")
                if self.is_production_mode():
                    raise RuntimeError(f"PRODUCTION DATABASE FAILURE: Firestore list escalation dossiers failed: {type(e).__name__}")

        if os.path.exists(self.local_storage_dir):
            try:
                for fname in os.listdir(self.local_storage_dir):
                    if fname.startswith("escalation_") and fname.endswith(".json"):
                        fpath = os.path.join(self.local_storage_dir, fname)
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            did = data.get("dossier_id") or fname.replace("escalation_", "").replace(".json", "")
                            if did not in seen_ids:
                                if not status or data.get("status") == status:
                                    seen_ids.add(did)
                                    results.append(data)
                results.sort(key=lambda x: x.get("submitted_at") or x.get("created_at") or "", reverse=True)
            except Exception as e:
                logger.error(f"Local DB list escalation dossiers error: {e}")
        return results[:limit]

    async def update_escalation_status(
        self,
        dossier_id: str,
        new_status: str,
        audit_entry: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Update the review status and audit trail of an escalation dossier."""
        dossier = await self.get_escalation_dossier(dossier_id)
        if not dossier:
            return None

        dossier["status"] = new_status
        if audit_entry:
            dossier.setdefault("audit_log", []).append(audit_entry)

        await self.save_escalation_dossier(dossier_id, dossier)
        return dossier


firestore_service = FirestoreService()


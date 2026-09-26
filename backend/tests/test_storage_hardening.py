import os
import shutil
import pytest
from unittest.mock import MagicMock, patch
from app.config import settings
from app.db.firestore import FirestoreService
from app.storage.backblaze import BackblazeB2Service


@pytest.fixture
def clean_local_dirs():
    """Ensure clean local directories for tests."""
    local_db = os.path.abspath("./data/local_db")
    local_storage = os.path.abspath("./data/local_storage")
    yield
    # Cleanup any test created files
    for path in [local_db, local_storage]:
        if os.path.exists(path):
            for fname in os.listdir(path):
                if fname.startswith("test_hardening_") or fname.startswith("test_"):
                    try:
                        os.remove(os.path.join(path, fname))
                    except Exception:
                        pass


def test_1_firestore_production_initialization_failure_no_credentials():
    """Verify that in production mode, missing Firebase credentials raises RuntimeError."""
    with patch.object(settings, "DATABASE_MODE", "firestore"), \
         patch.object(settings, "APP_ENV", "production"), \
         patch.object(settings, "FIREBASE_CREDENTIALS_PATH", None), \
         patch.object(settings, "FIREBASE_CREDENTIALS_JSON", None):
        
        with pytest.raises(RuntimeError) as exc_info:
            FirestoreService()
        assert "PRODUCTION DATABASE FAILURE" in str(exc_info.value)
        assert "Neither FIREBASE_CREDENTIALS_PATH nor FIREBASE_CREDENTIALS_JSON" in str(exc_info.value)


def test_2_firestore_production_invalid_credentials_failure():
    """Verify that invalid JSON credentials in production mode fail cleanly without leaking secrets."""
    secret_leak_check = "SUPER_SECRET_TOKEN_DO_NOT_LEAK"
    invalid_json = f'{{"type": "service_account", "private_key": "{secret_leak_check}", INVALID_JSON}}'
    
    with patch.object(settings, "DATABASE_MODE", "firestore"), \
         patch.object(settings, "APP_ENV", "production"), \
         patch.object(settings, "FIREBASE_CREDENTIALS_JSON", invalid_json):
        
        with pytest.raises(RuntimeError) as exc_info:
            FirestoreService()
        assert "PRODUCTION DATABASE FAILURE" in str(exc_info.value)
        # Verify secret was not leaked into the exception message
        assert secret_leak_check not in str(exc_info.value)


@pytest.mark.asyncio
async def test_3_firestore_successful_persistence_path():
    """Verify that when Firestore is connected, save and get use Firestore document client."""
    with patch.object(settings, "DATABASE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        service = FirestoreService()

    mock_db = MagicMock()
    mock_doc = MagicMock()
    mock_snapshot = MagicMock()
    mock_snapshot.exists = True
    mock_snapshot.to_dict.return_value = {"case_id": "test_case_123", "product_name": "Herbal Taila"}
    
    mock_doc.get.return_value = mock_snapshot
    mock_db.collection.return_value.document.return_value = mock_doc
    service.db = mock_db

    with patch.object(settings, "DATABASE_MODE", "firestore"), \
         patch.object(settings, "APP_ENV", "production"):
        
        # Test Save
        save_res = await service.save_case_state("test_case_123", {"case_id": "test_case_123", "product_name": "Herbal Taila"})
        assert save_res is True
        mock_db.collection.assert_called_with("case_states")
        mock_doc.set.assert_called_with({"case_id": "test_case_123", "product_name": "Herbal Taila"}, merge=True)

        # Test Get
        get_res = await service.get_case_state("test_case_123")
        assert get_res is not None
        assert get_res["product_name"] == "Herbal Taila"


@pytest.mark.asyncio
async def test_4_firestore_production_write_failure_no_silent_local_fallback(clean_local_dirs):
    """Verify that in production mode, a Firestore write failure raises RuntimeError and NEVER writes to local disk."""
    with patch.object(settings, "DATABASE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        service = FirestoreService()

    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value.set.side_effect = Exception("Cloud network connection timeout")
    service.db = mock_db

    test_case_id = "test_hardening_case_prod_fail"
    local_file = os.path.join(service.local_storage_dir, f"case_{test_case_id}.json")
    if os.path.exists(local_file):
        os.remove(local_file)

    with patch.object(settings, "DATABASE_MODE", "firestore"), \
         patch.object(settings, "APP_ENV", "production"):
        
        with pytest.raises(RuntimeError) as exc_info:
            await service.save_case_state(test_case_id, {"case_id": test_case_id})
        
        assert "PRODUCTION DATABASE FAILURE" in str(exc_info.value)
        # Verify NO local disk fallback file was created
        assert not os.path.exists(local_file)


@pytest.mark.asyncio
async def test_5_firestore_production_read_failure_no_silent_local_fallback(clean_local_dirs):
    """Verify that in production mode, a Firestore read failure raises RuntimeError and NEVER reads from local disk."""
    with patch.object(settings, "DATABASE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        service = FirestoreService()

    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value.get.side_effect = Exception("Firestore unavailable")
    service.db = mock_db

    test_case_id = "test_hardening_read_fail"
    with patch.object(settings, "DATABASE_MODE", "firestore"), \
         patch.object(settings, "APP_ENV", "production"):
        
        with pytest.raises(RuntimeError) as exc_info:
            await service.get_case_state(test_case_id)
        assert "PRODUCTION DATABASE FAILURE" in str(exc_info.value)


def test_6_firestore_id_sanitization():
    """Verify that path traversal in case_id is sanitized safely."""
    with patch.object(settings, "DATABASE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        service = FirestoreService()

    clean = service._sanitize_id("../../evil_path/case_001")
    assert ".." not in clean
    assert "/" not in clean
    assert clean == "______evil_path_case_001"

    with pytest.raises(ValueError):
        service._sanitize_id("")


def test_7_b2_production_initialization_failure_no_credentials():
    """Verify that in production mode, missing B2 credentials raises RuntimeError."""
    with patch.object(settings, "STORAGE_MODE", "backblaze"), \
         patch.object(settings, "APP_ENV", "production"), \
         patch.object(settings, "B2_APPLICATION_KEY_ID", None), \
         patch.object(settings, "B2_APPLICATION_KEY", None):
        
        with pytest.raises(RuntimeError) as exc_info:
            BackblazeB2Service()
        assert "PRODUCTION STORAGE FAILURE" in str(exc_info.value)
        assert "B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY are required" in str(exc_info.value)


@pytest.mark.asyncio
async def test_8_b2_successful_upload_download_delete_path():
    """Verify that when B2 is connected, upload, download, and delete operations interact with B2 bucket."""
    with patch.object(settings, "STORAGE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        service = BackblazeB2Service()

    mock_bucket = MagicMock()
    mock_file_info = MagicMock()
    mock_file_info.id_ = "b2_file_id_999"
    mock_bucket.upload_bytes.return_value = mock_file_info
    
    mock_downloaded = MagicMock()
    def mock_save(dest):
        dest.write(b"Downloaded PDF content")
    mock_downloaded.save.side_effect = mock_save
    mock_bucket.download_file_by_name.return_value = mock_downloaded

    service.bucket = mock_bucket

    with patch.object(settings, "STORAGE_MODE", "backblaze"), \
         patch.object(settings, "APP_ENV", "production"):
        
        # Upload
        res = await service.upload_file("test_patent.pdf", b"PDF file data", "application/pdf")
        assert res["storage_provider"] == "backblaze_b2"
        assert res["file_id"] == "b2_file_id_999"
        mock_bucket.upload_bytes.assert_called_once()

        # Download
        content = await service.download_file("test_patent.pdf")
        assert content == b"Downloaded PDF content"

        # Delete
        mock_bucket.get_file_info_by_name.return_value = mock_file_info
        del_res = await service.delete_file("test_patent.pdf")
        assert del_res is True
        mock_bucket.delete_file_version.assert_called_once_with("b2_file_id_999", "test_patent.pdf")


@pytest.mark.asyncio
async def test_9_b2_production_upload_failure_no_silent_local_disk_fallback(clean_local_dirs):
    """Verify that in production mode, a B2 upload failure raises RuntimeError and NEVER writes to local disk."""
    with patch.object(settings, "STORAGE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        service = BackblazeB2Service()

    mock_bucket = MagicMock()
    mock_bucket.upload_bytes.side_effect = Exception("B2 rate limit exceeded")
    service.bucket = mock_bucket

    test_filename = "test_hardening_b2_fail.pdf"
    local_file = os.path.join(service.local_storage_dir, test_filename)
    if os.path.exists(local_file):
        os.remove(local_file)

    with patch.object(settings, "STORAGE_MODE", "backblaze"), \
         patch.object(settings, "APP_ENV", "production"):
        
        with pytest.raises(RuntimeError) as exc_info:
            await service.upload_file(test_filename, b"Important document bytes")
        
        assert "PRODUCTION STORAGE FAILURE" in str(exc_info.value)
        # Verify local file was NOT created
        assert not os.path.exists(local_file)


def test_10_b2_safe_filename_and_path_traversal_prevention():
    """Verify that BackblazeB2Service sanitizes path traversal filenames."""
    with patch.object(settings, "STORAGE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        service = BackblazeB2Service()

    clean = service._sanitize_filename("..\\..\\secret\\exploit.pdf")
    assert ".." not in clean
    assert "\\" not in clean
    assert "/" not in clean
    assert clean == "exploit.pdf"

    clean_spaced = service._sanitize_filename("my patient form (v1).pdf")
    assert clean_spaced == "my_patient_form__v1_.pdf"

    with pytest.raises(ValueError):
        service._sanitize_filename("")


@pytest.mark.asyncio
async def test_11_development_mode_local_db_and_storage_work_seamlessly(clean_local_dirs):
    """Verify that in development mode (mock), local DB and local disk storage work properly."""
    with patch.object(settings, "DATABASE_MODE", "mock"), \
         patch.object(settings, "STORAGE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        
        fs_service = FirestoreService()
        fs_service.db = None  # Force local fallback in mock mode
        b2_service = BackblazeB2Service()
        b2_service.bucket = None  # Force local fallback in mock mode

        # Test Local DB save/get
        case_id = "test_dev_case_001"
        save_ok = await fs_service.save_case_state(case_id, {"case_id": case_id, "title": "Dev Test"})
        assert save_ok is True
        retrieved = await fs_service.get_case_state(case_id)
        assert retrieved is not None
        assert retrieved["title"] == "Dev Test"

        # Test Local Storage upload/download
        doc_name = "test_dev_doc.pdf"
        up_res = await b2_service.upload_file(doc_name, b"Dev test file contents")
        assert up_res["storage_provider"] == "local_dev"
        down_bytes = await b2_service.download_file(doc_name)
        assert down_bytes == b"Dev test file contents"


def test_12_credentials_are_not_exposed_in_status_or_errors():
    """Verify that service status diagnostics never reveal credential strings or tokens."""
    with patch.object(settings, "DATABASE_MODE", "mock"), \
         patch.object(settings, "STORAGE_MODE", "mock"), \
         patch.object(settings, "APP_ENV", "development"):
        fs_service = FirestoreService()
        b2_service = BackblazeB2Service()

    fs_status = fs_service.get_status()
    b2_status = b2_service.get_status()

    assert "FIREBASE_CREDENTIALS" not in str(fs_status)
    assert "B2_APPLICATION_KEY" not in str(b2_status)


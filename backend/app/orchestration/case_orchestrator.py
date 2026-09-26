import logging
from typing import Dict, Any, Optional
from app.case.models import CaseState, ExtractionResult
from app.case.extractor import case_extractor
from app.case.state_manager import case_state_manager

logger = logging.getLogger("IP-SAKTI.CaseOrchestrator")

class CaseOrchestrator:
    """
    Orchestrates CaseState retrieval, extraction, and update steps.
    """

    async def extract_and_update_state(self, current_state: CaseState, user_message: str) -> CaseState:
        """Extract structured updates from user message and apply to CaseState."""
        logger.info(f"Orchestrating structured extraction for Case ID: {current_state.case_id}")
        
        # 1. Extract structured updates
        extraction: ExtractionResult = await case_extractor.extract_information(current_state, user_message)
        
        # 2. Apply updates to state
        updated_state: CaseState = await case_state_manager.apply_updates(current_state, extraction)
        
        return updated_state

case_orchestrator = CaseOrchestrator()

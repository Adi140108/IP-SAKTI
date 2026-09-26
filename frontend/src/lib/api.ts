import { ChatResponse, CaseState, DocumentMetadata, DiagnosticsStatus, EscalationDossier } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/health`);
  return res.json();
}

export async function fetchDiagnostics(): Promise<DiagnosticsStatus> {
  const res = await fetch(`${API_BASE_URL}/system/diagnostics`);
  return res.json();
}

export async function createCase(initialData: Partial<CaseState>): Promise<CaseState> {
  const res = await fetch(`${API_BASE_URL}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initialData)
  });
  return res.json();
}

export async function getCase(caseId: string): Promise<CaseState> {
  const res = await fetch(`${API_BASE_URL}/cases/${caseId}`);
  return res.json();
}

export async function updateCase(caseId: string, updates: Partial<CaseState>): Promise<CaseState> {
  const res = await fetch(`${API_BASE_URL}/cases/${caseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

export async function sendChatMessage(params: {
  case_id: string;
  message: string;
  language: string;
  jurisdiction: string;
  country?: string;
  audio_base64?: string;
}): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE_URL}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return res.json();
}

export async function uploadDocument(file: File, caseId: string): Promise<DocumentMetadata> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('case_id', caseId);

  const res = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    body: formData
  });
  return res.json();
}

export async function fetchLegalSources(jurisdiction?: string): Promise<any[]> {
  const url = jurisdiction ? `${API_BASE_URL}/sources?jurisdiction=${jurisdiction}` : `${API_BASE_URL}/sources`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchEscalationDossier(caseId: string, reason: string = 'User request'): Promise<EscalationDossier> {
  const res = await fetch(`${API_BASE_URL}/escalation/dossier?case_id=${caseId}&reason=${encodeURIComponent(reason)}`, {
    method: 'POST'
  });
  return res.json();
}

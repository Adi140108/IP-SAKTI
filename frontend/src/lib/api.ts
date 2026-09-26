import {
  ChatResponse,
  CaseState,
  DocumentMetadata,
  DiagnosticsStatus,
  EscalationDossier,
  LegalSourceItem
} from '@/types';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('ip_sakti_api_url');
    if (custom && custom.trim()) {
      let cleaned = custom.trim().replace(/\/+$/, '');
      if (!cleaned.endsWith('/api/v1')) {
        cleaned = `${cleaned}/api/v1`;
      }
      return cleaned;
    }
  }

  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!envUrl) return 'http://localhost:8000/api/v1';
  let cleaned = envUrl.replace(/\/+$/, '');
  if (!cleaned.endsWith('/api/v1')) {
    cleaned = `${cleaned}/api/v1`;
  }
  return cleaned;
}

export function setCustomApiUrl(url: string) {
  if (typeof window !== 'undefined') {
    if (!url || !url.trim()) {
      localStorage.removeItem('ip_sakti_api_url');
    } else {
      localStorage.setItem('ip_sakti_api_url', url.trim());
    }
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errorJson = await res.json();
      if (errorJson && typeof errorJson === 'object') {
        errorDetail = errorJson.detail || errorJson.error || errorJson.message || JSON.stringify(errorJson);
      }
    } catch {
      // Non-JSON error response
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(): Promise<{ status: string; service?: string }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/health`);
  return handleResponse<{ status: string; service?: string }>(res);
}

export async function fetchDiagnostics(): Promise<DiagnosticsStatus> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/system/diagnostics`);
  return handleResponse<DiagnosticsStatus>(res);
}

export async function createCase(initialData: Partial<CaseState>): Promise<CaseState> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initialData)
  });
  return handleResponse<CaseState>(res);
}

export async function getCase(caseId: string): Promise<CaseState> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}`);
  return handleResponse<CaseState>(res);
}

export async function updateCase(caseId: string, updates: Partial<CaseState>): Promise<CaseState> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return handleResponse<CaseState>(res);
}

export async function sendChatMessage(params: {
  case_id: string;
  message: string;
  language: string;
  jurisdiction: string;
  country?: string;
  audio_base64?: string;
}): Promise<ChatResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return handleResponse<ChatResponse>(res);
}

export async function uploadDocument(file: File, caseId: string): Promise<DocumentMetadata> {
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('case_id', caseId);

  const res = await fetch(`${baseUrl}/documents/upload`, {
    method: 'POST',
    body: formData
  });
  return handleResponse<DocumentMetadata>(res);
}

export async function fetchLegalSources(jurisdiction?: string): Promise<LegalSourceItem[]> {
  const baseUrl = getApiBaseUrl();
  const url = jurisdiction ? `${baseUrl}/sources?jurisdiction=${encodeURIComponent(jurisdiction)}` : `${baseUrl}/sources`;
  const res = await fetch(url);
  return handleResponse<LegalSourceItem[]>(res);
}

export async function fetchEscalationDossier(caseId: string, reason: string = 'User request'): Promise<EscalationDossier> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/escalation/dossier?case_id=${encodeURIComponent(caseId)}&reason=${encodeURIComponent(reason)}`, {
    method: 'POST'
  });
  return handleResponse<EscalationDossier>(res);
}

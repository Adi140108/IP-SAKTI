import { CaseState } from '@/types';

const STORAGE_KEY = 'ip_sakti_persisted_cases';

/**
 * Retrieve all cases saved in local storage registry.
 */
export function getPersistedCases(): CaseState[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read persisted cases:', e);
    return [];
  }
}

/**
 * Upsert a single case into the persistent registry.
 */
export function persistCase(caseObj: CaseState): CaseState[] {
  if (typeof window === 'undefined' || !caseObj?.case_id) return [];
  try {
    const existing = getPersistedCases();
    const filtered = existing.filter((c) => c.case_id !== caseObj.case_id);
    const updated = [caseObj, ...filtered];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to persist case:', e);
    return [];
  }
}

/**
 * Merge API cases with local registry cases, deduplicating by case_id.
 */
export function mergeAndPersistCases(apiCases: CaseState[]): CaseState[] {
  if (typeof window === 'undefined') return apiCases || [];
  try {
    const localCases = getPersistedCases();
    const map = new Map<string, CaseState>();

    // Add local cases first
    localCases.forEach((c) => {
      if (c && c.case_id) map.set(c.case_id, c);
    });

    // Merge API cases (overriding if newer)
    (apiCases || []).forEach((c) => {
      if (c && c.case_id) {
        map.set(c.case_id, { ...(map.get(c.case_id) || {}), ...c });
      }
    });

    const merged = Array.from(map.values());
    merged.sort((a, b) => {
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.error('Failed to merge cases:', e);
    return apiCases || [];
  }
}

const DOSSIER_STORAGE_KEY = 'ip_sakti_persisted_dossiers';

/**
 * Retrieve all escalation dossiers saved in local storage registry.
 */
export function getPersistedDossiers(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DOSSIER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read persisted dossiers:', e);
    return [];
  }
}

/**
 * Upsert a single escalation dossier into the persistent registry.
 */
export function persistDossier(dossier: any): any[] {
  if (typeof window === 'undefined' || !dossier?.dossier_id) return [];
  try {
    const existing = getPersistedDossiers();
    const filtered = existing.filter((d) => d.dossier_id !== dossier.dossier_id);
    const updated = [dossier, ...filtered];
    localStorage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to persist dossier:', e);
    return [];
  }
}

/**
 * Merge API dossiers with local registry dossiers, deduplicating by dossier_id.
 */
export function mergeAndPersistDossiers(apiDossiers: any[]): any[] {
  if (typeof window === 'undefined') return apiDossiers || [];
  try {
    const localDossiers = getPersistedDossiers();
    const map = new Map<string, any>();

    // Add local dossiers first
    localDossiers.forEach((d) => {
      if (d && d.dossier_id) map.set(d.dossier_id, d);
    });

    // Merge API dossiers (overriding if newer)
    (apiDossiers || []).forEach((d) => {
      if (d && d.dossier_id) {
        map.set(d.dossier_id, { ...(map.get(d.dossier_id) || {}), ...d });
      }
    });

    const merged = Array.from(map.values());
    merged.sort((a, b) => {
      const timeA = new Date(a.submitted_at || a.created_at || 0).getTime();
      const timeB = new Date(b.submitted_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    localStorage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.error('Failed to merge dossiers:', e);
    return apiDossiers || [];
  }
}


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
 * Dynamically computes a robust evidence and case completeness confidence score (0.35 - 0.98).
 */
export function computeCaseConfidence(c?: Partial<CaseState> | null): number {
  if (!c) return 0.75;
  if (typeof c.confidence === 'number' && c.confidence > 0) {
    return Math.min(0.98, Math.max(0.35, Math.round(c.confidence * 100) / 100));
  }

  let score = 0.50; // Starting baseline
  if (c.ingredients && c.ingredients.length > 0) score += 0.15;
  if (c.product_type && c.product_type !== 'unknown') score += 0.10;
  if (c.formulation_classification && c.formulation_classification !== 'unknown') score += 0.10;
  if (c.intellectual_property_objective && c.intellectual_property_objective.length > 0) score += 0.08;
  if (c.evidence_references && c.evidence_references.length > 0) score += 0.07;
  if (c.conversation_history && c.conversation_history.length > 0) {
    score += Math.min(0.10, c.conversation_history.length * 0.04);
  }
  if (c.missing_information && c.missing_information.length > 0) {
    score -= Math.min(0.15, c.missing_information.length * 0.03);
  }
  return Math.min(0.98, Math.max(0.35, Math.round(score * 100) / 100));
}

export function getConfidenceLevel(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 0.75) return 'High';
  if (score >= 0.50) return 'Medium';
  return 'Low';
}

/**
 * Retrieve all escalation dossiers saved in local storage registry,
 * also synthesizing dossiers for any persisted user cases.
 */
export function getPersistedDossiers(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DOSSIER_STORAGE_KEY);
    const existingDossiers: any[] = raw ? JSON.parse(raw) : [];
    const dossierMap = new Map<string, any>();

    // 1. Load explicit submitted dossiers
    if (Array.isArray(existingDossiers)) {
      existingDossiers.forEach((d) => {
        if (d && (d.dossier_id || d.case_id)) {
          const key = d.dossier_id || `dos_${d.case_id}`;
          dossierMap.set(key, { ...d, dossier_id: key });
        }
      });
    }

    // 2. Also reconcile with any local cases in registry
    const localCases = getPersistedCases();
    localCases.forEach((c) => {
      if (c && c.case_id) {
        const alreadyHasDossier = Array.from(dossierMap.values()).some((d) => d.case_id === c.case_id);
        if (!alreadyHasDossier) {
          const autoKey = `dos_${c.case_id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const dynConfidence = computeCaseConfidence(c);
          const dynLevel = getConfidenceLevel(dynConfidence);

          const synthDossier = {
            dossier_id: autoKey,
            case_id: c.case_id,
            product_name: c.product_name || c.product_type || 'Ayurvedic Case',
            product_type: c.product_type || 'Polyherbal Formulation',
            formulation_classification: c.formulation_classification || 'proprietary',
            ingredients: c.ingredients || [],
            jurisdiction: c.jurisdiction || 'India',
            country: c.country || 'India',
            escalation_reason: 'User requested expert review',
            status: 'submitted',
            confidence: dynConfidence,
            confidence_level: dynLevel,
            user_note: c.known_information && c.known_information.length > 0 ? c.known_information.join('; ') : 'Submitted for human facilitator review.',
            created_at: c.created_at || new Date().toISOString(),
            submitted_at: c.updated_at || c.created_at || new Date().toISOString(),
            citations: c.conversation_history ? c.conversation_history.flatMap((t: any) => t.citations || []) : [],
            unresolved_questions: c.missing_information ? c.missing_information.map((m: string) => `Missing parameter: ${m.replace(/_/g, ' ')}`) : []
          };
          dossierMap.set(autoKey, synthDossier);
        }
      }
    });

    const result = Array.from(dossierMap.values());
    result.sort((a, b) => {
      const timeA = new Date(a.submitted_at || a.created_at || 0).getTime();
      const timeB = new Date(b.submitted_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    return result;
  } catch (e) {
    console.error('Failed to read persisted dossiers:', e);
    return [];
  }
}

/**
 * Upsert a single escalation dossier into the persistent registry.
 */
export function persistDossier(dossier: any): any[] {
  if (typeof window === 'undefined' || !dossier) return [];
  const effectiveId = dossier.dossier_id || `dos_${dossier.case_id || Date.now().toString(36)}`;
  const normalized = { ...dossier, dossier_id: effectiveId, status: dossier.status || 'submitted' };
  try {
    const existing = getPersistedDossiers();
    const filtered = existing.filter((d) => d.dossier_id !== effectiveId && d.case_id !== normalized.case_id);
    const updated = [normalized, ...filtered];
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
      if (d && (d.dossier_id || d.case_id)) {
        map.set(d.dossier_id || d.case_id, d);
      }
    });

    // Merge API dossiers (overriding if newer)
    (apiDossiers || []).forEach((d) => {
      if (d && (d.dossier_id || d.case_id)) {
        const key = d.dossier_id || d.case_id;
        map.set(key, { ...(map.get(key) || {}), ...d });
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


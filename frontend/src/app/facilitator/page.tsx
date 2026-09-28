'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { EscalationDossier } from '@/types';
import { fetchEscalationRequests, updateEscalationStatus } from '@/lib/api';
import { getTierFromClassification } from '@/lib/formulationTaxonomy';
import { getPersistedDossiers, mergeAndPersistDossiers, persistDossier } from '@/lib/caseRegistry';

export default function FacilitatorDashboardPage() {
  const [dossiers, setDossiers] = useState<EscalationDossier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [activeDossier, setActiveDossier] = useState<EscalationDossier | null>(null);
  const [facilitatorNote, setFacilitatorNote] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const local = getPersistedDossiers();
    if (local.length > 0) {
      setDossiers(local);
      setActiveDossier(local[0]);
      setLoading(false);
    }
  }, []);

  const loadDossiers = () => {
    setLoading(true);
    fetchEscalationRequests(50, selectedStatus === 'all' ? undefined : selectedStatus)
      .then((data) => {
        const merged = mergeAndPersistDossiers(data || []);
        setDossiers(merged);
        if (merged.length > 0 && !activeDossier) {
          setActiveDossier(merged[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Escalation requests API fallback (using local registry):', err);
        const local = getPersistedDossiers();
        setDossiers(local);
        if (local.length > 0 && !activeDossier) {
          setActiveDossier(local[0]);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDossiers();
  }, [selectedStatus]);

  const handleStatusChange = async (newStatus: string) => {
    if (!activeDossier?.dossier_id) return;
    setUpdatingStatus(true);

    const nowIso = new Date().toISOString();
    const typedStatus = newStatus as EscalationDossier['status'];
    const updatedLocal: EscalationDossier = {
      ...activeDossier,
      status: typedStatus,
      reviewed_at: newStatus === 'under_review' ? nowIso : activeDossier.reviewed_at,
      facilitator_notes: facilitatorNote || activeDossier.facilitator_notes,
      audit_log: [
        ...(activeDossier.audit_log || []),
        {
          action: `status_updated_to_${newStatus}`,
          timestamp: nowIso,
          facilitator_id: 'ip_facilitator_portal',
          note: facilitatorNote || undefined,
          status: newStatus
        }
      ]
    };

    // 1. Optimistically persist and update UI
    persistDossier(updatedLocal);
    setActiveDossier(updatedLocal);
    setDossiers((prev) => prev.map((d) => (d.dossier_id === updatedLocal.dossier_id ? updatedLocal : d)));
    setFacilitatorNote('');

    // 2. Sync with backend API
    try {
      const updatedRemote = await updateEscalationStatus(activeDossier.dossier_id, newStatus, facilitatorNote);
      if (updatedRemote) {
        persistDossier(updatedRemote);
        setActiveDossier(updatedRemote);
        setDossiers((prev) => prev.map((d) => (d.dossier_id === updatedRemote.dossier_id ? updatedRemote : d)));
      }
    } catch (err) {
      console.warn('Backend remote status sync fallback (saved in local registry):', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Filter dossiers by search query and selected status tab
  const filteredDossiers = dossiers.filter((d) => {
    // 1. Status Tab Filter
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'submitted') {
        const isPending = !d.status || d.status === 'submitted' || d.status === 'draft' || d.status === 'ready_for_submission';
        if (!isPending) return false;
      } else if (d.status !== selectedStatus) {
        return false;
      }
    }

    // 2. Search Query Filter
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (d.product_name && d.product_name.toLowerCase().includes(q)) ||
      (d.product_type && d.product_type.toLowerCase().includes(q)) ||
      (d.case_id && d.case_id.toLowerCase().includes(q)) ||
      (d.dossier_id && d.dossier_id.toLowerCase().includes(q)) ||
      (d.escalation_reason && d.escalation_reason.toLowerCase().includes(q)) ||
      (d.user_note && d.user_note.toLowerCase().includes(q)) ||
      (d.ingredients && Array.isArray(d.ingredients) && d.ingredients.some((ing: string) => ing.toLowerCase().includes(q)))
    );
  });

  const totalCount = mounted ? dossiers.length : 0;
  const pendingCount = mounted ? dossiers.filter((d) => !d.status || d.status === 'submitted' || d.status === 'draft').length : 0;
  const underReviewCount = mounted ? dossiers.filter((d) => d.status === 'under_review').length : 0;
  const resolvedCount = mounted ? dossiers.filter((d) => d.status === 'resolved').length : 0;

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

      {/* Header Banner */}
      <div className="panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-lg bg-accent-soft border border-accent-line text-accent-ink flex items-center justify-center text-2xl shrink-0">
            ⚖️
          </div>
          <div>
            <h1 className="font-display text-xl leading-tight text-ink flex items-center gap-2">
              <span>Human IP Facilitator Review Portal</span>
              <span className="chip chip-ok">
                Live Audit
              </span>
            </h1>
            <p className="text-xs text-muted">
              Inspect user-submitted escalation dossiers, novel formulation claims, prior-art overlaps, and ABS compliance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDossiers}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-subtle cursor-pointer"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-subtle cursor-pointer"
          >
            <span>💬</span>
            <span>AI Consultation</span>
          </Link>
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="panel p-4">
          <div className="eyebrow">Total Escalations</div>
          <div className="mt-1.5 text-2xl font-bold text-ink" suppressHydrationWarning>{totalCount}</div>
        </div>
        <div className="rounded-lg border border-warn-line bg-warn-soft p-4">
          <div className="eyebrow">Pending Review</div>
          <div className="mt-1.5 text-2xl font-bold text-warn" suppressHydrationWarning>{pendingCount}</div>
        </div>
        <div className="rounded-lg border border-info-line bg-info-soft p-4">
          <div className="eyebrow">Under Review</div>
          <div className="mt-1.5 text-2xl font-bold text-info" suppressHydrationWarning>{underReviewCount}</div>
        </div>
        <div className="rounded-lg border border-ok-line bg-ok-soft p-4">
          <div className="eyebrow">Resolved Cases</div>
          <div className="mt-1.5 text-2xl font-bold text-ok" suppressHydrationWarning>{resolvedCount}</div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-md bg-sunken border border-line text-xs overflow-x-auto">
          <button
            onClick={() => setSelectedStatus('all')}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              selectedStatus === 'all'
                ? 'bg-surface text-ink shadow-soft'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span suppressHydrationWarning>All Requests ({totalCount})</span>
          </button>
          <button
            onClick={() => setSelectedStatus('submitted')}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              selectedStatus === 'submitted'
                ? 'bg-surface text-warn shadow-soft'
                : 'text-muted hover:text-warn'
            }`}
          >
            <span suppressHydrationWarning>Pending ({pendingCount})</span>
          </button>
          <button
            onClick={() => setSelectedStatus('under_review')}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              selectedStatus === 'under_review'
                ? 'bg-surface text-info shadow-soft'
                : 'text-muted hover:text-info'
            }`}
          >
            <span suppressHydrationWarning>Under Review ({underReviewCount})</span>
          </button>
          <button
            onClick={() => setSelectedStatus('resolved')}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              selectedStatus === 'resolved'
                ? 'bg-surface text-ok shadow-soft'
                : 'text-muted hover:text-ok'
            }`}
          >
            <span suppressHydrationWarning>Resolved ({resolvedCount})</span>
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search cases, ingredients, IDs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 bg-surface border border-line rounded-md px-3 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Main 2-Pane Workspace (List ~35% | Detailed Dossier Inspector ~65%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

        {/* Left Column: Dossier Requests List */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-2.5 max-h-[75vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="p-8 text-center text-xs text-faint flex flex-col items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-line-strong border-t-accent rounded-full animate-spin" />
              <span>Loading escalation dossiers...</span>
            </div>
          ) : filteredDossiers.length === 0 ? (
            <div className="panel p-8 text-center text-xs text-faint">
              <span className="text-2xl block mb-1">📭</span>
              <span>No escalation requests found for this filter.</span>
            </div>
          ) : (
            filteredDossiers.map((dossier, idx) => {
              const isSelected = activeDossier?.dossier_id === dossier.dossier_id || activeDossier?.case_id === dossier.case_id;
              const tier = getTierFromClassification(dossier.formulation_classification || dossier.product_type);
              const status = dossier.status || 'submitted';

              return (
                <div
                  key={dossier.dossier_id || idx}
                  onClick={() => setActiveDossier(dossier)}
                  className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-accent-soft border-accent ring-2 ring-accent/20 shadow-soft'
                      : 'bg-surface border-line hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-semibold text-[12.5px] text-ink truncate">
                      {dossier.product_name || dossier.product_type || 'Ayurvedic Case'}
                    </div>
                    <span className={`shrink-0 uppercase ${
                      status === 'resolved'
                        ? 'chip chip-ok'
                        : status === 'under_review'
                        ? 'chip chip-info'
                        : 'chip chip-warn'
                    }`}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-[11px] text-muted line-clamp-1 mb-1.5">
                    <strong>Reason:</strong> {dossier.escalation_reason || 'Expert review requested'}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-faint">
                    <span>#{dossier.dossier_id?.slice(0, 10) || dossier.case_id?.slice(0, 8)}</span>
                    <span>{dossier.jurisdiction} {dossier.country ? `(${dossier.country})` : ''}</span>
                    <span className="font-mono text-accent-ink font-semibold">
                      {Math.round((dossier.confidence || 0.85) * 100)}% Conf
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Detailed Dossier Review & Actions */}
        <div className="lg:col-span-7 xl:col-span-8 panel p-5 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {activeDossier ? (
            <>
              {/* Dossier Top Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
                <div>
                  <h2 className="font-display text-[17px] text-ink flex items-center gap-2">
                    <span>{activeDossier.product_name || activeDossier.product_type || 'Case Dossier'}</span>
                    <span className="text-[11px] font-mono text-faint">#{activeDossier.dossier_id || activeDossier.case_id}</span>
                  </h2>
                  <p className="text-xs text-muted">
                    Jurisdiction: <strong>{activeDossier.jurisdiction} {activeDossier.country ? `(${activeDossier.country})` : ''}</strong> | Created: {activeDossier.created_at || 'Recent'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`uppercase ${
                    activeDossier.status === 'resolved' ? 'chip chip-ok' : activeDossier.status === 'under_review' ? 'chip chip-info' : 'chip chip-warn'
                  }`}>
                    {activeDossier.status || 'Submitted'}
                  </span>
                </div>
              </div>

              {/* Escalation Reason & User Notes */}
              <div className="rounded-lg border border-warn-line bg-warn-soft p-3.5 space-y-1 text-xs">
                <div className="font-semibold text-warn flex items-center gap-1.5">
                  <span>🚨</span>
                  <span>Escalation Reason: {activeDossier.escalation_reason || 'User requested expert review'}</span>
                </div>
                {activeDossier.user_note && (
                  <p className="text-warn">
                    <strong>User Note:</strong> &ldquo;{activeDossier.user_note}&rdquo;
                  </p>
                )}
                {activeDossier.user_question && (
                  <p className="text-muted pt-1 border-t border-warn-line">
                    <strong>Original User Query:</strong> &ldquo;{activeDossier.user_question}&rdquo;
                  </p>
                )}
              </div>

              {/* Formulation Parameters */}
              <div className="panel-sunken grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-4">
                <div>
                  <span className="eyebrow block">Formulation Tier:</span>
                  <span className="font-semibold text-accent-ink">{activeDossier.formulation_classification || 'Proprietary / Novel'}</span>
                </div>
                <div>
                  <span className="eyebrow block">Active Ingredients:</span>
                  <span className="font-semibold text-ink">
                    {activeDossier.ingredients && activeDossier.ingredients.length > 0 ? activeDossier.ingredients.join(', ') : 'None specified'}
                  </span>
                </div>
                <div>
                  <span className="eyebrow block">Claimed Novelty:</span>
                  <span className="text-muted">{activeDossier.novelty_aspect || 'Not stated'}</span>
                </div>
                <div>
                  <span className="eyebrow block">Technical Improvement:</span>
                  <span className="text-muted">{activeDossier.technical_improvement || 'Not stated'}</span>
                </div>
                <div>
                  <span className="eyebrow block">Biological Resources (ABS):</span>
                  <span className="text-muted">
                    {activeDossier.biological_resources_involved ? 'Yes (Sourced in India - NBA Clearance Required)' : 'No Indian biological resources'}
                  </span>
                </div>
                <div>
                  <span className="eyebrow block">Public Disclosure Status:</span>
                  <span className={activeDossier.public_disclosure ? 'text-danger font-bold' : 'text-ok font-bold'}>
                    {activeDossier.public_disclosure ? `Disclosed (${activeDossier.public_disclosure_details || 'Prior sale/exhibition'})` : 'Kept Confidential'}
                  </span>
                </div>
              </div>

              {/* Prior Art Matches */}
              {activeDossier.prior_art_matches && activeDossier.prior_art_matches.length > 0 && (
                <div className="panel-sunken space-y-2 p-4 text-xs">
                  <div className="font-semibold text-ink flex items-center gap-1.5">
                    <span>🔍</span>
                    <span>Corpus Prior-Art Overlaps Identified ({activeDossier.prior_art_matches.length})</span>
                  </div>
                  <div className="space-y-2">
                    {activeDossier.prior_art_matches.map((m, mIdx) => (
                      <div key={mIdx} className="p-2.5 rounded-md bg-surface border border-line text-[11px] space-y-1">
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-ink">{m.title}</span>
                          <span className="chip chip-neutral">
                            {m.match_category}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted">
                          Matched: {m.matched_features.join(', ') || 'General statutory overlap'} | Relevance: {Math.round(m.relevance_score * 100)}%
                        </div>
                        {m.source_url && (
                          <a href={m.source_url} target="_blank" rel="noreferrer" className="text-[10px] block font-semibold text-accent hover:underline">
                            Source Document Link ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unresolved Questions Requiring Human Facilitator Attention */}
              <div className="panel-sunken space-y-2 p-4 text-xs">
                <div className="font-semibold text-ink flex items-center gap-1.5">
                  <span>❓</span>
                  <span>Questions &amp; Audit Flags for Facilitator</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11.5px] text-muted">
                  {(activeDossier.unresolved_questions || activeDossier.questions_requiring_human_review || []).map((q, qIdx) => (
                    <li key={qIdx}>{q}</li>
                  ))}
                </ul>
              </div>

              {/* Facilitator Status Action Controls */}
              <div className="panel-sunken space-y-3 p-4">
                <div className="font-semibold text-xs text-ink flex items-center gap-1.5">
                  <span>✍️</span>
                  <span>Facilitator Audit Action &amp; Review Notes</span>
                </div>

                <textarea
                  rows={2}
                  placeholder="Enter facilitator review observations or client advisory notes..."
                  value={facilitatorNote}
                  onChange={(e) => setFacilitatorNote(e.target.value)}
                  className="w-full bg-surface border border-line rounded-md p-2.5 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleStatusChange('under_review')}
                    disabled={updatingStatus || activeDossier.status === 'under_review'}
                    className="inline-flex items-center gap-1.5 rounded-md bg-info px-3.5 py-2 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-40"
                  >
                    Mark &ldquo;Under Review&rdquo;
                  </button>
                  <button
                    onClick={() => handleStatusChange('resolved')}
                    disabled={updatingStatus || activeDossier.status === 'resolved'}
                    className="inline-flex items-center gap-1.5 rounded-md bg-ok px-3.5 py-2 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-40"
                  >
                    Mark &ldquo;Resolved&rdquo;
                  </button>
                  <button
                    onClick={() => handleStatusChange('cancelled')}
                    disabled={updatingStatus || activeDossier.status === 'cancelled'}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-subtle cursor-pointer disabled:opacity-40"
                  >
                    Dismiss / Cancel
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-xs text-faint">
              Select an escalation dossier from the left list to review case parameters.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

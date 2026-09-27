'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { EscalationDossier } from '@/types';
import { fetchEscalationRequests, updateEscalationStatus } from '@/lib/api';
import { getTierFromClassification } from '@/lib/formulationTaxonomy';
import { getPersistedDossiers, mergeAndPersistDossiers } from '@/lib/caseRegistry';

export default function FacilitatorDashboardPage() {
  const [dossiers, setDossiers] = useState<EscalationDossier[]>(() => getPersistedDossiers());
  const [loading, setLoading] = useState<boolean>(() => getPersistedDossiers().length === 0);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [activeDossier, setActiveDossier] = useState<EscalationDossier | null>(() => {
    const initial = getPersistedDossiers();
    return initial.length > 0 ? initial[0] : null;
  });
  const [facilitatorNote, setFacilitatorNote] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

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
        console.error('Error fetching escalation requests:', err);
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
    try {
      const updated = await updateEscalationStatus(activeDossier.dossier_id, newStatus, facilitatorNote);
      setActiveDossier(updated);
      setFacilitatorNote('');
      loadDossiers();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update escalation status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Filter dossiers by search query
  const filteredDossiers = dossiers.filter((d) => {
    const q = searchQuery.toLowerCase();
    return (
      (d.product_name && d.product_name.toLowerCase().includes(q)) ||
      (d.product_type && d.product_type.toLowerCase().includes(q)) ||
      (d.case_id && d.case_id.toLowerCase().includes(q)) ||
      (d.dossier_id && d.dossier_id.toLowerCase().includes(q)) ||
      (d.escalation_reason && d.escalation_reason.toLowerCase().includes(q)) ||
      (d.user_note && d.user_note.toLowerCase().includes(q)) ||
      (d.ingredients && d.ingredients.some((ing) => ing.toLowerCase().includes(q)))
    );
  });

  const totalCount = dossiers.length;
  const pendingCount = dossiers.filter((d) => !d.status || d.status === 'submitted' || d.status === 'draft').length;
  const underReviewCount = dossiers.filter((d) => d.status === 'under_review').length;
  const resolvedCount = dossiers.filter((d) => d.status === 'resolved').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

      {/* Header Banner */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl shadow-xs shrink-0">
            ⚖️
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Human IP Facilitator Review Portal</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Live Audit
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspect user-submitted escalation dossiers, novel formulation claims, prior-art overlaps, and ABS compliance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDossiers}
            className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
          <Link
            href="/chat"
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <span>💬</span>
            <span>AI Consultation</span>
          </Link>
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Total Escalations</div>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white">{totalCount}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 shadow-2xs">
          <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">Pending Review</div>
          <div className="text-xl font-extrabold text-amber-900 dark:text-amber-300">{pendingCount}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/50 shadow-2xs">
          <div className="text-[10px] font-bold text-cyan-700 dark:text-cyan-400 uppercase">Under Review</div>
          <div className="text-xl font-extrabold text-cyan-900 dark:text-cyan-300">{underReviewCount}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 shadow-2xs">
          <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Resolved Cases</div>
          <div className="text-xl font-extrabold text-emerald-900 dark:text-emerald-300">{resolvedCount}</div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setSelectedStatus('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedStatus === 'all'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            All Requests ({totalCount})
          </button>
          <button
            onClick={() => setSelectedStatus('submitted')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedStatus === 'submitted'
                ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setSelectedStatus('under_review')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedStatus === 'under_review'
                ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-cyan-600'
            }`}
          >
            Under Review ({underReviewCount})
          </button>
          <button
            onClick={() => setSelectedStatus('resolved')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedStatus === 'resolved'
                ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search cases, ingredients, IDs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none shadow-2xs"
          />
        </div>
      </div>

      {/* Main 2-Pane Workspace (List ~35% | Detailed Dossier Inspector ~65%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

        {/* Left Column: Dossier Requests List */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-2.5 max-h-[75vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Loading escalation dossiers...</span>
            </div>
          ) : filteredDossiers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 glass-panel rounded-2xl border border-slate-200 dark:border-slate-800">
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
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
                    isSelected
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                      {dossier.product_name || dossier.product_type || 'Ayurvedic Case'}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold shrink-0 uppercase font-mono ${
                      status === 'resolved'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                        : status === 'under_review'
                        ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300'
                        : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                    }`}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1 mb-1.5">
                    <strong>Reason:</strong> {dossier.escalation_reason || 'Expert review requested'}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>#{dossier.dossier_id?.slice(0, 10) || dossier.case_id?.slice(0, 8)}</span>
                    <span>{dossier.jurisdiction} {dossier.country ? `(${dossier.country})` : ''}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {Math.round((dossier.confidence || 0.85) * 100)}% Conf
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Detailed Dossier Review & Actions */}
        <div className="lg:col-span-7 xl:col-span-8 glass-panel p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 max-h-[82vh] overflow-y-auto">
          {activeDossier ? (
            <>
              {/* Dossier Top Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{activeDossier.product_name || activeDossier.product_type || 'Case Dossier'}</span>
                    <span className="text-[11px] font-mono text-slate-400">#{activeDossier.dossier_id || activeDossier.case_id}</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Jurisdiction: <strong>{activeDossier.jurisdiction} {activeDossier.country ? `(${activeDossier.country})` : ''}</strong> | Created: {activeDossier.created_at || 'Recent'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase font-mono ${
                    activeDossier.status === 'resolved'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : activeDossier.status === 'under_review'
                      ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  }`}>
                    {activeDossier.status || 'Submitted'}
                  </span>
                </div>
              </div>

              {/* Escalation Reason & User Notes */}
              <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 space-y-1 text-xs">
                <div className="font-extrabold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <span>🚨</span>
                  <span>Escalation Reason: {activeDossier.escalation_reason || 'User requested expert review'}</span>
                </div>
                {activeDossier.user_note && (
                  <p className="text-amber-800 dark:text-amber-200">
                    <strong>User Note:</strong> &ldquo;{activeDossier.user_note}&rdquo;
                  </p>
                )}
                {activeDossier.user_question && (
                  <p className="text-slate-600 dark:text-slate-400 pt-1 border-t border-amber-200 dark:border-amber-800/40">
                    <strong>Original User Query:</strong> &ldquo;{activeDossier.user_question}&rdquo;
                  </p>
                )}
              </div>

              {/* Formulation Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Formulation Tier:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{activeDossier.formulation_classification || 'Proprietary / Novel'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Active Ingredients:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {activeDossier.ingredients && activeDossier.ingredients.length > 0 ? activeDossier.ingredients.join(', ') : 'None specified'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Claimed Novelty:</span>
                  <span className="text-slate-700 dark:text-slate-300">{activeDossier.novelty_aspect || 'Not stated'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Technical Improvement:</span>
                  <span className="text-slate-700 dark:text-slate-300">{activeDossier.technical_improvement || 'Not stated'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Biological Resources (ABS):</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {activeDossier.biological_resources_involved ? 'Yes (Sourced in India - NBA Clearance Required)' : 'No Indian biological resources'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 block">Public Disclosure Status:</span>
                  <span className={activeDossier.public_disclosure ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-700 dark:text-emerald-400 font-bold'}>
                    {activeDossier.public_disclosure ? `Disclosed (${activeDossier.public_disclosure_details || 'Prior sale/exhibition'})` : 'Kept Confidential'}
                  </span>
                </div>
              </div>

              {/* Prior Art Matches */}
              {activeDossier.prior_art_matches && activeDossier.prior_art_matches.length > 0 && (
                <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>🔍</span>
                    <span>Corpus Prior-Art Overlaps Identified ({activeDossier.prior_art_matches.length})</span>
                  </div>
                  <div className="space-y-2">
                    {activeDossier.prior_art_matches.map((m, mIdx) => (
                      <div key={mIdx} className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-slate-900 dark:text-white">{m.title}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {m.match_category}
                          </span>
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                          Matched: {m.matched_features.join(', ') || 'General statutory overlap'} | Relevance: {Math.round(m.relevance_score * 100)}%
                        </div>
                        {m.source_url && (
                          <a href={m.source_url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline text-[10px] block font-semibold">
                            Source Document Link ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unresolved Questions Requiring Human Facilitator Attention */}
              <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>❓</span>
                  <span>Questions &amp; Audit Flags for Facilitator</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300 text-[11px]">
                  {(activeDossier.unresolved_questions || activeDossier.questions_requiring_human_review || []).map((q, qIdx) => (
                    <li key={qIdx}>{q}</li>
                  ))}
                </ul>
              </div>

              {/* Facilitator Status Action Controls */}
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-800 space-y-3">
                <div className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>✍️</span>
                  <span>Facilitator Audit Action &amp; Review Notes</span>
                </div>

                <textarea
                  rows={2}
                  placeholder="Enter facilitator review observations or client advisory notes..."
                  value={facilitatorNote}
                  onChange={(e) => setFacilitatorNote(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleStatusChange('under_review')}
                    disabled={updatingStatus || activeDossier.status === 'under_review'}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-600 text-white font-bold text-xs hover:bg-cyan-500 transition-all cursor-pointer disabled:opacity-40"
                  >
                    Mark &ldquo;Under Review&rdquo;
                  </button>
                  <button
                    onClick={() => handleStatusChange('resolved')}
                    disabled={updatingStatus || activeDossier.status === 'resolved'}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition-all cursor-pointer disabled:opacity-40"
                  >
                    Mark &ldquo;Resolved&rdquo;
                  </button>
                  <button
                    onClick={() => handleStatusChange('cancelled')}
                    disabled={updatingStatus || activeDossier.status === 'cancelled'}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-300 transition-all cursor-pointer disabled:opacity-40"
                  >
                    Dismiss / Cancel
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-xs text-slate-400">
              Select an escalation dossier from the left list to review case parameters.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

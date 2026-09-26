'use client';

import React, { useState } from 'react';
import { FORMULATION_TIERS, FormulationTier, getTierFromClassification } from '@/lib/formulationTaxonomy';

interface FormulationPathwayModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeClassification?: string;
  onSelectClassification?: (tierId: string) => void;
}

export default function FormulationPathwayModal({
  isOpen,
  onClose,
  activeClassification,
  onSelectClassification,
}: FormulationPathwayModalProps) {
  const [selectedTierKey, setSelectedTierKey] = useState<string>(
    activeClassification || 'classical'
  );

  if (!isOpen) return null;

  const currentTier = FORMULATION_TIERS[selectedTierKey] || FORMULATION_TIERS.classical;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xl font-bold border border-amber-300 dark:border-amber-800">
              ⚖️
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                6-Tier Ayurvedic Formulation Legal Classification
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Explore how drug regulatory categorization directly defines your IP patentability and ABS posture.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 6 Tiers Selection Tabs */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {Object.values(FORMULATION_TIERS).map((tier) => {
              const isSelected = selectedTierKey === tier.id;
              return (
                <button
                  key={tier.id}
                  onClick={() => {
                    setSelectedTierKey(tier.id);
                    if (onSelectClassification) onSelectClassification(tier.id);
                  }}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500 text-white dark:text-slate-950 shadow-md shadow-emerald-500/20 scale-[1.02]'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span>{tier.shortLabel}</span>
                  {activeClassification === tier.id && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Tier Deep Dive Card */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-5 shadow-xs">
            
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                  Category Profile
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {currentTier.label}
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                {currentTier.badge}
              </span>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Statutory Authority & Scope:
              </h4>
              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                {currentTier.statutoryBasis} — {currentTier.description}
              </p>
            </div>

            {/* Three Pillars: IP, ABS, Regulatory */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              
              {/* 1. IP Pillar */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400 text-[11px] uppercase tracking-wider">
                  <span>📜</span> Intellectual Property Posture
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                  {currentTier.ipPosture}
                </p>
              </div>

              {/* 2. ABS Pillar */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center gap-1.5 font-bold text-teal-700 dark:text-teal-400 text-[11px] uppercase tracking-wider">
                  <span>🌿</span> Biodiversity & ABS Duty
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                  {currentTier.absPosture}
                </p>
              </div>

              {/* 3. Regulatory Pillar */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center gap-1.5 font-bold text-cyan-700 dark:text-cyan-400 text-[11px] uppercase tracking-wider">
                  <span>⚕️</span> Manufacturing & Regulatory
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                  {currentTier.regulatoryPathway}
                </p>
              </div>
            </div>

            {/* Required Statutory Forms */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Key Required Official Forms & Applications:
              </h4>
              <div className="flex flex-wrap gap-2">
                {currentTier.formsRequired.map((form, fIdx) => (
                  <span
                    key={fIdx}
                    className="px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-mono text-[11px] font-bold"
                  >
                    ✓ {form}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Selected Classification: <strong className="text-slate-900 dark:text-white">{currentTier.shortLabel}</strong>
          </span>
          <button
            onClick={() => {
              if (onSelectClassification) onSelectClassification(currentTier.id);
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white dark:text-slate-950 font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            Apply Classification to Active Case →
          </button>
        </div>
      </div>
    </div>
  );
}

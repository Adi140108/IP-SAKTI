'use client';

import { useState } from 'react';
import { FORMULATION_TIERS } from '@/lib/formulationTaxonomy';
import Dialog from './Dialog';
import {
  ScalesIcon,
  ScrollIcon,
  LeafIcon,
  PillIcon,
  CheckIcon,
  stripLeadingGlyphs,
} from './Icons';

interface FormulationPathwayModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeClassification?: string;
  onSelectClassification?: (tierId: string) => void;
}

const PILLARS = [
  { key: 'ip', label: 'Intellectual Property Posture', field: 'ipPosture' as const, Icon: ScrollIcon },
  { key: 'abs', label: 'Biodiversity & ABS Duty', field: 'absPosture' as const, Icon: LeafIcon },
  {
    key: 'reg',
    label: 'Manufacturing & Regulatory',
    field: 'regulatoryPathway' as const,
    Icon: PillIcon,
  },
];

export default function FormulationPathwayModal({
  isOpen,
  onClose,
  activeClassification,
  onSelectClassification,
}: FormulationPathwayModalProps) {
  const [selectedTierKey, setSelectedTierKey] = useState<string>(activeClassification || 'classical');

  if (!isOpen) return null;

  const currentTier = FORMULATION_TIERS[selectedTierKey] || FORMULATION_TIERS.classical;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={<ScalesIcon size={16} />}
      title="6-Tier Ayurvedic Formulation Legal Classification"
      description="Explore how drug regulatory categorization directly defines your IP patentability and ABS posture."
      footer={
        <>
          <span className="text-[11.5px] text-muted">
            Selected Classification:{' '}
            <strong className="font-medium text-ink">{currentTier.shortLabel}</strong>
          </span>
          <button
            onClick={() => {
              if (onSelectClassification) onSelectClassification(currentTier.id);
              onClose();
            }}
            className="rounded-md bg-accent px-3.5 py-2 text-[12px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Apply Classification to Active Case
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 6 Tiers Selection Tabs */}
        <div
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Formulation tiers"
        >
          {Object.values(FORMULATION_TIERS).map((tier) => {
            const isSelected = selectedTierKey === tier.id;
            const isActive = activeClassification === tier.id;
            return (
              <button
                key={tier.id}
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  setSelectedTierKey(tier.id);
                  if (onSelectClassification) onSelectClassification(tier.id);
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                  isSelected
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line bg-sunken text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                {tier.shortLabel}
                {isActive && (
                  <span className="status-dot status-dot-ok" aria-label="Active case classification" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Tier Deep Dive */}
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <span className="eyebrow">Category Profile</span>
              <h3 className="font-display mt-1 text-[19px] leading-snug text-ink">
                {currentTier.label}
              </h3>
            </div>
            <span className="chip chip-accent">
              <CheckIcon size={10} />
              {stripLeadingGlyphs(currentTier.badge)}
            </span>
          </div>

          <div>
            <h4 className="eyebrow">Statutory Authority &amp; Scope</h4>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink">
              {currentTier.statutoryBasis} — {currentTier.description}
            </p>
          </div>

          {/* Three Pillars: IP, ABS, Regulatory */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {PILLARS.map(({ key, label, field, Icon }) => (
              <div key={key} className="panel-sunken space-y-2 p-4">
                <div className="flex items-center gap-1.5">
                  <Icon size={13} className="text-accent" />
                  <span className="eyebrow">{label}</span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-muted">{currentTier[field]}</p>
              </div>
            ))}
          </div>

          {/* Required Statutory Forms */}
          <div>
            <h4 className="eyebrow">Key Required Official Forms &amp; Applications</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {currentTier.formsRequired.map((form, fIdx) => (
                <span key={fIdx} className="chip chip-accent">
                  <CheckIcon size={10} />
                  {form}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

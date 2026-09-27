'use client';

import React, { useState } from 'react';
import Dialog from './Dialog';
import { LandmarkIcon, SearchIcon, ArrowUpRightIcon, ScrollIcon } from './Icons';

interface OfficialFormsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RegistryItem {
  id: string;
  category: 'IPO' | 'NBA' | 'FSSAI' | 'AYUSH' | 'WIPO';
  title: string;
  code: string;
  description: string;
  statute: string;
  portalUrl: string;
  isDownloadableTemplate?: boolean;
}

const REGISTRY_FORMS: RegistryItem[] = [
  {
    id: 'ipo-form-1',
    category: 'IPO',
    code: 'Form 1',
    title: 'Application for Grant of Patent',
    description: 'Statutory application form submitted to the Indian Patent Office for filing patent protection on novel Ayurvedic processes or formulations.',
    statute: 'Sections 7, 54 & 135 and Rule 20(1) of Patents Rules, 2003 (as amended 2024)',
    portalUrl: 'https://ipindiaonline.gov.in/epatentfiling/goForLogin/doLogin',
    isDownloadableTemplate: true,
  },
  {
    id: 'ipo-form-2',
    category: 'IPO',
    code: 'Form 2',
    title: 'Provisional / Complete Specification',
    description: 'Technical disclosure document detailing the Ayurvedic composition, experimental synergy data (Section 3(e)), and claims.',
    statute: 'Section 10 and Rule 13 of Patents Rules, 2003',
    portalUrl: 'https://ipindia.gov.in/writereaddata/Portal/IPOFormDownload/1_12_1/form-2.pdf',
    isDownloadableTemplate: true,
  },
  {
    id: 'ipo-form-18',
    category: 'IPO',
    code: 'Form 18',
    title: 'Request for Examination of Patent Application',
    description: 'Formal request to examine the patent specification against TKDL prior art and Section 3(p) statutory bars.',
    statute: 'Section 11B and Rule 24B of Patents Rules, 2003',
    portalUrl: 'https://ipindiaonline.gov.in/epatentfiling/goForLogin/doLogin',
  },
  {
    id: 'ipo-form-27',
    category: 'IPO',
    code: 'Form 27 (2024 Rule)',
    title: 'Statement of Working of Patented Invention (Triennial)',
    description: 'Under the 2024 Patent Amendment Rules, patentees submit Form 27 once every 3 financial years to state commercial exploitation.',
    statute: 'Section 146(2) and Rule 131(1) of Patents (Amendment) Rules, 2024',
    portalUrl: 'https://ipindiaonline.gov.in/epatentfiling/goForLogin/doLogin',
  },
  {
    id: 'nba-form-1',
    category: 'NBA',
    code: 'NBA Form I',
    title: 'Access to Biological Resources for Commercial Utilisation',
    description: 'Mandatory prior approval application to the National Biodiversity Authority for commercial utilisation or research by foreign entities/NRIs.',
    statute: 'Section 3 and Rule 14 of Biological Diversity Act, 2002 & 2024 Rules',
    portalUrl: 'https://absefiling.nic.in/',
    isDownloadableTemplate: true,
  },
  {
    id: 'nba-form-3',
    category: 'NBA',
    code: 'NBA Form III',
    title: 'Application for IPR on Inventions based on Biological Resources',
    description: 'Mandatory statutory application for obtaining prior approval of NBA before applying for or sealing any patent inside or outside India.',
    statute: 'Section 6 and Rule 18 of Biological Diversity Act, 2002 (as amended 2023)',
    portalUrl: 'https://absefiling.nic.in/',
    isDownloadableTemplate: true,
  },
  {
    id: 'fssai-foscos-form-b',
    category: 'FSSAI',
    code: 'FoSCoS Form B',
    title: 'Ayurveda-Aahar Food Business Operator License',
    description: 'Application for registration / state / central license under the Food Safety and Standards (Ayurveda Aahar) Regulations, 2022.',
    statute: 'FSSAI Ayurveda Aahar Regulations, 2022 & Section 31 of FSS Act, 2006',
    portalUrl: 'https://foscos.fssai.gov.in/',
  },
  {
    id: 'ayush-form-25d',
    category: 'AYUSH',
    code: 'Form 25D',
    title: 'License to Manufacture Ayurvedic Classical / P&P Drugs',
    description: 'State Licensing Authority (SLA) application for manufacturing license under Schedule T (GMP compliance) for Ayurvedic classical or proprietary medicines.',
    statute: 'Rule 153 of Drugs and Cosmetics Rules, 1945',
    portalUrl: 'https://e-aushadhi.gov.in/',
  },
  {
    id: 'cdsco-form-44',
    category: 'AYUSH',
    code: 'CDSCO Form 44',
    title: 'Phytopharmaceutical IND Clinical Trial Permission',
    description: 'Central licensing application for Investigational New Drug (IND) permission to conduct clinical trials on purified herbal fractions.',
    statute: 'Rule 122E and Schedule Y of Drugs and Cosmetics Rules, 1945',
    portalUrl: 'https://cdscoonline.gov.in/CDSCO/Homepage',
  },
  {
    id: 'wipo-epct',
    category: 'WIPO',
    code: 'WIPO ePCT / GRATK',
    title: 'WIPO Patent Cooperation Treaty & GRATK Disclosure',
    description: 'International patent application filing with mandatory genetic resource and traditional knowledge country of origin disclosure under the WIPO GRATK Treaty (2024).',
    statute: 'PCT Article 11 & WIPO Treaty on Intellectual Property, Genetic Resources and Associated TK (2024)',
    portalUrl: 'https://pct.wipo.int/ePCT/',
  },
];

export default function OfficialFormsModal({ isOpen, onClose }: OfficialFormsModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  const categories = ['ALL', 'IPO', 'NBA', 'FSSAI', 'AYUSH', 'WIPO'];

  const filteredForms = REGISTRY_FORMS.filter((form) => {
    const matchesCategory = selectedCategory === 'ALL' || form.category === selectedCategory;
    const matchesSearch =
      form.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      icon={<LandmarkIcon size={16} />}
      title="Official Registry Forms & Portals"
      description="Direct statutory forms for Indian Patent Office, NBA Biological Diversity, FSSAI FoSCoS, and AYUSH SLA."
      footer={
        <p className="w-full text-center text-[11px] text-faint">
          Source Links verified for SIH PS-26045 &middot; Direct Integration with IP India, NBA ABS
          e-Filing &amp; FSSAI FoSCoS
        </p>
      }
    >
      <div className="space-y-5">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5"
            role="group"
            aria-label="Registry filter"
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                aria-pressed={selectedCategory === cat}
                className={`rounded-[3px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-surface text-ink shadow-soft'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {cat === 'ALL' ? 'All Registries' : cat}
              </button>
            ))}
          </div>

          <div className="relative">
            <SearchIcon
              size={13}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
            />
            <input
              type="text"
              placeholder="Search forms by name or section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search forms"
              className="w-60 rounded-md border border-line bg-sunken py-1.5 pr-2.5 pl-8 text-[11.5px] text-ink placeholder:text-faint"
            />
          </div>
        </div>

        {/* Forms List */}
        <ul className="divide-y divide-line border-t border-line">
          {filteredForms.map((form) => (
            <li key={form.id} className="grid grid-cols-1 gap-3 py-4 lg:grid-cols-12 lg:gap-6">
              <div className="lg:col-span-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono-caps rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 text-accent-ink">
                    {form.code}
                  </span>
                  <span className="eyebrow">{form.category}</span>
                </div>
                <h3 className="mt-2 text-[13.5px] font-medium text-ink">{form.title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{form.description}</p>
                <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-faint">
                  <ScrollIcon size={11} className="mt-0.5 shrink-0" />
                  {form.statute}
                </p>
              </div>

              <div className="flex items-start lg:col-span-5 lg:justify-end">
                <a
                  href={form.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-[11.5px] font-medium text-ink transition-colors hover:bg-subtle"
                >
                  Open Portal
                  <ArrowUpRightIcon size={12} />
                </a>
              </div>
            </li>
          ))}
        </ul>

        {filteredForms.length === 0 && (
          <p className="py-8 text-center text-[12px] text-faint">
            No forms match this filter.
          </p>
        )}
      </div>
    </Dialog>
  );
}

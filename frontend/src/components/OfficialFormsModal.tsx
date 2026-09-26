'use client';

import React, { useState } from 'react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xl font-bold border border-emerald-300 dark:border-emerald-800">
              🏛️
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Official Registry Forms & Portals
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct statutory forms for Indian Patent Office, NBA Biological Diversity, FSSAI FoSCoS, and AYUSH SLA.
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

        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-emerald-500 text-white dark:text-slate-950 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {cat === 'ALL' ? 'All Registries' : cat}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search forms by name or section..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-64"
          />
        </div>

        {/* Forms Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredForms.map((form) => (
              <div
                key={form.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2.5 flex flex-col justify-between hover:border-emerald-500/40 transition-colors shadow-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                      {form.code}
                    </span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {form.category}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {form.title}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {form.description}
                  </p>

                  <div className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                    ⚖️ {form.statute}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                    Official Government Portal
                  </span>
                  <a
                    href={form.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white dark:text-slate-950 font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                  >
                    <span>Open Portal</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center text-xs text-slate-500 dark:text-slate-400">
          Source Links verified for SIH PS-26045 • Direct Integration with IP India, NBA ABS e-Filing & FSSAI FoSCoS
        </div>
      </div>
    </div>
  );
}

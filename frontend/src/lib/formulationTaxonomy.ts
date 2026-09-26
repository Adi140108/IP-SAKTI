export interface FormulationTier {
  id: string;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
  statutoryBasis: string;
  ipPosture: string;
  absPosture: string;
  regulatoryPathway: string;
  formsRequired: string[];
  colorTheme: {
    bgLight: string;
    borderLight: string;
    textLight: string;
    bgDark: string;
    borderDark: string;
    textDark: string;
    badgeBg: string;
    badgeText: string;
  };
}

export const FORMULATION_TIERS: Record<string, FormulationTier> = {
  classical: {
    id: 'classical',
    label: '1. Classical / Generic Ayurvedic Medicine',
    shortLabel: 'Classical Medicine',
    badge: '📜 First Schedule TK',
    statutoryBasis: 'First Schedule of Drugs and Cosmetics Act, 1940 (54 Classical Texts e.g., Charaka, Sushruta, Sharangadhara, Bhaishajya Ratnavali)',
    description: 'Formulations prepared strictly according to recipes and manufacturing methods recorded in authoritative First Schedule classical texts.',
    ipPosture: 'Barred from patenting under Section 3(p) of the Patents Act, 1970 as traditional knowledge prior art. Defended globally via the Traditional Knowledge Digital Library (TKDL). Protected via Trademark for brand name and Industrial Design / Trade Dress for packaging.',
    absPosture: 'Exempted from Access and Benefit Sharing (ABS) fees under the Biological Diversity (Amendment) Act, 2023 for registered Indian AYUSH practitioners and codified traditional knowledge.',
    regulatoryPathway: 'State Licensing Authority (SLA) GMP Manufacturing License (Form 25D) under Rule 153/154 of D&C Rules, 1945. No clinical trial data required; proof of classical text reference is sufficient.',
    formsRequired: ['AYUSH SLA Form 25D', 'TM-A (Trade Marks Registry)', 'Form 27 (Triennial Working)'],
    colorTheme: {
      bgLight: 'bg-amber-50',
      borderLight: 'border-amber-300',
      textLight: 'text-amber-900',
      bgDark: 'dark:bg-amber-950/30',
      borderDark: 'dark:border-amber-800/50',
      textDark: 'dark:text-amber-200',
      badgeBg: 'bg-amber-100 dark:bg-amber-950',
      badgeText: 'text-amber-800 dark:text-amber-300',
    }
  },
  proprietary: {
    id: 'proprietary',
    label: '2. Patent or Proprietary (P&P) Medicine',
    shortLabel: 'Patent & Proprietary (P&P)',
    badge: '⚖️ Section 3(h) D&C Act',
    statutoryBasis: 'Section 3(h) of Drugs and Cosmetics Act, 1940 & Drugs and Cosmetics Rules, 1945',
    description: 'Formulation containing ingredients mentioned in First Schedule texts but combined in proprietary ratios, modern dosage forms (capsules, syrups, tablets), or with proprietary excipients.',
    ipPosture: 'Patents barred under Section 3(e) (mere admixture) and 3(p) UNLESS applicant demonstrates synergistic therapeutic efficacy with comparative experimental data (in vitro / in vivo). Strong Trademark & Trade Secret protection.',
    absPosture: 'Mandatory intimation / approval from State Biodiversity Board (SBB) or National Biodiversity Authority (NBA) prior to commercial utilisation of biological resources.',
    regulatoryPathway: 'AYUSH State Licensing Authority Form 25D license with published scientific literature, pilot safety data, and stability testing proof.',
    formsRequired: ['IPO Form 1 & Form 2', 'NBA Form III (IPR Approval)', 'AYUSH Form 25D', 'TM-A (Trademark)'],
    colorTheme: {
      bgLight: 'bg-emerald-50',
      borderLight: 'border-emerald-300',
      textLight: 'text-emerald-900',
      bgDark: 'dark:bg-emerald-950/30',
      borderDark: 'dark:border-emerald-800/50',
      textDark: 'dark:text-emerald-200',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-950',
      badgeText: 'text-emerald-800 dark:text-emerald-300',
    }
  },
  new_non_classical: {
    id: 'new_non_classical',
    label: '3. New / Non-Classical Ayurvedic Drug',
    shortLabel: 'New Ayurvedic Drug',
    badge: '🔬 Clinical Evidence Track',
    statutoryBasis: 'New Drugs and Clinical Trials Rules, 2019 & Rule 158B of Drugs & Cosmetics Rules, 1945',
    description: 'Novel Ayurvedic compound, modified active chemical entity, or new therapeutic indication requiring formal safety, toxicity, and clinical effectiveness evaluation.',
    ipPosture: 'High patent eligibility for novel extraction processes, chemical isolation, or novel combination with demonstrated inventive step and unexpected technical efficacy.',
    absPosture: 'Strict mandatory National Biodiversity Authority (NBA) approval under Section 6 of Biological Diversity Act (Form III) before grant of patent.',
    regulatoryPathway: 'Investigational New Drug (IND) pathway through Central Drugs Standard Control Organisation (CDSCO) & AYUSH Task Force with Phase I-III clinical trial protocols.',
    formsRequired: ['IPO Form 1, 2 & 18', 'NBA Form III', 'CDSCO Form 44', 'WIPO ePCT Form (GRATK Disclosure)'],
    colorTheme: {
      bgLight: 'bg-blue-50',
      borderLight: 'border-blue-300',
      textLight: 'text-blue-900',
      bgDark: 'dark:bg-blue-950/30',
      borderDark: 'dark:border-blue-800/50',
      textDark: 'dark:text-blue-200',
      badgeBg: 'bg-blue-100 dark:bg-blue-950',
      badgeText: 'text-blue-800 dark:text-blue-300',
    }
  },
  phytopharmaceutical: {
    id: 'phytopharmaceutical',
    label: '4. Phytopharmaceutical Drug',
    shortLabel: 'Phytopharmaceutical',
    badge: '🌿 Rule 122E / Schedule Y',
    statutoryBasis: 'Rule 122E and Schedule Y of Drugs & Cosmetics Rules, 1945 (CDSCO Botanical Drugs Framework)',
    description: 'Purified, standardized fraction with minimum 4 defined bioactive/chemical markers extracted from an Ayurvedic medicinal plant part, intended for internal or external human medicine.',
    ipPosture: 'Very high global patentability across Indian Patent Office, USPTO, and EPO for fraction fingerprints, extraction methods, and precise pharmacological claims.',
    absPosture: 'Mandatory NBA Form I (Access for Research/Commercial Utilisation) and NBA Form III (Prior Approval for IPR application).',
    regulatoryPathway: 'Full DCGI / CDSCO drug approval pathway with standardized finger-printing, animal toxicology, and Phase I-III human clinical trials.',
    formsRequired: ['CDSCO Form 44 (Phyto IND)', 'IPO Form 1 & 2', 'NBA Form I & III', 'Budapest Treaty Deposit (if microbial)'],
    colorTheme: {
      bgLight: 'bg-teal-50',
      borderLight: 'border-teal-300',
      textLight: 'text-teal-900',
      bgDark: 'dark:bg-teal-950/30',
      borderDark: 'dark:border-teal-800/50',
      textDark: 'dark:text-teal-200',
      badgeBg: 'bg-teal-100 dark:bg-teal-950',
      badgeText: 'text-teal-800 dark:text-teal-300',
    }
  },
  ayurveda_aahar: {
    id: 'ayurveda_aahar',
    label: '5. Ayurveda-Aahar / Nutraceutical Food',
    shortLabel: 'Ayurveda-Aahar',
    badge: '🍲 FSSAI Regulations 2022',
    statutoryBasis: 'Food Safety and Standards (Ayurveda Aahar) Regulations, 2022 under FSSAI',
    description: 'Food prepared in accordance with recipes or processes described in authoritative Ayurveda texts or traditional food recipes consumed as diet for health maintenance.',
    ipPosture: 'Cannot claim therapeutic/disease treatment drug patents. Protection achieved via Trademark (Brand/Logos), Packaging Design Patents, and proprietary trade secrets.',
    absPosture: 'Access to biological resources for food commercialisation governed by State Biodiversity Board intimation rules.',
    regulatoryPathway: 'FSSAI FoSCoS portal registration/licensing under Ayurveda-Aahar category. Mandatory display of the official FSSAI Ayurveda-Aahar emblem. Zero medicinal/cure claims permitted on packaging.',
    formsRequired: ['FSSAI FoSCoS Form B (Ayurveda Aahar)', 'TM-A (Trademark)', 'Design Application (IPO Form 1)'],
    colorTheme: {
      bgLight: 'bg-purple-50',
      borderLight: 'border-purple-300',
      textLight: 'text-purple-900',
      bgDark: 'dark:bg-purple-950/30',
      borderDark: 'dark:border-purple-800/50',
      textDark: 'dark:text-purple-200',
      badgeBg: 'bg-purple-100 dark:bg-purple-950',
      badgeText: 'text-purple-800 dark:text-purple-300',
    }
  },
  cosmetic: {
    id: 'cosmetic',
    label: '6. Ayurvedic Cosmetic / Personal Care',
    shortLabel: 'Ayurvedic Cosmetic',
    badge: '✨ Cosmetic Rules 2020',
    statutoryBasis: 'Drugs and Cosmetics (Cosmetics) Rules, 2020 & Schedule S / IS 4707 Standards',
    description: 'Topical Ayurvedic preparations intended to be rubbed, poured, or sprayed on the human body for cleansing, beautifying, or promoting attractiveness (herbal oils, face packs, shampoos).',
    ipPosture: 'Formulations protected as trade secrets and distinctive brand trademarks; container/packaging shapes protected via Industrial Design Registration (Designs Act, 2000).',
    absPosture: 'Commercial utilisation of plant extracts subject to Biological Diversity Act SBB compliance.',
    regulatoryPathway: 'Form 32 Cosmetic Manufacturing License from State Licensing Authority (SLA) under Cosmetics Rules, 2020. Prohibited from claiming cure of skin diseases.',
    formsRequired: ['SLA Form 32 (Cosmetic License)', 'Designs Act Form 1', 'TM-A (Trade Marks)'],
    colorTheme: {
      bgLight: 'bg-rose-50',
      borderLight: 'border-rose-300',
      textLight: 'text-rose-900',
      bgDark: 'dark:bg-rose-950/30',
      borderDark: 'dark:border-rose-800/50',
      textDark: 'dark:text-rose-200',
      badgeBg: 'bg-rose-100 dark:bg-rose-950',
      badgeText: 'text-rose-800 dark:text-rose-300',
    }
  },
};

export function getTierFromClassification(classification?: string): FormulationTier {
  if (!classification) return FORMULATION_TIERS.classical;
  const norm = classification.toLowerCase().trim();
  if (norm.includes('classical') || norm.includes('generic')) return FORMULATION_TIERS.classical;
  if (norm.includes('proprietary') || norm.includes('p&p') || norm.includes('patent or proprietary')) return FORMULATION_TIERS.proprietary;
  if (norm.includes('new') || norm.includes('non-classical') || norm.includes('clinical')) return FORMULATION_TIERS.new_non_classical;
  if (norm.includes('phyto') || norm.includes('fraction')) return FORMULATION_TIERS.phytopharmaceutical;
  if (norm.includes('aahar') || norm.includes('food') || norm.includes('nutra')) return FORMULATION_TIERS.ayurveda_aahar;
  if (norm.includes('cosmetic') || norm.includes('topical') || norm.includes('beauty')) return FORMULATION_TIERS.cosmetic;
  return FORMULATION_TIERS.classical;
}

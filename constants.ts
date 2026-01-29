
import { Criteria } from './types';

export const PHASE2_CRITERIA: Criteria[] = [
  { id: 'small_mid', label: 'Small–mid company' },
  { id: 'not_faang', label: 'Not FAANG / Not "elite"' },
  { id: 'backend_fullstack', label: 'Backend or full-stack' },
  { id: 'business_domain', label: 'Business domain (telecom, healthcare, internal)' },
  { id: 'sql_involved', label: 'SQL involved' },
  { id: 'recruiter_led', label: 'Recruiter-led' },
  { id: 'maintenance', label: 'Maintenance + incremental build' },
  { id: 'no_algo_heavy', label: 'No extreme algorithm interview signals' }
];

export const BEHAVIORAL_THEMES = [
  { id: 'weakness', label: 'Worst Weakness' },
  { id: 'challenge', label: 'Biggest Challenge' },
  { id: 'failure', label: 'Failure' },
  { id: 'disagreement', label: 'Disagreement' },
  { id: 'pressure', label: 'Pressure Situation' },
  { id: 'impact', label: 'Impact You Made' }
];

export const MENTAL_RULES = {
  donts: [
    'No rewriting your narrative daily',
    'No comparing yourself to ideal candidates',
    'No stack-switching',
    'No "should I quit" thinking',
    'No AI during practice (Coding Phase)'
  ],
  dos: [
    'You are allowed to feel tired',
    'You are not allowed to change direction because of feelings'
  ]
};


import { Criteria, HuntPersonaId, TaskDefinition } from './types';

export const DAILY_TASKS: TaskDefinition[] = [
  { id: 'codingEasy', label: '1 Easy Problem', time: '60-90m (Combined)' },
  { id: 'codingMedium', label: '1 Medium Problem', time: '60-90m (Combined)' },
  { id: 'behavioral', label: 'Behavioral Prep', time: '20-30m' },
  { id: 'simulation', label: 'Interview Sim', time: '10m' },
];

export const CODING_HARD_TASK: TaskDefinition = {
  id: 'codingHard',
  label: '1 Hard Problem',
  time: '90-120m',
};

export const PORTFOLIO_TASK: TaskDefinition = {
  id: 'portfolio',
  label: 'Portfolio / Impact Review',
  time: '30m',
};

export const PHASE2_CRITERIA: Criteria[] = [
  { id: 'small_mid', label: 'Small–mid company' },
  { id: 'not_faang', label: 'Not FAANG / Not "elite"' },
  { id: 'backend_fullstack', label: 'Backend or full-stack' },
  { id: 'business_domain', label: 'Business domain (telecom, healthcare, internal)' },
  { id: 'sql_involved', label: 'SQL involved' },
  { id: 'recruiter_led', label: 'Recruiter-led' },
  { id: 'maintenance', label: 'Maintenance + incremental build' },
  { id: 'no_algo_heavy', label: 'No extreme algorithm interview signals' },
];

export const BIG_TECH_CRITERIA: Criteria[] = [
  { id: 'scale', label: 'Large scale / high traffic' },
  { id: 'algo_signals', label: 'Algorithm interview signals present' },
  { id: 'distributed', label: 'Distributed systems experience valued' },
  { id: 'backend_fullstack', label: 'Backend or full-stack' },
  { id: 'strong_eng_culture', label: 'Strong engineering culture' },
  { id: 'competitive_comp', label: 'Competitive compensation' },
  { id: 'brand_recognition', label: 'Brand recognition / resume signal' },
  { id: 'growth_trajectory', label: 'Clear growth trajectory' },
];

export const STARTUP_CRITERIA: Criteria[] = [
  { id: 'early_stage', label: 'Early stage (seed to Series B)' },
  { id: 'ownership', label: 'High ownership / wear many hats' },
  { id: 'equity', label: 'Meaningful equity component' },
  { id: 'impact_visible', label: 'Direct impact on product' },
  { id: 'backend_fullstack', label: 'Backend or full-stack' },
  { id: 'small_team', label: 'Small engineering team' },
  { id: 'fast_pace', label: 'Fast-paced environment' },
  { id: 'portfolio_matters', label: 'Portfolio / side projects valued' },
];

export const CAREER_SWITCHER_CRITERIA: Criteria[] = [
  { id: 'mentorship', label: 'Mentorship available' },
  { id: 'learning_gaps_ok', label: 'Learning gaps acceptable' },
  { id: 'junior_friendly', label: 'Junior / career-switcher friendly' },
  { id: 'backend_fullstack', label: 'Backend or full-stack' },
  { id: 'structured_onboarding', label: 'Structured onboarding' },
  { id: 'pair_programming', label: 'Pair programming culture' },
  { id: 'business_domain', label: 'Business domain (telecom, healthcare, internal)' },
  { id: 'recruiter_led', label: 'Recruiter-led' },
];

export interface HuntPersonaConfig {
  id: HuntPersonaId;
  label: string;
  description: string;
  criteria: Criteria[];
  targetScore: number;
  appsPerDay: number;
  taskIds: string[];
}

export const HUNT_PERSONAS: Record<HuntPersonaId, HuntPersonaConfig> = {
  maintenance_swe: {
    id: 'maintenance_swe',
    label: 'Maintenance SWE',
    description: 'Small-mid companies, SQL, recruiter-led. Default protocol.',
    criteria: PHASE2_CRITERIA,
    targetScore: 4,
    appsPerDay: 2,
    taskIds: ['codingEasy', 'codingMedium', 'behavioral', 'simulation'],
  },
  big_tech: {
    id: 'big_tech',
    label: 'Big Tech',
    description: 'Scale, algo signals, distributed systems. Add hard problems.',
    criteria: BIG_TECH_CRITERIA,
    targetScore: 5,
    appsPerDay: 2,
    taskIds: ['codingEasy', 'codingMedium', 'codingHard', 'behavioral', 'simulation'],
  },
  startup: {
    id: 'startup',
    label: 'Startup',
    description: 'Ownership, early stage, equity. Emphasize portfolio impact.',
    criteria: STARTUP_CRITERIA,
    targetScore: 4,
    appsPerDay: 2,
    taskIds: ['codingEasy', 'codingMedium', 'portfolio', 'behavioral', 'simulation'],
  },
  career_switcher: {
    id: 'career_switcher',
    label: 'Career Switcher',
    description: 'Mentorship OK, learning gaps acceptable. Extra behavioral weight.',
    criteria: CAREER_SWITCHER_CRITERIA,
    targetScore: 3,
    appsPerDay: 2,
    taskIds: ['codingEasy', 'codingMedium', 'behavioral', 'behavioral', 'simulation'],
  },
};

const ALL_TASKS: Record<string, TaskDefinition> = {
  codingEasy: DAILY_TASKS[0],
  codingMedium: DAILY_TASKS[1],
  behavioral: DAILY_TASKS[2],
  simulation: DAILY_TASKS[3],
  codingHard: CODING_HARD_TASK,
  portfolio: PORTFOLIO_TASK,
};

export function getTasksForPersona(personaId: HuntPersonaId): TaskDefinition[] {
  const persona = HUNT_PERSONAS[personaId];
  return persona.taskIds.map((id, i) => {
    const base = ALL_TASKS[id];
    if (id === 'behavioral' && personaId === 'career_switcher') {
      const count = persona.taskIds.slice(0, i + 1).filter(t => t === 'behavioral').length;
      return { ...base, id: `behavioral${count}`, label: `Behavioral Prep ${count}` };
    }
    return base;
  });
}

export const BEHAVIORAL_THEMES = [
  { id: 'weakness', label: 'Worst Weakness' },
  { id: 'challenge', label: 'Biggest Challenge' },
  { id: 'failure', label: 'Failure' },
  { id: 'disagreement', label: 'Disagreement' },
  { id: 'pressure', label: 'Pressure Situation' },
  { id: 'impact', label: 'Impact You Made' },
];

export const MENTAL_RULES = {
  manifesto: [
    { title: 'The Volume Principle', body: 'The market is a numbers game. You do not control the outcome, only the input volume.' },
    { title: 'Emotional Isolation', body: 'Feelings are biological noise. They have no bearing on the quality of your SQL or your STAR response.' },
    { title: 'The Pivot Trap', body: 'Changing your tech stack or strategy mid-mission is a form of procrastination. Stick to the protocol.' },
  ],
  donts: [
    'No rewriting your narrative daily',
    'No comparing yourself to ideal candidates',
    'No stack-switching mid-search',
    'No "should I quit" internal debates',
    'No AI assistance during active Coding drills',
  ],
  dos: [
    'Acknowledge exhaustion as a physical metric',
    'Execute regardless of perceived motivation',
    'Trust the 4/8 criteria score over your "hunch"',
    'Maintain a singular, consistent CV version',
    'Prioritize maintenance roles over "0-to-1" moonshots',
  ],
  emergency: {
    message: 'SYSTEM ALERT: Emotional interference detected. Initiating Emergency Protocol.',
    steps: [
      'Stop thinking about the job. Think about the next 5 minutes.',
      'Close all LinkedIn tabs. They are toxic noise.',
      'Check your streak. You have come too far to break the chain.',
      'Commit to one Easy problem. Nothing else matters right now.',
      'Remember: The mission ends when you are hired. Not when you are tired.',
    ],
  },
};

export const SYSTEM_DESIGN_TOPICS = [
  { id: 'url_shortener', label: 'URL Shortener' },
  { id: 'rate_limiter', label: 'Rate Limiter' },
  { id: 'chat_system', label: 'Chat System' },
  { id: 'news_feed', label: 'News Feed' },
  { id: 'file_storage', label: 'File Storage (Dropbox)' },
  { id: 'notification_system', label: 'Notification System' },
  { id: 'search_autocomplete', label: 'Search Autocomplete' },
  { id: 'payment_system', label: 'Payment System' },
];

export const INTERVIEW_STAGE_LABELS: Record<string, string> = {
  phone: 'Phone Screen',
  technical: 'Technical',
  system_design: 'System Design',
  behavioral: 'Behavioral',
  onsite: 'Onsite',
  take_home: 'Take Home',
};

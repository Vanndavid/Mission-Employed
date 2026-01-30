
import { Criteria, TaskDefinition } from './types';

export const DAILY_TASKS: TaskDefinition[] = [
  { id: 'codingEasy', label: '1 Easy Problem', time: '60-90m (Combined)' },
  { id: 'codingMedium', label: '1 Medium Problem', time: '60-90m (Combined)' },
  { id: 'behavioral', label: 'Behavioral Prep', time: '20-30m' },
  { id: 'simulation', label: 'Interview Sim', time: '10m' }
];

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
  manifesto: [
    { title: 'The Volume Principle', body: 'The market is a numbers game. You do not control the outcome, only the input volume.' },
    { title: 'Emotional Isolation', body: 'Feelings are biological noise. They have no bearing on the quality of your SQL or your STAR response.' },
    { title: 'The Pivot Trap', body: 'Changing your tech stack or strategy mid-mission is a form of procrastination. Stick to the protocol.' }
  ],
  donts: [
    'No rewriting your narrative daily',
    'No comparing yourself to ideal candidates',
    'No stack-switching mid-search',
    'No "should I quit" internal debates',
    'No AI assistance during active Coding drills'
  ],
  dos: [
    'Acknowledge exhaustion as a physical metric',
    'Execute regardless of perceived motivation',
    'Trust the 4/8 criteria score over your "hunch"',
    'Maintain a singular, consistent CV version',
    'Prioritize maintenance roles over "0-to-1" moonshots'
  ],
  emergency: {
    message: "SYSTEM ALERT: Emotional interference detected. Initiating Emergency Protocol.",
    steps: [
      "Stop thinking about the job. Think about the next 5 minutes.",
      "Close all LinkedIn tabs. They are toxic noise.",
      "Check your streak. You have come too far to break the chain.",
      "Commit to one Easy problem. Nothing else matters right now.",
      "Remember: The mission ends when you are hired. Not when you are tired."
    ]
  }
};

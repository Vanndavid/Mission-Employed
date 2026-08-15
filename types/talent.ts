import { AuthUser } from './auth';
import { HuntPersonaId } from '../types';

export interface TalentMetrics {
  huntPersona: HuntPersonaId;
  daysInSearch: number;
  streakDays: number;
  protocolCompletionRate: number;
  appsPerWeek: number;
  submitted: number;
  interviewing: number;
  offers: number;
  rejected: number;
  appliedToInterview: number;
  interviewToOffer: number;
  codingCompleted: number;
  codingEasy: number;
  codingMedium: number;
  codingHard: number;
  codingTopics: string[];
  behavioralThemesReady: number;
  behavioralThemesTotal: number;
  profileReady: boolean;
  portfolioReady: boolean;
}

export type TalentTier = 'scout' | 'operator' | 'specialist' | 'elite' | 'placed';

export interface TalentScore {
  total: number;
  execution: number;
  technical: number;
  interview: number;
  outcome: number;
  tier: TalentTier;
  placed: boolean;
}

export interface TalentSnapshotView {
  metrics: TalentMetrics;
  score: TalentScore;
  visibleToCompanies: boolean;
  updatedAt: string;
}

export interface TalentMeResponse {
  snapshot: TalentSnapshotView | null;
  rank: number | null;
  totalRanked: number;
  percentile: number | null;
}

export interface AdminTalentRow {
  rank: number;
  user: AuthUser;
  score: TalentScore;
  metrics: TalentMetrics;
  visibleToCompanies: boolean;
  updatedAt: string;
  stale: boolean;
}

export const TALENT_PILLAR_MAX = {
  execution: 20,
  technical: 25,
  interview: 30,
  outcome: 25,
} as const;

export const TALENT_TIER_META: Record<TalentTier, { label: string; blurb: string }> = {
  scout: {
    label: 'Scout',
    blurb: 'Getting on the board. Keep executing the protocol.',
  },
  operator: {
    label: 'Operator',
    blurb: 'Consistent hunter. Volume and discipline are landing.',
  },
  specialist: {
    label: 'Specialist',
    blurb: 'Interview signal is showing. Ready for serious pipelines.',
  },
  elite: {
    label: 'Elite',
    blurb: 'Top-quartile execution and conversion. Company-ready.',
  },
  placed: {
    label: 'Placed',
    blurb: 'Has an offer on the board. Prime talent to place.',
  },
};

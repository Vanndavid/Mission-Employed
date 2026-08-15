import { BEHAVIORAL_THEMES } from '../constants';
import { AppState, TaskDefinition } from '../types';
import { TalentMetrics } from '../types/talent';
import {
  computeConversions,
  computeDaysInSearch,
  computeFunnel,
  computeProjectedPace,
  computeProtocolCompletionRate,
} from './analytics';

function isThemeReady(bullets: string[]): boolean {
  return bullets.some(b => b.trim().length > 0);
}

export function buildTalentMetrics(
  state: AppState,
  tasks: TaskDefinition[],
  streakDays: number
): TalentMetrics {
  const funnel = computeFunnel(state.applications);
  const conversions = computeConversions(funnel);
  const pace = computeProjectedPace(state.applications);

  let codingCompleted = 0;
  let codingEasy = 0;
  let codingMedium = 0;
  let codingHard = 0;
  const topics = new Set<string>();

  for (const entry of state.codingHistory) {
    if (entry.completed) {
      codingCompleted++;
      if (entry.difficulty === 'easy') codingEasy++;
      else if (entry.difficulty === 'medium') codingMedium++;
      else if (entry.difficulty === 'hard') codingHard++;
    }
    for (const topic of entry.topics) {
      if (topic.trim()) topics.add(topic);
    }
  }

  const behavioralThemesReady = state.behavioralAnswers.filter(a => isThemeReady(a.bullets)).length;

  return {
    huntPersona: state.huntPersona,
    daysInSearch: computeDaysInSearch(state),
    streakDays,
    protocolCompletionRate: computeProtocolCompletionRate(state.dailyLogs, tasks),
    appsPerWeek: pace.appsPerWeek,
    submitted: funnel.applied + funnel.interviewing + funnel.offer + funnel.rejected,
    interviewing: funnel.interviewing,
    offers: funnel.offer,
    rejected: funnel.rejected,
    appliedToInterview: conversions.appliedToInterview,
    interviewToOffer: conversions.interviewToOffer,
    codingCompleted,
    codingEasy,
    codingMedium,
    codingHard,
    codingTopics: [...topics].slice(0, 20),
    behavioralThemesReady,
    behavioralThemesTotal: Math.max(state.behavioralAnswers.length, BEHAVIORAL_THEMES.length),
    profileReady: Boolean(state.baseCV?.trim()),
    portfolioReady: Boolean(state.portfolioUrl?.trim()),
  };
}

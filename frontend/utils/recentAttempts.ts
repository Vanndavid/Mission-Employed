/**
 * Mission Control's "Recent attempts": Problems' tutor attempts
 * (coding_attempts, dated by day) and the other modes' scored attempts
 * (practice_attempts, timestamped) in one list, newest first. A practice
 * attempt links to its page in the history.
 */

import { CodingHistoryEntry } from '../types';
import { PracticeKind } from '../types/practice';
import { PracticeAttemptSummary } from '../types/practiceHistory';
import { getLocalDateString } from '../utils';
import { languageLabel } from './codeReview';
import { MODE_LABELS } from './practiceLinks';

export interface RecentAttemptRow {
  key: string;
  mode: 'problems' | PracticeKind;
  /** The local day, YYYY-MM-DD: all Problems' attempts carry. */
  date: string;
  title: string;
  detail: string;
  outcome: { text: string; good: boolean };
  /** A practice attempt's id, for its history page; null for Problems. */
  attemptId: number | null;
}

/** A scored mode at or above this percent reads as a good attempt. */
const GOOD_PERCENT = 70;

export function attemptOutcome(attempt: PracticeAttemptSummary): { text: string; good: boolean } {
  if (attempt.kind === 'quiz') {
    return attempt.correct ? { text: 'Right', good: true } : { text: 'Wrong', good: false };
  }
  const percent = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
  return { text: `${attempt.score} / ${attempt.maxScore}`, good: percent >= GOOD_PERCENT };
}

export function attemptDetail(attempt: PracticeAttemptSummary): string {
  const parts: string[] = [MODE_LABELS[attempt.kind]];
  if (attempt.language) parts.push(languageLabel(attempt.language));
  parts.push(attempt.kind === 'quiz' ? attempt.topicLabel ?? attempt.topic ?? '' : attempt.difficulty);
  return parts.filter(Boolean).join(' · ');
}

export function recentAttempts(
  coding: CodingHistoryEntry[],
  practice: PracticeAttemptSummary[],
  limit = 10,
): RecentAttemptRow[] {
  const scored: RecentAttemptRow[] = [...practice]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(attempt => ({
      key: `practice-${attempt.id}`,
      mode: attempt.kind,
      date: getLocalDateString(new Date(attempt.createdAt)),
      title: attempt.title,
      detail: attemptDetail(attempt),
      outcome: attemptOutcome(attempt),
      attemptId: attempt.id,
    }));

  const problems: RecentAttemptRow[] = coding.map((entry, i) => ({
    key: `problem-${entry.id ?? `${entry.date}-${i}`}`,
    mode: 'problems',
    date: entry.date,
    title: entry.title,
    detail: `${entry.difficulty} · ${entry.topics.join(', ') || 'General'}`,
    outcome: entry.completed ? { text: '✓', good: true } : { text: '—', good: false },
    attemptId: null,
  }));

  // Stable: on the same day a scored attempt, which has a time, comes first.
  return [...scored, ...problems].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

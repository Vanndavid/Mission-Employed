import { CodingHistoryEntry } from '../types';
import { PracticeKind } from '../types/practice';
import { PracticeProgress } from '../types/practiceHistory';

export interface WeakTopic {
  topic: string;
  completed: number;
  attempted: number;
  completionRate: number;
  /** Problems' tutor attempts, or a practice mode's progress. */
  mode?: 'problems' | PracticeKind;
  /** What completed and attempted count when it is not attempts. */
  unit?: string;
}

/**
 * Weakest first. Problems' topics come from its coding attempts; with
 * `practice` (GET /api/practice/progress, the last 30 days) the other modes
 * join them: a quiz topic by answers right, a code review category by
 * planted issues found, a system design trait by points earned.
 */
export function computeWeakTopics(
  history: CodingHistoryEntry[],
  minAttempts = 1,
  practice: PracticeProgress | null = null,
): WeakTopic[] {
  const byTopic: Record<string, { completed: number; attempted: number }> = {};

  for (const entry of history) {
    const topics = entry.topics.length > 0 ? entry.topics : inferTopicsFromTitle(entry.title);
    for (const topic of topics) {
      if (!byTopic[topic]) byTopic[topic] = { completed: 0, attempted: 0 };
      byTopic[topic].attempted++;
      if (entry.completed) byTopic[topic].completed++;
    }
  }

  const problems: WeakTopic[] = Object.entries(byTopic)
    .filter(([, stats]) => stats.attempted >= minAttempts)
    .map(([topic, stats]) => ({
      topic,
      completed: stats.completed,
      attempted: stats.attempted,
      completionRate: Math.round((stats.completed / stats.attempted) * 100),
      mode: 'problems',
    }));

  return [...problems, ...practiceWeakTopics(practice, minAttempts)].sort(
    (a, b) => a.completionRate - b.completionRate || a.attempted - b.attempted,
  );
}

function practiceWeakTopics(practice: PracticeProgress | null, minAttempts: number): WeakTopic[] {
  if (!practice) return [];

  const quiz = practice.quiz.languages.flatMap(language =>
    language.topics
      .filter(topic => topic.answered >= minAttempts && topic.accuracy !== null)
      .map(
        (topic): WeakTopic => ({
          topic: `${language.label} · ${topic.label}`,
          completed: topic.correct,
          attempted: topic.answered,
          completionRate: topic.accuracy ?? 0,
          mode: 'quiz',
        }),
      ),
  );

  const codeReview = practice.codeReview.categories
    .filter(category => category.planted >= minAttempts && category.foundRate !== null)
    .map(
      (category): WeakTopic => ({
        topic: `Code review · ${category.label}`,
        completed: category.found,
        attempted: category.planted,
        completionRate: category.foundRate ?? 0,
        mode: 'code_review',
      }),
    );

  const systemDesign = practice.systemDesign.traits
    .filter(trait => trait.attempts >= minAttempts && trait.average !== null)
    .map(
      (trait): WeakTopic => ({
        topic: `System design · ${trait.label}`,
        completed: Math.round((trait.averagePoints ?? 0) * trait.attempts),
        attempted: trait.maxPoints * trait.attempts,
        completionRate: trait.average ?? 0,
        mode: 'system_design',
        unit: 'pts',
      }),
    );

  return [...quiz, ...codeReview, ...systemDesign];
}

export function inferTopicsFromTitle(title: string): string[] {
  const lower = title.toLowerCase();
  const keywords: [RegExp, string][] = [
    [/array|two.?sum|subarray/, 'Arrays'],
    [/string|anagram|palindrome/, 'Strings'],
    [/hash|map|dict|frequency/, 'Hash Maps'],
    [/tree|bst|binary/, 'Trees'],
    [/graph|bfs|dfs/, 'Graphs'],
    [/sql|query|join/, 'SQL'],
    [/stack|queue/, 'Stacks/Queues'],
    [/dynamic|dp/, 'Dynamic Programming'],
    [/binary search|sorted/, 'Binary Search'],
    [/linked.?list/, 'Linked Lists'],
  ];
  const found = keywords.filter(([re]) => re.test(lower)).map(([, label]) => label);
  return found.length > 0 ? found : ['General'];
}

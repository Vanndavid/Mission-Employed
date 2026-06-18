import { CodingHistoryEntry } from '../types';

export interface WeakTopic {
  topic: string;
  completed: number;
  attempted: number;
  completionRate: number;
}

export function computeWeakTopics(history: CodingHistoryEntry[], minAttempts = 1): WeakTopic[] {
  const byTopic: Record<string, { completed: number; attempted: number }> = {};

  for (const entry of history) {
    const topics = entry.topics.length > 0 ? entry.topics : inferTopicsFromTitle(entry.title);
    for (const topic of topics) {
      if (!byTopic[topic]) byTopic[topic] = { completed: 0, attempted: 0 };
      byTopic[topic].attempted++;
      if (entry.completed) byTopic[topic].completed++;
    }
  }

  return Object.entries(byTopic)
    .filter(([, stats]) => stats.attempted >= minAttempts)
    .map(([topic, stats]) => ({
      topic,
      completed: stats.completed,
      attempted: stats.attempted,
      completionRate: Math.round((stats.completed / stats.attempted) * 100),
    }))
    .sort((a, b) => a.completionRate - b.completionRate || a.attempted - b.attempted);
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

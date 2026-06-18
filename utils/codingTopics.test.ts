import { describe, it, expect } from 'vitest';
import { computeWeakTopics, inferTopicsFromTitle } from './codingTopics';
import { CodingHistoryEntry } from '../types';

describe('codingTopics', () => {
  it('infers topics from problem title', () => {
    expect(inferTopicsFromTitle('Two Sum Array Problem')).toContain('Arrays');
    expect(inferTopicsFromTitle('SQL Join Query')).toContain('SQL');
  });

  it('computes weak topics by completion rate', () => {
    const history: CodingHistoryEntry[] = [
      { date: '2025-01-01', difficulty: 'easy', title: 'Two Sum', completed: true, topics: ['Arrays'] },
      { date: '2025-01-02', difficulty: 'medium', title: 'Array Rotation', completed: false, topics: ['Arrays'] },
      { date: '2025-01-03', difficulty: 'easy', title: 'SQL Query', completed: true, topics: ['SQL'] },
    ];
    const weak = computeWeakTopics(history);
    expect(weak[0].topic).toBe('Arrays');
    expect(weak[0].completionRate).toBe(50);
  });
});

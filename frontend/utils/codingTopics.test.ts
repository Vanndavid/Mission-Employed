import { describe, it, expect } from 'vitest';
import { computeWeakTopics, inferTopicsFromTitle } from './codingTopics';
import { CodingHistoryEntry } from '../types';
import { PracticeProgress } from '../types/practiceHistory';

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

  it('adds the practice modes: quiz topics, code review categories and design traits', () => {
    const history: CodingHistoryEntry[] = [
      { date: '2025-01-01', difficulty: 'easy', title: 'Two Sum', completed: true, topics: ['Arrays'] },
      { date: '2025-01-02', difficulty: 'medium', title: 'Array Rotation', completed: false, topics: ['Arrays'] },
    ];
    const practice = {
      quiz: {
        languages: [
          {
            key: 'javascript',
            label: 'JavaScript',
            topics: [
              { key: 'async', label: 'Async', answered: 4, correct: 1, accuracy: 25, openMistakes: 3, recent: [] },
              { key: 'scope', label: 'Scope', answered: 0, correct: 0, accuracy: null, openMistakes: 0, recent: [] },
            ],
          },
        ],
      },
      codeReview: {
        categories: [
          { key: 'security', label: 'Security', planted: 3, found: 2, foundRate: 67, recent: [] },
          { key: 'bug', label: 'Bug', planted: 0, found: 0, foundRate: null, recent: [] },
        ],
      },
      systemDesign: {
        traits: [
          { key: 'estimation', label: 'Estimation', maxPoints: 12, attempts: 2, averagePoints: 3, average: 25, recent: [] },
          { key: 'architecture', label: 'Architecture', maxPoints: 20, attempts: 0, averagePoints: null, average: null, recent: [] },
        ],
      },
    } as unknown as PracticeProgress;

    const weak = computeWeakTopics(history, 1, practice);

    expect(weak.map(w => [w.topic, w.completionRate, w.mode])).toEqual([
      ['JavaScript · Async', 25, 'quiz'],
      ['System design · Estimation', 25, 'system_design'],
      ['Arrays', 50, 'problems'],
      ['Code review · Security', 67, 'code_review'],
    ]);
    // A trait is counted in points: 3 of 12, twice.
    expect(weak[1]).toMatchObject({ completed: 6, attempted: 24, unit: 'pts' });
  });
});

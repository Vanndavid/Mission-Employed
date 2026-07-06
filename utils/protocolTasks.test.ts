
import { describe, it, expect } from 'vitest';
import { resolveBehavioralTaskId } from './protocolTasks';

describe('resolveBehavioralTaskId', () => {
  it('returns first incomplete behavioral task', () => {
    const tasks = [
      { id: 'codingEasy', label: 'Easy', time: '60m' },
      { id: 'behavioral1', label: 'B1', time: '20m' },
      { id: 'behavioral2', label: 'B2', time: '20m' },
    ];
    expect(resolveBehavioralTaskId(tasks, { behavioral1: true })).toBe('behavioral2');
  });

  it('returns behavioral when single task incomplete', () => {
    const tasks = [{ id: 'behavioral', label: 'B', time: '20m' }];
    expect(resolveBehavioralTaskId(tasks, {})).toBe('behavioral');
  });
});

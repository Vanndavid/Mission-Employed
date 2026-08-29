
import { describe, it, expect } from 'vitest';
import { migrateState, createDefaultState, CURRENT_SCHEMA } from './migrateState';
import { JobStatus } from '../types';

describe('migrateState', () => {
  it('creates default state with schema version', () => {
    const state = createDefaultState();
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(state.codingHistory).toEqual([]);
    expect(state.applications).toEqual([]);
    expect(state.behavioralAnswers.length).toBeGreaterThan(0);
  });

  it('migrates legacy state without new fields', () => {
    const legacy = {
      applications: [{
        id: '1',
        company: 'Acme',
        role: 'Engineer',
        url: '',
        dateApplied: '2025-01-01',
        status: JobStatus.APPLIED,
        notes: 'Some JD text',
      }],
      behavioralAnswers: [],
      baseCV: '',
      baseCoverLetter: '',
    };
    const migrated = migrateState(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(migrated.applications[0].jobDescription).toBe('Some JD text');
    expect(migrated.applications[0].interviewStages).toEqual([]);
    expect(migrated.cvTemplate).toBe('');
  });

  it('drops keys belonging to removed features', () => {
    const legacy = {
      schemaVersion: 3,
      applications: [{
        id: '1',
        company: 'Acme',
        role: 'Engineer',
        url: '',
        dateApplied: '2025-01-01',
        status: JobStatus.APPLIED,
        criteriaScore: 4,
        criteriaMet: ['a'],
        notes: 'JD',
      }],
      dailyLogs: { '2025-01-01': { date: '2025-01-01', completions: { codingEasy: true } } },
      customCriteria: [{ id: 'a', label: 'A' }],
      targetScore: 4,
      huntPersona: 'big_tech',
      contacts: [{ id: 'c1', name: 'Rec' }],
      behavioralAnswers: [],
      baseCV: '',
      baseCoverLetter: '',
    };
    const migrated = migrateState(legacy) as unknown as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA);
    for (const key of ['dailyLogs', 'customCriteria', 'targetScore', 'huntPersona', 'contacts']) {
      expect(migrated).not.toHaveProperty(key);
    }
    const app = (migrated.applications as Record<string, unknown>[])[0];
    expect(app).not.toHaveProperty('criteriaScore');
    expect(app).not.toHaveProperty('criteriaMet');
    expect(app.company).toBe('Acme');
  });
});

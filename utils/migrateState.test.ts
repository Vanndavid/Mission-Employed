
import { describe, it, expect } from 'vitest';
import { migrateState, createDefaultState, CURRENT_SCHEMA } from './migrateState';
import { JobStatus } from '../types';

describe('migrateState', () => {
  it('creates default state with schema version', () => {
    const state = createDefaultState();
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(state.huntPersona).toBe('maintenance_swe');
    expect(state.codingHistory).toEqual([]);
    expect(state.contacts).toEqual([]);
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
        criteriaScore: 4,
        criteriaMet: ['a'],
        notes: 'Some JD text',
      }],
      dailyLogs: {},
      behavioralAnswers: [],
      customCriteria: [],
      targetScore: 4,
      baseCV: '',
      baseCoverLetter: '',
    };
    const migrated = migrateState(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(migrated.huntPersona).toBe('maintenance_swe');
    expect(migrated.applications[0].jobDescription).toBe('Some JD text');
    expect(migrated.applications[0].interviewStages).toEqual([]);
  });
});

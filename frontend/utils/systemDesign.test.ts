import { beforeEach, describe, expect, it } from 'vitest';
import { SystemDesignRubric, SystemDesignScenario } from '../types/systemDesign';
import {
  clearDraft,
  countWords,
  emptySections,
  gatedTraits,
  hasWriting,
  loadDraft,
  saveDraft,
  scoreBand,
  totalWords,
  traitWords,
} from './systemDesign';

/**
 * What the screen works out before asking the server: word counts and the
 * gate, which mirror SystemDesignRubric on the server, and the draft kept in
 * this browser until it is scored.
 */

const descriptors = ['none', 'weak', 'some', 'good', 'full'];

const RUBRIC: SystemDesignRubric = {
  version: 'sd-1',
  traitMax: 4,
  maxScore: 100,
  minWords: 15,
  sections: [
    { key: 'requirements', label: 'Requirements', hint: 'What it must do.' },
    { key: 'estimates', label: 'Estimates', hint: 'Traffic and storage.' },
    { key: 'api', label: 'API', hint: 'The operations.' },
    { key: 'data_model', label: 'Data model', hint: 'Entities and keys.' },
    { key: 'high_level', label: 'High-level design', hint: 'Components and paths.' },
    { key: 'deep_dive', label: 'Deep dive and scaling', hint: 'The bottleneck.' },
    { key: 'tradeoffs', label: 'Trade-offs and failure modes', hint: 'What fails.' },
  ],
  traits: [
    { key: 'requirements', label: 'Requirements and scope', weight: 12, sections: ['requirements'], descriptors },
    { key: 'estimation', label: 'Estimation', weight: 12, sections: ['estimates'], descriptors },
    { key: 'api_data_model', label: 'API and data model', weight: 16, sections: ['api', 'data_model'], descriptors },
    { key: 'architecture', label: 'Architecture', weight: 20, sections: ['high_level'], descriptors },
    { key: 'scalability', label: 'Scalability', weight: 16, sections: ['deep_dive'], descriptors },
    { key: 'reliability', label: 'Reliability and trade-offs', weight: 16, sections: ['tradeoffs'], descriptors },
    {
      key: 'communication',
      label: 'Communication',
      weight: 8,
      sections: ['requirements', 'estimates', 'api', 'data_model', 'high_level', 'deep_dive', 'tradeoffs'],
      descriptors,
    },
  ],
};

const SCENARIO: SystemDesignScenario = {
  id: 7,
  title: 'URL shortener',
  difficulty: 'easy',
  prompt: 'Design a URL shortener for 100 million new links a month.',
};

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

beforeEach(() => {
  localStorage.clear();
});

describe('countWords', () => {
  it('counts runs that contain a letter or digit, as the server does', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  \n - -> | ')).toBe(0);
    expect(countWords('Shard by short code.')).toBe(4);
    expect(countWords('- 100M links/month\n- ~40 writes/s')).toBe(4);
  });
});

describe('the gate', () => {
  it('gates a trait whose sections have fewer than 15 words between them', () => {
    const sections = {
      ...emptySections(),
      requirements: words(15),
      estimates: words(14),
      api: words(8),
      data_model: words(7),
      high_level: words(3),
    };

    expect(gatedTraits(RUBRIC, sections).map(t => t.key)).toEqual(['estimation', 'architecture', 'scalability', 'reliability']);
    expect(traitWords(RUBRIC, sections)).toMatchObject({ api_data_model: 15, communication: 47 });
    expect(totalWords(sections)).toBe(47);
  });

  it('gates everything when nothing is written', () => {
    expect(gatedTraits(RUBRIC, emptySections())).toHaveLength(7);
    expect(hasWriting(emptySections())).toBe(false);
    expect(hasWriting({ ...emptySections(), api: 'POST' })).toBe(true);
  });
});

describe('scoreBand', () => {
  it('reads a total as strong, fair or weak', () => {
    expect([90, 75, 74, 50, 49, 0].map(score => scoreBand(score).label)).toEqual([
      'Strong',
      'Strong',
      'Fair',
      'Fair',
      'Weak',
      'Weak',
    ]);
  });
});

describe('the draft', () => {
  it('keeps the scenario and the sections for the account that wrote them', () => {
    const sections = { ...emptySections(), requirements: 'Short links that redirect.' };
    saveDraft(3, SCENARIO, sections);

    expect(loadDraft(3)).toEqual({ scenario: SCENARIO, sections });
    expect(loadDraft(4)).toBeNull();

    clearDraft();
    expect(loadDraft(3)).toBeNull();
  });

  it('ignores storage it cannot read', () => {
    localStorage.setItem('mission_employed_system_design_draft', '{not json');
    expect(loadDraft(3)).toBeNull();

    localStorage.setItem(
      'mission_employed_system_design_draft',
      JSON.stringify({ userId: 3, scenario: { id: 'x' }, sections: {} }),
    );
    expect(loadDraft(3)).toBeNull();
  });

  it('fills in a section the stored draft lacks and drops one it does not know', () => {
    localStorage.setItem(
      'mission_employed_system_design_draft',
      JSON.stringify({ userId: 3, scenario: SCENARIO, sections: { api: 'POST /links', summary: 'x', estimates: 5 } }),
    );

    expect(loadDraft(3)?.sections).toEqual({ ...emptySections(), api: 'POST /links' });
  });
});

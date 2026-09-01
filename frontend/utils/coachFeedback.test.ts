import { describe, expect, it } from 'vitest';
import { inlineSegments, parseCoachFeedback } from './coachFeedback';

const MODEL_SHAPE = [
  '### 🎯 Execution Summary',
  '* Opened with a clear situation and named the stakeholders.',
  '* The result was quantified.',
  '',
  '### ⚖️ Unbiased Critiques',
  '* The task and action blurred together.',
  '* Your saved fact about the migration went uncited.',
  '',
  '### 🚀 Training Directives',
  '* Name the decision you personally owned.',
].join('\n');

describe('parseCoachFeedback', () => {
  it('splits the evaluator response into its three sections', () => {
    const sections = parseCoachFeedback(MODEL_SHAPE);

    expect(sections).toHaveLength(3);
    expect(sections.map(s => s.title)).toEqual([
      'Execution Summary',
      'Unbiased Critiques',
      'Training Directives',
    ]);
  });

  it('keeps the heading emoji apart from the heading text', () => {
    const [summary] = parseCoachFeedback(MODEL_SHAPE);

    expect(summary.icon).toBe('🎯');
    expect(summary.title).toBe('Execution Summary');
  });

  it('collects the bullets under each heading', () => {
    const [summary, critiques] = parseCoachFeedback(MODEL_SHAPE);

    expect(summary.bullets).toEqual([
      'Opened with a clear situation and named the stakeholders.',
      'The result was quantified.',
    ]);
    expect(critiques.bullets).toHaveLength(2);
  });

  it('accepts dash bullets and a heading with no emoji', () => {
    const [section] = parseCoachFeedback('## Execution Summary\n- One point');

    expect(section.icon).toBeNull();
    expect(section.title).toBe('Execution Summary');
    expect(section.bullets).toEqual(['One point']);
  });

  it('keeps unheaded prose rather than dropping it', () => {
    const sections = parseCoachFeedback('You rambled a little.\n\n### 🎯 Summary\n* Tighten it.');

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('');
    expect(sections[0].paragraphs).toEqual(['You rambled a little.']);
  });

  it('returns a single section when the model ignores the format', () => {
    const sections = parseCoachFeedback('Solid answer overall.');

    expect(sections).toEqual([
      { icon: null, title: '', bullets: [], paragraphs: ['Solid answer overall.'] },
    ]);
  });

  it('returns nothing for an empty response', () => {
    expect(parseCoachFeedback('')).toEqual([]);
    expect(parseCoachFeedback('   \n  ')).toEqual([]);
  });
});

describe('inlineSegments', () => {
  it('marks the emphasised run', () => {
    expect(inlineSegments('Name the **decision** you owned')).toEqual([
      { text: 'Name the ', bold: false },
      { text: 'decision', bold: true },
      { text: ' you owned', bold: false },
    ]);
  });

  it('leaves an unclosed marker as literal text', () => {
    expect(inlineSegments('Half **open')).toEqual([{ text: 'Half **open', bold: false }]);
  });

  it('handles a line with no emphasis', () => {
    expect(inlineSegments('Plain line')).toEqual([{ text: 'Plain line', bold: false }]);
  });
});

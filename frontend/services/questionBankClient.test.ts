import { describe, expect, it } from 'vitest';
import { questionQuery } from './questionBankClient';

describe('questionQuery', () => {
  it('is empty with no filters on the first page', () => {
    expect(questionQuery({})).toBe('');
    expect(questionQuery({ kind: '', status: '', topic: '', reported: false })).toBe('');
  });

  it('sends only the filters that are set, and the page after the first', () => {
    expect(questionQuery({ kind: 'quiz', status: 'draft', language: 'sql', topic: 'joins', reported: true }, 3)).toBe(
      '?kind=quiz&status=draft&language=sql&topic=joins&reported=1&page=3',
    );
    expect(questionQuery({ source: 'ai' }, 1)).toBe('?source=ai');
  });
});

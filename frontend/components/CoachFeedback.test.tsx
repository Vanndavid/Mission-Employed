// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CoachFeedback } from './CoachFeedback';

/**
 * The evaluator's Markdown used to be dumped into a `whitespace-pre-wrap` div,
 * so the reader saw the literal `###` and `*` characters. These lock in that
 * it is rendered as structure instead.
 */

const FEEDBACK = [
  '### 🎯 Execution Summary',
  '* You named the stakeholders early.',
  '',
  '### ⚖️ Unbiased Critiques',
  '* The **action** blurred into the result.',
  '',
  '### 🚀 Training Directives',
  '* Quantify the outcome.',
].join('\n');

afterEach(cleanup);

describe('CoachFeedback', () => {
  it('renders each section heading as text, without the Markdown markers', () => {
    render(<CoachFeedback markdown={FEEDBACK} />);

    expect(screen.getByText('Execution Summary')).toBeTruthy();
    expect(screen.getByText('Unbiased Critiques')).toBeTruthy();
    expect(screen.getByText('Training Directives')).toBeTruthy();
    expect(document.body.textContent).not.toContain('###');
  });

  it('renders bullets as list items rather than asterisks', () => {
    render(<CoachFeedback markdown={FEEDBACK} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('You named the stakeholders early.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('* You named');
  });

  it('emphasises a bolded run instead of showing the asterisks', () => {
    render(<CoachFeedback markdown={FEEDBACK} />);

    const emphasised = screen.getByText('action');
    expect(emphasised.tagName).toBe('STRONG');
    expect(document.body.textContent).not.toContain('**');
  });

  it('says so when the model returned nothing', () => {
    render(<CoachFeedback markdown="" />);

    expect(screen.getByText(/no written feedback/i)).toBeTruthy();
  });
});

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../services/http';
import { SystemDesignNext, SystemDesignReport, SystemDesignRubric, SystemDesignScenario } from '../types/systemDesign';

/**
 * The system design screen: a scenario, a sectioned answer with word counts
 * and the gate shown up front, a draft kept in this browser, and a report
 * that says how the score was reached. The score itself is the server's.
 */

const traitDescriptors = (name: string) => [0, 1, 2, 3, 4].map(score => `${name} descriptor ${score}`);

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
    { key: 'requirements', label: 'Requirements and scope', weight: 12, sections: ['requirements'], descriptors: traitDescriptors('Requirements') },
    { key: 'estimation', label: 'Estimation', weight: 12, sections: ['estimates'], descriptors: traitDescriptors('Estimation') },
    { key: 'api_data_model', label: 'API and data model', weight: 16, sections: ['api', 'data_model'], descriptors: traitDescriptors('API') },
    { key: 'architecture', label: 'Architecture', weight: 20, sections: ['high_level'], descriptors: traitDescriptors('Architecture') },
    { key: 'scalability', label: 'Scalability', weight: 16, sections: ['deep_dive'], descriptors: traitDescriptors('Scalability') },
    { key: 'reliability', label: 'Reliability and trade-offs', weight: 16, sections: ['tradeoffs'], descriptors: traitDescriptors('Reliability') },
    {
      key: 'communication',
      label: 'Communication',
      weight: 8,
      sections: ['requirements', 'estimates', 'api', 'data_model', 'high_level', 'deep_dive', 'tradeoffs'],
      descriptors: traitDescriptors('Communication'),
    },
  ],
};

const SHORTENER: SystemDesignScenario = {
  id: 7,
  title: 'URL shortener',
  difficulty: 'easy',
  prompt: 'Design a URL shortener for 100 million new links a month.',
};

const FEED: SystemDesignScenario = {
  id: 8,
  title: 'Social news feed',
  difficulty: 'hard',
  prompt: 'Design the home feed for 200 million daily users.',
};

const next = (question: SystemDesignScenario | null): SystemDesignNext => ({ question, rubric: RUBRIC });

const trait = (key: string, label: string, score: number, extra: Partial<SystemDesignReport['traits'][number]> = {}) => ({
  key: key as SystemDesignReport['traits'][number]['key'],
  label,
  score,
  max: 4,
  points: score * 3,
  maxPoints: 12,
  gated: false,
  words: 40,
  descriptor: `${label} descriptor ${score}`,
  evidence: null,
  improvement: null,
  keyPoints: { covered: [], missed: [] },
  ...extra,
});

const REPORT: SystemDesignReport = {
  attemptId: 31,
  questionId: 7,
  rubricVersion: 'sd-1',
  score: 69,
  maxScore: 100,
  explanation: 'A read-heavy key-value problem in disguise.',
  traits: [
    trait('requirements', 'Requirements and scope', 4, {
      evidence: 'p99 under 50 ms',
      improvement: 'Say what is out of scope.',
      keyPoints: { covered: ['Separates create from redirect'], missed: ['Decides on duplicate long URLs'] },
    }),
    trait('estimation', 'Estimation', 0, {
      gated: true,
      words: 3,
      descriptor: 'Estimation descriptor 0',
      improvement: 'Estimates had 3 words: a trait needs at least 15 to be assessed.',
      keyPoints: { covered: [], missed: ['About 40 new links a second'] },
    }),
    trait('scalability', 'Scalability', 3, {
      evidence: 'Shard the links table by short code.',
      keyPoints: { covered: ['Shard by short code'], missed: [] },
    }),
  ],
};

const fetchNextScenario = vi.fn();
const submitSystemDesign = vi.fn();
const refreshUser = vi.fn();

vi.mock('../services/systemDesignClient', () => ({
  fetchNextScenario: (...args: unknown[]) => fetchNextScenario(...args),
  submitSystemDesign: (...args: unknown[]) => submitSystemDesign(...args),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, isPremium: true, refreshUser }),
}));

const { SystemDesignMode } = await import('./SystemDesignMode');

const DRAFT_KEY = 'mission_employed_system_design_draft';
const FIFTEEN = 'We need short links that redirect quickly and stay up, with p99 latency under fifty milliseconds always.';

const box = (label: string) => screen.getByRole('textbox', { name: label }) as HTMLTextAreaElement;
const scoreButton = () => screen.getByRole('button', { name: 'Score my design' });

async function open() {
  render(<SystemDesignMode />);
  await screen.findByRole('heading', { name: SHORTENER.title });
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  fetchNextScenario.mockReset().mockResolvedValue(next(SHORTENER));
  submitSystemDesign.mockReset();
  refreshUser.mockReset();
});

describe('SystemDesignMode', () => {
  it('shows the scenario and one box per section, each with a word count', async () => {
    await open();

    expect(screen.getByText(SHORTENER.prompt)).toBeInTheDocument();
    expect(screen.getByText('easy')).toBeInTheDocument();
    for (const section of RUBRIC.sections) {
      expect(box(section.label)).toHaveValue('');
    }
    expect(screen.getAllByText('0 words')).toHaveLength(7);
    expect(scoreButton()).toBeDisabled();
  });

  it('shows the gate before submitting and which traits would score 0', async () => {
    await open();

    const gate = screen.getByRole('note', { name: 'How it is scored' });
    expect(gate).toHaveTextContent('fewer than 15 words');
    expect(gate).toHaveTextContent('scores 0');

    fireEvent.change(box('Requirements'), { target: { value: FIFTEEN } });
    expect(screen.getByText('17 words')).toBeInTheDocument();
    expect(scoreButton()).toBeEnabled();

    // Requirements and Communication have enough; the rest would score 0.
    const zero = within(gate).getByRole('list', { name: 'Would score 0' });
    expect(within(zero).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Estimation',
      'API and data model',
      'Architecture',
      'Scalability',
      'Reliability and trade-offs',
    ]);

    // A section with a few words says what it will cost.
    fireEvent.change(box('Estimates'), { target: { value: 'About 40 writes a second.' } });
    expect(screen.getByText(/Under 15 words: Estimation will score 0/)).toBeInTheDocument();
  });

  it('keeps a draft in this browser and resumes it, scenario and all', async () => {
    await open();
    fireEvent.change(box('API'), { target: { value: 'POST /links' } });

    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    expect(stored).toMatchObject({ userId: 1, scenario: SHORTENER, sections: { api: 'POST /links' } });

    // Next time the server offers another scenario, but the draft wins.
    cleanup();
    fetchNextScenario.mockResolvedValue(next(FEED));
    await open();
    expect(box('API')).toHaveValue('POST /links');
    expect(screen.getByText(/Resumed your draft/)).toBeInTheDocument();
  });

  it('scores the answer and shows how the score was reached', async () => {
    submitSystemDesign.mockResolvedValue(REPORT);
    await open();
    fireEvent.change(box('Requirements'), { target: { value: FIFTEEN } });
    fireEvent.click(scoreButton());

    await screen.findByLabelText('Score 69 out of 100');
    expect(submitSystemDesign).toHaveBeenCalledWith(7, expect.objectContaining({ requirements: FIFTEEN, estimates: '' }));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    const traits = within(screen.getByRole('list', { name: 'Rubric traits' })).getAllByRole('listitem');
    expect(traits).toHaveLength(3);
    expect(traits[0]).toHaveTextContent('Requirements and scope');
    expect(traits[0]).toHaveTextContent('12 / 12');
    expect(traits[0]).toHaveTextContent('Requirements and scope descriptor 4');
    expect(traits[0]).toHaveTextContent('p99 under 50 ms');
    expect(traits[0]).toHaveTextContent('Say what is out of scope.');
    expect(traits[1]).toHaveTextContent('Not assessed');
    expect(traits[1]).toHaveTextContent('needs at least 15');

    const covered = within(screen.getByRole('list', { name: 'Key points covered' })).getAllByRole('listitem');
    expect(covered).toHaveLength(2);
    expect(covered[0]).toHaveTextContent('Separates create from redirect');
    expect(covered[0]).toHaveTextContent('Requirements and scope');
    expect(covered[1]).toHaveTextContent('Shard by short code');
    const missed = within(screen.getByRole('list', { name: 'Key points missed' })).getAllByRole('listitem');
    expect(missed).toHaveLength(2);
    expect(screen.getByText(REPORT.explanation)).toBeInTheDocument();

    // The descriptors are folded away until asked for.
    expect(screen.queryByText('Architecture descriptor 2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /How this was scored/ }));
    expect(screen.getByText('Architecture descriptor 2')).toBeInTheDocument();
    expect(screen.getByText(/Rubric sd-1/)).toBeInTheDocument();
  });

  it('can go back to revise the same answer', async () => {
    submitSystemDesign.mockResolvedValue(REPORT);
    await open();
    fireEvent.change(box('Requirements'), { target: { value: FIFTEEN } });
    fireEvent.click(scoreButton());
    await screen.findByLabelText('Score 69 out of 100');

    fireEvent.click(screen.getByRole('button', { name: 'Revise this answer' }));
    expect(box('Requirements')).toHaveValue(FIFTEEN);
  });

  it("shows the plan's refusal as the server put it, and keeps the draft", async () => {
    submitSystemDesign.mockRejectedValue(
      new ApiError(429, 'You have reached your System design practice limit (20 per day).', 'quota_exceeded'),
    );
    await open();
    fireEvent.change(box('Requirements'), { target: { value: FIFTEEN } });
    fireEvent.click(scoreButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('You have reached your System design practice limit (20 per day).');
    expect(box('Requirements')).toHaveValue(FIFTEEN);
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null').sections.requirements).toBe(FIFTEEN);
  });

  it('says when the AI could not be reached, without losing the answer', async () => {
    submitSystemDesign.mockRejectedValue(new ApiError(502, 'The AI service is unavailable right now.', 'ai_unavailable'));
    await open();
    fireEvent.change(box('Requirements'), { target: { value: FIFTEEN } });
    fireEvent.click(scoreButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was lost');
    expect(box('Requirements')).toHaveValue(FIFTEEN);
  });

  it('fetches another scenario at the chosen difficulty, passing over this one', async () => {
    await open();
    fetchNextScenario.mockResolvedValue(next(FEED));

    fireEvent.click(screen.getByRole('button', { name: 'Hard' }));
    await screen.findByRole('heading', { name: FEED.title });
    expect(fetchNextScenario).toHaveBeenLastCalledWith({ difficulty: 'hard', skip: SHORTENER.id });

    fireEvent.click(screen.getByRole('button', { name: 'Another scenario' }));
    await waitFor(() => expect(fetchNextScenario).toHaveBeenLastCalledWith({ difficulty: 'hard', skip: FEED.id }));
  });

  it('asks before throwing a draft away for another scenario', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await open();
    fireEvent.change(box('API'), { target: { value: 'POST /links' } });

    fireEvent.click(screen.getByRole('button', { name: 'Another scenario' }));
    expect(confirm).toHaveBeenCalled();
    expect(fetchNextScenario).toHaveBeenCalledTimes(1);
    expect(box('API')).toHaveValue('POST /links');
  });

  it('says so when no scenario is published yet', async () => {
    fetchNextScenario.mockResolvedValue(next(null));
    render(<SystemDesignMode />);

    expect(await screen.findByText(/No system design scenarios/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Score my design' })).not.toBeInTheDocument();
  });
});

import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { aiFailureMessage, ApiError, isAbortError } from '../services/http';
import { fetchNextScenario, submitSystemDesign } from '../services/systemDesignClient';
import { PracticeDifficulty } from '../types/practice';
import {
  SystemDesignReport,
  SystemDesignRubric,
  SystemDesignRubricTrait,
  SystemDesignScenario,
  SystemDesignSectionKey,
  SystemDesignSections,
  SystemDesignTraitResult,
} from '../types/systemDesign';
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
} from '../utils/systemDesign';

/**
 * Mission Control's System design mode: a scenario answered in fixed
 * sections and scored against a fixed rubric. The server applies the word
 * gates, the AI rates the remaining traits against written descriptors and
 * the scenario's key points, and the server adds it up
 * (App\Services\Practice\SystemDesignRubric). Nothing here computes a score:
 * the form only shows the gate before it is applied.
 *
 * A Premium feature (`system_design`), behind a PremiumGate in App.tsx; each
 * scored answer is one use. The answer in progress is kept in this browser
 * until it is scored.
 */

const card = 'bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm';

const DIFFICULTIES: { key: PracticeDifficulty | null; label: string }[] = [
  { key: null, label: 'Any' },
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A trait that reads the whole answer (Communication) is not any one section's. */
const readsWholeAnswer = (rubric: SystemDesignRubric, trait: SystemDesignRubricTrait) =>
  trait.sections.length === rubric.sections.length;

export function SystemDesignMode() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { noteRefusal } = useSubscription();

  const [rubric, setRubric] = useState<SystemDesignRubric | null>(null);
  const [scenario, setScenario] = useState<SystemDesignScenario | null>(null);
  const [sections, setSections] = useState<SystemDesignSections>(emptySections);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<SystemDesignReport | null>(null);
  const [resumed, setResumed] = useState(false);

  const describe = (cause: unknown, fallback: string): string => {
    // A plan refusal means our copy of the plan is stale; re-read it.
    noteRefusal(cause);
    return aiFailureMessage(cause, fallback);
  };

  useEffect(() => {
    const controller = new AbortController();
    const draft = loadDraft(userId);

    fetchNextScenario({}, controller.signal)
      .then(loaded => {
        setRubric(loaded.rubric);
        if (draft) {
          setScenario(draft.scenario);
          setSections(draft.sections);
          setResumed(true);
        } else {
          setScenario(loaded.question);
        }
        setLoading(false);
      })
      .catch(cause => {
        if (isAbortError(cause)) return;
        setLoadError(describe(cause, 'Could not load a scenario.'));
        setLoading(false);
      });

    return () => controller.abort();
    // Only a change of account reloads: describe() reads the subscription,
    // and its changes are no reason to fetch another scenario.
  }, [userId]);

  const loadScenario = async (level: PracticeDifficulty | null) => {
    if (!report && hasWriting(sections) && !window.confirm('Discard your draft of this scenario and start another?')) {
      return;
    }
    setDifficulty(level);
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchNextScenario({ difficulty: level, skip: scenario?.id ?? null });
      setRubric(loaded.rubric);
      setScenario(loaded.question);
      setSections(emptySections());
      setReport(null);
      setResumed(false);
      clearDraft();
    } catch (cause) {
      setError(describe(cause, 'Could not load a scenario.'));
    } finally {
      setLoading(false);
    }
  };

  const update = (key: SystemDesignSectionKey, value: string) => {
    const changed = { ...sections, [key]: value };
    setSections(changed);
    if (userId === null || !scenario) return;
    if (hasWriting(changed)) saveDraft(userId, scenario, changed);
    else clearDraft();
  };

  const submit = async () => {
    if (!scenario || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setReport(await submitSystemDesign(scenario.id, sections));
      setResumed(false);
      clearDraft();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        clearDraft();
        setError('This scenario is no longer available. Try another one.');
      } else {
        setError(describe(cause, 'Could not score your design.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const revise = () => {
    setReport(null);
    if (userId !== null && scenario) saveDraft(userId, scenario, sections);
  };

  if (loadError) {
    return (
      <p role="alert" className="text-sm font-bold text-rose-600 dark:text-rose-400">
        {loadError}
      </p>
    );
  }

  if (!rubric) {
    return <p className="text-sm text-slate-400 italic animate-pulse">Loading a scenario…</p>;
  }

  return (
    <div className="space-y-6">
      <section className={`${card} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h3 className="text-xl font-bold flex items-center">
              <span className="mr-2">🏗️</span> System design
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Answer a design scenario in {rubric.sections.length} sections. It is scored out of {rubric.maxScore}{' '}
              against a fixed rubric: the AI rates each trait against written descriptors and the points a strong answer
              covers, and the total is added up the same way every time. Each scored answer is one use of your plan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadScenario(difficulty)}
            disabled={loading || submitting}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-brand-400 disabled:opacity-50"
          >
            Another scenario
          </button>
        </div>
        <div role="group" aria-label="Difficulty" className="mt-5 flex flex-wrap gap-2">
          {DIFFICULTIES.map(level => {
            const active = level.key === difficulty;
            return (
              <button
                key={level.label}
                type="button"
                aria-pressed={active}
                disabled={loading || submitting}
                onClick={() => void loadScenario(level.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors disabled:opacity-50 ${
                  active
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-brand-400'
                }`}
              >
                {level.label}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm font-bold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400 italic animate-pulse">Loading a scenario…</p>
      ) : !scenario ? (
        <p className={`${card} p-6 text-sm text-slate-500 dark:text-slate-400`}>
          No system design scenarios are published{difficulty ? ` at ${difficulty} difficulty` : ''} yet.
        </p>
      ) : (
        <>
          <ScenarioCard scenario={scenario} resumed={resumed} />
          {report ? (
            <ScoreReport
              report={report}
              rubric={rubric}
              onRevise={revise}
              onNext={() => void loadScenario(difficulty)}
            />
          ) : (
            <AnswerForm
              rubric={rubric}
              sections={sections}
              submitting={submitting}
              onChange={update}
              onSubmit={() => void submit()}
            />
          )}
        </>
      )}
    </div>
  );
}

function ScenarioCard({ scenario, resumed }: { scenario: SystemDesignScenario; resumed: boolean }) {
  return (
    <section className={`${card} p-6`} aria-labelledby="sd-scenario-title">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="sd-scenario-title" className="text-lg font-bold text-slate-900 dark:text-slate-50">
          {scenario.title}
        </h3>
        <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {scenario.difficulty}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">{scenario.prompt}</p>
      {resumed && (
        <p className="mt-3 text-xs text-slate-400">Resumed your draft from this browser. It is kept until you score it.</p>
      )}
    </section>
  );
}

function AnswerForm({
  rubric,
  sections,
  submitting,
  onChange,
  onSubmit,
}: {
  rubric: SystemDesignRubric;
  sections: SystemDesignSections;
  submitting: boolean;
  onChange: (key: SystemDesignSectionKey, value: string) => void;
  onSubmit: () => void;
}) {
  const words = traitWords(rubric, sections);
  const gated = gatedTraits(rubric, sections);
  const total = totalWords(sections);

  /** The warning under a section that has some words, but too few for its trait. */
  const warning = (key: SystemDesignSectionKey): string | null => {
    if (countWords(sections[key]) === 0) return null;
    const trait = rubric.traits.find(t => !readsWholeAnswer(rubric, t) && t.sections.includes(key));
    if (!trait || words[trait.key] >= rubric.minWords) return null;

    const shared = trait.sections.length > 1
      ? ` across ${trait.sections.map(s => rubric.sections.find(x => x.key === s)?.label ?? s).join(' and ')}`
      : '';
    return `Under ${rubric.minWords} words${shared}: ${trait.label} will score 0 and the AI will not be asked about it.`;
  };

  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {rubric.sections.map(section => {
        const id = `sd-section-${section.key}`;
        const count = countWords(sections[section.key]);
        const note = warning(section.key);
        return (
          <div key={section.key} className={`${card} p-5`}>
            <label htmlFor={id} className="block text-sm font-bold text-slate-800 dark:text-slate-100">
              {section.label}
            </label>
            <p id={`${id}-hint`} className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {section.hint}
            </p>
            <textarea
              id={id}
              aria-describedby={`${id}-hint`}
              value={sections[section.key]}
              onChange={event => onChange(section.key, event.target.value)}
              rows={5}
              disabled={submitting}
              className="mt-3 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 p-3 text-sm leading-relaxed focus:border-brand-500 focus:outline-none"
            />
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
              <span className={note ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}>{note}</span>
              <span className="text-slate-400 tabular-nums">{plural(count, 'word')}</span>
            </div>
          </div>
        );
      })}

      <section
        role="note"
        aria-label="How it is scored"
        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-5 text-sm text-slate-600 dark:text-slate-300 space-y-2"
      >
        <p>
          Each trait is rated 0 to {rubric.traitMax} against the rubric and weighted into a score out of{' '}
          {rubric.maxScore}. A trait whose sections have fewer than {rubric.minWords} words between them scores 0, and
          the AI is not asked about it.
        </p>
        {gated.length > 0 && total > 0 && (
          <div>
            <p className="font-bold text-amber-700 dark:text-amber-300">As it stands, these would score 0:</p>
            <ul aria-label="Would score 0" className="mt-1 flex flex-wrap gap-2">
              {gated.map(trait => (
                <li
                  key={trait.key}
                  className="rounded-full border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-200"
                >
                  {trait.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting || total < rubric.minWords}
          className="px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50"
        >
          {submitting ? 'Scoring…' : 'Score my design'}
        </button>
        <span className="text-xs text-slate-400 tabular-nums">{plural(total, 'word')} in all</span>
      </div>
    </form>
  );
}

function ScoreReport({
  report,
  rubric,
  onRevise,
  onNext,
}: {
  report: SystemDesignReport;
  rubric: SystemDesignRubric;
  onRevise: () => void;
  onNext: () => void;
}) {
  const band = scoreBand(report.maxScore > 0 ? (report.score / report.maxScore) * 100 : 0);
  const labelOf = (key: string) => report.traits.find(t => t.key === key)?.label ?? key;
  const covered = report.traits.flatMap(t => t.keyPoints.covered.map(text => ({ trait: t.key, text })));
  const missed = report.traits.flatMap(t => t.keyPoints.missed.map(text => ({ trait: t.key, text })));

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 flex flex-wrap items-center gap-6`}>
        <div
          aria-label={`Score ${report.score} out of ${report.maxScore}`}
          className={`rounded-2xl border px-6 py-4 text-center ${band.style}`}
        >
          <div className="text-4xl font-black tabular-nums">{report.score}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest">
            of {report.maxScore} · {band.label}
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl">
          Scored against rubric {report.rubricVersion}. Each bar is a trait rated 0 to {rubric.traitMax}; the points are
          that rating times the trait's weight.
        </p>
      </section>

      <section className={`${card} p-6`}>
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">By trait</h4>
        <ul aria-label="Rubric traits" className="space-y-5">
          {report.traits.map(trait => (
            <TraitRow key={trait.key} trait={trait} minWords={rubric.minWords} />
          ))}
        </ul>
      </section>

      <section className={`${card} p-6 grid gap-6 sm:grid-cols-2`}>
        <KeyPointList title="Covered" label="Key points covered" items={covered} labelOf={labelOf} tone="covered" />
        <KeyPointList title="Missed" label="Key points missed" items={missed} labelOf={labelOf} tone="missed" />
      </section>

      <section className={`${card} p-6`}>
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">What this scenario tests</h4>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{report.explanation}</p>
      </section>

      <HowScored rubric={rubric} />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRevise}
          className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-brand-400"
        >
          Revise this answer
        </button>
        <button
          type="button"
          onClick={onNext}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase tracking-widest"
        >
          Next scenario
        </button>
      </div>
    </div>
  );
}

function TraitRow({ trait, minWords }: { trait: SystemDesignTraitResult; minWords: number }) {
  const percent = trait.max > 0 ? (trait.score / trait.max) * 100 : 0;
  const bar = trait.score === trait.max ? 'bg-emerald-500' : trait.score === 0 ? 'bg-rose-500' : 'bg-amber-500';

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold text-slate-800 dark:text-slate-100">{trait.label}</span>
        <span className="font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {trait.points} / {trait.maxPoints}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"
        role="meter"
        aria-label={`${trait.label}: ${trait.score} of ${trait.max}`}
        aria-valuemin={0}
        aria-valuemax={trait.max}
        aria-valuenow={trait.score}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {trait.gated ? (
          <>
            <span className="font-bold text-rose-600 dark:text-rose-400">Not assessed</span>: {plural(trait.words, 'word')},
            under {minWords}.
          </>
        ) : (
          <>
            <span className="font-bold">
              Rated {trait.score} of {trait.max}:
            </span>{' '}
            {trait.descriptor}
          </>
        )}
      </p>
      {trait.evidence && (
        <blockquote className="mt-2 border-l-2 border-slate-200 dark:border-slate-600 pl-3 text-sm italic text-slate-600 dark:text-slate-300">
          “{trait.evidence}”
        </blockquote>
      )}
      {trait.improvement && (
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          <span className="font-bold text-brand-600 dark:text-brand-400">Next time: </span>
          {trait.improvement}
        </p>
      )}
    </li>
  );
}

function KeyPointList({
  title,
  label,
  items,
  labelOf,
  tone,
}: {
  title: string;
  label: string;
  items: { trait: string; text: string }[];
  labelOf: (key: string) => string;
  tone: 'covered' | 'missed';
}) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
        {title} ({items.length})
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{tone === 'covered' ? 'None this time.' : 'None: every key point covered.'}</p>
      ) : (
        <ul aria-label={label} className="space-y-2">
          {items.map(item => (
            <li key={`${item.trait}-${item.text}`} className="text-sm text-slate-700 dark:text-slate-200">
              <span className={tone === 'covered' ? 'text-emerald-600 mr-1.5' : 'text-rose-500 mr-1.5'} aria-hidden="true">
                {tone === 'covered' ? '✓' : '✗'}
              </span>
              {item.text}
              <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{labelOf(item.trait)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The rubric's descriptors, folded away until asked for. */
function HowScored({ rubric }: { rubric: SystemDesignRubric }) {
  const [open, setOpen] = useState(false);
  const sectionLabel = (key: string) => rubric.sections.find(s => s.key === key)?.label ?? key;

  return (
    <section className={`${card} overflow-hidden`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <span className="font-bold text-slate-800 dark:text-slate-100">How this was scored</span>
        <span aria-hidden="true" className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-700 pt-4 space-y-5 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            Rubric {rubric.version}. A trait whose sections have fewer than {rubric.minWords} words between them scores
            0 in code, before the AI is asked anything. The AI rates every other trait 0 to {rubric.traitMax} against the
            descriptors below and the key points a strong answer to this scenario covers, quoting your answer as
            evidence. Each rating is then weighted and added up to a score out of {rubric.maxScore}, the same way every
            time.
          </p>
          {rubric.traits.map(trait => (
            <div key={trait.key}>
              <h5 className="font-bold text-slate-800 dark:text-slate-100">
                {trait.label}{' '}
                <span className="font-normal text-slate-400">
                  · up to {trait.weight} points ·{' '}
                  {readsWholeAnswer(rubric, trait) ? 'the whole answer' : trait.sections.map(sectionLabel).join(', ')}
                </span>
              </h5>
              <ol className="mt-1 space-y-1">
                {[...trait.descriptors.keys()].reverse().map(score => (
                  <li key={score} className="flex gap-2 text-slate-600 dark:text-slate-300">
                    <span className="font-bold tabular-nums text-slate-400 w-4 shrink-0">{score}</span>
                    <span>{trait.descriptors[score]}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

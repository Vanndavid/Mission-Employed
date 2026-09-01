import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BEHAVIORAL_THEMES } from '../constants';
import { generateBehavioralPrompt, processAudioResponse, textToSpeech } from '../services/apiClient';
import { playSpokenClip } from '../utils/speech';
import { useAnswerRecorder } from '../hooks/useAnswerRecorder';
import { useBehavioralAnswers } from '../contexts/DataProvider';
import { useAuth } from '../contexts/AuthContext';
import { CoachFeedback } from './CoachFeedback';
import { PremiumGate } from './PremiumGate';

/**
 * Training Room — one behavioral question at a time.
 *
 * The screen is a workspace, not a wizard: the fact bank on the left stays on
 * screen and editable for the whole drill, because those facts are what the
 * evaluator checks the spoken answer against. Hiding them behind the question
 * — the old layout stacked them above a 500px drill box — meant nobody could
 * see what they were being marked against.
 *
 * The fact bank is deliberately outside the premium gate. Writing down your
 * own STAR material is not the AI feature; only the drill is.
 */

/** Decoration, so it lives with the screen rather than in shared constants. */
const THEME_ICONS: Record<string, string> = {
  weakness: '🪞',
  challenge: '⛰️',
  failure: '💥',
  disagreement: '⚔️',
  pressure: '⏱️',
  impact: '📈',
};

type Stage = 'idle' | 'asking' | 'question' | 'analyzing' | 'result';

/** Roughly where a good STAR answer lands; the clock turns amber past it. */
const TARGET_SECONDS = 120;

const STEPS = [
  { stage: 'question', label: 'Question' },
  { stage: 'answer', label: 'Your answer' },
  { stage: 'feedback', label: 'Feedback' },
] as const;

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Read a recording as base64 without the data-URL prefix.
 *
 * The previous version wrapped only the `FileReader` setup in try/catch, so a
 * failed evaluation inside `onloadend` escaped unhandled and left the screen
 * spinning forever. A promise puts the whole path under one catch.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('That recording could not be read.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');

      if (separator === -1) {
        reject(new Error('That recording could not be read.'));
        return;
      }
      resolve(result.slice(separator + 1));
    };

    reader.readAsDataURL(blob);
  });
}

/** Bars react at different rates so the group reads as a voice, not a gauge. */
const BAR_WEIGHTS = [0.55, 0.9, 1.35, 0.9, 0.55];

function LevelMeter({ levelRef, active }: { levelRef: React.RefObject<number>; active: boolean }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!active) return;

    let frame = requestAnimationFrame(function draw() {
      const level = levelRef.current;

      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        const height = 0.18 + Math.min(1, level * BAR_WEIGHTS[index]) * 0.82;
        bar.style.transform = `scaleY(${height.toFixed(3)})`;
      });

      frame = requestAnimationFrame(draw);
    });

    return () => cancelAnimationFrame(frame);
  }, [active, levelRef]);

  return (
    <div aria-hidden="true" className="flex h-10 items-center justify-center gap-1.5">
      {BAR_WEIGHTS.map((_, index) => (
        <span
          key={index}
          ref={node => {
            barsRef.current[index] = node;
          }}
          className="h-10 w-1.5 origin-center rounded-full bg-rose-500 transition-none"
          style={{ transform: 'scaleY(0.18)' }}
        />
      ))}
    </div>
  );
}

/**
 * One fact row.
 *
 * A textarea rather than an input because these are sentences — "Cut p95
 * checkout latency from 2.4s to 380ms" does not fit a single-line field at
 * this column width, and a fact you cannot read is a fact you cannot check.
 * It grows to its content and refuses newlines, so a bullet stays one line of
 * meaning even though it wraps on screen.
 */
function FactField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const fit = useCallback(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, []);

  useLayoutEffect(fit, [fit, value]);

  // A height measured before the web font loads is wrong by a line, and the
  // column reflows on resize, so re-measure on both.
  useEffect(() => {
    void document.fonts?.ready.then(fit).catch(() => {});
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value.replace(/\s*\n+\s*/g, ' '))}
        className="w-full resize-none overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </>
  );
}

export const PrepRoom = () => {
  const { isPremium } = useAuth();
  const { answers, updateAnswer, loading, saving, error: storeError } = useBehavioralAnswers();

  const [activeThemeId, setActiveThemeId] = useState(BEHAVIORAL_THEMES[0].id);
  const [stage, setStage] = useState<Stage>('idle');
  const [prompt, setPrompt] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [drilled, setDrilled] = useState<Set<string>>(() => new Set());

  /** The spoken clip for the current question, so replay costs no round trip. */
  const clipRef = useRef<{ text: string; audio: string } | null>(null);
  /** Cuts playback short — hitting record must not capture the question. */
  const playbackRef = useRef<AbortController | null>(null);

  const stopSpeaking = useCallback(() => {
    playbackRef.current?.abort();
    playbackRef.current = null;
    setSpeaking(false);
  }, []);

  const activeTheme = BEHAVIORAL_THEMES.find(theme => theme.id === activeThemeId)!;
  const activeAnswer = answers.find(answer => answer.themeId === activeThemeId) ?? {
    themeId: activeThemeId,
    bullets: [''],
  };

  const themeFacts = useMemo(
    () => activeAnswer.bullets.filter(bullet => bullet.trim()),
    [activeAnswer.bullets],
  );

  const factCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const answer of answers) {
      counts[answer.themeId] = answer.bullets.filter(bullet => bullet.trim()).length;
    }
    return counts;
  }, [answers]);

  const themesWithFacts = BEHAVIORAL_THEMES.filter(theme => (factCounts[theme.id] ?? 0) > 0).length;

  const speak = useCallback(
    async (text: string) => {
      stopSpeaking();

      const playback = new AbortController();
      playbackRef.current = playback;
      setSpeaking(true);
      setAudioFailed(false);

      try {
        // The API answers with a complete WAV, so this goes straight to an
        // <audio> element -- no PCM decoding, no hand-built header.
        const cached =
          clipRef.current?.text === text ? clipRef.current.audio : await textToSpeech(text);

        if (playback.signal.aborted) return;
        clipRef.current = { text, audio: cached };

        if (cached) await playSpokenClip(cached, playback.signal);
        else setAudioFailed(true);
      } catch {
        // Losing the audio costs the rehearsal feel, not the drill: the
        // question is already on screen to read.
        if (!playback.signal.aborted) setAudioFailed(true);
      } finally {
        // A newer clip may already have taken over; only the current one is
        // allowed to clear the flag.
        if (playbackRef.current === playback) {
          playbackRef.current = null;
          setSpeaking(false);
        }
      }
    },
    [stopSpeaking],
  );

  const askQuestion = useCallback(async () => {
    setStage('asking');
    setError(null);
    setTranscript('');
    setFeedback('');
    clipRef.current = null;

    try {
      const raw = await generateBehavioralPrompt(activeTheme.label);
      const cleaned = raw.replace(/^"([\s\S]*)"$/, '$1').trim();

      // The question is shown before it is spoken. The old flow held the
      // spinner up until playback finished, so you heard a question you could
      // not yet read.
      setPrompt(cleaned);
      setStage('question');
      void speak(cleaned);
    } catch {
      setError('The interviewer could not be reached. Try again in a moment.');
      setStage('idle');
    }
  }, [activeTheme.label, speak]);

  const evaluate = useCallback(
    async (audio: Blob) => {
      setStage('analyzing');
      setError(null);

      try {
        const result = await processAudioResponse(
          await blobToBase64(audio),
          activeTheme.label,
          prompt,
          themeFacts,
        );

        setTranscript(result.transcript);
        setFeedback(result.feedback);
        setStage('result');
        setDrilled(previous => new Set(previous).add(activeThemeId));
      } catch {
        setError('That answer could not be scored. The question is still here — try the take again.');
        setStage('question');
      }
    },
    [activeTheme.label, activeThemeId, prompt, themeFacts],
  );

  const recorder = useAnswerRecorder(evaluate);
  const recording = recorder.status === 'recording';

  // Navigating away mid-question must not leave the interviewer talking to an
  // empty room. The recorder cleans itself up; this is the audio side.
  useEffect(() => () => playbackRef.current?.abort(), []);

  const beginRecording = useCallback(async () => {
    setError(null);
    // Barge-in: the question stops the moment you start talking, both because
    // that is how a real interview goes and so the microphone does not pick up
    // the interviewer's own voice.
    stopSpeaking();

    try {
      await recorder.start();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Recording could not be started.');
    }
  }, [recorder, stopSpeaking]);

  const resetDrill = useCallback(() => {
    stopSpeaking();
    recorder.cancel();
    setStage('idle');
    setPrompt('');
    setTranscript('');
    setFeedback('');
    setError(null);
    setAudioFailed(false);
    clipRef.current = null;
  }, [recorder, stopSpeaking]);

  const retakeAnswer = useCallback(() => {
    setStage('question');
    setTranscript('');
    setFeedback('');
    setError(null);
  }, []);

  const selectTheme = (themeId: string) => {
    if (themeId === activeThemeId) return;
    setActiveThemeId(themeId);
    resetDrill();
  };

  const editFact = (index: number, value: string) => {
    const next = [...activeAnswer.bullets];
    next[index] = value;
    setEdited(true);
    updateAnswer(activeThemeId, next);
  };

  const removeFact = (index: number) => {
    // Note the server keeps the last saved set for a theme that goes entirely
    // blank -- the API rejects an empty list. Clearing every row here empties
    // the editor, not the stored answer.
    const next = activeAnswer.bullets.filter((_, position) => position !== index);
    setEdited(true);
    updateAnswer(activeThemeId, next.length ? next : ['']);
  };

  const addFact = () => {
    setEdited(true);
    updateAnswer(activeThemeId, [...activeAnswer.bullets, '']);
  };

  const canAddFact = activeAnswer.bullets.every(bullet => bullet.trim());

  const currentStep = stage === 'result' ? 2 : recording || stage === 'analyzing' ? 1 : 0;

  const statusLine =
    stage === 'asking'
      ? 'Writing your question.'
      : recording
        ? 'Recording your answer.'
        : stage === 'analyzing'
          ? 'Transcribing and scoring your answer.'
          : stage === 'result'
            ? 'Feedback ready.'
            : speaking
              ? 'Reading the question aloud.'
              : '';

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900 dark:text-slate-50">
            Training Room
          </h2>
          <p className="mt-1 font-medium text-slate-500 dark:text-slate-400">
            Behavioral drills, one question at a time.
          </p>
        </div>

        <dl className="flex gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Themes stocked
            </dt>
            <dd className="text-lg font-black text-slate-900 dark:text-slate-100">
              {themesWithFacts}
              <span className="text-slate-400 dark:text-slate-600">/{BEHAVIORAL_THEMES.length}</span>
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Drilled today
            </dt>
            <dd className="text-lg font-black text-slate-900 dark:text-slate-100">{drilled.size}</dd>
          </div>
        </dl>
      </header>

      {storeError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          {storeError}
        </p>
      )}

      <div role="group" aria-label="Behavioral theme" className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {BEHAVIORAL_THEMES.map(theme => {
          const selected = theme.id === activeThemeId;
          const facts = factCounts[theme.id] ?? 0;

          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={selected}
              onClick={() => selectTheme(theme.id)}
              className={`group relative rounded-2xl border p-3 text-left transition-colors ${
                selected
                  ? 'border-brand-600 bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-500/50 dark:hover:bg-slate-800'
              }`}
            >
              <span aria-hidden="true" className="block text-xl leading-none">
                {THEME_ICONS[theme.id] ?? '🧠'}
              </span>
              <span className="mt-2 block text-xs font-bold leading-tight">{theme.label}</span>
              <span
                className={`mt-1.5 block text-[10px] font-bold uppercase tracking-wider ${
                  selected
                    ? 'text-brand-100'
                    : facts > 0
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-slate-400 dark:text-slate-600'
                }`}
              >
                {facts > 0 ? `${facts} fact${facts === 1 ? '' : 's'}` : 'No facts'}
              </span>
              {drilled.has(theme.id) && (
                <span
                  title="Drilled this session"
                  className={`absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full text-[10px] ${
                    selected ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                  }`}
                >
                  ✓<span className="sr-only">Drilled this session</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        {/* On a phone the drill comes first: the fact bank is setup, and
            burying the question under a form means scrolling past it every
            round. Side by side on a wide screen, the bank reads as the left
            rail it is. */}
        <aside className="order-2 space-y-4 rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:order-1 lg:col-span-2 lg:sticky lg:top-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
                Fact bank
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeTheme.label}
              </p>
            </div>
            <span
              aria-live="polite"
              className="shrink-0 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
            >
              {saving ? 'Saving…' : edited ? 'Saved' : ''}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Concrete details — numbers, names, outcomes. The coach is given these and checks your
            spoken answer against them for consistency and missed examples.
          </p>

          {loading ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map(row => (
                <div key={row} className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {activeAnswer.bullets.map((bullet, index) => (
                <li key={index} className="flex items-start gap-2">
                  <FactField
                    id={`fact-${activeThemeId}-${index}`}
                    label={`${activeTheme.label} fact ${index + 1}`}
                    value={bullet}
                    placeholder={index === 0 ? 'Cut deploy time from 40 min to 6' : 'Another fact…'}
                    onChange={value => editFact(index, value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeFact(index)}
                    disabled={activeAnswer.bullets.length === 1 && !bullet.trim()}
                    aria-label={`Remove fact ${index + 1}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={addFact}
            disabled={loading || !canAddFact}
            className="text-[10px] font-black uppercase tracking-widest text-brand-600 hover:underline disabled:pointer-events-none disabled:text-slate-300 dark:text-brand-400 dark:disabled:text-slate-700"
          >
            + Add fact
          </button>
        </aside>

        <section className="order-1 lg:order-2 lg:col-span-3">
          {!isPremium ? (
            <PremiumGate title="Behavioral AI coach (Premium)" />
          ) : (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <ol className="flex border-b border-slate-200 dark:border-slate-800">
                {STEPS.map((step, index) => (
                  <li
                    key={step.stage}
                    aria-current={index === currentStep ? 'step' : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-3 text-[10px] font-black uppercase tracking-widest sm:px-4 ${
                      index === currentStep
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                        : index < currentStep
                          ? 'text-slate-400 dark:text-slate-500'
                          : 'text-slate-300 dark:text-slate-600'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                        index === currentStep
                          ? 'bg-brand-600 text-white'
                          : index < currentStep
                            ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                      }`}
                    >
                      {index < currentStep ? '✓' : index + 1}
                    </span>
                    <span className="truncate">{step.label}</span>
                  </li>
                ))}
              </ol>

              <div className="space-y-5 p-6 sm:p-8">
                <p aria-live="polite" className="sr-only">
                  {statusLine}
                </p>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                  >
                    {error}
                  </p>
                )}

                {stage === 'idle' && (
                  <div className="py-8 text-center">
                    <span aria-hidden="true" className="text-4xl">
                      {THEME_ICONS[activeThemeId] ?? '🧠'}
                    </span>
                    <h3 className="mt-4 text-lg font-black uppercase italic tracking-tight text-slate-900 dark:text-slate-100">
                      {activeTheme.label}
                    </h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                      You get one question, read aloud. Answer out loud in about two minutes, then
                      the coach transcribes it and marks it against STAR and your fact bank.
                    </p>

                    {themeFacts.length === 0 && (
                      <p className="mx-auto mt-4 max-w-sm rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                        No facts saved for this theme yet — the coach can still score structure, but
                        it cannot check your answer against anything real.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={askQuestion}
                      className="mt-7 rounded-2xl bg-brand-600 px-10 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-brand-600/25 transition-transform hover:scale-[1.02] hover:bg-brand-500"
                    >
                      Start drill
                    </button>
                  </div>
                )}

                {stage === 'asking' && (
                  <div className="flex flex-col items-center gap-5 py-16">
                    <span className="h-12 w-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                    <p className="text-sm font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">
                      Writing your question
                    </p>
                  </div>
                )}

                {(stage === 'question' || stage === 'analyzing' || stage === 'result') && prompt && (
                  <blockquote className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 dark:border-brand-500/25 dark:bg-brand-500/10">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">
                        Interviewer asks
                      </span>
                      <button
                        type="button"
                        onClick={() => void speak(prompt)}
                        disabled={speaking}
                        className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-40 dark:text-brand-300 dark:hover:bg-brand-500/20"
                      >
                        {speaking ? '🔊 Speaking…' : '🔊 Replay'}
                      </button>
                    </div>
                    <p className="text-lg font-semibold italic leading-snug text-slate-800 dark:text-slate-100">
                      {prompt}
                    </p>
                    {audioFailed && (
                      <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Audio is unavailable right now — read it instead.
                      </p>
                    )}
                  </blockquote>
                )}

                {stage === 'question' && (
                  <div className="space-y-4">
                    {recording ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center dark:border-rose-500/30 dark:bg-rose-500/10">
                        <LevelMeter levelRef={recorder.levelRef} active={recording} />
                        <p
                          role="timer"
                          aria-live="off"
                          className={`mt-3 font-mono text-3xl font-bold tabular-nums ${
                            recorder.seconds > TARGET_SECONDS
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {formatClock(recorder.seconds)}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {recorder.seconds > TARGET_SECONDS
                            ? 'Running long — land the result and stop.'
                            : 'Situation, task, action, result.'}
                        </p>
                        <button
                          type="button"
                          onClick={recorder.stop}
                          className="mt-5 w-full rounded-2xl bg-rose-600 py-4 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-rose-500"
                        >
                          Stop and score
                        </button>
                        <button
                          type="button"
                          onClick={recorder.cancel}
                          className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-rose-500 dark:text-slate-500"
                        >
                          Discard take
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={beginRecording}
                          className="w-full rounded-2xl bg-brand-600 py-5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-500"
                        >
                          🎙 Record answer
                        </button>
                        {speaking && (
                          <p className="text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            The question is still playing — recording cuts it off.
                          </p>
                        )}
                        <div className="flex justify-center gap-5">
                          <button
                            type="button"
                            onClick={askQuestion}
                            className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-brand-600 dark:text-slate-500 dark:hover:text-brand-400"
                          >
                            Different question
                          </button>
                          <button
                            type="button"
                            onClick={resetDrill}
                            className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-brand-600 dark:text-slate-500 dark:hover:text-brand-400"
                          >
                            End drill
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {stage === 'analyzing' && (
                  <div className="flex flex-col items-center gap-5 py-12">
                    <span className="h-12 w-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                    <p className="text-sm font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">
                      Transcribing and scoring
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Checking your answer against {themeFacts.length} saved{' '}
                      {themeFacts.length === 1 ? 'fact' : 'facts'}.
                    </p>
                  </div>
                )}

                {stage === 'result' && (
                  <div className="space-y-5">
                    <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        What you said
                      </summary>
                      <p className="mt-3 whitespace-pre-wrap text-sm italic leading-relaxed text-slate-700 dark:text-slate-300">
                        {transcript || 'No speech was picked up in that recording.'}
                      </p>
                    </details>

                    <CoachFeedback markdown={feedback} />

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={askQuestion}
                        className="flex-1 rounded-2xl bg-brand-600 py-3.5 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-brand-500"
                      >
                        Next question
                      </button>
                      <button
                        type="button"
                        onClick={retakeAnswer}
                        className="rounded-2xl border border-slate-200 px-6 py-3.5 text-sm font-black uppercase tracking-widest text-slate-600 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-500/50 dark:hover:text-brand-400"
                      >
                        Retake
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

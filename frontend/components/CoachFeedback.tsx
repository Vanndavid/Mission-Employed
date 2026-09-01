import React from 'react';
import { FeedbackSection, inlineSegments, parseCoachFeedback } from '../utils/coachFeedback';

/**
 * The evaluator's Markdown, rendered as cards.
 *
 * `BehavioralPrompts::evaluation` pins the section order — summary, then
 * critiques, then directives — so the accent comes from position rather than
 * from matching on heading text, which the model is free to reword. Anything
 * past the third section falls back to neutral.
 */
const ACCENTS = [
  {
    card: 'border-brand-200 bg-brand-50/60 dark:border-brand-500/25 dark:bg-brand-500/10',
    chip: 'bg-brand-600 text-white',
    title: 'text-brand-800 dark:text-brand-200',
    marker: 'bg-brand-500',
  },
  {
    card: 'border-amber-200 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/10',
    chip: 'bg-amber-500 text-white',
    title: 'text-amber-900 dark:text-amber-200',
    marker: 'bg-amber-500',
  },
  {
    card: 'border-sky-200 bg-sky-50/70 dark:border-sky-500/25 dark:bg-sky-500/10',
    chip: 'bg-sky-600 text-white',
    title: 'text-sky-900 dark:text-sky-200',
    marker: 'bg-sky-500',
  },
] as const;

const NEUTRAL = {
  card: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
  chip: 'bg-slate-600 text-white',
  title: 'text-slate-800 dark:text-slate-200',
  marker: 'bg-slate-400',
} as const;

/** Model text goes through React nodes, never `dangerouslySetInnerHTML`. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineSegments(text).map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-semibold">
            {segment.text}
          </strong>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function Section({ section, index }: { section: FeedbackSection; index: number }) {
  const accent = ACCENTS[index] ?? NEUTRAL;

  return (
    <article className={`rounded-2xl border p-5 ${accent.card}`}>
      {(section.title || section.icon) && (
        <h4 className="flex items-center gap-2.5 mb-3">
          {section.icon && (
            <span
              aria-hidden="true"
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm ${accent.chip}`}
            >
              {section.icon}
            </span>
          )}
          <span className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accent.title}`}>
            {section.title}
          </span>
        </h4>
      )}

      {section.paragraphs.map((paragraph, i) => (
        <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 mb-2 last:mb-0">
          <Inline text={paragraph} />
        </p>
      ))}

      {section.bullets.length > 0 && (
        <ul className="space-y-2.5">
          {section.bullets.map((bullet, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <span
                aria-hidden="true"
                className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${accent.marker}`}
              />
              <span>
                <Inline text={bullet} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function CoachFeedback({ markdown }: { markdown: string }) {
  const sections = parseCoachFeedback(markdown);

  if (sections.length === 0) {
    return (
      <p className="text-sm italic text-slate-500 dark:text-slate-400">
        The coach returned no written feedback for that answer.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <Section key={index} section={section} index={index} />
      ))}
    </div>
  );
}

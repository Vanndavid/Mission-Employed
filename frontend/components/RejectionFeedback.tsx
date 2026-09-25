import React, { useLayoutEffect, useRef, useState } from 'react';
import { JobApplication, JobStatus } from '../types';
import { categorizeReason, ReasonCategory, rejectionReasonsOf } from '../utils/rejectionInsights';

/** The API's limits on rejectionReasons — see ApplicationRequest. */
const MAX_REASONS = 20;
const MAX_REASON_LENGTH = 500;

export const ReasonCategoryTag = ({ category }: { category: ReasonCategory }) => (
  <span className="shrink-0 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">
    {category}
  </span>
);

const CrossIcon = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
      clipRule="evenodd"
    />
  </svg>
);

const inputClass =
  'flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm';

/**
 * The drawer's "Rejection feedback" section: each reason with its category,
 * editable by hand. Every change saves the whole list through the same
 * `onUpdate` path as the rest of the drawer.
 *
 * With no reasons it shows only for a rejected application, and then only as
 * a button to add the first one.
 */
export const RejectionFeedbackSection = ({
  app,
  onUpdate,
}: {
  app: JobApplication;
  onUpdate: (partial: Partial<JobApplication>) => void;
}) => {
  const reasons = rejectionReasonsOf(app);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');

  if (reasons.length === 0 && !adding) {
    if (app.status !== JobStatus.REJECTED) return null;
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="text-xs font-bold text-slate-400 hover:text-brand-600"
      >
        + Add rejection feedback
      </button>
    );
  }

  const save = (next: string[]) => onUpdate({ rejectionReasons: next });

  const isDuplicate = (text: string, except: number | null) =>
    reasons.some((r, i) => i !== except && r.toLowerCase() === text.toLowerCase());

  const commitEdit = () => {
    if (editing === null) return;
    const text = editText.trim();
    // Clearing a reason is removing it; a duplicate collapses into the original.
    const next = text && !isDuplicate(text, editing)
      ? reasons.map((r, i) => (i === editing ? text : r))
      : reasons.filter((_, i) => i !== editing);
    save(next);
    setEditing(null);
  };

  const commitAdd = () => {
    const text = newText.trim();
    if (text && !isDuplicate(text, null)) save([...reasons, text]);
    setNewText('');
    setAdding(false);
  };

  return (
    <section aria-labelledby="rejection-feedback-heading">
      <h4 id="rejection-feedback-heading" className="text-xs font-bold uppercase tracking-widest text-rose-500 mb-2">
        Rejection feedback
      </h4>
      <ul className="space-y-2">
        {reasons.map((reason, index) => (
          <li
            key={`${index}-${reason}`}
            className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-3 rounded-xl"
          >
            <CrossIcon />
            {editing === index ? (
              <form
                className="flex-1 flex gap-2"
                onSubmit={e => {
                  e.preventDefault();
                  commitEdit();
                }}
              >
                <input
                  autoFocus
                  aria-label="Edit reason"
                  value={editText}
                  maxLength={MAX_REASON_LENGTH}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && setEditing(null)}
                  className={inputClass}
                />
                <button type="submit" className="text-xs font-bold text-brand-600">Save</button>
                <button type="button" onClick={() => setEditing(null)} className="text-xs font-bold text-slate-400">
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1 min-w-0 break-words">{reason}</span>
                <ReasonCategoryTag category={categorizeReason(reason)} />
                <button
                  type="button"
                  aria-label={`Edit reason: ${reason}`}
                  onClick={() => {
                    setEditing(index);
                    setEditText(reason);
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-brand-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Remove reason: ${reason}`}
                  onClick={() => save(reasons.filter((_, i) => i !== index))}
                  className="text-slate-400 hover:text-rose-500 leading-none text-lg"
                >
                  &times;
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="flex gap-2 mt-2"
          onSubmit={e => {
            e.preventDefault();
            commitAdd();
          }}
        >
          <input
            autoFocus
            aria-label="New reason"
            placeholder="e.g. How many years' experience do you have with React?"
            value={newText}
            maxLength={MAX_REASON_LENGTH}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setAdding(false)}
            className={inputClass}
          />
          <button type="submit" className="text-xs font-bold text-brand-600">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs font-bold text-slate-400">
            Cancel
          </button>
        </form>
      ) : (
        reasons.length < MAX_REASONS && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 text-xs font-bold text-slate-400 hover:text-brand-600"
          >
            + Add reason
          </button>
        )
      )}

      <p className="text-xs text-slate-400 mt-2">
        From SEEK screening questions. Only part of how the employer judged the application.
      </p>
    </section>
  );
};

/**
 * "2 flags" on a rejected row. Hovering (with a mouse) or tapping shows the
 * reasons. The popover is fixed-positioned because the table clips overflow.
 */
export const RejectionFlagsBadge = ({ reasons }: { reasons: string[] }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 336) });
  }, [open]);

  const label = `${reasons.length} ${reasons.length === 1 ? 'flag' : 'flags'}`;

  return (
    <span className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-label={`${label}: show rejection feedback`}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        onPointerEnter={e => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={e => e.pointerType === 'mouse' && setOpen(false)}
        onBlur={() => setOpen(false)}
        className="mt-1 inline-flex items-center gap-1 rounded-full border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-300"
      >
        <span aria-hidden="true">✗</span>
        {label}
      </button>
      {open && (
        <div
          role="tooltip"
          style={position ? { top: position.top, left: Math.max(8, position.left) } : undefined}
          className="fixed z-50 w-80 max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-xl"
        >
          <ul className="space-y-2">
            {reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                <CrossIcon />
                <span className="flex-1">{reason}</span>
                <ReasonCategoryTag category={categorizeReason(reason)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
};


import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtsSource, BehavioralAnswer, JobApplication } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';
import { InterviewStageEditor } from './InterviewStageEditor';
import { RejectionFeedbackSection } from './RejectionFeedback';
import { AtsScorePanel } from './AtsScore';
import { InterviewStage, TakeHomeStatus } from '../types';

interface InterviewPrepDrawerProps {
  app: JobApplication;
  behavioralAnswers: BehavioralAnswer[];
  onClose: () => void;
  onUpdate: (partial: Partial<JobApplication>) => void;
  onAddStage: (stage: Omit<InterviewStage, 'id'>) => void;
  onRemoveStage: (stageId: number) => void;
  onOpenCoverLetter: () => void;
  onOpenCV: () => void;
  /** Whether the profile has a base CV the ATS check can fall back on. */
  hasBaseCv: boolean;
  onCheckAts: (source: AtsSource) => Promise<unknown>;
}

export const InterviewPrepDrawer = ({
  app,
  behavioralAnswers,
  onClose,
  onUpdate,
  onAddStage,
  onRemoveStage,
  onOpenCoverLetter,
  onOpenCV,
  hasBaseCv,
  onCheckAts,
}: InterviewPrepDrawerProps) => {
  const navigate = useNavigate();

  const takeHomeDeadlineSoon =
    app.takeHome?.deadline &&
    new Date(app.takeHome.deadline).getTime() - Date.now() < 48 * 60 * 60 * 1000 &&
    app.takeHome.status !== 'submitted';

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 h-full overflow-y-auto border-l border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-6 flex justify-between items-start z-10">
          <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-slate-50">{app.company}</h3>
            <p className="text-slate-500">{app.role}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
        </div>

        <div className="p-6 space-y-8">
          <RejectionFeedbackSection app={app} onUpdate={onUpdate} />

          <JobDescriptionSection key={app.id} app={app} onUpdate={onUpdate} />

          <section>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Tailored CV</h4>
              <button onClick={onOpenCV} className="text-xs font-bold text-brand-600 hover:underline">
                Open Studio
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 p-4 rounded-xl max-h-32 overflow-y-auto font-mono text-xs">
              {app.tailoredCV || 'No tailored CV yet.'}
            </p>
          </section>

          <AtsScorePanel key={app.id} app={app} hasBaseCv={hasBaseCv} onCheck={onCheckAts} />

          <section>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Cover Letter</h4>
              <button onClick={onOpenCoverLetter} className="text-xs font-bold text-brand-600 hover:underline">
                Open Studio
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 p-4 rounded-xl max-h-32 overflow-y-auto">
              {app.coverLetter || 'No cover letter yet.'}
            </p>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Behavioral Facts</h4>
            <div className="space-y-2">
              {behavioralAnswers.map(a => {
                const theme = BEHAVIORAL_THEMES.find(t => t.id === a.themeId);
                const bullets = a.bullets.filter(b => b.trim());
                if (bullets.length === 0) return null;
                return (
                  <div key={a.themeId} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                    <p className="text-xs font-bold text-brand-600 dark:text-brand-400">{theme?.label}</p>
                    <ul className="text-xs text-slate-600 dark:text-slate-300 mt-1 list-disc ml-4">
                      {bullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <InterviewStageEditor
            stages={app.interviewStages ?? []}
            onAdd={onAddStage}
            onRemove={onRemoveStage}
          />

          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Next Action</h4>
            <input
              value={app.nextAction}
              onChange={e => onUpdate({ nextAction: e.target.value })}
              placeholder="e.g. Send thank-you email"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm"
            />
            <input
              type="date"
              value={app.nextActionDue ? app.nextActionDue.slice(0, 10) : ''}
              onChange={e => onUpdate({ nextActionDue: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm"
            />
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Take Home</h4>
            {takeHomeDeadlineSoon && (
              <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-400 rounded-xl text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-widest">
                Deadline within 48h — time-box your work
              </div>
            )}
            <input
              type="date"
              value={app.takeHome?.deadline?.slice(0, 10) ?? ''}
              onChange={e =>
                onUpdate({
                  takeHome: {
                    deadline: e.target.value,
                    repo: app.takeHome?.repo ?? '',
                    status: app.takeHome?.status ?? 'not_started',
                  },
                })
              }
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm"
            />
            <input
              value={app.takeHome?.repo ?? ''}
              onChange={e =>
                onUpdate({
                  takeHome: {
                    deadline: app.takeHome?.deadline ?? '',
                    repo: e.target.value,
                    status: app.takeHome?.status ?? 'not_started',
                  },
                })
              }
              placeholder="Repo URL"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm"
            />
            <select
              value={app.takeHome?.status ?? 'not_started'}
              onChange={e =>
                onUpdate({
                  takeHome: {
                    deadline: app.takeHome?.deadline ?? '',
                    repo: app.takeHome?.repo ?? '',
                    status: e.target.value as TakeHomeStatus,
                  },
                })
              }
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm"
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted</option>
            </select>
          </section>

          <button
            // No onClose(): leaving the page unmounts the drawer anyway, and
            // closing it rewrites the tracker's query string, which navigates
            // straight back over the trip to /mock.
            onClick={() => navigate(`/mock?appId=${app.id}`)}
            className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-black uppercase tracking-widest transition-all"
          >
            Mock for {app.company}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * The job description, editable in place. An application tracked from a Seek
 * listing only carries the listing's teaser, and imported rows often carry
 * nothing, so this is where the full ad gets pasted in — the ATS check and the
 * tailored documents all read it.
 *
 * Notes used to be shown here as a fallback when there was no description.
 * They still are when they say something the description does not (the email
 * sync writes to them); when they were only a copy of the old description, as
 * the add form and Seek tracking make them, they follow the new one.
 */
const JobDescriptionSection = ({
  app,
  onUpdate,
}: {
  app: JobApplication;
  onUpdate: (partial: Partial<JobApplication>) => void;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const saved = app.jobDescription.trim();
  const notes = app.notes.trim();
  const headingId = `job-description-heading-${app.id}`;

  const save = () => {
    const next = (draft ?? '').trim();
    if (next !== saved) {
      onUpdate(notes !== '' && notes === saved ? { jobDescription: next, notes: next } : { jobDescription: next });
    }
    setDraft(null);
  };

  return (
    <section aria-labelledby={headingId}>
      <div className="flex justify-between items-center mb-2">
        <h4 id={headingId} className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Job Description
        </h4>
        {draft === null && (
          <button
            onClick={() => setDraft(app.jobDescription)}
            aria-label={saved ? 'Edit job description' : 'Add job description'}
            className="text-xs font-bold text-brand-600 hover:underline"
          >
            {saved ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {draft !== null ? (
        <div className="space-y-2">
          <textarea
            aria-label="Job description"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={12}
            autoFocus
            placeholder="Paste the full job ad here..."
            className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDraft(null)}
              aria-label="Cancel editing job description"
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button onClick={save} aria-label="Save job description" className="px-4 py-2 rounded-lg text-xs font-bold bg-brand-600 hover:bg-brand-500 text-white">
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
          {saved ? app.jobDescription : 'No job description saved. Add the full ad to check the ATS score and tailor documents.'}
        </p>
      )}

      {notes !== '' && notes !== saved && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Notes</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto">{app.notes}</p>
        </div>
      )}
    </section>
  );
};

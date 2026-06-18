
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BehavioralAnswer, JobApplication } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';
import { InterviewStageEditor } from './InterviewStageEditor';
import { InterviewStage, TakeHomeStatus } from '../types';

interface InterviewPrepDrawerProps {
  app: JobApplication;
  behavioralAnswers: BehavioralAnswer[];
  onClose: () => void;
  onUpdate: (partial: Partial<JobApplication>) => void;
  onAddStage: (stage: Omit<InterviewStage, 'id'>) => void;
  onRemoveStage: (stageId: string) => void;
}

export const InterviewPrepDrawer = ({
  app,
  behavioralAnswers,
  onClose,
  onUpdate,
  onAddStage,
  onRemoveStage,
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
          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Job Description Recap</h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
              {app.jobDescription || app.notes || 'No job description saved.'}
            </p>
          </section>

          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Cover Letter</h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
              {app.coverLetter || 'No cover letter yet. (Cover letter studio coming in Phase 3.)'}
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
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{theme?.label}</p>
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
            onClick={() => {
              navigate(`/mock?appId=${app.id}`);
              onClose();
            }}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest transition-all"
          >
            Mock for {app.company}
          </button>
        </div>
      </div>
    </div>
  );
};

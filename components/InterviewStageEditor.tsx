
import React, { useState } from 'react';
import { InterviewStage, InterviewStageType } from '../types';
import { INTERVIEW_STAGE_LABELS } from '../constants';

const STAGE_TYPES: InterviewStageType[] = [
  'phone', 'technical', 'system_design', 'behavioral', 'onsite', 'take_home',
];

interface InterviewStageEditorProps {
  stages: InterviewStage[];
  onAdd: (stage: Omit<InterviewStage, 'id'>) => void;
  onRemove: (stageId: string) => void;
}

export const InterviewStageEditor = ({ stages, onAdd, onRemove }: InterviewStageEditorProps) => {
  const [type, setType] = useState<InterviewStageType>('phone');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');

  const handleAdd = () => {
    if (!scheduledAt) return;
    onAdd({ type, scheduledAt: new Date(scheduledAt).toISOString(), notes });
    setScheduledAt('');
    setNotes('');
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
        Interview Stages
      </h4>
      {stages.length > 0 && (
        <div className="space-y-2">
          {stages.map(stage => (
            <div
              key={stage.id}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div>
                <span className="font-bold text-sm">{INTERVIEW_STAGE_LABELS[stage.type]}</span>
                <span className="text-xs text-slate-400 ml-2">
                  {new Date(stage.scheduledAt).toLocaleString()}
                </span>
                {stage.notes && <p className="text-xs text-slate-500 mt-1">{stage.notes}</p>}
              </div>
              <button
                onClick={() => onRemove(stage.id)}
                className="text-slate-400 hover:text-rose-500 text-xs font-bold"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={type}
          onChange={e => setType(e.target.value as InterviewStageType)}
          className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm"
        >
          {STAGE_TYPES.map(t => (
            <option key={t} value={t}>{INTERVIEW_STAGE_LABELS[t]}</option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={!scheduledAt}
          className="py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
        >
          Add Stage
        </button>
      </div>
      <input
        placeholder="Stage notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm"
      />
    </div>
  );
};

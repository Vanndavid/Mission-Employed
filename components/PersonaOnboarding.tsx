
import React from 'react';
import { HuntPersonaId } from '../types';
import { HUNT_PERSONAS } from '../constants';

interface PersonaOnboardingProps {
  onSelect: (personaId: HuntPersonaId) => void;
}

export const PersonaOnboarding = ({ onSelect }: PersonaOnboardingProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl p-8 space-y-6">
        <header className="text-center space-y-2">
          <h2 className="text-3xl font-black text-slate-900 dark:text-slate-50 uppercase tracking-tighter">
            Select Hunt Persona
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Your persona sets criteria presets, daily protocol tasks, and application targets.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(HUNT_PERSONAS) as HuntPersonaId[]).map(id => {
            const persona = HUNT_PERSONAS[id];
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className="text-left p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all group"
              >
                <h3 className="font-black text-lg text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                  {persona.label}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{persona.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded">
                    {persona.targetScore}/{persona.criteria.length} target
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded">
                    {persona.appsPerDay} apps/day
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

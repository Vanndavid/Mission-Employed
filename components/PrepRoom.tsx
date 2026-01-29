
import React, { useState } from 'react';
import { BehavioralAnswer } from '../types';
import { BEHAVIORAL_THEMES } from '../constants';
import { generateBehavioralPrompt } from '../services/geminiService';

interface PrepRoomProps {
  answers: BehavioralAnswer[];
  onUpdateAnswer: (themeId: string, bullets: string[]) => void;
}

export const PrepRoom: React.FC<PrepRoomProps> = ({ answers, onUpdateAnswer }) => {
  const [activeThemeId, setActiveThemeId] = useState(BEHAVIORAL_THEMES[0].id);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  const activeTheme = BEHAVIORAL_THEMES.find(t => t.id === activeThemeId)!;
  const activeAnswer = answers.find(a => a.themeId === activeThemeId) || { themeId: activeThemeId, bullets: [''] };

  const handleFetchPrompt = async () => {
    setLoadingPrompt(true);
    try {
      const p = await generateBehavioralPrompt(activeTheme.label);
      setCurrentPrompt(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const updateBullet = (index: number, val: string) => {
    const newBullets = [...activeAnswer.bullets];
    newBullets[index] = val;
    onUpdateAnswer(activeThemeId, newBullets);
  };

  const addBullet = () => onUpdateAnswer(activeThemeId, [...activeAnswer.bullets, '']);

  const removeBullet = (index: number) => {
    if (activeAnswer.bullets.length === 1) return;
    onUpdateAnswer(activeThemeId, activeAnswer.bullets.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold">Training Room</h2>
        <p className="text-slate-400 mt-2">Bullet points only. No storytelling yet. Remove improvisation.</p>
      </header>
      <div className="flex space-x-2 overflow-x-auto pb-4 no-scrollbar">
        {BEHAVIORAL_THEMES.map(theme => (
          <button key={theme.id} onClick={() => { setActiveThemeId(theme.id); setCurrentPrompt(''); }} className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${activeThemeId === theme.id ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'}`}>{theme.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-emerald-400">{activeTheme.label} Protocol</h3>
              <button onClick={handleFetchPrompt} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold transition-colors" disabled={loadingPrompt}>{loadingPrompt ? 'Loading...' : 'Get Prompt'}</button>
           </div>
           {currentPrompt && <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"><p className="text-sm font-medium text-emerald-300 italic">" {currentPrompt.trim()} "</p></div>}
           <div className="space-y-4">
              <p className="text-xs font-bold text-slate-500 uppercase">Bullet Points (Raw Facts)</p>
              {activeAnswer.bullets.map((bullet, idx) => (
                <div key={idx} className="flex space-x-2">
                  <input className="flex-1 bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500" placeholder="Enter a raw detail..." value={bullet} onChange={(e) => updateBullet(idx, e.target.value)} />
                  <button onClick={() => removeBullet(idx)} className="text-slate-600 hover:text-rose-500 px-2">✕</button>
                </div>
              ))}
              <button onClick={addBullet} className="text-xs font-bold text-emerald-500 hover:text-emerald-400">+ Add Point</button>
           </div>
        </div>
        <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 border-dashed flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-2xl mb-4">⏱️</div>
            <h3 className="text-xl font-bold mb-2">Simulation Protocol</h3>
            <p className="text-slate-400 text-sm max-w-xs mb-6">Pick one question and answer it out loud. 10 minutes max. No judgment. Just exposure to the pressure.</p>
            <button className="bg-slate-800 hover:bg-slate-700 px-8 py-3 rounded-xl text-sm font-bold border border-slate-700 transition-all">Start Timer</button>
        </div>
      </div>
    </div>
  );
};

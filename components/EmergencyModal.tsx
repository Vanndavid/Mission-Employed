
import React from 'react';
import { MENTAL_RULES } from '../constants';

interface EmergencyModalProps {
  onClose: () => void;
}

export const EmergencyModal = ({ onClose }: EmergencyModalProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
      <div className="max-w-2xl w-full bg-slate-900 border-4 border-rose-600 p-12 rounded-3xl shadow-[0_0_50px_rgba(225,29,72,0.3)] text-center space-y-8">
        <div className="w-20 h-20 bg-rose-600 text-white rounded-full flex items-center justify-center text-4xl mx-auto animate-pulse">
          ⚠️
        </div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">
          {MENTAL_RULES.emergency.message}
        </h2>
        <div className="space-y-4 text-left">
          {MENTAL_RULES.emergency.steps.map((step, i) => (
            <div key={i} className="flex items-start space-x-4 group">
              <span className="text-rose-500 font-mono font-bold pt-1">{i + 1}.0</span>
              <p className="text-slate-300 text-lg font-medium leading-tight group-hover:text-white transition-colors">{step}</p>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full py-4 bg-white text-slate-900 rounded-xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all shadow-xl"
        >
          Acknowledge & Resume Mission
        </button>
      </div>
    </div>
  );
};

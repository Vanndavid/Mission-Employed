
import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (t: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'dashboard', label: 'Mission Control', icon: '🚀' },
    { id: 'applications', label: 'Pipeline', icon: '📁' },
    { id: 'prep', label: 'Training Room', icon: '🧠' },
    { id: 'rules', label: 'The Codex', icon: '📜' },
  ];

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0">
      <div className="p-6">
        <h1 className="text-xl font-bold text-emerald-500 tracking-tight">MISSION: EMPLOYED</h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Mechanical Execution</p>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <span className="mr-3 text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="p-4 bg-slate-800/50 m-4 rounded-xl border border-slate-700">
        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Mental Rule #1</h3>
        <p className="text-sm text-slate-300">"Applying is mechanical, not strategic."</p>
      </div>
    </div>
  );
};

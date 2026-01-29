
import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (t: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const Sidebar = ({ activeTab, setActiveTab, theme, toggleTheme }: SidebarProps) => {
  const tabs = [
    { id: 'dashboard', label: 'Mission Control', sub: 'Checklist & Coding', icon: '🚀' },
    { id: 'applications', label: 'Pipeline', sub: 'Mechanical Applying', icon: '📁' },
    { id: 'prep', label: 'Training Room', sub: 'Behavioral & Sim', icon: '🧠' },
    { id: 'rules', label: 'The Codex', sub: 'Mental Guidelines', icon: '📜' },
  ];

  return (
    <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen fixed left-0 top-0 transition-colors">
      <div className="p-6">
        <h1 className="text-xl font-bold text-emerald-600 dark:text-emerald-500 tracking-tight">MISSION: EMPLOYED</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest font-semibold">Mechanical Execution</p>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex flex-col items-start px-4 py-3 rounded-lg transition-colors border ${
              activeTab === tab.id 
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent'
            }`}
          >
            <div className="flex items-center">
              <span className="mr-3 text-lg">{tab.icon}</span>
              <span className="text-sm font-bold">{tab.label}</span>
            </div>
            <span className={`text-[10px] ml-8 uppercase tracking-tighter font-medium ${activeTab === tab.id ? 'text-emerald-500/70' : 'text-slate-400'}`}>
              {tab.sub}
            </span>
          </button>
        ))}
      </nav>

      <div className="px-4 py-2">
        <button 
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
        >
          <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          <span>{theme === 'light' ? '🌙' : '☀️'}</span>
        </button>
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 m-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Mental Rule #1</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">"Applying is mechanical, not strategic."</p>
      </div>
    </div>
  );
};

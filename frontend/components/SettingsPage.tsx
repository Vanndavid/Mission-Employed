import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { ColorMode, THEME_PALETTE_IDS, THEME_PALETTES } from '../themes';
import { ConnectAgentSection } from './ConnectAgentSection';

const MODES: { id: ColorMode; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'dark', label: 'Dark', icon: '🌙' },
];

/**
 * Display preferences, which apply to this device only and are not saved to
 * the account, and how to connect an AI agent to it.
 */
export function SettingsPage() {
  const { mode, palette, setMode, setPalette } = useTheme();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Appearance applies to this device only.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-6">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Colour theme</h3>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {THEME_PALETTE_IDS.map(id => {
              const cfg = THEME_PALETTES[id];
              const selected = palette === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPalette(id)}
                  className={`flex items-center gap-3 rounded-lg p-3 border text-left transition-all ${
                    selected
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span
                    className="w-8 h-8 shrink-0 rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: cfg.swatch }}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{cfg.label}</span>
                    <span className="block text-xs text-slate-500 truncate">{cfg.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Mode</h3>
          <div className="mt-3 inline-flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            {MODES.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={`px-6 py-2 text-xs font-bold uppercase tracking-widest ${
                  mode === id
                    ? 'bg-brand-600 text-white'
                    : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span aria-hidden className="mr-2">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <ConnectAgentSection />
    </div>
  );
}

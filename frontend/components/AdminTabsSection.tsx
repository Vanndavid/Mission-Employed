import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateHiddenTabs } from '../services/authClient';
import { errorMessage } from '../services/http';
import { NAV_TABS, screenLabel } from '../utils/navTabs';
import { useToast } from './ToastProvider';

/**
 * Which feature tabs users see, for the whole site. Each switch saves at once
 * and sends the whole list. Hiding a tab only declutters the sidebar: the
 * plan still decides what the features behind it allow.
 */
export function AdminTabsSection() {
  const { hiddenTabs, setHiddenTabs } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const setShown = async (key: (typeof NAV_TABS)[number]['key'], shown: boolean) => {
    const next = NAV_TABS.map(t => t.key).filter(k => (k === key ? !shown : hiddenTabs.includes(k)));
    const label = screenLabel(NAV_TABS.find(t => t.key === key)!);

    setSaving(true);
    try {
      const { hiddenTabs: saved } = await updateHiddenTabs(next);
      setHiddenTabs(saved);
      toast(shown ? `${label} is shown to users.` : `${label} is hidden from users.`, 'success');
    } catch (e) {
      toast(errorMessage(e, 'Could not save the tabs.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Tabs users see</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
        Untick a tab to take it off every user's sidebar. Mission Control's modes, Problems and Quiz, are switched
        separately and show as tabs on that page. It only tidies the sidebar: the plan below still decides what the
        features behind it allow, and an AI agent can still use them. You keep seeing hidden tabs, marked as such.
        Saves straight away.
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {NAV_TABS.map(tab => {
          const shown = !hiddenTabs.includes(tab.key);
          const label = screenLabel(tab);
          return (
            <label
              key={tab.key}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                shown
                  ? 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  : 'border-dashed border-slate-300 dark:border-slate-700 text-slate-400'
              }`}
            >
              <input
                type="checkbox"
                aria-label={`Show ${label} to users`}
                checked={shown}
                disabled={saving}
                onChange={e => void setShown(tab.key, e.target.checked)}
                className="rounded border-slate-300 text-brand-600"
              />
              <span className="text-lg">{tab.icon}</span>
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-widest">
                {shown ? 'Shown' : 'Hidden'}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

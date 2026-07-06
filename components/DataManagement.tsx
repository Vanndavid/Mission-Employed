
import React, { useRef } from 'react';
import { AppState } from '../types';
import { migrateState } from '../utils/migrateState';
import { useToast } from './ToastProvider';

interface DataManagementProps {
  state: AppState;
  onImport: (state: AppState) => void;
}

export const DataManagement = ({ state, onImport }: DataManagementProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const anchor = document.createElement('a');
    anchor.setAttribute('href', dataStr);
    anchor.setAttribute('download', `one-partner-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast('Backup exported', 'success');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const migrated = migrateState(parsed);
        if (!window.confirm('Import will replace all current data. Continue?')) return;
        onImport(migrated);
        toast('Data imported successfully', 'success');
      } catch {
        toast('Invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed bottom-4 right-4 flex gap-2 z-40">
      <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      <button
        onClick={() => inputRef.current?.click()}
        className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 text-xs font-bold shadow-sm"
        title="Import backup JSON"
      >
        Import
      </button>
      <button
        onClick={handleExport}
        className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 text-xs font-bold shadow-sm"
        title="Export backup JSON"
      >
        Export
      </button>
    </div>
  );
};

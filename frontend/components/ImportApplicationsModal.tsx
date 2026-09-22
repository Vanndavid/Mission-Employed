import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { JobApplication, JobStatus } from '../types';
import { ApiError } from '../services/http';
import { requestImportPlan } from '../services/apiClient';
import { ImportOutcome } from '../contexts/ApplicationsContext';
import {
  defaultImportOptions,
  distinctColumnValues,
  distinctValues,
  guessPlan,
  ImportField,
  IMPORT_FIELDS,
  ImportOptions,
  ImportPlan,
  mappingDifferences,
  mergePlans,
  NO_COLUMN,
  sampleRows,
  sanitizePlan,
  StatusRule,
} from '../utils/importPlan';
import { buildRowPlans, isActionable, RowPlan, summarize } from '../utils/importMerge';
import { applyPlan } from '../utils/importRows';
import { defaultSheet, readSheetFile, SheetFile, SheetGrid } from '../utils/spreadsheet';

/**
 * Importing a spreadsheet of job applications.
 *
 * Three steps, one component: read the file, review the column mapping, then
 * review the rows and commit. The mapping is a form rather than a result,
 * because the AI that suggests it can be wrong and a dropdown is a much cheaper
 * correction than a bad import.
 *
 * It works without the AI. `guessPlan` maps the sheet from header names and
 * value shapes, and is both the fallback when the call fails and the baseline
 * the AI's answer is diffed against, so free-plan users get a working importer
 * rather than a locked door.
 */

type Stage = 'reading' | 'mapping' | 'review' | 'done';

/** How the AI step turned out, so the two failure modes read differently. */
type AiState =
  | { kind: 'pending' }
  | { kind: 'applied'; changed: ImportField[]; notes: string }
  | { kind: 'skipped'; reason: string };

interface ImportApplicationsModalProps {
  file: File;
  existing: JobApplication[];
  onClose: () => void;
  onCommit: (plans: RowPlan[]) => Promise<ImportOutcome[]>;
}

const FIELD_LABELS: Record<ImportField, string> = {
  company: 'Company',
  role: 'Role',
  location: 'Location',
  url: 'Job link',
  source: 'Source',
  status: 'Status',
  dateApplied: 'Date applied',
  statusDate: 'Status date',
  notes: 'Notes',
  nextAction: 'Next action',
};

/** Channels common enough to offer, without constraining the column. */
const KNOWN_SOURCES = ['Seek', 'LinkedIn', 'Indeed', 'Company site', 'Recruiter', 'Referral'];

const VERDICT_STYLES: Record<RowPlan['verdict'], string> = {
  create: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  fill: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  identical: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  invalid: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

const VERDICT_LABELS: Record<RowPlan['verdict'], string> = {
  create: 'New',
  fill: 'Fill',
  identical: 'Unchanged',
  invalid: 'Skipped',
};

const OUTCOME_LABELS: Record<ImportOutcome['status'], string> = {
  created: 'Created',
  filled: 'Filled',
  skipped: 'Unchanged',
  failed: 'Failed',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const Spinner = () => (
  <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
);

export const ImportApplicationsModal = ({
  file,
  existing,
  onClose,
  onCommit,
}: ImportApplicationsModalProps) => {
  const [stage, setStage] = useState<Stage>('reading');
  const [sheetFile, setSheetFile] = useState<SheetFile | null>(null);
  const [grid, setGrid] = useState<SheetGrid | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [options, setOptions] = useState<ImportOptions>(() => defaultImportOptions(today()));
  const [ai, setAi] = useState<AiState>({ kind: 'pending' });
  const [readError, setReadError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);

  // --- Step 1: read the file, then ask for a mapping ----------------------

  useEffect(() => {
    let live = true;

    const run = async () => {
      let parsed: SheetFile;

      try {
        parsed = await readSheetFile(file);
      } catch (cause) {
        if (live) {
          setReadError(cause instanceof Error
            ? cause.message
            : 'That file could not be read as a spreadsheet.');
        }
        return;
      }

      const sheet = defaultSheet(parsed);

      if (!live) return;

      if (sheet === null) {
        setReadError('That file has no rows to import. Try saving it as .xlsx or .csv.');
        return;
      }

      setSheetFile(parsed);
      setGrid(sheet);

      const guess = guessPlan(sheet);

      // The guess is shown immediately, so the form is usable while the model
      // is still thinking.
      setPlan(guess);
      setOptions(prev => ({
        ...prev,
        followUpColumn: guess.columns.nextAction,
        daysSinceColumn: guessDaysColumn(sheet),
      }));
      setStage('mapping');

      try {
        const raw = await requestImportPlan(
          sheet.headers,
          sampleRows(sheet),
          distinctColumnValues(sheet),
        );

        if (!live) return;

        const merged = mergePlans(guess, sanitizePlan(raw, sheet));

        setPlan(merged);
        setAi({
          kind: 'applied',
          changed: mappingDifferences(guess, merged),
          notes: merged.notes,
        });
      } catch (cause) {
        if (!live) return;

        // The two failure modes must not read the same, or a premium user will
        // think their subscription lapsed.
        setAi({
          kind: 'skipped',
          reason: cause instanceof ApiError && cause.isPremiumRequired
            ? 'Columns matched by name. AI column matching is a premium feature.'
            : 'Columns matched by name — the AI service could not be reached.',
        });
      }
    };

    void run();

    return () => {
      live = false;
    };
  }, [file]);

  // --- Steps 2 and 3: everything below is derived, and re-derived on edit --

  const rowPlans = useMemo(() => {
    if (grid === null || plan === null) return [];

    return buildRowPlans(applyPlan(grid, plan, options), existing);
  }, [grid, plan, options, existing]);

  const summary = useMemo(() => summarize(rowPlans), [rowPlans]);

  const selected = useMemo(
    () => rowPlans.filter(row => isActionable(row.verdict) && !skipped.has(row.rowNumber)),
    [rowPlans, skipped],
  );

  const toggleRow = useCallback((rowNumber: number) => {
    setSkipped(prev => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);

      return next;
    });
  }, []);

  const setColumn = (field: ImportField, column: number) => {
    setPlan(prev => (prev === null ? prev : { ...prev, columns: { ...prev.columns, [field]: column } }));
  };

  const setStatusRule = (from: string, changes: Partial<StatusRule>) => {
    setPlan(prev => prev === null ? prev : {
      ...prev,
      statusMap: prev.statusMap.map(rule => rule.from === from ? { ...rule, ...changes } : rule),
    });
  };

  const handleCommit = async () => {
    setCommitting(true);

    try {
      setOutcomes(await onCommit(selected));
      setStage('done');
    } finally {
      setCommitting(false);
    }
  };

  // Statuses in the sheet that no rule covers yet — the reviewer's to decide.
  const unmappedStatuses = useMemo(() => {
    if (grid === null || plan === null || plan.columns.status === NO_COLUMN) return [];

    const covered = new Set(plan.statusMap.map(rule => rule.from.toLowerCase()));

    return distinctValues(grid, plan.columns.status).filter(value => !covered.has(value.toLowerCase()));
  }, [grid, plan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-w-6xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-start gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-50">
              Import applications
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {file.name}
              {grid !== null && ` — ${grid.rows.length} rows`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {readError !== null && (
            <p className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 text-sm text-amber-800 dark:text-amber-200">
              {readError}
            </p>
          )}

          {stage === 'reading' && readError === null && (
            <div className="flex flex-col items-center gap-3 py-10 text-slate-500 dark:text-slate-400">
              <Spinner />
              <p className="text-sm">Reading the spreadsheet…</p>
            </div>
          )}

          {stage === 'mapping' && grid !== null && plan !== null && (
            <>
              <MappingNotice state={ai} />

              {plan.dateFormatHint !== '' && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dates read as <span className="font-bold">{plan.dateFormatHint}</span>. Check the
                  parsed dates in the next step before importing.
                </p>
              )}

              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Columns
                </h4>

                <div className="grid gap-3 sm:grid-cols-2">
                  {IMPORT_FIELDS.map(field => (
                    <ColumnPicker
                      key={field}
                      label={FIELD_LABELS[field]}
                      grid={grid}
                      column={plan.columns[field]}
                      changedByAi={ai.kind === 'applied' && ai.changed.includes(field)}
                      onChange={column => setColumn(field, column)}
                    />
                  ))}
                </div>
              </section>

              {plan.statusMap.length > 0 && (
                <section className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Statuses
                  </h4>

                  <div className="space-y-2">
                    {plan.statusMap.map(rule => (
                      <div key={rule.from} className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="font-bold text-slate-700 dark:text-slate-200 min-w-40">
                          {rule.from}
                        </span>
                        <span className="text-slate-400">becomes</span>
                        <select
                          aria-label={`Status for ${rule.from}`}
                          value={rule.status}
                          onChange={event => setStatusRule(rule.from, {
                            status: event.target.value as JobStatus,
                          })}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-900 dark:text-slate-100"
                        >
                          {Object.values(JobStatus).map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                        {rule.nextAction !== '' && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            and a next action: “{rule.nextAction}”
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {unmappedStatuses.length > 0 && (
                <p className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                  Not recognised, and will import as Applied with the original wording kept in the
                  notes: {unmappedStatuses.join(', ')}.
                </p>
              )}

              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Options
                </h4>

                <ColumnPicker
                  label="Follow-up flag"
                  grid={grid}
                  column={options.followUpColumn}
                  changedByAi={false}
                  onChange={column => setOptions(prev => ({ ...prev, followUpColumn: column }))}
                />

                <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={options.inferDateFromDaysColumn}
                    onChange={event => setOptions(prev => ({
                      ...prev,
                      inferDateFromDaysColumn: event.target.checked,
                    }))}
                    className="mt-1"
                  />
                  <span>
                    Estimate a missing “date applied” from a days-elapsed column.
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Off by default: such a column is usually a live formula, so the estimate is
                      only as good as the date the file was last opened. It never replaces a date
                      the sheet already has.
                    </span>
                  </span>
                </label>

                {options.inferDateFromDaysColumn && (
                  <div className="flex flex-wrap items-center gap-3 pl-6">
                    <ColumnPicker
                      label="Days-elapsed column"
                      grid={grid}
                      column={options.daysSinceColumn}
                      changedByAi={false}
                      onChange={column => setOptions(prev => ({ ...prev, daysSinceColumn: column }))}
                    />
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      <span className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Sheet as of
                      </span>
                      <input
                        type="date"
                        value={options.sheetAsOf}
                        onChange={event => setOptions(prev => ({
                          ...prev,
                          sheetAsOf: event.target.value,
                        }))}
                        className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                      />
                    </label>
                  </div>
                )}

                {sheetFile !== null && sheetFile.sheets.length > 1 && (
                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    <span className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Sheet
                    </span>
                    <select
                      value={grid.sheetName}
                      onChange={event => {
                        const next = sheetFile.sheets.find(s => s.sheetName === event.target.value);
                        if (!next) return;

                        setGrid(next);
                        setPlan(guessPlan(next));
                      }}
                      className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                    >
                      {sheetFile.sheets.map(sheet => (
                        <option key={sheet.sheetName} value={sheet.sheetName}>
                          {sheet.sheetName} ({sheet.rows.length} rows)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </section>
            </>
          )}

          {stage === 'review' && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-2">
                <span className="font-bold">{summary.create} new</span>
                <span className="font-bold">{summary.fill} to fill</span>
                <span>{summary.identical} unchanged</span>
                <span>{summary.invalid} skipped</span>
              </p>

              <RowTable plans={rowPlans} skipped={skipped} onToggle={toggleRow} />
            </>
          )}

          {stage === 'done' && outcomes !== null && <OutcomeTable outcomes={outcomes} />}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex flex-wrap justify-end gap-3">
          {stage === 'mapping' && (
            <button
              onClick={() => setStage('review')}
              disabled={plan === null || plan.columns.company === NO_COLUMN}
              className="px-6 py-2 rounded-xl font-bold bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
            >
              {plan !== null && plan.columns.company === NO_COLUMN
                ? 'Pick a company column'
                : 'Review rows'}
            </button>
          )}

          {stage === 'review' && (
            <>
              <button
                onClick={() => setStage('mapping')}
                className="px-4 py-2 rounded-xl font-bold text-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-brand-600"
              >
                Back to columns
              </button>
              <button
                onClick={() => void handleCommit()}
                disabled={committing || selected.length === 0}
                className="px-6 py-2 rounded-xl font-bold bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
              >
                {committing
                  ? 'Importing…'
                  : selected.length === 0
                    ? 'Nothing to import'
                    : `Import ${selected.length} ${selected.length === 1 ? 'row' : 'rows'}`}
              </button>
            </>
          )}

          {(stage === 'done' || readError !== null) && (
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-xl font-bold bg-brand-600 hover:bg-brand-500 text-white"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** A column of small integers with 'day' in its name, if there is one. */
function guessDaysColumn(grid: SheetGrid): number {
  return grid.headers.findIndex(header => /day/i.test(header));
}

const MappingNotice = ({ state }: { state: AiState }) => {
  if (state.kind === 'pending') {
    return (
      <p className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        Matching your columns…
      </p>
    );
  }

  if (state.kind === 'skipped') {
    return (
      <p className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-300">
        {state.reason} Check the columns below and correct anything that looks wrong.
      </p>
    );
  }

  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-300 space-y-1">
      <p>
        {state.changed.length === 0
          ? 'Columns matched. Nothing the AI suggested differed from the names in your sheet.'
          : `The AI changed ${state.changed.length} of these, marked below.`}
      </p>
      {state.notes !== '' && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{state.notes}</p>
      )}
    </div>
  );
};

interface ColumnPickerProps {
  label: string;
  grid: SheetGrid;
  column: number;
  changedByAi: boolean;
  onChange: (column: number) => void;
}

const ColumnPicker = ({ label, grid, column, changedByAi, onChange }: ColumnPickerProps) => {
  // Three values from the chosen column, so a wrong pick is obvious here
  // rather than after importing.
  const preview = column === NO_COLUMN
    ? []
    : grid.rows.slice(0, 3).map(row => (row[column] ?? '').trim()).filter(value => value !== '');

  return (
    <label className="block text-sm">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
        {changedByAi && (
          <span className="rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 px-2 py-0.5 text-[10px] tracking-normal normal-case">
            AI
          </span>
        )}
      </span>
      <select
        aria-label={label}
        value={column}
        onChange={event => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-900 dark:text-slate-100"
      >
        <option value={NO_COLUMN}>— not imported —</option>
        {grid.headers.map((header, index) => (
          <option key={index} value={index}>
            {header.trim() === '' ? `Column ${index + 1}` : header}
          </option>
        ))}
      </select>
      {preview.length > 0 && (
        <span className="mt-1 block truncate text-xs text-slate-400 dark:text-slate-500">
          {preview.join(' · ')}
        </span>
      )}
    </label>
  );
};

interface RowTableProps {
  plans: RowPlan[];
  skipped: Set<number>;
  onToggle: (rowNumber: number) => void;
}

const RowTable = ({ plans, skipped, onToggle }: RowTableProps) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
    <table className="w-full text-sm">
      <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        <tr>
          <th className="px-4 py-3 w-10" />
          <th className="px-4 py-3 text-left w-16">Row</th>
          <th className="px-4 py-3 text-left w-24">Action</th>
          <th className="px-4 py-3 text-left">Company</th>
          <th className="px-4 py-3 text-left">Role</th>
          <th className="px-4 py-3 text-left">Detail</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {plans.map(plan => {
          const actionable = isActionable(plan.verdict);

          return (
            <tr
              key={plan.rowNumber}
              className={actionable ? '' : 'opacity-60'}
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={`Import row ${plan.rowNumber}`}
                  disabled={!actionable}
                  checked={actionable && !skipped.has(plan.rowNumber)}
                  onChange={() => onToggle(plan.rowNumber)}
                />
              </td>
              <td className="px-4 py-3 text-slate-400">{plan.rowNumber}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${VERDICT_STYLES[plan.verdict]}`}>
                  {VERDICT_LABELS[plan.verdict]}
                </span>
              </td>
              <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">
                {plan.company || '—'}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{plan.role || '—'}</td>
              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="block">
                  {plan.verdict === 'fill' ? `Fills ${plan.fills.join(', ')}` : plan.reason}
                </span>
                {plan.warnings.map(warning => (
                  <span key={warning} className="block text-amber-600 dark:text-amber-400">
                    {warning}
                  </span>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const OutcomeTable = ({ outcomes }: { outcomes: ImportOutcome[] }) => {
  const failed = outcomes.filter(outcome => outcome.status === 'failed');
  const created = outcomes.filter(outcome => outcome.status === 'created').length;
  const filled = outcomes.filter(outcome => outcome.status === 'filled').length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Created <span className="font-bold">{created}</span>, filled{' '}
        <span className="font-bold">{filled}</span>
        {failed.length > 0 && <>, <span className="font-bold text-amber-600 dark:text-amber-400">{failed.length} failed</span></>}.
      </p>

      {failed.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left w-16">Row</th>
                <th className="px-4 py-3 text-left w-24">Result</th>
                <th className="px-4 py-3 text-left">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {failed.map(outcome => (
                <tr key={outcome.rowNumber}>
                  <td className="px-4 py-3 text-slate-400">{outcome.rowNumber}</td>
                  <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">
                    {OUTCOME_LABELS[outcome.status]}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {outcome.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

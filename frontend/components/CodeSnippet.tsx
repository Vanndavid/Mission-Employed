import React from 'react';

/**
 * A code snippet, monospaced, with line numbers, so a question can ask
 * "which line throws?". The numbers are not part of the selectable text.
 */
export function CodeSnippet({ code }: { code: string }) {
  const lines = code.replace(/\n+$/, '').split('\n');

  return (
    <figure
      aria-label="Code"
      className="rounded-xl bg-slate-950 text-slate-100 border border-slate-800 overflow-x-auto"
    >
      <pre className="py-3 text-[13px] leading-6 font-mono">
        <code className="block min-w-max">
          {lines.map((line, i) => (
            <span key={i} className="flex">
              <span aria-hidden="true" className="select-none w-10 shrink-0 pr-3 text-right text-slate-500">
                {i + 1}
              </span>
              <span className="pr-4 whitespace-pre">{line === '' ? ' ' : line}</span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

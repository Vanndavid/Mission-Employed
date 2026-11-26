import React from 'react';

/**
 * A code snippet, monospaced, with line numbers, so a question can ask
 * "which line throws?". The numbers are not part of the selectable text.
 *
 * Everything else is optional, for code review: a line number can be a
 * button (`onLineClick`), a line can be highlighted (`lineClassName`), and
 * content can sit under a line (`renderAfterLine`), such as comments or an
 * editor. `wrap` wraps long lines instead of scrolling sideways, so that
 * content keeps the width of the box. Without them it renders as it always
 * has, which the quiz relies on.
 *
 * Unwrapped, it fills the width it is given and never asks for more, so in a
 * shrink-to-fit container (inline-block, an absolutely positioned box) give
 * it a width.
 */
export function CodeSnippet({
  code,
  label = 'Code',
  wrap = false,
  onLineClick,
  lineActionLabel = line => `Line ${line}`,
  lineClassName,
  renderAfterLine,
}: {
  code: string;
  /** The figure's accessible name. */
  label?: string;
  wrap?: boolean;
  /** Makes each line number a button that calls this with the 1-based line. */
  onLineClick?: (line: number) => void;
  /** The accessible name of a line number's button. */
  lineActionLabel?: (line: number) => string;
  /** Extra classes for a line's row. */
  lineClassName?: (line: number) => string | undefined;
  /** Drawn under a line, across the width of the code. */
  renderAfterLine?: (line: number) => React.ReactNode;
}) {
  const lines = code.replace(/\n+$/, '').split('\n');

  return (
    <figure
      aria-label={label}
      // Unwrapped lines scroll inside the box. Size containment keeps their
      // width out of the page's minimum width, or on a phone one long line
      // would widen the whole screen instead of scrolling here.
      className={`rounded-xl bg-slate-950 text-slate-100 border border-slate-800 overflow-x-auto ${wrap ? '' : '[contain:inline-size]'}`}
    >
      <pre className="py-3 text-[13px] leading-6 font-mono">
        <code className={wrap ? 'block' : 'block min-w-max'}>
          {lines.map((line, i) => {
            const number = i + 1;
            const after = renderAfterLine?.(number);
            return (
              <React.Fragment key={i}>
                <span data-line={number} className={`flex ${lineClassName?.(number) ?? ''}`}>
                  {onLineClick ? (
                    <button
                      type="button"
                      onClick={() => onLineClick(number)}
                      aria-label={lineActionLabel(number)}
                      title={lineActionLabel(number)}
                      className="select-none w-10 shrink-0 pr-3 text-right text-slate-500 hover:text-brand-300 hover:bg-slate-800/80 focus:outline-none focus-visible:text-brand-300 focus-visible:bg-slate-800 cursor-pointer"
                    >
                      {number}
                    </button>
                  ) : (
                    <span aria-hidden="true" className="select-none w-10 shrink-0 pr-3 text-right text-slate-500">
                      {number}
                    </span>
                  )}
                  <span className={`pr-4 ${wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere] min-w-0' : 'whitespace-pre'}`}>
                    {line === '' ? ' ' : line}
                  </span>
                </span>
                {after !== null && after !== undefined && after !== false && (
                  <span className="block whitespace-normal [overflow-wrap:anywhere] font-sans text-sm leading-normal pl-10 pr-3 py-1">{after}</span>
                )}
              </React.Fragment>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}

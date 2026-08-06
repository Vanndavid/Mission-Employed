
import React, { useEffect, useRef, useState } from 'react';

interface A4PreviewProps {
  content: string;
  emptyLabel?: string;
  documentTitle?: string;
}

/** A4 page preview — 210×297mm aspect, scaled to fit the container. */
export const A4Preview = ({
  content,
  emptyLabel = 'Nothing to preview yet.',
  documentTitle = 'Document',
}: A4PreviewProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      // A4 width at 96dpi ≈ 794px; leave padding for the scroll gutter
      const available = el.clientWidth - 24;
      const pageWidthPx = 794;
      setScale(Math.min(1, available / pageWidthPx));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handlePrint = () => {
    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100');
    if (!win) return;
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${documentTitle.replace(/</g, '')}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: "Source Serif 4", "Libre Baskerville", Georgia, "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.45;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: inherit;
      margin: 0;
    }
  </style>
</head>
<body><pre>${escaped}</pre></body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          A4 preview · 210 × 297 mm
        </p>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!content.trim()}
          className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40"
        >
          Print / PDF
        </button>
      </div>

      <div
        ref={viewportRef}
        className="overflow-auto max-h-[55vh] rounded-xl bg-slate-200/80 dark:bg-slate-950/80 p-3"
      >
        <div
          className="mx-auto"
          style={{
            width: `${794 * scale}px`,
            height: `${1123 * scale}px`,
          }}
        >
          <div
            className="origin-top-left bg-white text-slate-900 shadow-[0_8px_40px_rgba(15,23,42,0.18)]"
            style={{
              width: '210mm',
              minHeight: '297mm',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              padding: '18mm 16mm',
              boxSizing: 'border-box',
            }}
          >
            {content.trim() ? (
              <pre
                className="m-0 whitespace-pre-wrap break-words"
                style={{
                  fontFamily: '"Source Serif 4", "Libre Baskerville", Georgia, "Times New Roman", serif',
                  fontSize: '11pt',
                  lineHeight: 1.45,
                }}
              >
                {content}
              </pre>
            ) : (
              <p className="text-sm text-slate-400 italic">{emptyLabel}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ModeToggleProps {
  mode: 'edit' | 'preview';
  onChange: (mode: 'edit' | 'preview') => void;
}

export const EditPreviewToggle = ({ mode, onChange }: ModeToggleProps) => (
  <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/80">
    <button
      type="button"
      onClick={() => onChange('edit')}
      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        mode === 'edit'
          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      Edit
    </button>
    <button
      type="button"
      onClick={() => onChange('preview')}
      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        mode === 'preview'
          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      A4 Preview
    </button>
  </div>
);

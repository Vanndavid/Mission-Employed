/**
 * Labels and number formats for the admin usage screen.
 */

/** Route patterns as ai_usage records them, in words an admin recognises. */
const FEATURE_LABELS: Record<string, string> = {
  'ai/coding/problem': 'Coding problem',
  'ai/coding/sessions': 'Coding tutor',
  'ai/sessions/{session}/messages': 'Tutor chat',
  'ai/behavioral/prompt': 'Practice question',
  'ai/behavioral/evaluate': 'Practice answer feedback',
  'ai/mock/sessions/{session}/turns': 'Mock interview (typed)',
  'ai/mock/sessions/{session}/report': 'Mock interview report',
  'ai/mock/live': 'Mock interview (voice)',
  'ai/job/parse': 'Job description parsing',
  'ai/import/plan': 'Spreadsheet import',
  'ai/cover-letter/generate': 'Cover letter',
  'ai/cv/generate': 'Tailored CV',
  'ai/tts': 'Spoken playback',
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

const trim = (value: string) => value.replace(/\.?0+$/, '');

/** 950, 12.5k, 1.25M. */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${trim((tokens / 1000).toFixed(1))}k`;
  return `${trim((tokens / 1_000_000).toFixed(2))}M`;
}

/** $4.20, or <$0.01 for a cost too small to show in cents. */
export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.005) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

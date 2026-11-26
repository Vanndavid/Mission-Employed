import {
  SystemDesignRubric,
  SystemDesignRubricTrait,
  SystemDesignScenario,
  SystemDesignSectionKey,
  SystemDesignSections,
  SystemDesignTraitKey,
} from '../types/systemDesign';

/**
 * System design answers, before they reach the server: word counts and the
 * word gate, worked out the way SystemDesignRubric does it so the form can
 * say which traits would score 0, and the draft parked in this browser.
 * The server applies the gate again and decides the score; nothing here is
 * the enforcement.
 */

export const SECTION_KEYS: SystemDesignSectionKey[] = [
  'requirements',
  'estimates',
  'api',
  'data_model',
  'high_level',
  'deep_dive',
  'tradeoffs',
];

export function emptySections(): SystemDesignSections {
  return Object.fromEntries(SECTION_KEYS.map(key => [key, ''])) as SystemDesignSections;
}

/** Runs of non-space containing a letter or digit, so "-" and "->" do not count. Matches the server. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
}

export function totalWords(sections: SystemDesignSections): number {
  return SECTION_KEYS.reduce((sum, key) => sum + countWords(sections[key]), 0);
}

export function hasWriting(sections: SystemDesignSections): boolean {
  return SECTION_KEYS.some(key => sections[key].trim() !== '');
}

/** Words across each trait's sections. */
export function traitWords(rubric: SystemDesignRubric, sections: SystemDesignSections): Record<SystemDesignTraitKey, number> {
  return Object.fromEntries(
    rubric.traits.map(trait => [trait.key, trait.sections.reduce((sum, key) => sum + countWords(sections[key] ?? ''), 0)]),
  ) as Record<SystemDesignTraitKey, number>;
}

/** The traits that would score 0 unasked as the answer stands, in rubric order. */
export function gatedTraits(rubric: SystemDesignRubric, sections: SystemDesignSections): SystemDesignRubricTrait[] {
  const words = traitWords(rubric, sections);
  return rubric.traits.filter(trait => words[trait.key] < rubric.minWords);
}

export interface ScoreBand {
  label: 'Strong' | 'Fair' | 'Weak';
  /** Border, background and text for the score tile. */
  style: string;
  /** The fill of a bar at this level. */
  bar: string;
}

/** The same bands as the ATS score: 75 and up is strong, under 50 weak. */
export function scoreBand(percent: number): ScoreBand {
  if (percent >= 75) {
    return {
      label: 'Strong',
      style: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
      bar: 'bg-emerald-500',
    };
  }
  if (percent >= 50) {
    return {
      label: 'Fair',
      style: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
      bar: 'bg-amber-500',
    };
  }
  return {
    label: 'Weak',
    style: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
    bar: 'bg-rose-500',
  };
}

/**
 * One answer in progress, kept in this browser until it is scored so a
 * reload or a visit elsewhere does not lose it. It carries its scenario, so
 * coming back resumes the same one, and the account it belongs to, so
 * another account on this browser never sees it.
 */
const DRAFT_KEY = 'mission_employed_system_design_draft';

export interface SystemDesignDraft {
  scenario: SystemDesignScenario;
  sections: SystemDesignSections;
}

const DIFFICULTIES = ['easy', 'medium', 'hard'];

function isScenario(value: unknown): value is SystemDesignScenario {
  if (!value || typeof value !== 'object') return false;
  const { id, title, difficulty, prompt } = value as Record<string, unknown>;
  return (
    Number.isInteger(id) &&
    typeof title === 'string' &&
    typeof prompt === 'string' &&
    typeof difficulty === 'string' &&
    DIFFICULTIES.includes(difficulty)
  );
}

export function loadDraft(userId: number | null): SystemDesignDraft | null {
  if (userId === null) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as { userId?: unknown; scenario?: unknown; sections?: unknown };
    if (stored.userId !== userId || !isScenario(stored.scenario)) return null;

    const saved = stored.sections && typeof stored.sections === 'object' ? (stored.sections as Record<string, unknown>) : {};
    const sections = emptySections();
    for (const key of SECTION_KEYS) {
      if (typeof saved[key] === 'string') sections[key] = saved[key] as string;
    }

    const { id, title, difficulty, prompt } = stored.scenario;
    return { scenario: { id, title, difficulty, prompt }, sections };
  } catch {
    // Corrupt or unreadable storage costs the draft, not the screen.
    return null;
  }
}

export function saveDraft(userId: number, scenario: SystemDesignScenario, sections: SystemDesignSections): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ userId, scenario, sections }));
  } catch {
    // Private mode or full storage: the draft just will not survive a reload.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do.
  }
}

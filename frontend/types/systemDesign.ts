/**
 * System design practice on Mission Control: shapes of
 * /api/practice/system-design/*, which answer flat JSON (no `data` envelope).
 * The rubric itself is the server's (App\Services\Practice\SystemDesignRubric)
 * and arrives with every scenario, so nothing here restates it.
 */

import { PracticeDifficulty } from './practice';

/** Mirrors SystemDesignRubric::SECTIONS, in answer order. */
export type SystemDesignSectionKey =
  | 'requirements'
  | 'estimates'
  | 'api'
  | 'data_model'
  | 'high_level'
  | 'deep_dive'
  | 'tradeoffs';

/** Mirrors SystemDesignRubric::TRAITS, in report order. */
export type SystemDesignTraitKey =
  | 'requirements'
  | 'estimation'
  | 'api_data_model'
  | 'architecture'
  | 'scalability'
  | 'reliability'
  | 'communication';

/** An answer: free text per section, '' where nothing is written yet. */
export type SystemDesignSections = Record<SystemDesignSectionKey, string>;

export interface SystemDesignSection {
  key: SystemDesignSectionKey;
  label: string;
  /** What the section should cover. */
  hint: string;
}

export interface SystemDesignRubricTrait {
  key: SystemDesignTraitKey;
  label: string;
  /** Points out of the rubric's maxScore at a full rating. */
  weight: number;
  /** The sections it is judged on; every one of them for Communication. */
  sections: SystemDesignSectionKey[];
  /** Indexed by score: descriptors[3] is what a 3 means. */
  descriptors: string[];
}

export interface SystemDesignRubric {
  version: string;
  /** Each trait is rated 0 to this. */
  traitMax: number;
  maxScore: number;
  /** A trait whose sections have fewer words than this scores 0 and is not sent to the AI. */
  minWords: number;
  sections: SystemDesignSection[];
  traits: SystemDesignRubricTrait[];
}

/** A scenario as it is served: never its key points or explanation. */
export interface SystemDesignScenario {
  id: number;
  title: string;
  difficulty: PracticeDifficulty;
  /** The scenario, with its scale numbers. */
  prompt: string;
}

/** GET /api/practice/system-design/next. */
export interface SystemDesignNext {
  /** Null when nothing is published at that difficulty. */
  question: SystemDesignScenario | null;
  rubric: SystemDesignRubric;
}

export interface SystemDesignTraitResult {
  key: SystemDesignTraitKey;
  label: string;
  /** 0 to max. */
  score: number;
  max: number;
  /** What the score is worth out of the total, and the most it could be. */
  points: number;
  maxPoints: number;
  /** Under the word gate: scored 0 without the AI being asked. */
  gated: boolean;
  /** Words across the trait's sections. */
  words: number;
  /** The rubric's descriptor for the score given. */
  descriptor: string;
  /** A quote from the answer, checked by the server to be in it. */
  evidence: string | null;
  improvement: string | null;
  keyPoints: { covered: string[]; missed: string[] };
}

/** POST /api/practice/system-design/{id}/answers. */
export interface SystemDesignReport {
  attemptId: number;
  questionId: number;
  rubricVersion: string;
  score: number;
  maxScore: number;
  traits: SystemDesignTraitResult[];
  /** What the scenario was really testing. */
  explanation: string;
}

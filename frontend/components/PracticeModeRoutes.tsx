import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readQuizLaunch, readReviewCategory } from '../utils/practiceLinks';
import { CodeReviewMode } from './CodeReviewMode';
import { QuizMode } from './QuizMode';

/**
 * The quiz and code review as routes: what a link puts in the address (the
 * practice coach's one-click starts, utils/practiceLinks.ts) handed to the
 * mode as props, so the modes themselves need no router.
 */

export function QuizModeRoute() {
  const [params, setParams] = useSearchParams();
  // Once started, the address is tidied so a reload does not start it again.
  const consumed = useCallback(() => setParams({}, { replace: true }), [setParams]);

  return <QuizMode launch={readQuizLaunch(params)} onLaunched={consumed} />;
}

export function CodeReviewModeRoute() {
  const [params, setParams] = useSearchParams();

  return <CodeReviewMode category={readReviewCategory(params)} onClearCategory={() => setParams({}, { replace: true })} />;
}

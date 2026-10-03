import { useRef, useState } from 'react';
import { ApiError, errorMessage } from '../services/http';

interface DocumentStudioOptions {
  /** The saved document, or '' when there is none yet. */
  initial: string;
  /** 'cover letter' or 'CV' — used in the error sentences. */
  label: string;
  generate: () => Promise<string>;
  /** Opens a refine session over the document as it stands. */
  openSession: (document: string) => Promise<{ sessionId: string }>;
  sendTurn: (sessionId: string, instruction: string) => Promise<string>;
}

/**
 * The generate-then-refine loop the CV and cover letter studios share.
 *
 * The refine session is opened on the first Refine, over whatever text is on
 * screen — a fresh draft, a document saved earlier, or one edited by hand —
 * and reused for the turns after it, since each revision is already in its
 * history. A hand edit or a new draft drops the session, so the next Refine
 * starts from the text the user is actually looking at.
 */
export function useDocumentStudio({ initial, label, generate, openSession, sendTurn }: DocumentStudioOptions) {
  const [text, setText] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const describe = (cause: unknown, fallback: string): string => {
    if (cause instanceof ApiError) {
      if (cause.isPremiumRequired) {
        return `The tailored ${label} is a Premium feature and this account is not on Premium. Ask an admin to upgrade the plan.`;
      }
      if (cause.isAiUnavailable) {
        return 'The AI service is not answering right now. Nothing was lost — try again in a moment.';
      }
    }
    return errorMessage(cause, fallback);
  };

  /** Resolves true when the work succeeded, so the caller can switch views. */
  const run = async (work: () => Promise<void>, fallback: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await work();
      return true;
    } catch (cause) {
      setError(describe(cause, fallback));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const edit = (next: string) => {
    setText(next);
    sessionIdRef.current = null;
  };

  const generateDocument = () =>
    run(async () => edit(await generate()), `Could not write the ${label}.`);

  const refine = (instruction: string) =>
    run(async () => {
      if (!sessionIdRef.current) {
        sessionIdRef.current = (await openSession(text)).sessionId;
      }
      setText(await sendTurn(sessionIdRef.current, instruction));
    }, `Could not refine the ${label}.`);

  return { text, edit, loading, error, generate: generateDocument, refine };
}

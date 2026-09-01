/**
 * The behavioral evaluator answers with Markdown, not prose.
 *
 * `BehavioralPrompts::evaluation` asks the model for exactly three `###`
 * sections with bulleted bodies. The prep room used to drop that straight into
 * a `whitespace-pre-wrap` div, so the reader saw the literal `###` and `*`
 * characters. Rather than pull in a Markdown renderer for one known shape,
 * this parses that shape and hands the screen something it can lay out.
 *
 * The parser is deliberately forgiving: a model that drops the emoji, uses `-`
 * for bullets, or writes a plain paragraph still renders as readable content
 * instead of disappearing.
 */

export interface FeedbackSection {
  /** Leading emoji from the heading, kept apart so it can be rendered large. */
  icon: string | null;
  /** Heading text with the emoji stripped. Empty for unheaded content. */
  title: string;
  bullets: string[];
  /** Non-bullet lines under the heading, in order. */
  paragraphs: string[];
}

const HEADING = /^#{1,6}\s+(.*)$/;
const BULLET = /^\s*[*\-•]\s+(.*)$/;
const LEADING_EMOJI = /^([\p{Extended_Pictographic}️‍\u{1F3FB}-\u{1F3FF}]+)\s*/u;

function emptySection(heading: string): FeedbackSection {
  const match = LEADING_EMOJI.exec(heading);

  return {
    icon: match ? match[1] : null,
    title: (match ? heading.slice(match[0].length) : heading).trim(),
    bullets: [],
    paragraphs: [],
  };
}

/**
 * Split the evaluator's Markdown into renderable sections.
 *
 * Content that arrives before any heading — or a response with no headings at
 * all — comes back as a single leading section with an empty title, so no text
 * from the model is ever silently dropped.
 */
export function parseCoachFeedback(markdown: string): FeedbackSection[] {
  const sections: FeedbackSection[] = [];
  let current: FeedbackSection | null = null;

  for (const rawLine of (markdown ?? '').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      current = emptySection(heading[1].trim());
      sections.push(current);
      continue;
    }

    if (!current) {
      current = emptySection('');
      sections.push(current);
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      current.bullets.push(bullet[1].trim());
    } else {
      current.paragraphs.push(line.trim());
    }
  }

  return sections.filter(section => section.title || section.bullets.length || section.paragraphs.length);
}

export interface InlineSegment {
  text: string;
  bold: boolean;
}

/**
 * Split `**emphasis**` out of a line so the component can wrap it in <strong>
 * without ever handing model output to `dangerouslySetInnerHTML`.
 *
 * An unclosed `**` is left as literal text rather than swallowing the rest of
 * the line.
 */
export function inlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let cursor = 0;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), bold: false });
  }

  return segments.length ? segments : [{ text, bold: false }];
}

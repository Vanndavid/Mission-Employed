import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CodeSnippet } from './CodeSnippet';

/**
 * The numbered code viewer. The quiz uses it as it is; code review adds a
 * button on each line number, a highlight per line and something under a
 * line (comments, an editor), all optional.
 */

const code = 'const a = 1;\n\nconst b = 2;\n';

describe('CodeSnippet', () => {
  it('numbers every line, without a trailing empty one, and has no buttons by default', () => {
    render(<CodeSnippet code={code} />);

    const figure = screen.getByRole('figure', { name: 'Code' });
    expect(within(figure).getByText('const b = 2;')).toBeTruthy();
    expect(within(figure).getByText('3')).toBeTruthy();
    expect(within(figure).queryByText('4')).toBeNull();
    expect(within(figure).queryByRole('button')).toBeNull();
  });

  it('keeps a long line from widening the page: it scrolls inside the box, which takes no width from its content', () => {
    const long = `const x = ${'"a", '.repeat(80)};`;
    render(<CodeSnippet code={long} />);

    const figure = screen.getByRole('figure', { name: 'Code' });
    // Without size containment the line's width becomes the page's minimum on a phone.
    expect(figure).toHaveClass('overflow-x-auto', '[contain:inline-size]');
    // The quiz's rendering is otherwise as it was: lines stay whole and scroll.
    expect(figure.querySelector('code')).toHaveClass('min-w-max');
    expect(within(figure).getByText(long)).toHaveClass('whitespace-pre');
  });

  it('wraps instead when asked, as code review does', () => {
    render(<CodeSnippet code={code} wrap />);

    const figure = screen.getByRole('figure', { name: 'Code' });
    expect(figure.querySelector('code')).not.toHaveClass('min-w-max');
    expect(within(figure).getByText('const a = 1;')).toHaveClass('whitespace-pre-wrap');
  });

  it('turns line numbers into buttons when lines can be clicked', () => {
    const onLineClick = vi.fn();
    render(<CodeSnippet code={code} onLineClick={onLineClick} lineActionLabel={line => `Comment on line ${line}`} />);

    fireEvent.click(screen.getByRole('button', { name: 'Comment on line 3' }));

    expect(onLineClick).toHaveBeenCalledWith(3);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('highlights a line and draws content under it', () => {
    render(
      <CodeSnippet
        code={code}
        label="Snippet under review"
        lineClassName={line => (line === 1 ? 'bg-emerald-500/20' : undefined)}
        renderAfterLine={line => (line === 1 ? <span>Comment on the first line</span> : null)}
      />,
    );

    const figure = screen.getByRole('figure', { name: 'Snippet under review' });
    expect(within(figure).getByText('const a = 1;').closest('[data-line]')).toHaveClass('bg-emerald-500/20');
    expect(within(figure).getByText('const a = 1;').closest('[data-line]')).toHaveAttribute('data-line', '1');
    expect(within(figure).getByText('Comment on the first line')).toBeTruthy();
    expect(within(figure).getByText('const b = 2;').closest('[data-line]')?.className).not.toContain('emerald');
  });
});

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectAgentSection } from './ConnectAgentSection';

/**
 * How to connect Claude (or Claude Code) to the hosted MCP connector. It is
 * on Settings for every account, not only admins, so nothing here may assume
 * server access: the address is this site's /mcp and sign-in is the user's own.
 */

let premium = false;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isPremium: premium, isAdmin: false, user: null, logout: vi.fn() }),
}));

const connectorUrl = () => `${window.location.origin}/mcp`;

const renderSection = () =>
  render(
    <MemoryRouter>
      <ConnectAgentSection />
    </MemoryRouter>,
  );

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  premium = false;
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('ConnectAgentSection', () => {
  it('gives a plain user the connector address for this site', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: /connect an ai agent/i })).toBeTruthy();
    expect(screen.getByText(connectorUrl())).toBeTruthy();
    expect(screen.getByText(/add custom connector/i)).toBeTruthy();
  });

  it('gives the Claude Code command for the same address', () => {
    renderSection();

    expect(
      screen.getByText(`claude mcp add --transport http mission-employed ${connectorUrl()}`),
    ).toBeTruthy();
  });

  it('copies the address and confirms it', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /copy connector address/i }));

    expect(writeText).toHaveBeenCalledWith(connectorUrl());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /copy connector address/i })).toHaveTextContent('Copied'),
    );
  });

  it('copies the Claude Code command', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /copy claude code command/i }));

    expect(writeText).toHaveBeenCalledWith(
      `claude mcp add --transport http mission-employed ${connectorUrl()}`,
    );
  });

  it('tells a free account which tools need Premium', () => {
    renderSection();

    expect(screen.getByText(/you're on the free plan/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /view account plan/i })).toHaveAttribute('href', '/account');
  });

  it('says nothing about plans to a premium account', () => {
    premium = true;
    renderSection();

    expect(screen.queryByText(/you're on the free plan/i)).toBeNull();
  });
});

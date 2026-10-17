import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastProvider';

const EXAMPLES = [
  'Track this job: <paste the posting>',
  'Which of my applications are still waiting on a reply?',
  'Tailor my CV for my application at Acme and save it.',
  'Update my job tracker from my email for the last two weeks.',
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast('Could not copy. Select the text and copy it by hand.', 'error');
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      onClick={copy}
      className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-brand-600 text-white hover:bg-brand-700"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CopyField({ text, label }: { text: string; label: string }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200 break-words select-all">
        {text}
      </code>
      <CopyButton text={text} label={label} />
    </div>
  );
}

/**
 * How to reach the hosted MCP connector (`mcp/`) from Claude. It is for every
 * account: the agent signs in as the user through OAuth and can do only what
 * they can do here, so there is nothing to install and no token to paste.
 */
export function ConnectAgentSection() {
  const { isPremium } = useAuth();
  const connectorUrl = `${window.location.origin}/mcp`;
  const claudeCodeCommand = `claude mcp add --transport http mission-employed ${connectorUrl}`;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Connect an AI agent</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Use Mission-Employed from a conversation with Claude: track a job from a pasted posting,
          update an application or tailor a CV. Claude signs in as you, and can do only what you
          can do here.
        </p>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Connector address</h4>
        <CopyField text={connectorUrl} label="Copy connector address" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Claude on the web, desktop or Cowork</h4>
          <ol className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
            <li>
              In Claude, open <strong>Settings → Connectors</strong> and choose{' '}
              <strong>Add custom connector</strong>.
            </li>
            <li>Paste the connector address above and add it.</li>
            <li>
              Claude opens a <em>Connect to Mission-Employed</em> page. Sign in with the email and
              password you use here.
            </li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            On a Claude Team or Enterprise plan, an owner may need to add the connector for the
            organisation first.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Claude Code</h4>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Run this in a terminal:</p>
          <CopyField text={claudeCodeCommand} label="Copy Claude Code command" />
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Then type <code className="font-mono text-xs">/mcp</code> in Claude Code, choose{' '}
            <strong>mission-employed</strong> and sign in.
          </p>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Things to ask</h4>
        <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {EXAMPLES.map(example => (
            <li key={example} className="font-mono text-xs">“{example}”</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          The email update needs Claude's own Gmail connector turned on as well. Mission-Employed
          never sees your mailbox. To disconnect, remove the connector in Claude.
        </p>
      </div>

      {!isPremium && (
        <p className="text-sm rounded-lg p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200">
          You're on the Free plan. The tracker, your CV profile and practice history all work from
          an agent; the AI tools your plan does not include (by default job parsing, tailored CVs
          and cover letters, the ATS check, coding problems and mock interviews) need Premium. An
          agent's requests count against the same allowances as yours.{' '}
          <NavLink to="/account" className="font-bold underline">
            View account plan
          </NavLink>
        </p>
      )}
    </section>
  );
}

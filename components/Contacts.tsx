
import React, { useState, useMemo } from 'react';
import { Contact, JobApplication } from '../types';
import { computeFollowUpReminders } from '../utils/followUps';
import { generateFollowUpEmail } from '../services/apiClient';

interface ContactsProps {
  contacts: Contact[];
  applications: JobApplication[];
  onAddContact: (contact: Omit<Contact, 'id'>) => void;
  onUpdateContact: (id: string, partial: Partial<Contact>) => void;
  onDeleteContact: (id: string) => void;
}

export const Contacts = ({
  contacts,
  applications,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
}: ContactsProps) => {
  const reminders = useMemo(() => computeFollowUpReminders(applications), [applications]);
  const [draftEmail, setDraftEmail] = useState<Record<string, string>>({});
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

  const [newContact, setNewContact] = useState({
    name: '', company: '', email: '', lastContact: new Date().toISOString().slice(0, 10), applicationIds: [] as string[],
  });

  const handleAdd = () => {
    if (!newContact.name || !newContact.company) return;
    onAddContact({
      ...newContact,
      lastContact: newContact.lastContact || new Date().toISOString(),
    });
    setNewContact({ name: '', company: '', email: '', lastContact: new Date().toISOString().slice(0, 10), applicationIds: [] });
  };

  const draftFollowUp = async (appId: string) => {
    const reminder = reminders.find(r => r.applicationId === appId);
    const app = applications.find(a => a.id === appId);
    if (!reminder || !app) return;
    setLoadingEmail(appId);
    try {
      const contact = contacts.find(c => c.applicationIds.includes(appId));
      const email = await generateFollowUpEmail({
        company: app.company,
        role: app.role,
        contactName: contact?.name,
        daysSinceApplied: reminder.daysSinceApplied,
        notes: app.notes,
      });
      setDraftEmail(prev => ({ ...prev, [appId]: email }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEmail(null);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Contacts & Follow-ups</h2>
        <p className="text-slate-500 mt-2">Lightweight CRM. You send emails manually — AI drafts only.</p>
      </header>

      {reminders.length > 0 && (
        <section className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400 mb-4">
            Follow-up Reminders ({reminders.length})
          </h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-4 uppercase tracking-widest font-bold">
            Applied + 7 days with no status change
          </p>
          <div className="space-y-4">
            {reminders.map(r => (
              <div key={r.applicationId} className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-amber-200 dark:border-amber-500/20">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold">{r.company}</p>
                    <p className="text-sm text-slate-500">{r.role} · {r.daysSinceApplied} days since last update</p>
                  </div>
                  <button
                    onClick={() => draftFollowUp(r.applicationId)}
                    disabled={loadingEmail === r.applicationId}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold"
                  >
                    {loadingEmail === r.applicationId ? 'Drafting...' : 'AI Draft Email'}
                  </button>
                </div>
                {draftEmail[r.applicationId] && (
                  <pre className="mt-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                    {draftEmail[r.applicationId]}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold mb-4">Add Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <input placeholder="Name" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
          <input placeholder="Company" value={newContact.company} onChange={e => setNewContact({ ...newContact, company: e.target.value })} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
          <input placeholder="Email" value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm" />
          <select
            value={newContact.applicationIds[0] ?? ''}
            onChange={e => setNewContact({ ...newContact, applicationIds: e.target.value ? [e.target.value] : [] })}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
          >
            <option value="">Link to application (optional)</option>
            {applications.map(a => (
              <option key={a.id} value={a.id}>{a.company} — {a.role}</option>
            ))}
          </select>
        </div>
        <button onClick={handleAdd} className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm">
          Add Contact
        </button>
      </section>

      <section className="bg-white dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Company</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Last Contact</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {contacts.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">No contacts yet.</td></tr>
            ) : contacts.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-6 py-4 font-bold">{c.name}</td>
                <td className="px-6 py-4">{c.company}</td>
                <td className="px-6 py-4">
                  <input
                    value={c.email}
                    onChange={e => onUpdateContact(c.id, { email: e.target.value })}
                    className="bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 outline-none w-full"
                  />
                </td>
                <td className="px-6 py-4 text-slate-500">
                  {c.lastContact ? new Date(c.lastContact).toLocaleDateString() : '—'}
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => onDeleteContact(c.id)} className="text-slate-400 hover:text-rose-500 text-xs font-bold">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};


import React, { useState, useMemo } from 'react';
import { JobApplication, JobStatus, OfferDetails } from '../types';
import { generateNegotiationScript } from '../services/apiClient';

interface OfferToolsProps {
  applications: JobApplication[];
  onUpdateApplication: (id: string, partial: Partial<JobApplication>) => void;
}

const emptyOffer = (): OfferDetails => ({
  base: 0,
  equity: '',
  benefits: '',
  startDate: '',
});

export const OfferTools = ({ applications, onUpdateApplication }: OfferToolsProps) => {
  const offers = useMemo(
    () => applications.filter(a => a.status === JobStatus.OFFER || a.offer),
    [applications]
  );

  const [negotiationScript, setNegotiationScript] = useState<Record<string, string>>({});
  const [loadingScript, setLoadingScript] = useState<string | null>(null);
  const [marketContext, setMarketContext] = useState('AU software engineer, maintenance SWE niche');

  const updateOffer = (appId: string, field: keyof OfferDetails, value: string | number) => {
    const app = applications.find(a => a.id === appId);
    const offer = app?.offer ?? emptyOffer();
    onUpdateApplication(appId, {
      offer: { ...offer, [field]: value },
      status: JobStatus.OFFER,
    });
  };

  const handleNegotiate = async (app: JobApplication) => {
    if (!app.offer?.base) return;
    setLoadingScript(app.id);
    try {
      const script = await generateNegotiationScript({
        company: app.company,
        role: app.role,
        offer: app.offer,
        marketContext,
      });
      setNegotiationScript(prev => ({ ...prev, [app.id]: script }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingScript(null);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Offer Tools</h2>
        <p className="text-slate-500 mt-2">Compare offers side-by-side. Negotiate with evidence.</p>
      </header>

      {offers.length === 0 ? (
        <div className="text-center py-16 text-slate-400 italic">
          No offers yet. Set application status to Offer to capture comp details.
        </div>
      ) : (
        <>
          <section className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Base</th>
                  <th className="px-4 py-3">Equity</th>
                  <th className="px-4 py-3">Benefits</th>
                  <th className="px-4 py-3">Start</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {offers.map(app => {
                  const o = app.offer ?? emptyOffer();
                  return (
                    <tr key={app.id}>
                      <td className="px-4 py-3 font-bold">{app.company}</td>
                      <td className="px-4 py-3">{app.role}</td>
                      <td className="px-4 py-3">${o.base.toLocaleString()}</td>
                      <td className="px-4 py-3">{o.equity || '—'}</td>
                      <td className="px-4 py-3">{o.benefits || '—'}</td>
                      <td className="px-4 py-3">{o.startDate || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="space-y-6">
            {offers.map(app => {
              const o = app.offer ?? emptyOffer();
              return (
                <section key={app.id} className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 space-y-4">
                  <h3 className="font-black text-lg">{app.company} — {app.role}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Base Salary</label>
                      <input
                        type="number"
                        value={o.base || ''}
                        onChange={e => updateOffer(app.id, 'base', parseInt(e.target.value, 10) || 0)}
                        className="w-full mt-1 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Equity</label>
                      <input
                        value={o.equity}
                        onChange={e => updateOffer(app.id, 'equity', e.target.value)}
                        placeholder="e.g. 0.1% over 4yr"
                        className="w-full mt-1 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Benefits</label>
                      <input
                        value={o.benefits}
                        onChange={e => updateOffer(app.id, 'benefits', e.target.value)}
                        placeholder="Health, WFH, etc."
                        className="w-full mt-1 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Start Date</label>
                      <input
                        type="date"
                        value={o.startDate?.slice(0, 10) ?? ''}
                        onChange={e => updateOffer(app.id, 'startDate', e.target.value)}
                        className="w-full mt-1 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Market Context</label>
                      <input
                        value={marketContext}
                        onChange={e => setMarketContext(e.target.value)}
                        className="w-full mt-1 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => handleNegotiate(app)}
                      disabled={loadingScript === app.id || !o.base}
                      className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                    >
                      {loadingScript === app.id ? 'Generating...' : 'AI Negotiation Script'}
                    </button>
                  </div>

                  {negotiationScript[app.id] && (
                    <pre className="p-4 bg-slate-900 text-emerald-50 rounded-xl text-sm whitespace-pre-wrap">
                      {negotiationScript[app.id]}
                    </pre>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

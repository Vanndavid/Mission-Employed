import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthUser, AccountPlan } from '../types/auth';
import { listAdminUsers, setUserPlan } from '../services/authClient';
import { useToast } from './ToastProvider';

export function AdminUsersPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listAdminUsers();
      setUsers(res.users);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/account" replace />;

  const changePlan = async (userId: string, plan: AccountPlan) => {
    setBusyId(userId);
    try {
      const res = await setUserPlan(userId, plan);
      setUsers(prev => prev.map(u => (u.id === userId ? res.user : u)));
      toast(`Updated to ${plan}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Admin · Plans</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Unlock Premium for any account. Payment integration can replace this later.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading users…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-[10px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3 font-bold">Email</th>
                <th className="px-4 py-3 font-bold">Role</th>
                <th className="px-4 py-3 font-bold">Plan</th>
                <th className="px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-100 break-all">{user.email}</td>
                  <td className="px-4 py-3 text-slate-500">{user.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        user.plan === 'premium'
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-300'
                      }
                    >
                      {user.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.role === 'admin' ? (
                      <span className="text-xs text-slate-400">Always premium</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === user.id || user.plan === 'free'}
                          onClick={() => void changePlan(user.id, 'free')}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                        >
                          Free
                        </button>
                        <button
                          type="button"
                          disabled={busyId === user.id || user.plan === 'premium'}
                          onClick={() => void changePlan(user.id, 'premium')}
                          className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                        >
                          Premium
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

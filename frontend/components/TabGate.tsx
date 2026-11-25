import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NavTabKey } from '../types/auth';
import { homePath } from '../utils/navTabs';

/**
 * A hidden tab's screen. A user who reaches its address (an old bookmark)
 * lands on the first tab they can see; an admin still gets the screen.
 */
export function TabGate({ tab, children }: { tab: NavTabKey; children: React.ReactNode }) {
  const { isAdmin, hiddenTabs } = useAuth();

  if (!isAdmin && hiddenTabs.includes(tab)) {
    return <Navigate to={homePath(hiddenTabs, isAdmin)} replace />;
  }

  return <>{children}</>;
}

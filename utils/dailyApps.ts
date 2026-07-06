
import { JobApplication, JobStatus } from '../types';
import { getLocalDateString } from '../utils';

export function countAppsToday(applications: JobApplication[], date: string = getLocalDateString()): number {
  return applications.filter(app => {
    if (app.status === JobStatus.SAVED) return false;
    return getLocalDateString(new Date(app.dateApplied)) === date;
  }).length;
}

export function countAppsOnDate(applications: JobApplication[], date: string): number {
  return countAppsToday(applications, date);
}

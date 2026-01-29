
import { DailyLog } from './types';
import { DAILY_TASKS } from './constants';

export const isWeekday = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

export const getRecentWeekdays = (count: number) => {
  const dates: string[] = [];
  let d = new Date();
  while (dates.length < count) {
    if (isWeekday(d)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
};

export const calculateStreak = (logs: Record<string, DailyLog>) => {
  const today = new Date().toISOString().split('T')[0];
  let currentStreak = 0;
  const sortedWeekdays = getRecentWeekdays(100); 
  
  for (const date of sortedWeekdays) {
    const log = logs[date];
    
    // Check if ALL configured tasks are complete for this day
    const isComplete = log && DAILY_TASKS.every(task => log.completions[task.id]);
    
    if (isComplete) {
      currentStreak++;
    } else {
      // If today is not complete, we don't break the streak yet, but we don't count it.
      // If a past weekday is not complete, the streak breaks.
      if (date !== today) break;
    }
  }
  return currentStreak;
};

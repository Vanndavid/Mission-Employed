
import { TaskDefinition } from '../types';

export function resolveBehavioralTaskId(tasks: TaskDefinition[], completions: Record<string, boolean>): string | null {
  const behavioral = tasks.filter(t => t.id.startsWith('behavioral'));
  const incomplete = behavioral.find(t => !completions[t.id]);
  return incomplete?.id ?? behavioral[behavioral.length - 1]?.id ?? 'behavioral';
}

export function isSimulationTask(taskId: string): boolean {
  return taskId === 'simulation';
}

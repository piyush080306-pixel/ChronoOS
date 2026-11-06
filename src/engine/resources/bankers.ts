import type { ResourceProcessState, WaitingRequest } from '../types';

export interface SafetyResult {
  safe: boolean;
  sequence: string[];
}

export function needOf(process: ResourceProcessState): number[] {
  return process.max.map((maximum, index) => maximum - process.allocation[index]);
}

export function fitsWithin(request: number[], available: number[]): boolean {
  return request.every((amount, index) => amount <= available[index]);
}

export function checkSafety(available: number[], processes: ResourceProcessState[]): SafetyResult {
  const work = [...available];
  const finished = new Set<string>();
  const sequence: string[] = [];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const process of processes) {
      if (finished.has(process.pid)) continue;
      if (!fitsWithin(needOf(process), work)) continue;
      process.allocation.forEach((amount, index) => {
        work[index] += amount;
      });
      finished.add(process.pid);
      sequence.push(process.pid);
      progressed = true;
    }
  }

  return { safe: finished.size === processes.length, sequence };
}

export function detectDeadlock(
  available: number[],
  processes: ResourceProcessState[],
  waiting: WaitingRequest[],
): string[] {
  const work = [...available];
  const finished = new Set<string>(
    processes
      .filter((process) => process.allocation.every((amount) => amount === 0))
      .map((process) => process.pid),
  );
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const process of processes) {
      if (finished.has(process.pid)) continue;
      const request = waiting.find((entry) => entry.pid === process.pid);
      if (request && !fitsWithin(request.vector, work)) continue;
      process.allocation.forEach((amount, index) => {
        work[index] += amount;
      });
      finished.add(process.pid);
      progressed = true;
    }
  }

  return processes.filter((process) => !finished.has(process.pid)).map((process) => process.pid);
}

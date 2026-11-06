import type { Recorder } from '../recorder';
import { checkSafety, detectDeadlock, fitsWithin, needOf } from './bankers';
import type { ResourceProcessState, ScriptEntryState, SimulationConfig } from '../types';

export function describeVector(names: string[], vector: number[]): string {
  const parts = vector.map((amount, index) => (amount > 0 ? `${amount} x ${names[index]}` : null));
  const described = parts.filter((part): part is string => part !== null);
  return described.length > 0 ? described.join(', ') : 'nothing';
}

function isValidVector(vector: number[], length: number): boolean {
  return (
    vector.length === length &&
    vector.every((amount) => Number.isInteger(amount) && amount >= 0) &&
    vector.some((amount) => amount > 0)
  );
}

function sequenceKey(sequence: string[]): string {
  return sequence.join('>');
}

export function runResourceManager(rec: Recorder, config: SimulationConfig, startTime: number): void {
  const mode = config.resources.mode;
  const pending = rec.state.resources.script
    .filter((entry) => !entry.done)
    .sort((left, right) => left.time - right.time || left.index - right.index);

  const tryGrant = (pid: string, vector: number[], time: number, fromWaiting: boolean): boolean => {
    const { resources } = rec.state;
    const name = (): string => describeVector(resources.names, vector);
    if (!fitsWithin(vector, resources.available)) {
      if (!fromWaiting) {
        rec.emit({
          type: 'RESOURCE_REQUEST_BLOCKED',
          timestamp: time,
          processId: pid,
          resourceId: null,
          payload: { vector, reason: 'INSUFFICIENT_AVAILABLE' },
          description: `${pid} blocked waiting for ${name()}: not enough free instances`,
        });
      }
      return false;
    }

    if (mode === 'AVOIDANCE') {
      const available = resources.available.map((amount, index) => amount - vector[index]);
      const processes: ResourceProcessState[] = resources.processes.map((process) =>
        process.pid === pid
          ? { ...process, allocation: process.allocation.map((amount, index) => amount + vector[index]) }
          : process,
      );
      if (!checkSafety(available, processes).safe) {
        if (!fromWaiting) {
          rec.emit({
            type: 'RESOURCE_REQUEST_BLOCKED',
            timestamp: time,
            processId: pid,
            resourceId: null,
            payload: { vector, reason: 'UNSAFE_STATE' },
            description: `${pid} blocked: granting ${name()} would leave the system in an unsafe state`,
          });
        }
        return false;
      }
    }

    rec.emit({
      type: 'RESOURCE_ALLOCATED',
      timestamp: time,
      processId: pid,
      resourceId: null,
      payload: { vector, fromWaiting },
      description: `${pid} granted ${name()}${fromWaiting ? ' (from wait queue)' : ''}`,
    });
    return true;
  };

  const handleRequest = (entry: ScriptEntryState, time: number) => {
    const { resources } = rec.state;
    rec.emit({
      type: 'RESOURCE_REQUEST_ISSUED',
      timestamp: time,
      processId: entry.pid,
      resourceId: null,
      payload: { scriptIndex: entry.index, vector: entry.vector },
      description: `${entry.pid} requests ${describeVector(resources.names, entry.vector)}`,
    });
    const process = resources.processes.find((candidate) => candidate.pid === entry.pid);
    const reject = (reason: string) =>
      rec.emit({
        type: 'RESOURCE_REJECTED',
        timestamp: time,
        processId: entry.pid,
        resourceId: null,
        payload: { vector: entry.vector, reason },
        description: `Request by ${entry.pid} rejected: ${reason}`,
      });

    if (!process) return reject('unknown process');
    if (!isValidVector(entry.vector, resources.names.length)) return reject('invalid resource vector');
    if (resources.waiting.some((waiting) => waiting.pid === entry.pid)) return reject('process is already blocked');
    const remainingClaim = needOf(process);
    if (!fitsWithin(entry.vector, remainingClaim)) return reject('exceeds remaining declared maximum claim');
    tryGrant(entry.pid, entry.vector, time, false);
  };

  const handleRelease = (entry: ScriptEntryState, time: number) => {
    const { resources } = rec.state;
    rec.emit({
      type: 'RESOURCE_RELEASE_ISSUED',
      timestamp: time,
      processId: entry.pid,
      resourceId: null,
      payload: { scriptIndex: entry.index, vector: entry.vector },
      description: `${entry.pid} releases ${describeVector(resources.names, entry.vector)}`,
    });
    const process = resources.processes.find((candidate) => candidate.pid === entry.pid);
    if (!process || !isValidVector(entry.vector, resources.names.length) || !fitsWithin(entry.vector, process.allocation)) {
      rec.emit({
        type: 'RESOURCE_REJECTED',
        timestamp: time,
        processId: entry.pid,
        resourceId: null,
        payload: { vector: entry.vector, reason: 'release exceeds current allocation' },
        description: `Release by ${entry.pid} rejected: it does not hold that many instances`,
      });
      return;
    }
    rec.emit({
      type: 'RESOURCE_RELEASED',
      timestamp: time,
      processId: entry.pid,
      resourceId: null,
      payload: { vector: entry.vector },
      description: `${entry.pid} released ${describeVector(resources.names, entry.vector)}`,
    });
    for (const waiting of [...rec.state.resources.waiting]) {
      const current = rec.state.resources.waiting.find((candidate) => candidate.pid === waiting.pid);
      if (current) tryGrant(current.pid, current.vector, time, true);
    }
  };

  const refreshSafety = (time: number) => {
    const { resources } = rec.state;
    const result = checkSafety(resources.available, resources.processes);
    const changed =
      result.safe !== resources.safe || sequenceKey(result.sequence) !== sequenceKey(resources.safeSequence);
    if (!changed) return;
    rec.emit({
      type: 'RESOURCE_SAFETY_CHECKED',
      timestamp: time,
      processId: null,
      resourceId: null,
      payload: { safe: result.safe, sequence: result.sequence },
      description: result.safe
        ? `System is SAFE. Safe sequence: ${result.sequence.join(' -> ') || 'none'}`
        : 'System is UNSAFE: no complete safe sequence exists',
    });
  };

  const refreshDeadlock = (time: number) => {
    const { resources } = rec.state;
    if (resources.deadlock !== null || resources.waiting.length === 0) return;
    const pids = detectDeadlock(resources.available, resources.processes, resources.waiting);
    if (pids.length === 0) return;
    rec.emit({
      type: 'DEADLOCK_DETECTED',
      timestamp: time,
      processId: null,
      resourceId: null,
      payload: { pids },
      description: `DEADLOCK detected among ${pids.join(', ')}`,
    });
  };

  refreshSafety(startTime);
  for (const entry of pending) {
    const time = Math.max(entry.time, startTime);
    if (entry.type === 'REQUEST') handleRequest(entry, time);
    else handleRelease(entry, time);
    refreshSafety(time);
    refreshDeadlock(time);
  }
}

import type { Recorder } from '../recorder';
import { findHole, memoryStats } from '../memory/allocator';
import type { ChronoState, CpuAlgorithm, RtProcess, SimulationConfig } from '../types';

interface CpuContext {
  algorithm: CpuAlgorithm;
  quantum: number;
  lowerIsHigher: boolean;
  order: Map<string, number>;
  memoryAlgorithm: SimulationConfig['memory']['algorithm'];
}

const ALGORITHM_LABELS: Record<CpuAlgorithm, string> = {
  FCFS: 'First Come First Serve',
  SJF: 'Shortest Job First',
  SRTF: 'Shortest Remaining Time First',
  PRIORITY_PREEMPTIVE: 'Priority (preemptive)',
  PRIORITY_NONPREEMPTIVE: 'Priority (non-preemptive)',
  RR: 'Round Robin',
};

export function cpuAlgorithmLabel(algorithm: CpuAlgorithm): string {
  return ALGORITHM_LABELS[algorithm];
}

function priorityRank(priority: number, lowerIsHigher: boolean): number {
  return lowerIsHigher ? priority : -priority;
}

function primaryKey(ctx: CpuContext, process: RtProcess, remaining: number): number {
  switch (ctx.algorithm) {
    case 'SRTF':
      return remaining;
    case 'PRIORITY_PREEMPTIVE':
    case 'PRIORITY_NONPREEMPTIVE':
      return priorityRank(process.priority, ctx.lowerIsHigher);
    case 'SJF':
      return process.burst;
    default:
      return process.arrival;
  }
}

function compareKeys(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function fullKey(ctx: CpuContext, process: RtProcess): number[] {
  const order = ctx.order.get(process.pid) ?? 0;
  return [primaryKey(ctx, process, process.remaining), process.arrival, order];
}

function pickNext(state: ChronoState, ctx: CpuContext): string | null {
  const queue = state.cpu.readyQueue;
  if (queue.length === 0) return null;
  if (ctx.algorithm === 'RR') return queue[0];
  let best: string | null = null;
  let bestKey: number[] = [];
  for (const pid of queue) {
    const process = state.processes.find((candidate) => candidate.pid === pid);
    if (!process) continue;
    const key = ctx.algorithm === 'FCFS'
      ? [process.arrival, ctx.order.get(pid) ?? 0]
      : fullKey(ctx, process);
    if (best === null || compareKeys(key, bestKey) < 0) {
      best = pid;
      bestKey = key;
    }
  }
  return best;
}

function remainingAt(state: ChronoState, pid: string, time: number): number {
  const process = state.processes.find((candidate) => candidate.pid === pid);
  if (!process) throw new Error(`Unknown process ${pid}`);
  return process.remaining - (time - state.cpu.runStart);
}

function processOf(state: ChronoState, pid: string): RtProcess {
  const process = state.processes.find((candidate) => candidate.pid === pid);
  if (!process) throw new Error(`Unknown process ${pid}`);
  return process;
}

function admitArrivals(rec: Recorder, ctx: CpuContext, ordered: string[], time: number): void {
  for (const pid of ordered) {
    const process = processOf(rec.state, pid);
    if (!process.arrived && process.arrival <= time) {
      rec.emit({
        type: 'PROCESS_ARRIVED',
        timestamp: time,
        processId: pid,
        resourceId: null,
        payload: {},
        description: `${process.name} arrived and requests ${process.memory} MB`,
      });
    }
  }

  for (const pid of ordered) {
    const process = processOf(rec.state, pid);
    const admissible = process.arrived && (process.state === 'NEW' || process.state === 'WAITING');
    if (!admissible) continue;
    const { memory } = rec.state;
    const start = findHole(memory.blocks, process.memory, ctx.memoryAlgorithm, memory.lastAllocStart);
    if (start !== null) {
      rec.emit({
        type: 'MEMORY_ALLOCATED',
        timestamp: time,
        processId: pid,
        resourceId: null,
        payload: { start, size: process.memory, algorithm: ctx.memoryAlgorithm },
        description: `${process.name} allocated ${process.memory} MB at address ${start}`,
      });
      rec.emit({
        type: 'PROCESS_READY',
        timestamp: time,
        processId: pid,
        resourceId: null,
        payload: { reason: 'ADMITTED', remaining: process.remaining },
        description: `${process.name} admitted to the ready queue`,
      });
    } else if (process.state === 'NEW') {
      const stats = memoryStats(memory.blocks, memory.totalMb);
      rec.emit({
        type: 'PROCESS_WAITING',
        timestamp: time,
        processId: pid,
        resourceId: null,
        payload: { reason: 'MEMORY' },
        description: `${process.name} waits: no contiguous hole of ${process.memory} MB (largest free ${stats.largestFreeMb} MB)`,
      });
      rec.emit({
        type: 'MEMORY_ALLOCATION_FAILED',
        timestamp: time,
        processId: pid,
        resourceId: null,
        payload: {
          size: process.memory,
          totalFree: stats.freeMb,
          largestFree: stats.largestFreeMb,
        },
        description: `Allocation of ${process.memory} MB for ${process.name} failed (free ${stats.freeMb} MB, largest hole ${stats.largestFreeMb} MB)`,
      });
    }
  }
}

function terminateFinished(rec: Recorder, time: number): void {
  const { state } = rec;
  const pid = state.cpu.running;
  if (!pid) return;
  const process = processOf(state, pid);
  if (remainingAt(state, pid, time) > 0) return;
  if (process.memoryStart === null) throw new Error(`${pid} is running without memory`);
  const turnaround = time - process.arrival;
  const waiting = turnaround - process.burst;
  rec.emit({
    type: 'PROCESS_TERMINATED',
    timestamp: time,
    processId: pid,
    resourceId: null,
    payload: { turnaround, waiting },
    description: `${process.name} completed at t=${time} (turnaround ${turnaround}, waiting ${waiting})`,
  });
  rec.emit({
    type: 'MEMORY_RELEASED',
    timestamp: time,
    processId: pid,
    resourceId: null,
    payload: { start: process.memoryStart, size: process.memory },
    description: `${process.memory} MB released from ${process.name}`,
  });
}

function preemptIfNeeded(rec: Recorder, ctx: CpuContext, time: number): void {
  const { state } = rec;
  const pid = state.cpu.running;
  if (!pid || state.cpu.readyQueue.length === 0) return;
  const process = processOf(state, pid);
  const remaining = remainingAt(state, pid, time);

  if (ctx.algorithm === 'RR') {
    const elapsed = time - state.cpu.runStart;
    if (elapsed > 0 && elapsed % ctx.quantum === 0) {
      rec.emit({
        type: 'PROCESS_READY',
        timestamp: time,
        processId: pid,
        resourceId: null,
        payload: { reason: 'QUANTUM_EXPIRED', remaining },
        description: `${process.name} used its ${ctx.quantum} unit quantum and returns to the ready queue`,
      });
      return;
    }
  }

  if (ctx.algorithm !== 'SRTF' && ctx.algorithm !== 'PRIORITY_PREEMPTIVE') return;
  const best = pickNext(state, ctx);
  if (!best) return;
  const bestProcess = processOf(state, best);
  const bestPrimary = primaryKey(ctx, bestProcess, bestProcess.remaining);
  const runningPrimary = primaryKey(ctx, process, remaining);
  if (bestPrimary >= runningPrimary) return;
  rec.emit({
    type: 'PROCESS_READY',
    timestamp: time,
    processId: pid,
    resourceId: null,
    payload: { reason: 'PREEMPTED', remaining },
    description: `${process.name} preempted by ${bestProcess.name}`,
  });
}

function dispatch(rec: Recorder, ctx: CpuContext, time: number): void {
  const { state } = rec;
  if (state.cpu.running) return;
  const next = pickNext(state, ctx);
  if (next) {
    const process = processOf(state, next);
    const previous = state.cpu.lastRun;
    if (previous !== null && previous !== next) {
      rec.emit({
        type: 'CPU_CONTEXT_SWITCH',
        timestamp: time,
        processId: next,
        resourceId: null,
        payload: { from: previous, to: next },
        description: `Context switch ${previous} to ${next}`,
      });
    }
    rec.emit({
      type: 'PROCESS_RUNNING',
      timestamp: time,
      processId: next,
      resourceId: null,
      payload: { remaining: process.remaining },
      description: `${process.name} starts running with ${process.remaining} units remaining`,
    });
  } else if (!state.cpu.idle) {
    rec.emit({
      type: 'CPU_IDLE',
      timestamp: time,
      processId: null,
      resourceId: null,
      payload: {},
      description: 'CPU is idle: no process is ready',
    });
  }
}

function nextDecisionTime(state: ChronoState, ctx: CpuContext, time: number): number | null {
  const candidates: number[] = [];
  const pid = state.cpu.running;
  if (pid) {
    const process = processOf(state, pid);
    candidates.push(state.cpu.runStart + process.remaining);
    if (ctx.algorithm === 'RR') {
      const elapsed = time - state.cpu.runStart;
      candidates.push(state.cpu.runStart + (Math.floor(elapsed / ctx.quantum) + 1) * ctx.quantum);
    }
  }
  for (const process of state.processes) {
    if (!process.arrived) candidates.push(process.arrival);
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

export function runCpuScheduler(rec: Recorder, config: SimulationConfig, startTime: number): void {
  const ctx: CpuContext = {
    algorithm: config.cpu.algorithm,
    quantum: config.cpu.quantum,
    lowerIsHigher: config.cpu.priorityLowerIsHigher,
    order: new Map(config.processes.map((process, index) => [process.pid, index])),
    memoryAlgorithm: config.memory.algorithm,
  };
  const ordered = config.processes.map((process) => process.pid);

  let time = startTime;
  for (;;) {
    terminateFinished(rec, time);
    admitArrivals(rec, ctx, ordered, time);
    if (rec.state.processes.every((process) => process.state === 'TERMINATED')) break;
    preemptIfNeeded(rec, ctx, time);
    dispatch(rec, ctx, time);
    const next = nextDecisionTime(rec.state, ctx, time);
    if (next === null) break;
    time = next;
  }
}

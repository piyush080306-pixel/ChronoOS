import { memoryStats, type MemoryStats } from './memory/allocator';
import type { ChronoState } from './types';

export interface ProcessMetric {
  pid: string;
  name: string;
  arrival: number;
  burst: number;
  completion: number | null;
  turnaround: number | null;
  waiting: number | null;
  responseTime: number | null;
}

export interface Analytics {
  endTime: number;
  processes: ProcessMetric[];
  completedCount: number;
  totalCount: number;
  avgWaiting: number | null;
  avgTurnaround: number | null;
  avgResponse: number | null;
  throughput: number | null;
  cpuBusy: number;
  cpuUtilizationPct: number;
  contextSwitches: number;
  memory: MemoryStats;
  disk: {
    totalMovement: number;
    completed: number;
    total: number;
    avgLatency: number | null;
    maxLatency: number | null;
  };
  resources: {
    safe: boolean | null;
    deadlockPids: string[];
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeAnalytics(state: ChronoState, endTime: number): Analytics {
  const processes: ProcessMetric[] = state.processes.map((process) => {
    const turnaround = process.completion === null ? null : process.completion - process.arrival;
    return {
      pid: process.pid,
      name: process.name,
      arrival: process.arrival,
      burst: process.burst,
      completion: process.completion,
      turnaround,
      waiting: turnaround === null ? null : turnaround - process.burst,
      responseTime: process.firstRun === null ? null : process.firstRun - process.arrival,
    };
  });

  const completed = processes.filter((process) => process.completion !== null);
  const runSegments = [...state.cpu.segments, ...(state.cpu.openSegment ? [state.cpu.openSegment] : [])];
  const cpuBusy = runSegments
    .filter((segment) => segment.kind === 'RUN')
    .reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  const latencies = state.disk.completed.map((request) => request.completion - request.arrival);
  const completedAverage = average(completed.map((process) => process.turnaround ?? 0));

  return {
    endTime,
    processes,
    completedCount: completed.length,
    totalCount: processes.length,
    avgWaiting: average(completed.map((process) => process.waiting ?? 0)),
    avgTurnaround: completedAverage,
    avgResponse: average(processes.flatMap((process) => (process.responseTime === null ? [] : [process.responseTime]))),
    throughput: endTime > 0 ? completed.length / endTime : null,
    cpuBusy,
    cpuUtilizationPct: endTime > 0 ? (cpuBusy / endTime) * 100 : 0,
    contextSwitches: state.cpu.contextSwitches,
    memory: memoryStats(state.memory.blocks, state.memory.totalMb),
    disk: {
      totalMovement: state.disk.totalMovement,
      completed: state.disk.completed.length,
      total: state.disk.requests.length,
      avgLatency: average(latencies),
      maxLatency: latencies.length === 0 ? null : Math.max(...latencies),
    },
    resources: {
      safe: state.resources.safe,
      deadlockPids: state.resources.deadlock?.pids ?? [],
    },
  };
}

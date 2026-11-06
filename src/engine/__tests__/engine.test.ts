import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '@/engine/presets';
import { forkSimulation, reconstructAt, runSimulation } from '@/engine/simulator';
import { checkSafety, detectDeadlock } from '@/engine/resources/bankers';
import type { ResourceProcessState, SimulationConfig } from '@/engine/types';

function config(overrides: Partial<SimulationConfig>): SimulationConfig {
  return { ...createDefaultConfig(), ...overrides };
}

const ample = 100000;

function completions(state: ReturnType<typeof runSimulation>['finalState']): Record<string, number | null> {
  return Object.fromEntries(state.processes.map((process) => [process.pid, process.completion]));
}

describe('CPU scheduling', () => {
  it('FCFS matches the textbook completion times', () => {
    const log = runSimulation(
      config({
        memory: { totalMb: ample, algorithm: 'FIRST_FIT' },
        cpu: { algorithm: 'FCFS', quantum: 2, priorityLowerIsHigher: true },
        processes: [
          { pid: 'P1', name: 'P1', arrival: 0, burst: 5, priority: 1, memory: 1 },
          { pid: 'P2', name: 'P2', arrival: 1, burst: 3, priority: 1, memory: 1 },
          { pid: 'P3', name: 'P3', arrival: 2, burst: 8, priority: 1, memory: 1 },
          { pid: 'P4', name: 'P4', arrival: 3, burst: 6, priority: 1, memory: 1 },
        ],
      }),
    );
    expect(completions(log.finalState)).toEqual({ P1: 5, P2: 8, P3: 16, P4: 22 });
  });

  it('round robin rotates on the quantum', () => {
    const log = runSimulation(
      config({
        memory: { totalMb: ample, algorithm: 'FIRST_FIT' },
        cpu: { algorithm: 'RR', quantum: 2, priorityLowerIsHigher: true },
        processes: [
          { pid: 'P1', name: 'P1', arrival: 0, burst: 4, priority: 1, memory: 1 },
          { pid: 'P2', name: 'P2', arrival: 0, burst: 4, priority: 1, memory: 1 },
        ],
      }),
    );
    expect(completions(log.finalState)).toEqual({ P1: 6, P2: 8 });
  });

  it('SRTF preempts for shorter remaining work', () => {
    const log = runSimulation(
      config({
        memory: { totalMb: ample, algorithm: 'FIRST_FIT' },
        cpu: { algorithm: 'SRTF', quantum: 2, priorityLowerIsHigher: true },
        processes: [
          { pid: 'P1', name: 'P1', arrival: 0, burst: 8, priority: 1, memory: 1 },
          { pid: 'P2', name: 'P2', arrival: 1, burst: 4, priority: 1, memory: 1 },
          { pid: 'P3', name: 'P3', arrival: 2, burst: 9, priority: 1, memory: 1 },
          { pid: 'P4', name: 'P4', arrival: 3, burst: 5, priority: 1, memory: 1 },
        ],
      }),
    );
    expect(completions(log.finalState)).toEqual({ P1: 17, P2: 5, P3: 26, P4: 10 });
  });

  it('a process waits for memory and is admitted after a release', () => {
    const log = runSimulation(
      config({
        memory: { totalMb: 100, algorithm: 'FIRST_FIT' },
        cpu: { algorithm: 'FCFS', quantum: 2, priorityLowerIsHigher: true },
        processes: [
          { pid: 'P1', name: 'P1', arrival: 0, burst: 5, priority: 1, memory: 60 },
          { pid: 'P2', name: 'P2', arrival: 1, burst: 3, priority: 1, memory: 60 },
        ],
      }),
    );
    expect(completions(log.finalState)).toEqual({ P1: 5, P2: 8 });
    expect(log.events.some((event) => event.type === 'MEMORY_ALLOCATION_FAILED')).toBe(true);
  });
});

describe('disk scheduling', () => {
  const queue = [98, 183, 37, 122, 14, 124, 65, 67];
  const diskConfig = (algorithm: SimulationConfig['disk']['algorithm']) =>
    config({
      disk: {
        cylinders: 200,
        head: 53,
        direction: 'UP',
        algorithm,
        requests: queue.map((cylinder, index) => ({ id: `R${index}`, cylinder, arrival: 0 })),
      },
    });

  it.each([
    ['FCFS', 640],
    ['SSTF', 236],
    ['LOOK', 299],
    ['SCAN', 331],
    ['CSCAN', 382],
  ] as const)('%s total head movement is %i cylinders', (algorithm, expected) => {
    const log = runSimulation(diskConfig(algorithm));
    expect(log.finalState.disk.totalMovement).toBe(expected);
    expect(log.finalState.disk.completed).toHaveLength(queue.length);
  });
});

describe("Banker's algorithm", () => {
  const processes: ResourceProcessState[] = [
    { pid: 'P0', max: [7, 5, 3], allocation: [0, 1, 0] },
    { pid: 'P1', max: [3, 2, 2], allocation: [2, 0, 0] },
    { pid: 'P2', max: [9, 0, 2], allocation: [3, 0, 2] },
    { pid: 'P3', max: [2, 2, 2], allocation: [2, 1, 1] },
    { pid: 'P4', max: [4, 3, 3], allocation: [0, 0, 2] },
  ];

  it('finds the classic safe sequence', () => {
    const result = checkSafety([3, 3, 2], processes);
    expect(result.safe).toBe(true);
    expect(result.sequence).toEqual(['P1', 'P3', 'P4', 'P0', 'P2']);
  });

  it('reports an unsafe state when no sequence completes', () => {
    const result = checkSafety([0, 0, 0], processes);
    expect(result.safe).toBe(false);
  });

  it('detects a circular wait as deadlock', () => {
    const held: ResourceProcessState[] = [
      { pid: 'A', max: [1, 1], allocation: [1, 0] },
      { pid: 'B', max: [1, 1], allocation: [0, 1] },
    ];
    const pids = detectDeadlock([0, 0], held, [
      { pid: 'A', vector: [0, 1], since: 1 },
      { pid: 'B', vector: [1, 0], since: 1 },
    ]);
    expect(pids.sort()).toEqual(['A', 'B']);
  });
});

describe('resource manager', () => {
  const deadlockScript: SimulationConfig['resources'] = {
    mode: 'DETECTION',
    types: [
      { name: 'R1', total: 1 },
      { name: 'R2', total: 1 },
    ],
    processes: [
      { pid: 'P1', max: [1, 1] },
      { pid: 'P2', max: [1, 1] },
    ],
    script: [
      { time: 0, pid: 'P1', type: 'REQUEST', vector: [1, 0] },
      { time: 0, pid: 'P2', type: 'REQUEST', vector: [0, 1] },
      { time: 1, pid: 'P1', type: 'REQUEST', vector: [0, 1] },
      { time: 1, pid: 'P2', type: 'REQUEST', vector: [1, 0] },
    ],
  };

  it('detects deadlock when the system does not avoid it', () => {
    const log = runSimulation(config({ resources: deadlockScript }));
    expect(log.finalState.resources.deadlock?.pids.sort()).toEqual(['P1', 'P2']);
  });

  it('avoidance blocks the unsafe request and prevents deadlock', () => {
    const log = runSimulation(config({ resources: { ...deadlockScript, mode: 'AVOIDANCE' } }));
    expect(log.finalState.resources.deadlock).toBeNull();
    expect(log.events.some((event) => event.type === 'RESOURCE_REQUEST_BLOCKED')).toBe(true);
  });
});

describe('time machine', () => {
  const log = runSimulation(createDefaultConfig());

  it('reconstructing the end state matches the live final state', () => {
    expect(reconstructAt(log, log.endTime)).toEqual(log.finalState);
  });

  it('a snapshot-based rebuild at an earlier time matches a full replay', () => {
    const fromSnapshot = reconstructAt(log, 20);
    const fromScratch = reconstructAt({ ...log, snapshots: [] }, 20);
    expect(fromSnapshot).toEqual(fromScratch);
  });

  it('forking with no overrides reproduces the original history', () => {
    const restored = forkSimulation(log, {}, 20);
    expect(restored.events.map(({ seq: _seq, ...event }) => event)).toEqual(
      log.events.map(({ seq: _seq, ...event }) => event),
    );
  });

  it('forking with a different CPU algorithm changes only what happens after the fork', () => {
    const branch = forkSimulation(log, { cpuAlgorithm: 'FCFS' }, 20);
    const beforeFork = log.events.filter((event) => event.timestamp <= 20);
    const branchBefore = branch.events.filter((event) => event.timestamp <= 20);
    expect(branchBefore.length).toBe(beforeFork.length);
    expect(branch.finalState.processes).not.toEqual(log.finalState.processes);
  });
});

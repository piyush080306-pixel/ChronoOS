import { applyEvent, createInitialState } from './reducer';
import type { ChronoEvent, ChronoEventDraft, EventType } from './events';
import { Recorder } from './recorder';
import { runCpuScheduler } from './cpu/scheduler';
import { runDiskScheduler } from './disk/scheduler';
import { runResourceManager } from './resources/manager';
import type { BranchOverrides, ChronoState, SimulationConfig } from './types';

export interface Snapshot {
  timestamp: number;
  seq: number;
  state: ChronoState;
}

export interface SimulationLog {
  config: SimulationConfig;
  events: ChronoEvent[];
  snapshots: Snapshot[];
  finalState: ChronoState;
  endTime: number;
}

function canonicalize(drafts: ChronoEventDraft[]): ChronoEvent[] {
  return drafts
    .map((draft, index) => ({ draft, index }))
    .sort((left, right) => left.draft.timestamp - right.draft.timestamp || left.index - right.index)
    .map(({ draft }, seq) => ({ ...draft, seq }));
}

function stripSeq(event: ChronoEvent): ChronoEventDraft {
  const { seq: _seq, ...draft } = event;
  return draft as ChronoEventDraft;
}

function foldEvents(state: ChronoState, events: ChronoEvent[], from: number, to: number): ChronoState {
  let current = state;
  for (const event of events) {
    if (event.timestamp <= from || event.timestamp > to) continue;
    current = applyEvent(current, event);
  }
  return current;
}

export function buildSnapshots(config: SimulationConfig, events: ChronoEvent[], endTime: number): Snapshot[] {
  const interval = config.snapshotInterval;
  if (interval <= 0) return [];
  const snapshots: Snapshot[] = [];
  let state = createInitialState(config);
  let cursor = 0;
  let lastSeq = -1;
  for (let time = interval; time <= endTime; time += interval) {
    while (cursor < events.length && events[cursor].timestamp <= time) {
      state = applyEvent(state, events[cursor]);
      lastSeq = events[cursor].seq;
      cursor += 1;
    }
    if (lastSeq < 0 || snapshots[snapshots.length - 1]?.seq === lastSeq) continue;
    snapshots.push({ timestamp: time, seq: lastSeq, state });
  }
  return snapshots;
}

function finishLog(config: SimulationConfig, drafts: ChronoEventDraft[]): SimulationLog {
  const events = canonicalize(drafts);
  const endTime = events.reduce((max, event) => Math.max(max, event.timestamp), 0);
  return {
    config,
    events,
    snapshots: buildSnapshots(config, events, endTime),
    finalState: foldEvents(createInitialState(config), events, -Infinity, Infinity),
    endTime,
  };
}

function simulate(rec: Recorder, config: SimulationConfig, startTime: number): void {
  runCpuScheduler(rec, config, startTime);
  runDiskScheduler(rec, config, startTime);
  runResourceManager(rec, config, startTime);
}

export function runSimulation(config: SimulationConfig): SimulationLog {
  const rec = new Recorder(createInitialState(config));
  for (const process of config.processes) {
    rec.emit({
      type: 'PROCESS_CREATED',
      timestamp: 0,
      processId: process.pid,
      resourceId: null,
      payload: { arrival: process.arrival, burst: process.burst, priority: process.priority, memory: process.memory },
      description: `${process.name} created (burst ${process.burst}, priority ${process.priority}, memory ${process.memory} MB)`,
    });
  }
  simulate(rec, config, 0);
  return finishLog(config, rec.drafts);
}

export function logFromStored(config: SimulationConfig, events: ChronoEvent[], snapshots: Snapshot[]): SimulationLog {
  const endTime = events.reduce((max, event) => Math.max(max, event.timestamp), 0);
  return {
    config,
    events,
    snapshots,
    finalState: foldEvents(createInitialState(config), events, -Infinity, Infinity),
    endTime,
  };
}

export function reconstructAt(log: SimulationLog, time: number): ChronoState {
  const eligible = log.snapshots.filter((candidate) => candidate.timestamp <= time);
  const snapshot = eligible[eligible.length - 1];
  const base = snapshot ? snapshot.state : createInitialState(log.config);
  return foldEvents(base, log.events, snapshot ? snapshot.timestamp : -Infinity, time);
}

export function applyOverrides(config: SimulationConfig, overrides: BranchOverrides): SimulationConfig {
  return {
    ...config,
    cpu: {
      ...config.cpu,
      algorithm: overrides.cpuAlgorithm ?? config.cpu.algorithm,
      quantum: overrides.cpuQuantum ?? config.cpu.quantum,
    },
    memory: { ...config.memory, algorithm: overrides.memoryAlgorithm ?? config.memory.algorithm },
    disk: { ...config.disk, algorithm: overrides.diskAlgorithm ?? config.disk.algorithm },
  };
}

type Domain = 'CPU' | 'DISK' | 'RESOURCE';

function domainOf(type: EventType): Domain {
  if (type.startsWith('DISK_')) return 'DISK';
  if (type.startsWith('RESOURCE_') || type === 'DEADLOCK_DETECTED') return 'RESOURCE';
  return 'CPU';
}

// Only domains whose algorithm changed are re-simulated; every other domain keeps its recorded history,
// because disk head moves are atomic and cannot be resumed mid-move from a reconstructed state.
export function forkSimulation(parent: SimulationLog, overrides: BranchOverrides, time: number): SimulationLog {
  const config = applyOverrides(parent.config, overrides);
  const cpuChanged =
    overrides.cpuAlgorithm !== undefined || overrides.cpuQuantum !== undefined || overrides.memoryAlgorithm !== undefined;
  const diskChanged = overrides.diskAlgorithm !== undefined;

  const kept = parent.events
    .filter((event) => {
      if (event.timestamp <= time) return true;
      const domain = domainOf(event.type);
      if (domain === 'CPU') return !cpuChanged;
      if (domain === 'DISK') return !diskChanged;
      return true;
    })
    .map(stripSeq);

  const rec = new Recorder(reconstructAt(parent, time));
  if (cpuChanged) runCpuScheduler(rec, config, time);
  if (diskChanged) runDiskScheduler(rec, config, time);
  return finishLog(config, [...kept, ...rec.drafts]);
}

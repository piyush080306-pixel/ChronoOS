import type { ChronoEventDraft } from './events';
import { allocateAt, initialMemoryBlocks, releaseOwner } from './memory/allocator';
import type { ChronoState, CpuState, RtProcess, Segment, SimulationConfig } from './types';

export function createInitialState(config: SimulationConfig): ChronoState {
  return {
    processes: config.processes.map((process) => ({
      pid: process.pid,
      name: process.name,
      arrival: process.arrival,
      burst: process.burst,
      priority: process.priority,
      memory: process.memory,
      state: 'NEW',
      arrived: false,
      remaining: process.burst,
      firstRun: null,
      completion: null,
      memoryStart: null,
    })),
    cpu: {
      running: null,
      runStart: 0,
      idle: false,
      readyQueue: [],
      lastRun: null,
      contextSwitches: 0,
      segments: [],
      openSegment: null,
    },
    memory: {
      totalMb: config.memory.totalMb,
      blocks: initialMemoryBlocks(config.memory.totalMb),
      failures: 0,
      lastAllocStart: 0,
    },
    disk: {
      cylinders: config.disk.cylinders,
      head: config.disk.head,
      direction: config.disk.direction,
      requests: config.disk.requests.map((request) => ({
        id: request.id,
        cylinder: request.cylinder,
        arrival: request.arrival,
        created: false,
        served: false,
      })),
      completed: [],
      totalMovement: 0,
    },
    resources: {
      names: config.resources.types.map((type) => type.name),
      total: config.resources.types.map((type) => type.total),
      available: config.resources.types.map((type) => type.total),
      processes: config.resources.processes.map((process) => ({
        pid: process.pid,
        max: [...process.max],
        allocation: process.max.map(() => 0),
      })),
      script: config.resources.script.map((entry, index) => ({
        index,
        time: entry.time,
        pid: entry.pid,
        type: entry.type,
        vector: [...entry.vector],
        done: false,
      })),
      waiting: [],
      safe: null,
      safeSequence: [],
      deadlock: null,
    },
  };
}

function patchProcess(state: ChronoState, pid: string, patch: Partial<RtProcess>): ChronoState {
  return {
    ...state,
    processes: state.processes.map((process) => (process.pid === pid ? { ...process, ...patch } : process)),
  };
}

function closeSegment(cpu: CpuState, timestamp: number): CpuState {
  if (!cpu.openSegment) return cpu;
  const closed: Segment | null =
    timestamp > cpu.openSegment.start ? { ...cpu.openSegment, end: timestamp } : null;
  return {
    ...cpu,
    segments: closed ? [...cpu.segments, closed] : cpu.segments,
    openSegment: null,
  };
}

function addVectors(left: number[], right: number[], sign: 1 | -1): number[] {
  return left.map((value, index) => value + sign * right[index]);
}

export function applyEvent(state: ChronoState, event: ChronoEventDraft): ChronoState {
  const pid = event.processId ?? '';
  const timestamp = event.timestamp;

  switch (event.type) {
    case 'PROCESS_CREATED':
      return state;

    case 'PROCESS_ARRIVED':
      return patchProcess(state, pid, { arrived: true });

    case 'PROCESS_READY': {
      const wasRunning = state.cpu.running === pid;
      const cpu: CpuState = wasRunning
        ? { ...closeSegment(state.cpu, timestamp), running: null }
        : state.cpu;
      const readyQueue = cpu.readyQueue.includes(pid) ? cpu.readyQueue : [...cpu.readyQueue, pid];
      const next = { ...state, cpu: { ...cpu, readyQueue } };
      return patchProcess(next, pid, { state: 'READY', remaining: event.payload.remaining });
    }

    case 'PROCESS_RUNNING': {
      const cpu = closeSegment(state.cpu, timestamp);
      const next: ChronoState = {
        ...state,
        cpu: {
          ...cpu,
          running: pid,
          runStart: timestamp,
          idle: false,
          lastRun: pid,
          readyQueue: cpu.readyQueue.filter((queued) => queued !== pid),
          openSegment: { kind: 'RUN', pid, start: timestamp, end: timestamp },
        },
      };
      const current = state.processes.find((process) => process.pid === pid);
      return patchProcess(next, pid, {
        state: 'RUNNING',
        remaining: event.payload.remaining,
        firstRun: current?.firstRun ?? timestamp,
      });
    }

    case 'PROCESS_WAITING':
      return patchProcess(state, pid, { state: 'WAITING' });

    case 'PROCESS_TERMINATED': {
      const cpu: CpuState =
        state.cpu.running === pid
          ? { ...closeSegment(state.cpu, timestamp), running: null }
          : state.cpu;
      const next = {
        ...state,
        cpu: { ...cpu, readyQueue: cpu.readyQueue.filter((queued) => queued !== pid) },
      };
      return patchProcess(next, pid, { state: 'TERMINATED', remaining: 0, completion: timestamp });
    }

    case 'CPU_CONTEXT_SWITCH':
      return { ...state, cpu: { ...state.cpu, contextSwitches: state.cpu.contextSwitches + 1 } };

    case 'CPU_IDLE': {
      const cpu = closeSegment(state.cpu, timestamp);
      return {
        ...state,
        cpu: {
          ...cpu,
          running: null,
          idle: true,
          openSegment: { kind: 'IDLE', pid: null, start: timestamp, end: timestamp },
        },
      };
    }

    case 'MEMORY_ALLOCATED': {
      const blocks = allocateAt(state.memory.blocks, pid, event.payload.start, event.payload.size);
      const next = {
        ...state,
        memory: { ...state.memory, blocks, lastAllocStart: event.payload.start },
      };
      return patchProcess(next, pid, { memoryStart: event.payload.start });
    }

    case 'MEMORY_RELEASED': {
      const blocks = releaseOwner(state.memory.blocks, pid);
      const next = { ...state, memory: { ...state.memory, blocks } };
      return patchProcess(next, pid, { memoryStart: null });
    }

    case 'MEMORY_ALLOCATION_FAILED':
      return { ...state, memory: { ...state.memory, failures: state.memory.failures + 1 } };

    case 'DISK_REQUEST_CREATED':
      return {
        ...state,
        disk: {
          ...state.disk,
          requests: state.disk.requests.map((request) =>
            request.id === event.resourceId ? { ...request, created: true } : request,
          ),
        },
      };

    case 'DISK_HEAD_MOVED':
      return {
        ...state,
        disk: {
          ...state.disk,
          head: event.payload.to,
          direction: event.payload.direction,
          totalMovement: state.disk.totalMovement + event.payload.distance,
        },
      };

    case 'DISK_REQUEST_COMPLETED': {
      const served = state.disk.requests.find((request) => request.id === event.resourceId);
      return {
        ...state,
        disk: {
          ...state.disk,
          requests: state.disk.requests.map((request) =>
            request.id === event.resourceId ? { ...request, served: true } : request,
          ),
          completed: served
            ? [
                ...state.disk.completed,
                {
                  id: served.id,
                  cylinder: served.cylinder,
                  arrival: served.arrival,
                  completion: timestamp,
                },
              ]
            : state.disk.completed,
        },
      };
    }

    case 'RESOURCE_REQUEST_ISSUED':
    case 'RESOURCE_RELEASE_ISSUED':
      return {
        ...state,
        resources: {
          ...state.resources,
          script: state.resources.script.map((entry) =>
            entry.index === event.payload.scriptIndex ? { ...entry, done: true } : entry,
          ),
        },
      };

    case 'RESOURCE_ALLOCATED': {
      const resources = state.resources;
      return {
        ...state,
        resources: {
          ...resources,
          available: addVectors(resources.available, event.payload.vector, -1),
          processes: resources.processes.map((process) =>
            process.pid === pid
              ? { ...process, allocation: addVectors(process.allocation, event.payload.vector, 1) }
              : process,
          ),
          waiting: event.payload.fromWaiting
            ? resources.waiting.filter((request) => request.pid !== pid)
            : resources.waiting,
        },
      };
    }

    case 'RESOURCE_RELEASED': {
      const resources = state.resources;
      return {
        ...state,
        resources: {
          ...resources,
          available: addVectors(resources.available, event.payload.vector, 1),
          processes: resources.processes.map((process) =>
            process.pid === pid
              ? { ...process, allocation: addVectors(process.allocation, event.payload.vector, -1) }
              : process,
          ),
        },
      };
    }

    case 'RESOURCE_REQUEST_BLOCKED':
      return {
        ...state,
        resources: {
          ...state.resources,
          waiting: [...state.resources.waiting, { pid, vector: event.payload.vector, since: timestamp }],
        },
      };

    case 'RESOURCE_REJECTED':
      return state;

    case 'RESOURCE_SAFETY_CHECKED':
      return {
        ...state,
        resources: { ...state.resources, safe: event.payload.safe, safeSequence: event.payload.sequence },
      };

    case 'DEADLOCK_DETECTED':
      return {
        ...state,
        resources: { ...state.resources, deadlock: { pids: event.payload.pids, time: timestamp } },
      };
  }
}

export type ProcessState = 'NEW' | 'READY' | 'RUNNING' | 'WAITING' | 'TERMINATED';
export type CpuAlgorithm = 'FCFS' | 'SJF' | 'SRTF' | 'PRIORITY_PREEMPTIVE' | 'PRIORITY_NONPREEMPTIVE' | 'RR';
export type MemoryAlgorithm = 'FIRST_FIT' | 'BEST_FIT' | 'WORST_FIT' | 'NEXT_FIT';
export type DiskAlgorithm = 'FCFS' | 'SSTF' | 'SCAN' | 'CSCAN' | 'LOOK' | 'CLOOK';
export type HeadDirection = 'UP' | 'DOWN';
export type ResourceMode = 'AVOIDANCE' | 'DETECTION';

export interface ProcessSpec {
  pid: string;
  name: string;
  arrival: number;
  burst: number;
  priority: number;
  memory: number;
}

export interface DiskRequestSpec {
  id: string;
  cylinder: number;
  arrival: number;
}

export interface ResourceProcessSpec {
  pid: string;
  max: number[];
}

export interface ResourceScriptSpec {
  time: number;
  pid: string;
  type: 'REQUEST' | 'RELEASE';
  vector: number[];
}

export interface ResourceTypeSpec {
  name: string;
  total: number;
}

export interface ResourceSpec {
  mode: ResourceMode;
  types: ResourceTypeSpec[];
  processes: ResourceProcessSpec[];
  script: ResourceScriptSpec[];
}

export interface SimulationConfig {
  seed: number;
  snapshotInterval: number;
  processes: ProcessSpec[];
  cpu: { algorithm: CpuAlgorithm; quantum: number; priorityLowerIsHigher: boolean };
  memory: { totalMb: number; algorithm: MemoryAlgorithm };
  disk: { cylinders: number; head: number; direction: HeadDirection; algorithm: DiskAlgorithm; requests: DiskRequestSpec[] };
  resources: ResourceSpec;
}

export interface BranchOverrides {
  cpuAlgorithm?: CpuAlgorithm;
  cpuQuantum?: number;
  memoryAlgorithm?: MemoryAlgorithm;
  diskAlgorithm?: DiskAlgorithm;
}

export interface RtProcess {
  pid: string;
  name: string;
  arrival: number;
  burst: number;
  priority: number;
  memory: number;
  state: ProcessState;
  arrived: boolean;
  remaining: number;
  firstRun: number | null;
  completion: number | null;
  memoryStart: number | null;
}

export interface CpuState {
  running: string | null;
  runStart: number;
  idle: boolean;
  readyQueue: string[];
  lastRun: string | null;
  contextSwitches: number;
  segments: Segment[];
  openSegment: Segment | null;
}

export interface Segment {
  kind: 'RUN' | 'IDLE';
  pid: string | null;
  start: number;
  end: number;
}

export interface MemoryBlock {
  start: number;
  size: number;
  pid: string | null;
}

export interface MemoryState {
  totalMb: number;
  blocks: MemoryBlock[];
  failures: number;
  lastAllocStart: number;
}

export interface DiskRequestState {
  id: string;
  cylinder: number;
  arrival: number;
  created: boolean;
  served: boolean;
}

export interface DiskCompletion {
  id: string;
  cylinder: number;
  arrival: number;
  completion: number;
}

export interface DiskState {
  cylinders: number;
  head: number;
  direction: HeadDirection;
  requests: DiskRequestState[];
  completed: DiskCompletion[];
  totalMovement: number;
}

export interface ResourceProcessState {
  pid: string;
  max: number[];
  allocation: number[];
}

export interface ScriptEntryState {
  index: number;
  time: number;
  pid: string;
  type: 'REQUEST' | 'RELEASE';
  vector: number[];
  done: boolean;
}

export interface WaitingRequest {
  pid: string;
  vector: number[];
  since: number;
}

export interface ResourceState {
  names: string[];
  total: number[];
  available: number[];
  processes: ResourceProcessState[];
  script: ScriptEntryState[];
  waiting: WaitingRequest[];
  safe: boolean | null;
  safeSequence: string[];
  deadlock: { pids: string[]; time: number } | null;
}

export interface ChronoState {
  processes: RtProcess[];
  cpu: CpuState;
  memory: MemoryState;
  disk: DiskState;
  resources: ResourceState;
}

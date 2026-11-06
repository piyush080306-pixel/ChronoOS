import type { ChronoEvent } from '@/engine/events';
import type { Snapshot, SimulationLog } from '@/engine/simulator';
import type { ChronoState, SimulationConfig } from '@/engine/types';
import type { StoredLogPayload } from '@/lib/engineApi';

export interface SimulationRow {
  id: string;
  name: string;
  config: SimulationConfig;
  created_at: string;
}

export interface BranchRow {
  id: string;
  simulation_id: string;
  name: string;
  parent_branch_id: string | null;
  base_timestamp: number | null;
  base_seq: number | null;
  config: SimulationConfig;
  created_at: string;
}

interface StoredEventRow {
  simulation_id: string;
  branch_id: string;
  seq: number;
  timestamp: number;
  event_type: string;
  process_id: string | null;
  resource_id: string | null;
  payload: unknown;
  description: string;
}

interface StoredSnapshotRow {
  simulation_id: string;
  branch_id: string;
  seq: number;
  timestamp: number;
  state: ChronoState;
}

interface LocalDatabase {
  version: 1;
  simulations: SimulationRow[];
  branches: BranchRow[];
  events: StoredEventRow[];
  snapshots: StoredSnapshotRow[];
}

const STORAGE_KEY = 'chronoos:database:v1';

function emptyDatabase(): LocalDatabase {
  return { version: 1, simulations: [], branches: [], events: [], snapshots: [] };
}

let memoryDatabase: LocalDatabase | null = null;

function readDatabase(): LocalDatabase {
  if (memoryDatabase) return memoryDatabase;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDatabase();
    const parsed = JSON.parse(raw) as Partial<LocalDatabase> | null;
    if (!parsed || parsed.version !== 1) return emptyDatabase();
    return {
      version: 1,
      simulations: Array.isArray(parsed.simulations) ? parsed.simulations : [],
      branches: Array.isArray(parsed.branches) ? parsed.branches : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch {
    return emptyDatabase();
  }
}

function writeDatabase(database: LocalDatabase): void {
  memoryDatabase = database;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  } catch {
    // Storage can be full or disabled; the in-memory copy keeps the session usable.
    memoryDatabase = database;
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function appendLog(database: LocalDatabase, simulationId: string, branchId: string, log: SimulationLog): void {
  for (const event of log.events) {
    database.events.push({
      simulation_id: simulationId,
      branch_id: branchId,
      seq: event.seq,
      timestamp: event.timestamp,
      event_type: event.type,
      process_id: event.processId,
      resource_id: event.resourceId,
      payload: event.payload,
      description: event.description,
    });
  }
  for (const snapshot of log.snapshots) {
    database.snapshots.push({
      simulation_id: simulationId,
      branch_id: branchId,
      seq: snapshot.seq,
      timestamp: snapshot.timestamp,
      state: snapshot.state,
    });
  }
}

export function listLocalSimulations(): SimulationRow[] {
  return [...readDatabase().simulations].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export function loadLocalSimulation(id: string): { simulation: SimulationRow; branches: BranchRow[] } | null {
  const database = readDatabase();
  const simulation = database.simulations.find((row) => row.id === id);
  if (!simulation) return null;
  const branches = database.branches
    .filter((row) => row.simulation_id === id)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  return { simulation, branches };
}

export function createLocalSimulation(name: string, config: SimulationConfig, log: SimulationLog): string {
  const database = readDatabase();
  const createdAt = new Date().toISOString();
  const simulationId = newId();
  const branchId = newId();

  database.simulations.push({ id: simulationId, name, config, created_at: createdAt });
  database.branches.push({
    id: branchId,
    simulation_id: simulationId,
    name: 'Main timeline',
    parent_branch_id: null,
    base_timestamp: null,
    base_seq: null,
    config: log.config,
    created_at: createdAt,
  });
  appendLog(database, simulationId, branchId, log);
  writeDatabase(database);
  return simulationId;
}

export function createLocalBranch(
  simulation: SimulationRow,
  parent: BranchRow,
  name: string,
  log: SimulationLog,
  time: number,
): string {
  const database = readDatabase();
  const eligible = log.events.filter((event) => event.timestamp <= time);
  const lastBase = eligible[eligible.length - 1];
  const branchId = newId();

  database.branches.push({
    id: branchId,
    simulation_id: simulation.id,
    name,
    parent_branch_id: parent.id,
    base_timestamp: time,
    base_seq: lastBase ? lastBase.seq : null,
    config: log.config,
    created_at: new Date().toISOString(),
  });
  appendLog(database, simulation.id, branchId, log);
  writeDatabase(database);
  return branchId;
}

export function loadLocalBranchLog(branch: BranchRow): StoredLogPayload {
  const database = readDatabase();
  const events: ChronoEvent[] = database.events
    .filter((row) => row.branch_id === branch.id)
    .sort((left, right) => left.seq - right.seq)
    .map(
      (row) =>
        ({
          seq: row.seq,
          timestamp: row.timestamp,
          type: row.event_type,
          processId: row.process_id,
          resourceId: row.resource_id,
          payload: row.payload,
          description: row.description,
        }) as ChronoEvent,
    );
  const snapshots: Snapshot[] = database.snapshots
    .filter((row) => row.branch_id === branch.id)
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((row) => ({ seq: row.seq, timestamp: row.timestamp, state: row.state }));
  return { config: branch.config, events, snapshots };
}

export function deleteLocalSimulation(id: string): void {
  const database = readDatabase();
  database.simulations = database.simulations.filter((row) => row.id !== id);
  database.branches = database.branches.filter((row) => row.simulation_id !== id);
  database.events = database.events.filter((row) => row.simulation_id !== id);
  database.snapshots = database.snapshots.filter((row) => row.simulation_id !== id);
  writeDatabase(database);
}

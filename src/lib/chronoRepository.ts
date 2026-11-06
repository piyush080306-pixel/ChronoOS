import { supabase } from '@/lib/supabase';
import type { SimulationLog } from '@/engine/simulator';
import type { ChronoEvent } from '@/engine/events';
import type { Snapshot } from '@/engine/simulator';
import type { ChronoState, SimulationConfig } from '@/engine/types';
import { hydrateLog, type EngineLogBundle } from '@/lib/engineApi';
import {
  createLocalBranch,
  createLocalSimulation,
  deleteLocalSimulation,
  listLocalSimulations,
  loadLocalBranchLog,
  loadLocalSimulation,
  type BranchRow,
  type SimulationRow,
} from '@/lib/localStore';

export type { BranchRow, SimulationRow } from '@/lib/localStore';

const EVENT_PAGE_SIZE = 1000;
const INSERT_CHUNK = 500;
const PROBE_TIMEOUT_MS = 4000;

type Backend = 'remote' | 'local';

let backendPromise: Promise<Backend> | null = null;

/**
 * Prefers Supabase when it is configured and answering, otherwise keeps everything in the
 * browser so the app always works (no account, no network, no migration step).
 */
function resolveBackend(): Promise<Backend> {
  if (!backendPromise) backendPromise = detectBackend();
  return backendPromise;
}

async function detectBackend(): Promise<Backend> {
  const client = supabase;
  if (!client) return 'local';
  try {
    const probe = client.from('chrono_simulations').select('id').limit(1);
    const result = await Promise.race([
      probe,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
      }),
    ]);
    if (!result || result.error) return 'local';
    return 'remote';
  } catch {
    return 'local';
  }
}

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function insertInChunks<T>(table: string, rows: T[], chunkSize: number): Promise<void> {
  for (let start = 0; start < rows.length; start += chunkSize) {
    const { error } = await supabase!.from(table).insert(rows.slice(start, start + chunkSize));
    assertNoError(error, `Saving ${table}`);
  }
}

export async function listSimulations(): Promise<SimulationRow[]> {
  if ((await resolveBackend()) === 'local') return listLocalSimulations();
  const { data, error } = await supabase!
    .from('chrono_simulations')
    .select('id, name, config, created_at')
    .order('created_at', { ascending: false });
  assertNoError(error, 'Loading simulations');
  return (data ?? []) as SimulationRow[];
}

export async function loadSimulation(id: string): Promise<{ simulation: SimulationRow; branches: BranchRow[] } | null> {
  if ((await resolveBackend()) === 'local') return loadLocalSimulation(id);
  const { data, error } = await supabase!
    .from('chrono_simulations')
    .select('id, name, config, created_at')
    .eq('id', id)
    .maybeSingle();
  assertNoError(error, 'Loading simulation');
  if (!data) return null;
  const { data: branches, error: branchError } = await supabase!
    .from('chrono_branches')
    .select('id, simulation_id, name, parent_branch_id, base_timestamp, base_seq, config, created_at')
    .eq('simulation_id', id)
    .order('created_at', { ascending: true });
  assertNoError(branchError, 'Loading branches');
  return { simulation: data as SimulationRow, branches: (branches ?? []) as BranchRow[] };
}

async function saveLog(simulationId: string, branchId: string, log: SimulationLog): Promise<void> {
  await insertInChunks(
    'chrono_events',
    log.events.map((event) => ({
      simulation_id: simulationId,
      branch_id: branchId,
      seq: event.seq,
      timestamp: event.timestamp,
      event_type: event.type,
      process_id: event.processId,
      resource_id: event.resourceId,
      payload: event.payload,
      description: event.description,
    })),
    INSERT_CHUNK,
  );
  await insertInChunks(
    'chrono_snapshots',
    log.snapshots.map((snapshot) => ({
      simulation_id: simulationId,
      branch_id: branchId,
      seq: snapshot.seq,
      timestamp: snapshot.timestamp,
      state: snapshot.state,
    })),
    20,
  );
}

export async function createSimulation(name: string, config: SimulationConfig, log: SimulationLog): Promise<string> {
  if ((await resolveBackend()) === 'local') return createLocalSimulation(name, config, log);
  const { data: simulation, error } = await supabase!
    .from('chrono_simulations')
    .insert({ name, config, seed: config.seed })
    .select('id')
    .single();
  assertNoError(error, 'Creating simulation');
  if (!simulation) throw new Error('Creating simulation: no row returned');
  const simulationId = simulation.id as string;

  const { data: branch, error: branchError } = await supabase!
    .from('chrono_branches')
    .insert({ simulation_id: simulationId, name: 'Main timeline', config: log.config })
    .select('id')
    .single();
  assertNoError(branchError, 'Creating main branch');
  if (!branch) throw new Error('Creating main branch: no row returned');

  await saveLog(simulationId, branch.id as string, log);
  return simulationId;
}

export async function createBranch(
  simulation: SimulationRow,
  parent: BranchRow,
  name: string,
  log: SimulationLog,
  time: number,
): Promise<string> {
  if ((await resolveBackend()) === 'local') return createLocalBranch(simulation, parent, name, log, time);
  const eligible = log.events.filter((event) => event.timestamp <= time);
  const lastBase = eligible[eligible.length - 1];
  const { data: branch, error } = await supabase!
    .from('chrono_branches')
    .insert({
      simulation_id: simulation.id,
      name,
      parent_branch_id: parent.id,
      base_timestamp: time,
      base_seq: lastBase ? lastBase.seq : null,
      config: log.config,
    })
    .select('id')
    .single();
  assertNoError(error, 'Creating branch');
  if (!branch) throw new Error('Creating branch: no row returned');
  await saveLog(simulation.id, branch.id as string, log);
  return branch.id as string;
}

export async function loadBranchLog(simulation: SimulationRow, branch: BranchRow): Promise<EngineLogBundle> {
  if ((await resolveBackend()) === 'local') {
    return hydrateLog(loadLocalBranchLog(branch));
  }

  const events: ChronoEvent[] = [];
  for (let from = 0; ; from += EVENT_PAGE_SIZE) {
    const { data, error } = await supabase!
      .from('chrono_events')
      .select('seq, timestamp, event_type, process_id, resource_id, payload, description')
      .eq('branch_id', branch.id)
      .order('seq', { ascending: true })
      .range(from, from + EVENT_PAGE_SIZE - 1);
    assertNoError(error, 'Loading events');
    const rows = data ?? [];
    for (const row of rows) {
      events.push({
        seq: row.seq,
        timestamp: row.timestamp,
        type: row.event_type,
        processId: row.process_id,
        resourceId: row.resource_id,
        payload: row.payload,
        description: row.description,
      } as ChronoEvent);
    }
    if (rows.length < EVENT_PAGE_SIZE) break;
  }

  const { data: snapshotRows, error: snapshotError } = await supabase!
    .from('chrono_snapshots')
    .select('seq, timestamp, state')
    .eq('branch_id', branch.id)
    .order('timestamp', { ascending: true });
  assertNoError(snapshotError, 'Loading snapshots');
  const snapshots: Snapshot[] = (snapshotRows ?? []).map((row) => ({
    seq: row.seq,
    timestamp: row.timestamp,
    state: row.state as ChronoState,
  }));

  return hydrateLog({ config: branch.config ?? simulation.config, events, snapshots });
}

export async function deleteSimulation(id: string): Promise<void> {
  if ((await resolveBackend()) === 'local') {
    deleteLocalSimulation(id);
    return;
  }
  for (const table of ['chrono_events', 'chrono_snapshots', 'chrono_branches']) {
    const { error } = await supabase!.from(table).delete().eq('simulation_id', id);
    assertNoError(error, `Deleting ${table}`);
  }
  const { error } = await supabase!.from('chrono_simulations').delete().eq('id', id);
  assertNoError(error, 'Deleting simulation');
}

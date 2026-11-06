import { beforeEach, describe, expect, it } from 'vitest';
import {
  createBranch,
  createSimulation,
  deleteSimulation,
  listSimulations,
  loadBranchLog,
  loadSimulation,
} from '@/lib/chronoRepository';
import { fetchDefaultConfig, forkLog, reconstructState, runSimulationRemote, toStoredPayload } from '@/lib/engineApi';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

describe('local simulation flow', () => {
  beforeEach(() => {
    const storage = new MemoryStorage();
    (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
  });

  it('runs, saves, reloads, forks and deletes a simulation without any server', async () => {
    const config = await fetchDefaultConfig();
    const { log, analysis } = await runSimulationRemote(config);
    expect(log.events.length).toBeGreaterThan(0);
    expect(analysis.analytics.totalCount).toBe(config.processes.length);

    const id = await createSimulation('Local run', config, log);
    expect((await listSimulations()).map((row) => row.id)).toContain(id);

    const loaded = await loadSimulation(id);
    expect(loaded?.branches).toHaveLength(1);
    const branch = loaded!.branches[0];

    const bundle = await loadBranchLog(loaded!.simulation, branch);
    expect(bundle.log.events.length).toBe(log.events.length);
    expect(bundle.analysis.findings.length).toBeGreaterThanOrEqual(0);

    const state = await reconstructState(toStoredPayload(bundle.log), Math.floor(log.endTime / 2));
    expect(state.processes.length).toBe(config.processes.length);

    const forked = await forkLog(toStoredPayload(bundle.log), { cpuAlgorithm: 'SJF' }, 3);
    const branchId = await createBranch(loaded!.simulation, branch, 'What-if', forked.log, 3);
    const reloaded = await loadSimulation(id);
    expect(reloaded?.branches).toHaveLength(2);
    expect(reloaded?.branches.map((row) => row.id)).toContain(branchId);

    const forkedBundle = await loadBranchLog(reloaded!.simulation, reloaded!.branches[1]);
    expect(forkedBundle.log.events.length).toBeGreaterThan(0);

    await deleteSimulation(id);
    expect(await listSimulations()).toHaveLength(0);
    expect(await loadSimulation(id)).toBeNull();
  });
});

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, GitBranch, GitFork, History, Scale, Sparkles, Zap } from 'lucide-react';
import { Badge, Card, EmptyState, ErrorBanner, Metric, cn, fmt } from '@/components/ui';
import { useSimulation } from '@/context/SimulationContext';
import type { Analytics } from '@/engine/analytics';
import type { BranchOverrides } from '@/engine/types';
import { createBranch, loadBranchLog } from '@/lib/chronoRepository';
import { forkLog, toStoredPayload, type EngineLogBundle } from '@/lib/engineApi';

const CPU_CHOICES = ['FCFS', 'SJF', 'SRTF', 'PRIORITY_PREEMPTIVE', 'PRIORITY_NONPREEMPTIVE', 'RR'] as const;
const DISK_CHOICES = ['FCFS', 'SSTF', 'SCAN', 'CSCAN', 'LOOK', 'CLOOK'] as const;
const MEMORY_CHOICES = ['FIRST_FIT', 'BEST_FIT', 'WORST_FIT', 'NEXT_FIT'] as const;

const labelize = (value: string) => value.replace(/_/g, ' ').toLowerCase();

export default function BranchesPage() {
  const { simulation, branches, activeBranch, log, analysis, setActiveBranchId, refresh, time, setTime, endTime } = useSimulation();
  const [name, setName] = useState('What-if');
  const [cpu, setCpu] = useState('');
  const [quantum, setQuantum] = useState('');
  const [memory, setMemory] = useState('');
  const [disk, setDisk] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compareId, setCompareId] = useState<string>('');

  const compareBranch = branches.find((branch) => branch.id === compareId) ?? null;
  const [compareBundle, setCompareBundle] = useState<EngineLogBundle | null>(null);

  useEffect(() => {
    setCompareBundle(null);
    if (!compareBranch) return;
    let cancelled = false;
    loadBranchLog(simulation, compareBranch)
      .then((result) => {
        if (!cancelled) setCompareBundle(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load that timeline');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareId, simulation]);

  const rows = useMemo(
    () => buildComparison(analysis.analytics, compareBundle?.analysis.analytics ?? null),
    [analysis, compareBundle],
  );

  const overrides = useMemo<BranchOverrides>(() => {
    return {
      ...(cpu ? { cpuAlgorithm: cpu as BranchOverrides['cpuAlgorithm'] } : {}),
      ...(quantum ? { cpuQuantum: Number(quantum) } : {}),
      ...(memory ? { memoryAlgorithm: memory as BranchOverrides['memoryAlgorithm'] } : {}),
      ...(disk ? { diskAlgorithm: disk as BranchOverrides['diskAlgorithm'] } : {}),
    };
  }, [cpu, quantum, memory, disk]);

  const changedRules = Object.keys(overrides).length;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Name the new timeline.');
    if (!Number.isInteger(time) || time < 0 || time > endTime) return setError(`Choose a time between 0 and ${endTime}.`);
    if (overrides.cpuQuantum !== undefined && (overrides.cpuQuantum < 1 || !Number.isFinite(overrides.cpuQuantum))) {
      return setError('Quantum must be at least 1.');
    }
    setBusy(true);
    try {
      const forked = await forkLog(toStoredPayload(log), overrides, time);
      const id = await createBranch(simulation, activeBranch, name.trim(), forked.log, time);
      await refresh();
      setActiveBranchId(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the timeline');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setError(null);
    setBusy(true);
    try {
      const forked = await forkLog(toStoredPayload(log), {}, time);
      const id = await createBranch(simulation, activeBranch, `Restored from t=${time}`, forked.log, time);
      await refresh();
      setActiveBranchId(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore the timeline');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <GitFork className="h-3 w-3" /> Alternate realities
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">Timeline branches</h1>
          <p className="mt-1 text-sm text-slate-500">
            Rewind to a moment, change a rule, and see how the future would have unfolded. The original timeline is never
            overwritten.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="cyan" dot>
            fork point t={time}
          </Badge>
          <Badge tone="slate">{branches.length} timelines</Badge>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Active timeline" value={activeBranch.name} hint={activeBranch.base_timestamp === null ? 'original history' : `forked at t=${activeBranch.base_timestamp}`} mono={false} tone="cyan" icon={<GitBranch className="h-4 w-4" />} />
        <Metric label="Fork point" value={`${time}`} hint={`of ${endTime} ticks · follows the scrubber`} tone="emerald" />
        <Metric label="Rule changes" value={`${changedRules}`} hint={changedRules ? 'policies overridden' : 'pure snapshot fork'} tone={changedRules ? 'amber' : 'slate'} />
        <Metric label="Total branches" value={`${branches.length}`} hint="including the original" tone="indigo" icon={<Sparkles className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card
          title="Create a what-if timeline"
          subtitle="The fork inherits every event up to the chosen tick, then re-simulates with your overrides"
          action={<Zap className="h-4 w-4 text-cyan-400/60" />}
        >
          <form onSubmit={create} className="space-y-4">
            <div className="rounded-xl border border-white/[0.07] bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="field-label mb-0">Fork at tick</span>
                <span className="font-mono text-sm text-cyan-300">
                  {String(time).padStart(3, '0')}
                  <span className="text-xs text-slate-500"> / {endTime}</span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(endTime, 1)}
                value={Math.min(time, endTime)}
                onChange={(event) => setTime(Number(event.target.value))}
                aria-label="Fork time"
                className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-cyan-200 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_14px_3px_rgba(0,240,255,0.4)]"
              />
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-600">
                <span>0</span>
                <span>drag, or use the workspace scrubber</span>
                <span>{endTime}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Timeline name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  className="field"
                  placeholder="What-if"
                />
              </label>
              <label className="block">
                <span className="field-label">CPU algorithm</span>
                <select value={cpu} onChange={(event) => setCpu(event.target.value)} className="field">
                  <option value="" className="bg-[#0b0d14]">Keep current · {simulation.config.cpu.algorithm}</option>
                  {CPU_CHOICES.map((choice) => (
                    <option key={choice} value={choice} className="bg-[#0b0d14]">
                      {choice}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Time quantum</span>
                <input
                  type="number"
                  min={1}
                  value={quantum}
                  placeholder={`Keep current · ${simulation.config.cpu.quantum}`}
                  onChange={(event) => setQuantum(event.target.value)}
                  className="field font-mono"
                />
              </label>
              <label className="block">
                <span className="field-label">Memory strategy</span>
                <select value={memory} onChange={(event) => setMemory(event.target.value)} className="field">
                  <option value="" className="bg-[#0b0d14]">Keep current · {labelize(simulation.config.memory.algorithm)}</option>
                  {MEMORY_CHOICES.map((choice) => (
                    <option key={choice} value={choice} className="bg-[#0b0d14]">
                      {labelize(choice)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="field-label">Disk algorithm</span>
                <select value={disk} onChange={(event) => setDisk(event.target.value)} className="field">
                  <option value="" className="bg-[#0b0d14]">Keep current · {simulation.config.disk.algorithm}</option>
                  {DISK_CHOICES.map((choice) => (
                    <option key={choice} value={choice} className="bg-[#0b0d14]">
                      {choice}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="btn-primary">
                <GitBranch className="h-4 w-4" /> {busy ? 'Forking…' : 'Create branch'}
              </button>
              <button type="button" disabled={busy} onClick={() => void restore()} className="btn-ghost">
                <History className="h-4 w-4" /> Restore this moment
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600">
              A pure restore forks the identical rule set — handy for re-running a tick boundary without changing policies.
            </p>
          </form>
        </Card>

        <Card title="Timelines" subtitle="Switch which reality the workspace is inspecting" bodyClassName="p-0">
          {branches.length === 0 ? (
            <EmptyState message="No timelines yet." icon={<GitBranch className="h-5 w-5" />} />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {branches.map((branch) => {
                const isActive = branch.id === activeBranch.id;
                const isOriginal = branch.base_timestamp === null;
                return (
                  <li
                    key={branch.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 transition-colors',
                      isActive ? 'bg-cyan-400/[0.04]' : 'hover:bg-white/[0.03]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                        isActive
                          ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
                          : 'border-white/[0.08] bg-white/[0.02] text-slate-500',
                      )}
                    >
                      {isOriginal ? <History className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-100">
                        {branch.name}
                        {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_10px_2px_rgba(0,240,255,0.45)]" />}
                      </p>
                      <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-slate-600">
                        {isOriginal ? 'original history' : `forked at t=${branch.base_timestamp}`} · {branch.id.slice(0, 8)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveBranchId(branch.id)}
                      disabled={isActive}
                      className={cn(
                        'shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                        isActive
                          ? 'cursor-default border-cyan-400/25 bg-cyan-400/10 text-cyan-200'
                          : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-cyan-400/30 hover:text-cyan-200',
                      )}
                    >
                      {isActive ? 'Active' : 'Open'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Compare timelines"
        subtitle="End-of-run metrics side by side against the active branch"
        action={<Scale className="h-4 w-4 text-indigo-400/70" />}
        bodyClassName="p-0"
      >
        <div className="border-b border-white/[0.06] px-5 py-4">
          <label className="block max-w-sm">
            <span className="field-label">Other timeline</span>
            <select value={compareId} onChange={(event) => setCompareId(event.target.value)} className="field">
              <option value="" className="bg-[#0b0d14]">Choose a timeline</option>
              {branches
                .filter((branch) => branch.id !== activeBranch.id)
                .map((branch) => (
                  <option key={branch.id} value={branch.id} className="bg-[#0b0d14]">
                    {branch.name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {compareBranch && !compareBundle && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-8 w-full" />
            ))}
          </div>
        )}

        {!compareBranch && (
          <EmptyState
            icon={<Scale className="h-5 w-5" />}
            message="Pick a second timeline to compare"
            hint="Metrics are computed from each branch's own recorded event stream, so the comparison is exact."
          />
        )}

        {compareBundle && compareBranch && (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>
                    <span className="flex items-center gap-1.5 normal-case tracking-normal text-cyan-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> {activeBranch.name}
                    </span>
                  </th>
                  <th>
                    <span className="flex items-center gap-1.5 normal-case tracking-normal text-slate-300">
                      <ArrowRight className="h-3 w-3 text-slate-600" /> {compareBranch.name}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs text-slate-300">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td className="font-sans text-sm text-slate-400">{row.label}</td>
                    <td className="text-cyan-200">{row.left}</td>
                    <td>{row.right}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function buildComparison(a: Analytics, b: Analytics | null) {
  return [
    { label: 'Avg waiting', left: fmt(a.avgWaiting), right: fmt(b?.avgWaiting ?? null) },
    { label: 'Avg turnaround', left: fmt(a.avgTurnaround), right: fmt(b?.avgTurnaround ?? null) },
    { label: 'Context switches', left: `${a.contextSwitches}`, right: `${b?.contextSwitches ?? '-'}` },
    { label: 'Disk movement', left: `${a.disk.totalMovement}`, right: `${b?.disk.totalMovement ?? '-'}` },
    { label: 'Finished at', left: `t=${a.endTime}`, right: b ? `t=${b.endTime}` : '-' },
  ];
}

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Cpu,
  Gauge,
  HardDrive,
  Layers,
  MemoryStick,
  Play,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Badge, Card, ErrorBanner, LoadingLine, cn } from '@/components/ui';
import type { CpuAlgorithm, DiskAlgorithm, MemoryAlgorithm, ProcessSpec, SimulationConfig } from '@/engine/types';
import { createSimulation } from '@/lib/chronoRepository';
import { fetchDefaultConfig, runSimulationRemote } from '@/lib/engineApi';

const CPU_OPTIONS: { value: CpuAlgorithm; label: string }[] = [
  { value: 'FCFS', label: 'First Come First Serve' },
  { value: 'SJF', label: 'Shortest Job First' },
  { value: 'SRTF', label: 'Shortest Remaining Time First' },
  { value: 'PRIORITY_PREEMPTIVE', label: 'Priority (preemptive)' },
  { value: 'PRIORITY_NONPREEMPTIVE', label: 'Priority (non-preemptive)' },
  { value: 'RR', label: 'Round Robin' },
];
const MEMORY_OPTIONS: { value: MemoryAlgorithm; label: string }[] = [
  { value: 'FIRST_FIT', label: 'First fit' },
  { value: 'BEST_FIT', label: 'Best fit' },
  { value: 'WORST_FIT', label: 'Worst fit' },
  { value: 'NEXT_FIT', label: 'Next fit' },
];
const DISK_OPTIONS: { value: DiskAlgorithm; label: string }[] = [
  { value: 'FCFS', label: 'FCFS' },
  { value: 'SSTF', label: 'SSTF' },
  { value: 'SCAN', label: 'SCAN' },
  { value: 'CSCAN', label: 'C-SCAN' },
  { value: 'LOOK', label: 'LOOK' },
  { value: 'CLOOK', label: 'C-LOOK' },
];

const PRESET_ALGORITHMS: Record<string, CpuAlgorithm> = {
  rr: 'RR',
  sjf: 'SJF',
  priority: 'PRIORITY_PREEMPTIVE',
};

function parseCylinders(text: string): number[] | null {
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const values = parts.map(Number);
  if (values.some((value) => !Number.isInteger(value))) return null;
  return values;
}

function buildConfig(form: FormState, base: SimulationConfig): { config: SimulationConfig } | { error: string } {
  if (!form.name.trim()) return { error: 'Give the simulation a name.' };
  if (form.processes.length === 0) return { error: 'Add at least one process.' };
  for (const process of form.processes) {
    if (!process.name.trim()) return { error: 'Every process needs a name.' };
    if (process.burst < 1) return { error: `${process.name}: burst time must be at least 1.` };
    if (process.arrival < 0) return { error: `${process.name}: arrival time cannot be negative.` };
    if (process.memory < 1 || process.memory > form.memoryMb) {
      return { error: `${process.name}: memory must be between 1 and ${form.memoryMb} MB.` };
    }
  }
  if (form.quantum < 1) return { error: 'Time quantum must be at least 1.' };
  if (form.memoryMb < 1) return { error: 'Memory size must be at least 1 MB.' };

  const cylinders = Number(form.cylinders);
  const head = Number(form.head);
  if (!Number.isInteger(cylinders) || cylinders < 2) return { error: 'The disk needs at least 2 cylinders.' };
  if (!Number.isInteger(head) || head < 0 || head >= cylinders) return { error: 'Head position must be inside the disk.' };
  const cylinderList = parseCylinders(form.requests);
  if (!cylinderList) return { error: 'Disk requests must be whole numbers separated by commas.' };
  if (cylinderList.some((value) => value < 0 || value >= cylinders)) {
    return { error: `Disk requests must be between 0 and ${cylinders - 1}.` };
  }

  const pids = new Set(form.processes.map((process) => process.pid));
  return {
    config: {
      ...base,
      processes: form.processes,
      cpu: { algorithm: form.cpuAlgorithm, quantum: form.quantum, priorityLowerIsHigher: form.priorityLowerIsHigher },
      memory: { totalMb: form.memoryMb, algorithm: form.memoryAlgorithm },
      disk: {
        cylinders,
        head,
        direction: form.direction,
        algorithm: form.diskAlgorithm,
        requests: cylinderList.map((cylinder, index) => ({ id: `R${index + 1}`, cylinder, arrival: index * 2 })),
      },
      resources: {
        ...base.resources,
        processes: base.resources.processes.filter((process) => pids.has(process.pid)),
        script: base.resources.script.filter((entry) => pids.has(entry.pid)),
      },
    },
  };
}

interface FormState {
  name: string;
  processes: ProcessSpec[];
  cpuAlgorithm: CpuAlgorithm;
  quantum: number;
  priorityLowerIsHigher: boolean;
  memoryMb: number;
  memoryAlgorithm: MemoryAlgorithm;
  cylinders: string;
  head: string;
  direction: 'UP' | 'DOWN';
  diskAlgorithm: DiskAlgorithm;
  requests: string;
}

function initialForm(base: SimulationConfig): FormState {
  return {
    name: 'Morning workload',
    processes: base.processes,
    cpuAlgorithm: base.cpu.algorithm,
    quantum: base.cpu.quantum,
    priorityLowerIsHigher: base.cpu.priorityLowerIsHigher,
    memoryMb: base.memory.totalMb,
    memoryAlgorithm: base.memory.algorithm,
    cylinders: String(base.disk.cylinders),
    head: String(base.disk.head),
    direction: base.disk.direction,
    diskAlgorithm: base.disk.algorithm,
    requests: base.disk.requests.map((request) => request.cylinder).join(', '),
  };
}

export default function NewSimulationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preset = searchParams.get('preset');
  const [base, setBase] = useState<SimulationConfig | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDefaultConfig()
      .then((config) => {
        if (cancelled) return;
        const algorithm = preset ? PRESET_ALGORITHMS[preset] : undefined;
        const next = algorithm ? { ...config, cpu: { ...config.cpu, algorithm } } : config;
        setBase(next);
        setForm(initialForm(next));
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load the default settings');
      });
    return () => {
      cancelled = true;
    };
  }, [preset]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const updateProcess = (index: number, patch: Partial<ProcessSpec>) =>
    setForm((current) =>
      current && {
        ...current,
        processes: current.processes.map((process, position) => (position === index ? { ...process, ...patch } : process)),
      },
    );

  const addProcess = () =>
    setForm((current) => {
      if (!current) return current;
      const number = Math.max(0, ...current.processes.map((process) => Number(process.pid.slice(1)))) + 1;
      const pid = `P${number}`;
      return {
        ...current,
        processes: [...current.processes, { pid, name: `Process ${number}`, arrival: 0, burst: 4, priority: 1, memory: 128 }],
      };
    });

  const removeProcess = (index: number) =>
    setForm((current) => current && { ...current, processes: current.processes.filter((_, position) => position !== index) });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form || !base) return;
    const result = buildConfig(form, base);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setSaving(true);
    try {
      const { log } = await runSimulationRemote(result.config);
      const id = await createSimulation(form.name.trim(), result.config, log);
      navigate(`/simulations/${id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the simulation');
      setSaving(false);
    }
  };

  if (!form) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        {error ? <ErrorBanner message={error} /> : <LoadingLine label="Loading kernel defaults" />}
      </div>
    );
  }

  const memoryDemand = form.processes.reduce((sum, process) => sum + (Number(process.memory) || 0), 0);
  const memoryOver = memoryDemand > form.memoryMb;
  const totalBurst = form.processes.reduce((sum, process) => sum + (Number(process.burst) || 0), 0);

  return (
    <form onSubmit={submit} className="mx-auto max-w-[1500px] animate-fade-in px-4 py-7 sm:px-6 lg:py-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-slate-500 transition-colors hover:text-slate-300">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to simulations
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-400/80">
            <Sparkles className="h-3 w-3" /> New run
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Configure the kernel</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Shape the workload, pick the scheduling policies and ChronoOS will record every tick into a replayable timeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="cyan" dot>
            deterministic
          </Badge>
          <Badge tone="slate">{form.processes.length} processes</Badge>
        </div>
      </div>

      {error && <div className="mt-6"><ErrorBanner message={error} /></div>}

      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Simulation identity" subtitle="Name the run so it is easy to find in the vault">
            <label className="block">
              <span className="field-label">Simulation name</span>
              <input
                className="field"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                maxLength={80}
                placeholder="Morning workload"
              />
            </label>
          </Card>

          <Card
            title="Process table"
            subtitle="Arrival time, burst length, priority and memory footprint"
            action={
              <button
                type="button"
                onClick={addProcess}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 transition-colors hover:bg-cyan-400/15"
              >
                <Plus className="h-3.5 w-3.5" /> Add process
              </button>
            }
            bodyClassName="p-4 sm:p-5"
          >
            <div className="space-y-2.5">
              <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_1fr_auto] gap-2.5 px-1 text-[10px] uppercase tracking-[0.14em] text-slate-600 md:grid">
                <span>Process</span>
                <span>Arrival</span>
                <span>Burst</span>
                <span>Priority</span>
                <span>Memory (MB)</span>
                <span className="w-9" />
              </div>
              {form.processes.map((process, index) => (
                <div
                  key={process.pid}
                  className="group grid grid-cols-2 gap-2.5 rounded-xl border border-white/[0.05] bg-black/25 p-3 transition-colors hover:border-white/[0.1] md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_auto] md:items-center md:border-0 md:bg-transparent md:p-0"
                >
                  <div className="col-span-2 flex items-center gap-2 md:col-span-1">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] font-mono text-[10px] text-slate-500">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <input
                      aria-label="Process name"
                      className="field h-9 py-1.5"
                      value={process.name}
                      onChange={(event) => updateProcess(index, { name: event.target.value })}
                    />
                  </div>
                  <input
                    aria-label="Arrival"
                    type="number"
                    min={0}
                    className="field h-9 py-1.5 font-mono"
                    value={process.arrival}
                    onChange={(event) => updateProcess(index, { arrival: Number(event.target.value) })}
                  />
                  <input
                    aria-label="Burst"
                    type="number"
                    min={1}
                    className="field h-9 py-1.5 font-mono"
                    value={process.burst}
                    onChange={(event) => updateProcess(index, { burst: Number(event.target.value) })}
                  />
                  <input
                    aria-label="Priority"
                    type="number"
                    className="field h-9 py-1.5 font-mono"
                    value={process.priority}
                    onChange={(event) => updateProcess(index, { priority: Number(event.target.value) })}
                  />
                  <input
                    aria-label="Memory"
                    type="number"
                    min={1}
                    className="field h-9 py-1.5 font-mono"
                    value={process.memory}
                    onChange={(event) => updateProcess(index, { memory: Number(event.target.value) })}
                  />
                  <button
                    type="button"
                    onClick={() => removeProcess(index)}
                    aria-label={`Remove ${process.name}`}
                    className="col-span-2 justify-self-end rounded-lg border border-white/[0.06] p-2 text-slate-600 transition-colors hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-300 md:col-span-1 md:justify-self-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {form.processes.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/[0.08] py-8 text-center text-xs text-slate-500">
                  No processes yet — add at least one to run the kernel.
                </p>
              )}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="CPU scheduler" subtitle="Pick the policy and quantum" action={<Cpu className="h-4 w-4 text-cyan-400/60" />}>
              <div className="space-y-4">
                <label className="block">
                  <span className="field-label">Algorithm</span>
                  <select className="field" value={form.cpuAlgorithm} onChange={(event) => update('cpuAlgorithm', event.target.value as CpuAlgorithm)}>
                    {CPU_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0b0d14]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Time quantum</span>
                  <input type="number" min={1} className="field font-mono" value={form.quantum} onChange={(event) => update('quantum', Number(event.target.value))} />
                </label>
                <label className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.priorityLowerIsHigher}
                    onChange={(event) => update('priorityLowerIsHigher', event.target.checked)}
                    className="h-3.5 w-3.5 accent-cyan-400"
                  />
                  Lower priority number means higher priority
                </label>
              </div>
            </Card>

            <Card title="Memory allocator" subtitle="Partition size and placement strategy" action={<MemoryStick className="h-4 w-4 text-indigo-400/70" />}>
              <div className="space-y-4">
                <label className="block">
                  <span className="field-label">Total memory (MB)</span>
                  <input type="number" min={1} className="field font-mono" value={form.memoryMb} onChange={(event) => update('memoryMb', Number(event.target.value))} />
                </label>
                <label className="block">
                  <span className="field-label">Allocation strategy</span>
                  <select className="field" value={form.memoryAlgorithm} onChange={(event) => update('memoryAlgorithm', event.target.value as MemoryAlgorithm)}>
                    {MEMORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0b0d14]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={cn('rounded-xl border px-3 py-2.5 text-xs', memoryOver ? 'border-amber-400/25 bg-amber-400/[0.06] text-amber-200' : 'border-white/[0.06] bg-black/20 text-slate-400')}>
                  <p className="flex items-center gap-2">
                    {memoryOver && <TriangleAlert className="h-3.5 w-3.5" />}
                    <span className="font-mono">{memoryDemand} MB</span> requested of{' '}
                    <span className="font-mono">{form.memoryMb} MB</span>
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {memoryOver ? 'Not all processes will fit at once — expect waiting and compaction events.' : 'Memory can hold every process simultaneously.'}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card title="Disk scheduling" subtitle="Head geometry, seek policy and request stream" action={<HardDrive className="h-4 w-4 text-emerald-400/70" />}>
            <div className="grid gap-4 md:grid-cols-4">
              <label className="block">
                <span className="field-label">Cylinders</span>
                <input type="number" min={2} className="field font-mono" value={form.cylinders} onChange={(event) => update('cylinders', event.target.value)} />
              </label>
              <label className="block">
                <span className="field-label">Head start</span>
                <input type="number" min={0} className="field font-mono" value={form.head} onChange={(event) => update('head', event.target.value)} />
              </label>
              <label className="block">
                <span className="field-label">Direction</span>
                <select className="field" value={form.direction} onChange={(event) => update('direction', event.target.value as 'UP' | 'DOWN')}>
                  <option value="UP" className="bg-[#0b0d14]">Outward (up)</option>
                  <option value="DOWN" className="bg-[#0b0d14]">Inward (down)</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label">Algorithm</span>
                <select className="field" value={form.diskAlgorithm} onChange={(event) => update('diskAlgorithm', event.target.value as DiskAlgorithm)}>
                  {DISK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#0b0d14]">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="field-label">Requested cylinders (comma separated, in arrival order)</span>
              <input className="field font-mono" value={form.requests} onChange={(event) => update('requests', event.target.value)} />
            </label>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="laser-frame shadow-glow">
            <div className="laser-inner p-5">
              <p className="panel-title">Run summary</p>
              <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">{form.name.trim() || 'Untitled run'}</h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">config/live-preview</p>

              <dl className="mt-5 space-y-2.5 text-xs">
                {[
                  { label: 'CPU policy', value: form.cpuAlgorithm },
                  { label: 'Quantum', value: String(form.quantum) },
                  { label: 'Memory', value: `${form.memoryMb} MB · ${form.memoryAlgorithm.replace('_', ' ')}` },
                  { label: 'Disk policy', value: `${form.diskAlgorithm} · ${form.cylinders} cyl` },
                  { label: 'Processes', value: String(form.processes.length) },
                  { label: 'Total burst', value: `${totalBurst} ticks` },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-0 last:pb-0">
                    <dt className="text-slate-500">{row.label}</dt>
                    <dd className="font-mono text-slate-200">{row.value}</dd>
                  </div>
                ))}
              </dl>

              <button type="submit" disabled={saving} className="btn-primary mt-5 w-full">
                {saving ? (
                  <>
                    <Gauge className="h-4 w-4 animate-pulse" /> Recording timeline…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Run simulation
                  </>
                )}
              </button>
              <Link to="/" className="btn-ghost mt-2 w-full">
                Cancel
              </Link>
              <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-600">
                The run is recorded locally and stays in this browser.
              </p>
            </div>
          </div>

          <div className="glass p-4">
            <p className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
              <Layers className="h-3.5 w-3.5 text-cyan-400/70" /> What happens next
            </p>
            <ol className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-slate-500">
              <li>1. The kernel replays every scheduling decision.</li>
              <li>2. Events and snapshots are persisted.</li>
              <li>3. You land in the time-travel workspace.</li>
            </ol>
          </div>
        </aside>
      </div>
    </form>
  );
}

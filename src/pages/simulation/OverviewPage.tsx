import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  Cpu,
  HardDrive,
  ListChecks,
  MemoryStick,
  Radio,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge, Card, Metric, StatusDot, cn, fmt, fmtTime } from '@/components/ui';
import { useSimulation } from '@/context/SimulationContext';
import type { ProcessState } from '@/engine/types';

const STATE_STYLES: Record<ProcessState, { chip: string; ring: string; bar: string; label: string }> = {
  RUNNING: { chip: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300', ring: 'border-emerald-400/40', bar: 'bg-emerald-400', label: 'running' },
  READY: { chip: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300', ring: 'border-cyan-400/25', bar: 'bg-cyan-400', label: 'ready' },
  WAITING: { chip: 'border-amber-400/30 bg-amber-400/10 text-amber-300', ring: 'border-amber-400/25', bar: 'bg-amber-400', label: 'waiting' },
  NEW: { chip: 'border-white/10 bg-white/[0.04] text-slate-400', ring: 'border-white/10', bar: 'bg-slate-600', label: 'new' },
  TERMINATED: { chip: 'border-white/[0.06] bg-white/[0.02] text-slate-600', ring: 'border-white/[0.06]', bar: 'bg-slate-700', label: 'done' },
};

const TABS = [
  { key: 'cpu', label: 'CPU', icon: Cpu },
  { key: 'ram', label: 'RAM', icon: MemoryStick },
  { key: 'disk', label: 'Disk', icon: HardDrive },
  { key: 'events', label: 'Events', icon: ListChecks },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function OverviewPage() {
  const { log, simulation, activeBranch, analysis, time, endTime, state, stateLoading } = useSimulation();
  const analytics = analysis.analytics;
  const [tab, setTab] = useState<TabKey>('cpu');

  const segments = useMemo(() => [...state.cpu.segments, ...(state.cpu.openSegment ? [state.cpu.openSegment] : [])], [state.cpu]);
  const span = Math.max(endTime, 1);
  const nameOf = (pid: string | null) => state.processes.find((process) => process.pid === pid)?.name ?? 'Idle';
  const running = state.processes.find((process) => process.pid === state.cpu.running) ?? null;
  const memoryUsed = state.memory.blocks.filter((block) => block.pid).reduce((sum, block) => sum + block.size, 0);
  const recentEvents = useMemo(
    () => log.events.filter((event) => event.timestamp <= time).slice(-6).reverse(),
    [log.events, time],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <Activity className="h-3 w-3" /> Kernel overview
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">Live workspace</h1>
          <p className="mt-1 text-sm text-slate-500">
            {simulation.config.processes.length} processes on <span className="text-slate-300">{activeBranch.name}</span> · inspecting{' '}
            <span className="font-mono text-cyan-300">t={time}</span> of <span className="font-mono">{endTime}</span> · {fmtTime(time)} elapsed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={stateLoading ? 'amber' : 'emerald'} dot>
            {stateLoading ? 'reconstructing' : 'state live'}
          </Badge>
          <Badge tone="slate">{log.events.length} events</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Avg waiting" value={fmt(analytics.avgWaiting)} hint="end of run · ready queue time" tone="cyan" icon={<Timer className="h-4 w-4" />} />
        <Metric label="Avg turnaround" value={fmt(analytics.avgTurnaround)} hint="arrival to completion" icon={<TrendingUp className="h-4 w-4" />} />
        <Metric label="CPU utilization" value={`${fmt(analytics.cpuUtilizationPct)}%`} hint={`${analytics.contextSwitches} context switches`} tone="emerald" icon={<Cpu className="h-4 w-4" />} />
        <Metric label="Completed" value={`${analytics.completedCount} / ${analytics.totalCount}`} hint="processes finished" tone="indigo" icon={<ListChecks className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card
          title="Process map"
          subtitle={`Kernel state reconstructed at t=${time}`}
          action={
            <span className="pill">
              <StatusDot tone={running ? 'emerald' : 'slate'} />
              {running ? `${running.name} on core` : 'core idle'}
            </span>
          }
          bodyClassName="space-y-5 p-5"
        >
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {state.processes.map((process) => {
              const style = STATE_STYLES[process.state];
              const progress = process.burst > 0 ? ((process.burst - process.remaining) / process.burst) * 100 : 0;
              return (
                <div
                  key={process.pid}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border bg-black/25 p-3 transition-all duration-300 ease-spring hover:-translate-y-0.5',
                    style.ring,
                    process.state === 'RUNNING' && 'shadow-[0_0_26px_rgba(0,255,133,0.12)]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-600">{process.pid}</span>
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]', style.chip)}>{style.label}</span>
                  </div>
                  <p className="mt-1.5 truncate text-[13px] font-medium text-slate-100">{process.name}</p>
                  <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className={cn('h-full rounded-full transition-all duration-500 ease-spring', style.bar)} style={{ width: `${Math.max(3, progress)}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-slate-500">
                    <span>rem {process.state === 'TERMINATED' ? 0 : process.remaining}</span>
                    <span>{process.memoryStart === null ? '—' : `${process.memory}MB@${process.memoryStart}`}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-slate-600">
              <span>CPU timeline</span>
              <span className="font-mono">{time} / {endTime}</span>
            </div>
            <div className="relative h-10 overflow-hidden rounded-lg border border-white/[0.06] bg-black/40">
              {segments.map((segment, index) => {
                const left = (segment.start / span) * 100;
                const width = ((segment.end - segment.start) / span) * 100;
                return (
                  <div
                    key={`${segment.start}-${index}`}
                    title={`${nameOf(segment.pid)}: t=${segment.start} → ${segment.end}`}
                    className={cn(
                      'absolute inset-y-1 rounded-[3px] transition-all',
                      segment.kind === 'IDLE' ? 'bg-slate-700/40' : 'bg-gradient-to-b from-cyan-300/90 to-cyan-500/70 hover:brightness-110',
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
              <div className="pointer-events-none absolute inset-y-0 w-px bg-emerald-300 shadow-[0_0_10px_2px_rgba(0,255,133,0.5)]" style={{ left: `${(time / span) * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[9px] text-slate-600">
              <span>0</span><span>{Math.round(span / 2)}</span><span>{span}</span>
            </div>
          </div>
        </Card>

        <Card
          title="State inspector"
          subtitle="Telemetry at the current tick"
          bodyClassName="p-0"
          action={<Radio className="h-3.5 w-3.5 animate-pulse-dot text-cyan-400/70" />}
        >
          <div className="flex gap-1 border-b border-white/[0.06] px-3 pt-3">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-2 py-2 text-[11px] transition-colors',
                    tab === item.key ? 'border-cyan-400 text-cyan-200' : 'border-transparent text-slate-500 hover:text-slate-300',
                  )}
                >
                  <Icon className="h-3 w-3" /> {item.label}
                </button>
              );
            })}
          </div>

          <div className="p-5">
            {tab === 'cpu' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-black/25 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Running process</p>
                  <p className={cn('mt-1 text-lg font-semibold tracking-tight', running ? 'text-emerald-300' : 'text-slate-500')}>
                    {running ? running.name : 'Idle core'}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-slate-500">
                    pid {running?.pid ?? '—'} · remaining {running?.remaining ?? 0} ticks
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Ready queue</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {state.cpu.readyQueue.length === 0 && <span className="text-xs text-slate-500">empty</span>}
                    {state.cpu.readyQueue.map((pid) => (
                      <span key={pid} className="pill border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-200">{nameOf(pid)}</span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">Context switches</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-200">{state.cpu.contextSwitches}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">Quantum</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-200">{simulation.config.cpu.quantum}</p>
                  </div>
                </div>
              </div>
            )}

            {tab === 'ram' && (
              <div className="space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Allocated</p>
                    <p className="mt-1 font-mono text-2xl text-cyan-300">{memoryUsed}<span className="text-xs text-slate-500"> MB</span></p>
                  </div>
                  <p className="font-mono text-[10px] text-slate-500">of {state.memory.totalMb} MB</p>
                </div>
                <div className="flex h-6 w-full overflow-hidden rounded-md border border-white/[0.08] bg-black/40">
                  {state.memory.blocks.map((block) => (
                    <div
                      key={`${block.start}-${block.size}`}
                      title={`${block.pid ? nameOf(block.pid) : 'free'}: ${block.size} MB @ ${block.start}`}
                      className={cn('h-full transition-all', block.pid ? 'bg-gradient-to-b from-cyan-300/90 to-cyan-500/70' : 'bg-white/[0.04]')}
                      style={{ width: `${(block.size / state.memory.totalMb) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">Free holes</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-200">{state.memory.blocks.filter((block) => !block.pid).length}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">Failed allocs</p>
                    <p className="mt-0.5 font-mono text-sm text-amber-300">{state.memory.failures}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Strategy</p>
                  <p className="mt-1 text-sm text-slate-200">{simulation.config.memory.algorithm.replace('_', ' ')}</p>
                </div>
              </div>
            )}

            {tab === 'disk' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-black/25 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Head position</p>
                  <p className="mt-1 font-mono text-2xl text-emerald-300">{state.disk.head}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-500">
                    cylinder of {state.disk.cylinders} · moving {state.disk.direction}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">Served</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-200">{state.disk.completed.length} / {state.disk.requests.length}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">Travel</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-200">{state.disk.totalMovement} cyl</p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
                    style={{ width: `${(state.disk.completed.length / Math.max(state.disk.requests.length, 1)) * 100}%` }}
                  />
                </div>
                <p className="text-center font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">{simulation.config.disk.algorithm} policy</p>
              </div>
            )}

            {tab === 'events' && (
              <ol className="space-y-1.5">
                {recentEvents.length === 0 && <li className="text-xs text-slate-500">Nothing has happened yet.</li>}
                {recentEvents.map((event) => (
                  <li key={event.seq} className="rounded-lg border border-white/[0.05] bg-black/25 px-2.5 py-2">
                    <p className="flex items-center gap-2 font-mono text-[10px] text-cyan-400/80">
                      <span className="text-slate-600">#{event.seq}</span>
                      <span>t={event.timestamp}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{event.description}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      </div>

      <Card title="Waiting time per process" subtitle="End-of-run comparison across the ready queue" action={<Zap className="h-4 w-4 text-cyan-400/60" />}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.processes.map((process) => ({ name: process.name, waiting: process.waiting ?? 0 }))}>
              <defs>
                <linearGradient id="waiting-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00F0FF" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#00F0FF" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(0,240,255,0.05)' }}
                contentStyle={{ background: 'rgba(11,13,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
              />
              <Bar dataKey="waiting" fill="url(#waiting-fill)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Process results" subtitle="Completion, turnaround and response metrics" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Process</th><th>Arrival</th><th>Burst</th><th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs text-slate-300">
              {analytics.processes.map((process) => (
                <tr key={process.pid}>
                  <td className="font-sans text-sm font-medium text-slate-200">{process.name}</td>
                  <td>{process.arrival}</td>
                  <td>{process.burst}</td>
                  <td>{process.completion ?? <span className="text-amber-300">running</span>}</td>
                  <td>{process.turnaround ?? '—'}</td>
                  <td>{process.waiting ?? '—'}</td>
                  <td>{process.responseTime ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

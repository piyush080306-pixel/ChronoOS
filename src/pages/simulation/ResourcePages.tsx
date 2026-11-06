import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Boxes, CheckCircle2, HardDrive, MemoryStick, ShieldCheck, Timer } from 'lucide-react';
import { Badge, Card, EmptyState, Metric, cn, fmt } from '@/components/ui';
import { useSimulation } from '@/context/SimulationContext';

const CHART_TOOLTIP = {
  background: 'rgba(11,13,20,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#e2e8f0',
  fontSize: 12,
};

export function MemoryPage() {
  const { analysis, simulation, state, time } = useSimulation();
  const analytics = analysis.analytics;
  const total = state.memory.totalMb;
  const used = state.memory.blocks.filter((block) => block.pid).reduce((sum, block) => sum + block.size, 0);
  const nameOf = (pid: string | null) => state.processes.find((process) => process.pid === pid)?.name ?? 'Free';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <MemoryStick className="h-3 w-3" /> Physical memory
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">Address space</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} MB contiguous partition · <span className="text-slate-300">{simulation.config.memory.algorithm.replace('_', ' ')}</span> · inspecting{' '}
            <span className="font-mono text-cyan-300">t={time}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone="cyan">{simulation.config.memory.algorithm.replace('_', ' ')}</Badge>
          <Badge tone="slate">{state.memory.blocks.length} blocks</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="In use" value={`${used} MB`} hint={`${fmt((used / Math.max(total, 1)) * 100, 0)}% of capacity`} tone="cyan" icon={<MemoryStick className="h-4 w-4" />} />
        <Metric label="Free" value={`${total - used} MB`} hint={`largest hole ${analytics.memory.largestFreeMb} MB`} />
        <Metric label="External fragmentation" value={`${analytics.memory.externalFragmentationMb} MB`} hint={`${fmt(analytics.memory.fragmentationPct, 0)}% of free memory`} tone="amber" icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Failed allocations" value={`${state.memory.failures}`} hint="requests that could not be placed" tone="rose" />
      </div>

      <Card title="Memory map" subtitle={`Live allocation at t=${time}`}>
        <div className="flex h-24 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/40">
          {state.memory.blocks.map((block) => (
            <div
              key={`${block.start}-${block.size}`}
              title={`${nameOf(block.pid)}: ${block.start}–${block.start + block.size} MB (${block.size} MB)`}
              className={cn(
                'flex items-center justify-center overflow-hidden border-r border-black/40 text-[10px] font-medium transition-all duration-500 hover:brightness-125',
                block.pid ? 'bg-gradient-to-b from-cyan-300/90 to-cyan-500/70 text-slate-950' : 'bg-white/[0.03] text-slate-600',
              )}
              style={{ width: `${(block.size / total) * 100}%` }}
            >
              {block.size / total > 0.08 ? (
                <span className="truncate px-1">{block.pid ? `${nameOf(block.pid)} · ${block.size}MB` : 'free'}</span>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-600">
          <span>0 MB</span><span>{Math.round(total / 2)} MB</span><span>{total} MB</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-b from-cyan-300 to-cyan-500" /> allocated</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-white/10" /> free hole</span>
        </div>
      </Card>

      <Card title="Block table" subtitle="Contiguous partitions and their owners" bodyClassName="p-0">
        <div className="max-h-96 overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0 z-10 bg-[#0d0f17]/95 backdrop-blur">
              <tr><th>Start</th><th>Size</th><th>Range</th><th>Owner</th></tr>
            </thead>
            <tbody className="font-mono text-xs text-slate-300">
              {state.memory.blocks.map((block) => (
                <tr key={`${block.start}-${block.size}`}>
                  <td>{block.start} MB</td>
                  <td>{block.size} MB</td>
                  <td className="text-slate-500">{block.start}–{block.start + block.size}</td>
                  <td className="font-sans">
                    {block.pid ? <Badge tone="cyan">{nameOf(block.pid)}</Badge> : <span className="text-slate-500">free</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function DiskPage() {
  const { log, simulation, analysis, state, time } = useSimulation();
  const analytics = analysis.analytics;
  const path = useMemo(() => {
    const points = [{ t: 0, cylinder: simulation.config.disk.head }];
    for (const event of log.events) {
      if (event.type === 'DISK_HEAD_MOVED') points.push({ t: event.timestamp, cylinder: event.payload.to });
    }
    return points;
  }, [log.events, simulation.config.disk.head]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <HardDrive className="h-3 w-3" /> Storage stack
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">Disk scheduling</h1>
          <p className="mt-1 text-sm text-slate-500">
            {simulation.config.disk.algorithm} · {simulation.config.disk.cylinders} cylinders · head moving {simulation.config.disk.direction} ·{' '}
            inspecting <span className="font-mono text-cyan-300">t={time}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone="cyan">{simulation.config.disk.algorithm}</Badge>
          <Badge tone="slate">head {state.disk.head}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Total head movement" value={`${analytics.disk.totalMovement}`} hint="cylinders travelled" tone="emerald" icon={<HardDrive className="h-4 w-4" />} />
        <Metric label="Average latency" value={fmt(analytics.disk.avgLatency)} hint="arrival → completion" icon={<Timer className="h-4 w-4" />} />
        <Metric label="Worst latency" value={`${analytics.disk.maxLatency ?? '-'}`} hint="slowest request" tone="amber" />
        <Metric label="Served" value={`${analytics.disk.completed} / ${analytics.disk.total}`} hint="requests completed" tone="cyan" />
      </div>

      <Card title="Head path" subtitle="Cylinder trajectory over simulation time" action={<Badge tone="slate">live head {state.disk.head}</Badge>}>
        {path.length < 2 ? (
          <EmptyState message="The head did not move in this timeline." />
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={path}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="t" type="number" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} name="Time" />
                <YAxis dataKey="cylinder" type="number" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} name="Cylinder" domain={[0, simulation.config.disk.cylinders - 1]} />
                <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ stroke: 'rgba(0,240,255,0.2)' }} />
                <ReferenceLine y={state.disk.head} stroke="#00F0FF" strokeDasharray="4 4" strokeOpacity={0.5} />
                <Line type="stepAfter" dataKey="cylinder" stroke="#00FF85" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#00FF85' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Served requests" subtitle="Completion order and per-request latency" bodyClassName="p-0">
        <div className="max-h-96 overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0 z-10 bg-[#0d0f17]/95 backdrop-blur">
              <tr><th>Request</th><th>Cylinder</th><th>Arrived</th><th>Served</th><th>Latency</th></tr>
            </thead>
            <tbody className="font-mono text-xs text-slate-300">
              {state.disk.completed.map((request) => (
                <tr key={request.id}>
                  <td><Badge tone="cyan">{request.id}</Badge></td>
                  <td>{request.cylinder}</td>
                  <td>{request.arrival}</td>
                  <td>{request.completion}</td>
                  <td className={request.completion - request.arrival > 100 ? 'text-amber-300' : ''}>{request.completion - request.arrival}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ResourcesPage() {
  const { log, state, time } = useSimulation();
  const finalResources = log.finalState.resources;
  const resources = state.resources;
  const deadlock = finalResources.deadlock;
  const mode = log.config.resources.mode;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <Boxes className="h-3 w-3" /> Concurrency safety
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">Resources &amp; deadlocks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Banker&apos;s algorithm · {mode === 'AVOIDANCE' ? 'avoidance' : 'detection only'} · inspecting{' '}
            <span className="font-mono text-cyan-300">t={time}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={resources.safe === false ? 'rose' : 'emerald'} dot>
            {resources.safe === null ? 'not evaluated' : resources.safe ? 'safe state' : 'unsafe state'}
          </Badge>
          <Badge tone="slate">{mode.toLowerCase()}</Badge>
        </div>
      </div>

      {deadlock ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-medium">Deadlock detected at t={deadlock.time}.</span>{' '}
            {deadlock.pids.join(', ')} are waiting on each other and cannot progress.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-medium">No deadlock in this timeline.</span> Every blocked request was eventually granted or
            safely deferred.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric
          label="Safety verdict"
          value={resources.safe === null ? '—' : resources.safe ? 'Safe' : 'Unsafe'}
          hint={resources.safeSequence.length ? `sequence ${resources.safeSequence.join(' → ')}` : 'no safe sequence'}
          tone={resources.safe === false ? 'rose' : 'emerald'}
          icon={<ShieldCheck className="h-4 w-4" />}
          mono={false}
        />
        <Metric label="Waiting requests" value={`${resources.waiting.length}`} hint="processes blocked on resources" tone={resources.waiting.length ? 'amber' : 'slate'} />
        <Metric
          label="Available pool"
          value={resources.available.join(' / ')}
          hint={resources.names.join(' / ')}
          tone="cyan"
        />
      </div>

      <Card title="Resource pools" subtitle={`Availability at t=${time}`}>
        <div className="space-y-4">
          {resources.names.map((name, index) => {
            const total = resources.total[index];
            const available = resources.available[index];
            const held = total - available;
            const pct = total > 0 ? (held / total) * 100 : 0;
            return (
              <div key={name}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-300">{name}</span>
                  <span className="font-mono text-slate-500">
                    {available} free · {held}/{total} held
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-indigo-400/70 transition-all duration-500 ease-spring"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Allocation matrix" subtitle="Held versus maximum claim per process" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Process</th>
                {resources.names.map((name) => <th key={name}>{name} · held / max</th>)}
              </tr>
            </thead>
            <tbody className="font-mono text-xs text-slate-300">
              {resources.processes.map((process) => (
                <tr key={process.pid}>
                  <td className="font-sans text-sm font-medium text-slate-200">{process.pid}</td>
                  {process.allocation.map((held, index) => (
                    <td key={resources.names[index]}>
                      <span className={held === process.max[index] ? 'text-emerald-300' : ''}>{held}</span>
                      <span className="text-slate-600"> / {process.max[index]}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Blocked requests" subtitle={`Queue at t=${time}`}>
        {resources.waiting.length === 0 ? (
          <EmptyState message="No process is waiting for a resource." icon={<CheckCircle2 className="h-5 w-5" />} />
        ) : (
          <ul className="space-y-2">
            {resources.waiting.map((request) => (
              <li key={request.pid} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-xs text-amber-100">
                <span className="font-mono font-medium">{request.pid}</span>
                <span className="text-amber-200/70">waits for</span>
                <span className="font-mono">
                  {request.vector.map((amount, index) => (amount > 0 ? `${amount} × ${resources.names[index]}` : null)).filter(Boolean).join(', ')}
                </span>
                <span className="ml-auto font-mono text-[10px] text-amber-300/60">since t={request.since}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

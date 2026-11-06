import { Cpu, Gauge, Repeat, Timer } from 'lucide-react';
import { Badge, Card, Metric, fmt, fmtTime } from '@/components/ui';
import { useSimulation } from '@/context/SimulationContext';
import { cpuAlgorithmLabel } from '@/engine/cpu/scheduler';

const PALETTE = ['#00F0FF', '#00FF85', '#FFB800', '#818CF8', '#F472B6', '#2DD4BF', '#FBBF24', '#A3E635'];

export default function CpuPage() {
  const { log, simulation, analysis, time } = useSimulation();
  const state = log.finalState;
  const analytics = analysis.analytics;
  const span = Math.max(log.endTime, 1);
  const colorOf = (pid: string | null) => {
    if (!pid) return '#1e293b';
    const index = state.processes.findIndex((process) => process.pid === pid);
    return PALETTE[index % PALETTE.length];
  };
  const nameOf = (pid: string | null) => state.processes.find((process) => process.pid === pid)?.name ?? 'Idle';
  const segments = [...state.cpu.segments, ...(state.cpu.openSegment ? [state.cpu.openSegment] : [])];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <Cpu className="h-3 w-3" /> Scheduler telemetry
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">CPU scheduling</h1>
          <p className="mt-1 text-sm text-slate-500">
            {cpuAlgorithmLabel(simulation.config.cpu.algorithm)} · quantum {simulation.config.cpu.quantum} · playhead at{' '}
            <span className="font-mono text-cyan-300">t={time}</span> ({fmtTime(time)})
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone="cyan">{simulation.config.cpu.algorithm}</Badge>
          <Badge tone="slate">quantum {simulation.config.cpu.quantum}</Badge>
          <Badge tone="slate">{state.cpu.contextSwitches} switches</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Context switches" value={`${state.cpu.contextSwitches}`} hint="preemptions + dispatches" icon={<Repeat className="h-4 w-4" />} tone="cyan" />
        <Metric label="CPU busy" value={`${analytics.cpuBusy}`} hint={`${fmt(analytics.cpuUtilizationPct)}% of the run`} icon={<Cpu className="h-4 w-4" />} tone="emerald" />
        <Metric label="Throughput" value={fmt(analytics.throughput, 3)} hint="processes per tick" icon={<Gauge className="h-4 w-4" />} tone="indigo" />
        <Metric label="Idle time" value={`${Math.max(0, log.endTime - analytics.cpuBusy)}`} hint="ticks without a runnable process" icon={<Timer className="h-4 w-4" />} />
      </div>

      <Card title="Execution Gantt" subtitle="Every dispatch, preemption and idle window in the selected timeline" bodyClassName="p-5">
        <div className="overflow-x-auto">
          <div className="relative h-20 min-w-[680px] overflow-hidden rounded-xl border border-white/[0.06] bg-black/40">
            <div className="absolute inset-0 bg-fine-grid bg-[length:32px_32px] opacity-25" />
            {segments.map((segment, index) => {
              const left = (segment.start / span) * 100;
              const width = ((segment.end - segment.start) / span) * 100;
              const color = segment.kind === 'IDLE' ? '#334155' : colorOf(segment.pid);
              return (
                <div
                  key={`${segment.start}-${index}`}
                  title={`${nameOf(segment.pid)}: t=${segment.start} → ${segment.end}`}
                  className="group absolute inset-y-2 flex items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold text-slate-950 transition-all hover:brightness-110"
                  style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: segment.kind === 'IDLE' ? 0.5 : 0.9 }}
                >
                  {segment.kind === 'RUN' && width > 4 ? nameOf(segment.pid) : ''}
                </div>
              );
            })}
            <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_12px_2px_rgba(255,255,255,0.5)]" style={{ left: `${(time / span) * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-600">
            <span>0</span><span>{Math.round(span / 2)}</span><span>{span}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-slate-400">
          {state.processes.map((process) => (
            <span key={process.pid} className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: colorOf(process.pid) }} />
              {process.name}
              <span className="font-mono text-[9px] text-slate-600">{process.pid}</span>
            </span>
          ))}
        </div>
      </Card>

      <Card title="Dispatch log" subtitle="Ordered execution segments" bodyClassName="p-0">
        <div className="max-h-96 overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0 z-10 bg-[#0d0f17]/95 backdrop-blur">
              <tr><th>Process</th><th>Start</th><th>End</th><th>Length</th><th>Kind</th></tr>
            </thead>
            <tbody className="font-mono text-xs text-slate-300">
              {segments.map((segment, index) => (
                <tr key={`${segment.start}-${index}`}>
                  <td className="font-sans text-sm text-slate-200">
                    <span className="mr-2 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: colorOf(segment.pid) }} />
                    {nameOf(segment.pid)}
                  </td>
                  <td>{segment.start}</td>
                  <td>{segment.end}</td>
                  <td>{segment.end - segment.start}</td>
                  <td>
                    <Badge tone={segment.kind === 'RUN' ? 'cyan' : 'slate'}>{segment.kind.toLowerCase()}</Badge>
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

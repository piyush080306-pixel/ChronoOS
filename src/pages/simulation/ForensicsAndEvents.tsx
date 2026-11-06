import { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, ArrowRight, Filter, Info, Search, ShieldAlert, Terminal } from 'lucide-react';
import { Badge, Card, EmptyState, SEVERITY_STYLES, cn } from '@/components/ui';
import { useSimulation } from '@/context/SimulationContext';
import { EVENT_TYPES } from '@/engine/events';
import type { Severity } from '@/engine/forensics';

const SEVERITY_ICON: Record<Severity, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

export function ForensicsPage() {
  const { analysis, time, setTime } = useSimulation();
  const findings = analysis.findings;
  const [severity, setSeverity] = useState<Severity | 'all'>('all');

  const counts = useMemo(
    () => ({
      critical: findings.filter((finding) => finding.severity === 'critical').length,
      warning: findings.filter((finding) => finding.severity === 'warning').length,
      info: findings.filter((finding) => finding.severity === 'info').length,
    }),
    [findings],
  );

  const shown = severity === 'all' ? findings : findings.filter((finding) => finding.severity === severity);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <ShieldAlert className="h-3 w-3" /> Post-run analysis
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">Forensics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Plain-language explanations derived from the recorded event stream · playhead at{' '}
            <span className="font-mono text-cyan-300">t={time}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="rose" dot>{counts.critical} critical</Badge>
          <Badge tone="amber">{counts.warning} warnings</Badge>
          <Badge tone="cyan">{counts.info} info</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['all', 'critical', 'warning', 'info'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSeverity(option)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-200',
              severity === option
                ? 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200'
                : 'border-white/[0.08] bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300',
            )}
          >
            <Filter className="h-3 w-3" /> {option}
          </button>
        ))}
      </div>

      <Card bodyClassName="p-0">
        {shown.length === 0 ? (
          <EmptyState
            message={findings.length === 0 ? 'Nothing unusual happened in this timeline.' : `No ${severity} findings.`}
            hint={findings.length === 0 ? 'Every allocation, dispatch and resource request was granted without contention.' : undefined}
            icon={<ShieldAlert className="h-5 w-5" />}
          />
        ) : (
          <ol className="relative divide-y divide-white/[0.05]">
            {shown.map((finding) => {
              const Icon = SEVERITY_ICON[finding.severity];
              return (
                <li key={finding.seq} className="group flex gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02]">
                  <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', SEVERITY_STYLES[finding.severity])}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTime(finding.time)}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-400/80 hover:text-cyan-300"
                        title="Jump the timeline to this moment"
                      >
                        t={finding.time}
                      </button>
                      <span className="text-slate-700">·</span>
                      <span className={cn('text-[10px] uppercase tracking-[0.14em]', finding.severity === 'critical' ? 'text-rose-300' : finding.severity === 'warning' ? 'text-amber-300' : 'text-sky-300')}>
                        {finding.severity}
                      </span>
                      <span className="text-slate-700">·</span>
                      <span className="font-mono text-[10px] text-slate-600">event #{finding.seq}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-100">{finding.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{finding.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTime(finding.time)}
                    className="btn-icon h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Seek to t=${finding.time}`}
                    title={`Seek to t=${finding.time}`}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

export function EventsPage() {
  const { log, time, setTime } = useSimulation();
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () =>
      log.events.filter(
        (event) =>
          (!type || event.type === type) &&
          (!query.trim() ||
            event.description.toLowerCase().includes(query.trim().toLowerCase()) ||
            event.type.toLowerCase().includes(query.trim().toLowerCase()) ||
            String(event.processId ?? '').toLowerCase().includes(query.trim().toLowerCase())),
      ),
    [log.events, type, query],
  );
  const shown = filtered.slice(0, 500);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <Terminal className="h-3 w-3" /> Kernel trace
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">Kernel logs</h1>
          <p className="mt-1 text-sm text-slate-500">
            {log.events.length} recorded events · every page is derived from this stream ·{' '}
            <span className="font-mono text-cyan-300">t={time}</span>
          </p>
        </div>
        <Badge tone="slate">{filtered.length} matching</Badge>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="field-label">Event type</span>
          <select value={type} onChange={(event) => setType(event.target.value)} className="field h-9 w-56 py-1.5 text-xs">
            <option value="" className="bg-[#0b0d14]">All events</option>
            {EVENT_TYPES.map((eventType) => (
              <option key={eventType} value={eventType} className="bg-[#0b0d14]">
                {eventType}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 min-w-[200px]">
          <span className="field-label">Search</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by description, pid or type…"
              className="field h-9 py-1.5 pl-9 text-xs"
            />
          </span>
        </label>
      </div>

      <Card bodyClassName="p-0">
        {shown.length === 0 ? (
          <EmptyState message="No events match these filters." icon={<Terminal className="h-5 w-5" />} />
        ) : (
          <div className="max-h-[34rem] overflow-auto">
            <table className="data-table">
              <thead className="sticky top-0 z-10 bg-[#0d0f17]/95 backdrop-blur">
                <tr><th className="w-16">#</th><th className="w-20">Time</th><th>Type</th><th>Detail</th><th className="w-12" /></tr>
              </thead>
              <tbody className="text-xs">
                {shown.map((event) => (
                  <tr key={event.seq} className="group">
                    <td className="font-mono text-slate-600">{event.seq}</td>
                    <td className="font-mono text-slate-400">{event.timestamp}</td>
                    <td>
                      <span className="whitespace-nowrap rounded-md border border-cyan-400/15 bg-cyan-400/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                        {event.type}
                      </span>
                    </td>
                    <td className="text-slate-400">{event.description}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setTime(event.timestamp)}
                        className="btn-icon h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Seek to t=${event.timestamp}`}
                        title={`Seek to t=${event.timestamp}`}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > shown.length && (
          <p className="border-t border-white/[0.05] px-5 py-3 text-[11px] text-slate-500">
            Showing the first {shown.length} of {filtered.length} events.
          </p>
        )}
      </Card>
    </div>
  );
}

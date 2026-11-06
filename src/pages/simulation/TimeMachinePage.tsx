import { useMemo } from 'react';
import { History, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { Badge, Card, EmptyState, Metric, cn, fmtTime } from '@/components/ui';
import { useSimulation } from '@/context/SimulationContext';
import type { ProcessState } from '@/engine/types';

const STATE_TONE: Record<ProcessState, string> = {
  RUNNING: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  READY: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  WAITING: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  NEW: 'border-white/10 bg-white/[0.04] text-slate-400',
  TERMINATED: 'border-white/[0.06] bg-white/[0.02] text-slate-600',
};

export default function TimeMachinePage() {
  const { log, time, setTime, endTime, playing, setPlaying, state, stateLoading } = useSimulation();

  const visibleEvents = useMemo(
    () => log.events.filter((event) => event.timestamp <= time).slice(-16).reverse(),
    [log.events, time],
  );
  const nameOf = (pid: string | null) => state.processes.find((process) => process.pid === pid)?.name ?? '—';
  const memoryUsed = state.memory.blocks.filter((block) => block.pid).reduce((sum, block) => sum + block.size, 0);
  const progress = endTime > 0 ? (time / endTime) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
            <History className="h-3 w-3" /> Temporal navigator
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">Time machine</h1>
          <p className="mt-1 text-sm text-slate-500">Drag anywhere on the timeline to rebuild the exact kernel state at that tick.</p>
        </div>
        <Badge tone={stateLoading ? 'amber' : 'emerald'} dot>
          {stateLoading ? 'reconstructing state' : 'state synchronized'}
        </Badge>
      </div>

      <div className="laser-frame shadow-glow">
        <div className="laser-inner relative overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-0 bg-fine-grid bg-grid opacity-25" />
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/[0.08] blur-3xl" />

          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Kernel timestamp</p>
              <p className="mt-2 font-mono text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                {String(time).padStart(3, '0')}
                <span className="text-xl text-slate-600"> / {endTime}</span>
              </p>
              <p className="mt-2 font-mono text-xs text-cyan-300/80">{fmtTime(time)} elapsed · {fmtTime(Math.max(0, endTime - time))} remaining</p>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setPlaying(false); setTime(0); }} className="btn-icon" aria-label="Rewind to start">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => { setPlaying(false); setTime(Math.max(0, time - 1)); }} className="btn-icon" aria-label="Step backward">
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!playing && time >= endTime) setTime(0);
                  setPlaying(!playing);
                }}
                aria-label={playing ? 'Pause playback' : 'Play timeline'}
                className={cn(
                  'inline-flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 ease-spring',
                  playing ? 'bg-accent text-slate-950 shadow-glow-lg' : 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20',
                )}
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <button type="button" onClick={() => { setPlaying(false); setTime(Math.min(endTime, time + 1)); }} className="btn-icon" aria-label="Step forward">
                <SkipForward className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative mt-7">
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.08]" />
            <div className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-cyan-400/80 to-indigo-400/60" style={{ width: `${progress}%` }} />
            <input
              type="range"
              min={0}
              max={endTime}
              value={time}
              onChange={(event) => {
                setPlaying(false);
                setTime(Number(event.target.value));
              }}
              aria-label="Scrub simulation time"
              className="relative z-10 h-2 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-cyan-400 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-cyan-200 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_16px_4px_rgba(0,240,255,0.45)]"
            />
            <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-600">
              <span>0</span><span>{Math.round(endTime / 4)}</span><span>{Math.round(endTime / 2)}</span><span>{Math.round((endTime * 3) / 4)}</span><span>{endTime}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Running" value={nameOf(state.cpu.running)} hint={state.cpu.running ? 'on core now' : 'core idle'} tone={state.cpu.running ? 'emerald' : 'slate'} mono={false} />
        <Metric label="Ready queue" value={`${state.cpu.readyQueue.length}`} hint="processes waiting for CPU" tone="cyan" />
        <Metric label="Memory used" value={`${memoryUsed} MB`} hint={`of ${state.memory.totalMb} MB`} />
        <Metric label="Disk head" value={`${state.disk.head}`} hint={`${state.disk.completed.length} requests served`} tone="indigo" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Processes at this moment" subtitle={`Snapshot reconstructed from events up to t=${time}`} bodyClassName="p-0">
          <div className="max-h-96 overflow-y-auto">
            <table className="data-table">
              <thead className="sticky top-0 z-10 bg-[#0d0f17]/95 backdrop-blur">
                <tr><th>Process</th><th>State</th><th>Remaining</th><th>Memory</th></tr>
              </thead>
              <tbody className="text-xs">
                {state.processes.map((process) => (
                  <tr key={process.pid}>
                    <td>
                      <span className="text-sm text-slate-200">{process.name}</span>
                      <span className="ml-2 font-mono text-[10px] text-slate-600">{process.pid}</span>
                    </td>
                    <td>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em]', STATE_TONE[process.state])}>
                        {process.state.toLowerCase()}
                      </span>
                    </td>
                    <td className="font-mono text-slate-300">{process.state === 'TERMINATED' ? 0 : process.remaining}</td>
                    <td className="font-mono text-slate-400">{process.memoryStart === null ? '—' : `${process.memory} MB @ ${process.memoryStart}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Latest events" subtitle="Newest first, up to the playhead">
          {visibleEvents.length === 0 ? (
            <EmptyState message="Nothing has happened yet." hint="Move the playhead forward to watch the kernel wake up." />
          ) : (
            <ol className="scroll-fade max-h-96 space-y-1.5 overflow-y-auto pr-1">
              {visibleEvents.map((event) => (
                <li key={event.seq} className="group rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2 transition-colors hover:border-cyan-400/20 hover:bg-cyan-400/[0.03]">
                  <p className="flex items-center gap-2 font-mono text-[10px] text-cyan-400/80">
                    <span className="text-slate-600">#{event.seq}</span>
                    <span>t={event.timestamp}</span>
                    <span className="ml-auto truncate text-slate-600">{event.type}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{event.description}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Pause, Play, RotateCcw, SkipBack, SkipForward, Zap } from 'lucide-react';
import type { ChronoEvent } from '@/engine/events';
import { cn, fmtTime } from '@/components/ui';

const BUCKETS = 96;

export default function TimelineBar({
  endTime,
  time,
  setTime,
  playing,
  setPlaying,
  events,
  branchName,
  onFork,
}: {
  endTime: number;
  time: number;
  setTime: (time: number) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  events: ChronoEvent[];
  branchName: string;
  onFork: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const safeEnd = Math.max(endTime, 1);

  const buckets = useMemo(() => {
    const counts = new Array<number>(BUCKETS).fill(0);
    if (endTime <= 0) return counts;
    for (const event of events) {
      const index = Math.min(BUCKETS - 1, Math.max(0, Math.floor((event.timestamp / safeEnd) * BUCKETS)));
      counts[index] += 1;
    }
    const max = Math.max(...counts, 1);
    return counts.map((count) => count / max);
  }, [events, endTime, safeEnd]);

  const positionOf = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return time;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * endTime);
  };

  const stop = () => setPlaying(false);
  const clamp = (value: number) => Math.min(endTime, Math.max(0, value));
  const toggle = () => {
    if (!playing && time >= endTime) setTime(0);
    setPlaying(!playing);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (event.code === 'Space') {
        event.preventDefault();
        toggle();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stop();
        setTime(clamp(time + (event.shiftKey ? 10 : 1)));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stop();
        setTime(clamp(time - (event.shiftKey ? 10 : 1)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const progress = (time / safeEnd) * 100;
  const currentBucket = Math.min(BUCKETS - 1, Math.floor((time / safeEnd) * BUCKETS));

  return (
    <section className="sticky top-16 z-20 border-b border-white/[0.06] bg-[#090a0f]/85 backdrop-blur-2xl">
      <div className="mx-auto max-w-[1500px] px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stop();
                setTime(0);
              }}
              className="btn-icon"
              aria-label="Rewind to start"
              title="Rewind to start"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                stop();
                setTime(clamp(time - 1));
              }}
              className="btn-icon"
              aria-label="Step backward"
              title="Step backward (←)"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? 'Pause timeline' : 'Play timeline'}
              title="Play / pause (space)"
              className={cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ease-spring',
                playing
                  ? 'bg-accent text-slate-950 shadow-glow-lg'
                  : 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 hover:shadow-glow',
              )}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                stop();
                setTime(clamp(time + 1));
              }}
              className="btn-icon"
              aria-label="Step forward"
              title="Step forward (→)"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                stop();
                setTime(endTime);
              }}
              className="btn-icon"
              aria-label="Jump to end"
              title="Jump to end"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                stop();
                setTime(0);
              }}
              className="btn-icon hidden sm:inline-flex"
              aria-label="Jump to start"
              title="Jump to start"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={trackRef}
            role="slider"
            aria-label="Timeline position"
            aria-valuemin={0}
            aria-valuemax={endTime}
            aria-valuenow={time}
            tabIndex={0}
            onPointerDown={(event) => {
              stop();
              setTime(positionOf(event.clientX));
              setScrubbing(true);
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                /* synthetic or unsupported pointers still scrub without capture */
              }
            }}
            onPointerMove={(event) => {
              if (scrubbing) setTime(positionOf(event.clientX));
            }}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
            className="group relative h-16 flex-1 cursor-crosshair select-none overflow-hidden rounded-xl border border-white/[0.07] bg-[#0b0d14]/80 px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          >
            <div className="absolute inset-0 bg-fine-grid bg-[length:24px_24px] opacity-30" />
            <div className="relative flex h-full items-end gap-[2px]">
              {buckets.map((value, index) => {
                const isPast = index <= currentBucket;
                return (
                  <span
                    key={index}
                    className={cn(
                      'flex-1 rounded-sm transition-all duration-200',
                      isPast ? 'bg-cyan-400/80' : 'bg-slate-600/30',
                      index === currentBucket && 'bg-cyan-200 shadow-[0_0_12px_2px_rgba(0,240,255,0.5)]',
                    )}
                    style={{ height: `${Math.max(10, value * 100)}%` }}
                  />
                );
              })}
            </div>

            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-gradient-to-b from-cyan-200 via-cyan-400 to-cyan-400/10"
              style={{ left: `calc(${progress}% )` }}
            >
              <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-cyan-200 shadow-[0_0_14px_3px_rgba(0,240,255,0.65)]" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <div className="min-w-[124px] text-right">
              <p className="font-mono text-lg font-semibold leading-none text-white tabular-nums">
                {String(time).padStart(3, '0')}
                <span className="text-xs font-normal text-slate-500"> / {endTime}</span>
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {fmtTime(time)} · {branchName}
              </p>
            </div>
            <button type="button" onClick={onFork} className="btn-primary whitespace-nowrap px-3 py-2 text-xs">
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fork from this tick</span>
              <span className="sm:hidden">Fork</span>
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 pb-2 text-[10px] text-slate-600 sm:px-6">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          {events.length} recorded events
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 font-mono text-[9px] text-slate-500">space</kbd>
          play/pause
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 font-mono text-[9px] text-slate-500">←</kbd>
          <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 font-mono text-[9px] text-slate-500">→</kbd>
          step · hold shift for ×10
        </span>
        <span className="ml-auto hidden font-mono sm:inline">scrub the waveform to time-travel</span>
      </div>
    </section>
  );
}

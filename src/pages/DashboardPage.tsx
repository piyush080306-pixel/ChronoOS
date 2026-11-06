import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Cpu,
  GitBranch,
  Grid2X2,
  Layers,
  List,
  Plus,
  Search,
  Sparkles,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge, CardSkeleton, EmptyState, ErrorBanner, Metric, Skeleton, StatusDot, cn } from '@/components/ui';
import { deleteSimulation, listSimulations, type SimulationRow } from '@/lib/chronoRepository';

const PRESETS = [
  {
    key: 'rr',
    title: 'Round Robin',
    detail: '5 processes · quantum 2',
    icon: <Timer className="h-4 w-4" />,
    tone: 'text-cyan-300',
  },
  {
    key: 'sjf',
    title: 'Shortest Job First',
    detail: 'Non-preemptive · burst ordered',
    icon: <Layers className="h-4 w-4" />,
    tone: 'text-emerald-300',
  },
  {
    key: 'priority',
    title: 'Priority preemptive',
    detail: 'Lower number wins',
    icon: <Zap className="h-4 w-4" />,
    tone: 'text-amber-300',
  },
];

function readSet(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export default function DashboardPage() {
  const [rows, setRows] = useState<SimulationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => readSet('chronoos:bookmarks'));

  useEffect(() => {
    listSimulations()
      .then(setRows)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load simulations'));
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#vault') return;
    const id = window.setTimeout(() => {
      document.getElementById('vault')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(id);
  }, []);

  const toggleBookmark = (id: string) => {
    setBookmarks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem('chronoos:bookmarks', JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const remove = async (row: SimulationRow) => {
    if (!window.confirm(`Delete "${row.name}" and its whole timeline? This cannot be undone.`)) return;
    setBusyId(row.id);
    try {
      await deleteSimulation(row.id);
      setRows((current) => current?.filter((candidate) => candidate.id !== row.id) ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the simulation');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.config.cpu.algorithm.toLowerCase().includes(needle) ||
        row.id.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const totals = useMemo(() => {
    if (!rows) return null;
    const processes = rows.reduce((sum, row) => sum + row.config.processes.length, 0);
    const algorithms = new Set(rows.map((row) => row.config.cpu.algorithm));
    return { simulations: rows.length, processes, algorithms: algorithms.size, last: rows[0]?.created_at ?? null };
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1500px] animate-fade-in space-y-8 px-4 py-7 sm:px-6 lg:py-9">
      <section className="glass grain relative overflow-hidden">
        <div className="absolute inset-0 bg-fine-grid bg-grid opacity-40 [mask-image:linear-gradient(to_right,black,transparent_85%)]" />
        <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl" />

        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.45fr_1fr] lg:p-10">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-400/80">
              <StatusDot />
              Systems observatory
            </div>
            <h1 className="mt-4 max-w-xl text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              Time-travel debugging for <span className="text-glow text-cyan-300">operating systems</span>.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
              Run CPU, memory, disk and resource simulations, then rewind to any tick, fork alternate realities and inspect
              exactly why the kernel made each decision.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/new" className="btn-primary">
                <Plus className="h-4 w-4" />
                Launch simulation
              </Link>
              <button
                type="button"
                onClick={() => document.getElementById('vault')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="btn-ghost"
              >
                <Layers className="h-4 w-4" />
                Explore vault
              </button>
            </div>

            <div className="mt-8 grid max-w-lg grid-cols-3 gap-3 border-t border-white/[0.06] pt-5">
              {[
                { label: 'Kernel', value: 'deterministic' },
                { label: 'Schedulers', value: '16 algorithms' },
                { label: 'Branches', value: 'infinite forks' },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">{item.label}</p>
                  <p className="mt-1 font-mono text-xs text-slate-300">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between px-1">
              <p className="panel-title">Quick launch</p>
              <Sparkles className="h-3.5 w-3.5 text-cyan-400/60" />
            </div>
            <div className="mt-3 space-y-2">
              {PRESETS.map((preset) => (
                <Link
                  key={preset.key}
                  to={`/new?preset=${preset.key}`}
                  className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-all duration-200 ease-spring hover:border-cyan-400/25 hover:bg-cyan-400/[0.05]"
                >
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-black/40', preset.tone)}>
                    {preset.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-200 group-hover:text-white">{preset.title}</span>
                    <span className="block truncate text-[10px] text-slate-500">{preset.detail}</span>
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                </Link>
              ))}
            </div>
            <p className="mt-3 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">
              preset → opens the configurator
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals ? (
          <>
            <Metric label="Simulations" value={String(totals.simulations)} hint="stored in this workspace" icon={<GitBranch className="h-4 w-4" />} tone="cyan" />
            <Metric label="Processes modelled" value={String(totals.processes)} hint="across every timeline" icon={<Cpu className="h-4 w-4" />} />
            <Metric label="Schedulers used" value={String(totals.algorithms)} hint="distinct CPU algorithms" icon={<Sparkles className="h-4 w-4" />} tone="indigo" />
            <Metric
              label="Last activity"
              value={totals.last ? new Date(totals.last).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
              hint={totals.last ? new Date(totals.last).toLocaleTimeString() : 'no runs yet'}
              icon={<Timer className="h-4 w-4" />}
              tone="emerald"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="glass h-[104px] p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-16" />
              <Skeleton className="mt-2 h-2.5 w-24" />
            </div>
          ))
        )}
      </div>

      <section id="vault" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-white">Simulation vault</h2>
              {rows && <Badge tone="slate">{rows.length} runs</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-500">Every recorded timeline, ready to rewind or fork.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search runs, algorithms…"
                className="field h-9 w-56 pl-9 text-xs"
                aria-label="Search simulations"
              />
            </label>
            <div className="flex rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-pressed={view === 'grid'}
                aria-label="Grid view"
                className={cn('rounded-md p-1.5 transition-colors', view === 'grid' ? 'bg-white/[0.08] text-cyan-300' : 'text-slate-500 hover:text-slate-300')}
              >
                <Grid2X2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
                aria-label="List view"
                className={cn('rounded-md p-1.5 transition-colors', view === 'list' ? 'bg-white/[0.08] text-cyan-300' : 'text-slate-500 hover:text-slate-300')}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        {!filtered && !error && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        )}

        {filtered && rows && rows.length === 0 && (
          <div className="glass">
            <EmptyState
              icon={<GitBranch className="h-5 w-5" />}
              message="No simulations yet"
              hint="Launch a run to populate the vault. Every run is deterministic, so you can replay it exactly."
            />
            <div className="flex justify-center pb-10">
              <Link to="/new" className="btn-primary">
                <Plus className="h-4 w-4" /> Launch simulation
              </Link>
            </div>
          </div>
        )}

        {filtered && rows && rows.length > 0 && filtered.length === 0 && (
          <div className="glass">
            <EmptyState icon={<Search className="h-5 w-5" />} message={`No runs match “${query}”`} hint="Try a simulation name, an id prefix, or a CPU algorithm." />
          </div>
        )}

        {filtered && filtered.length > 0 && view === 'grid' && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((row) => {
              const bookmarked = bookmarks.has(row.id);
              return (
                <article key={row.id} className="group glass glass-hover relative flex flex-col overflow-hidden p-5">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-cyan-400/[0.06] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

                  <div className="flex items-start justify-between gap-3">
                    <span className="pill">
                      <StatusDot tone="emerald" pulse={false} />
                      ready
                      <span className="text-slate-600">·</span>
                      <span className="font-mono">{row.config.cpu.algorithm}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleBookmark(row.id)}
                      aria-label={bookmarked ? `Remove bookmark for ${row.name}` : `Bookmark ${row.name}`}
                      aria-pressed={bookmarked}
                      className={cn(
                        'rounded-lg p-1.5 transition-all duration-200',
                        bookmarked
                          ? 'text-cyan-300'
                          : 'text-slate-600 opacity-0 hover:bg-white/[0.06] hover:text-slate-300 group-hover:opacity-100 focus-visible:opacity-100',
                      )}
                    >
                      {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    </button>
                  </div>

                  <Link to={`/simulations/${row.id}`} className="mt-3 flex-1 focus-visible:outline-none">
                    <h3 className="truncate text-[15px] font-semibold tracking-tight text-slate-100 transition-colors group-hover:text-white">
                      {row.name}
                    </h3>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-600">sim/{row.id.slice(0, 8)}</p>
                  </Link>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <Badge>{new Date(row.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Badge>
                    <Badge>{row.config.processes.length} processes</Badge>
                    <Badge tone="indigo">{row.config.memory.totalMb} MB</Badge>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3">
                    <div className="flex items-center gap-1">
                      <Link to={`/simulations/${row.id}`} className="btn-icon h-8 w-8" aria-label={`Inspect ${row.name}`} title="Inspect timeline">
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                      <Link
                        to={`/simulations/${row.id}/branches`}
                        className="btn-icon h-8 w-8"
                        aria-label={`Fork ${row.name}`}
                        title="Fork alternate timeline"
                      >
                        <GitBranch className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void remove(row)}
                        disabled={busyId === row.id}
                        aria-label={`Delete ${row.name}`}
                        title="Delete simulation"
                        className="btn-icon h-8 w-8 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <Link to={`/simulations/${row.id}`} className="flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-cyan-300">
                      Inspect <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {filtered && filtered.length > 0 && view === 'list' && (
          <div className="glass divide-y divide-white/[0.05] overflow-hidden">
            {filtered.map((row) => (
              <div key={row.id} className="group flex flex-wrap items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.03] sm:px-5">
                <StatusDot tone="emerald" pulse={false} />
                <Link to={`/simulations/${row.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100 group-hover:text-white">{row.name}</p>
                  <p className="truncate font-mono text-[10px] text-slate-600">
                    sim/{row.id.slice(0, 8)} · {new Date(row.created_at).toLocaleString()}
                  </p>
                </Link>
                <div className="hidden items-center gap-2 sm:flex">
                  <Badge tone="cyan">{row.config.cpu.algorithm}</Badge>
                  <Badge>{row.config.processes.length} processes</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Link to={`/simulations/${row.id}`} className="btn-icon h-8 w-8" aria-label={`Inspect ${row.name}`}>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link to={`/simulations/${row.id}/branches`} className="btn-icon h-8 w-8" aria-label={`Fork ${row.name}`}>
                    <GitBranch className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    disabled={busyId === row.id}
                    aria-label={`Delete ${row.name}`}
                    className="btn-icon h-8 w-8 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: 'Deterministic replays',
            body: 'Every run is a pure function of its config. Rewind to any tick and the kernel state rebuilds byte-for-byte.',
            icon: <Timer className="h-4 w-4" />,
          },
          {
            title: 'Branch the timeline',
            body: 'Change the scheduler at tick 12 and compare both realities side by side without losing the original.',
            icon: <GitBranch className="h-4 w-4" />,
          },
          {
            title: 'Explain the why',
            body: 'Forensics translate raw events into plain-language findings: fragmentation, unsafe states, starvation.',
            icon: <Sparkles className="h-4 w-4" />,
          },
        ].map((feature) => (
          <div key={feature.title} className="glass p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300">
              {feature.icon}
            </span>
            <h3 className="mt-3 text-sm font-semibold text-slate-100">{feature.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{feature.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

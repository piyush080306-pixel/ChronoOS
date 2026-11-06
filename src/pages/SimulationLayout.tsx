import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  Cpu,
  GitBranch,
  HardDrive,
  History,
  LayoutDashboard,
  MemoryStick,
  Search,
  Terminal,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import TimelineBar from '@/components/TimelineBar';
import { Badge, ErrorBanner, LoadingLine, cn } from '@/components/ui';
import { SimulationContext } from '@/context/SimulationContext';
import type { BranchRow, SimulationRow } from '@/lib/chronoRepository';
import { loadBranchLog, loadSimulation } from '@/lib/chronoRepository';
import { reconstructState, toStoredPayload, type EngineLogBundle } from '@/lib/engineApi';
import type { ChronoState } from '@/engine/types';

const NAV = [
  { to: '', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: 'cpu', label: 'CPU', icon: Cpu },
  { to: 'memory', label: 'Memory', icon: MemoryStick },
  { to: 'disk', label: 'Disk', icon: HardDrive },
  { to: 'resources', label: 'Resources', icon: Boxes },
  { to: 'time', label: 'Time Machine', icon: History },
  { to: 'branches', label: 'Branches', icon: GitBranch },
  { to: 'forensics', label: 'Forensics', icon: Search },
  { to: 'events', label: 'Kernel Logs', icon: Terminal },
];

interface Loaded {
  simulation: SimulationRow;
  branches: BranchRow[];
}

const CPU_LABELS: Record<string, string> = {
  FCFS: 'First Come First Serve',
  SJF: 'Shortest Job First',
  SRTF: 'Shortest Remaining Time',
  PRIORITY_PREEMPTIVE: 'Priority · preemptive',
  PRIORITY_NONPREEMPTIVE: 'Priority · non-preemptive',
  RR: 'Round Robin',
};

export default function SimulationLayout() {
  const { simId = '' } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<EngineLogBundle | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [state, setState] = useState<ChronoState | null>(null);
  const [stateLoading, setStateLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await loadSimulation(simId);
      if (!result) {
        setNotFound(true);
        return;
      }
      setLoaded(result);
      setActiveBranchId((current) => current ?? result.branches[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the simulation');
    }
  }, [simId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeBranch = loaded?.branches.find((branch) => branch.id === activeBranchId) ?? null;

  useEffect(() => {
    if (!loaded || !activeBranch) return;
    let cancelled = false;
    setBundle(null);
    loadBranchLog(loaded.simulation, activeBranch)
      .then((result) => {
        if (!cancelled) setBundle(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load the timeline');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, activeBranch?.id]);

  const endTime = bundle?.log.endTime ?? 0;
  const stored = useMemo(() => (bundle ? toStoredPayload(bundle.log) : null), [bundle]);

  useEffect(() => {
    if (!bundle) return;
    setPlaying(false);
    setTime(bundle.log.endTime);
    setState(bundle.log.finalState);
    setStateLoading(false);
  }, [bundle]);

  useEffect(() => {
    if (!stored) return;
    let cancelled = false;
    setStateLoading(true);
    reconstructState(stored, time)
      .then((next) => {
        if (!cancelled) {
          setState(next);
          setStateLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setStateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stored, time]);

  useEffect(() => {
    if (!playing || !bundle) return;
    const id = window.setInterval(() => {
      setTime((current) => Math.min(current + 1, bundle.log.endTime));
    }, 140);
    return () => window.clearInterval(id);
  }, [playing, bundle]);

  useEffect(() => {
    if (playing && time >= endTime) setPlaying(false);
  }, [playing, time, endTime]);

  if (notFound) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="glass p-8 text-center">
            <p className="text-lg font-semibold text-white">Timeline not found</p>
            <p className="mt-2 text-sm text-slate-400">This simulation does not exist, or its local vault entry was cleared.</p>
            <Link to="/" className="btn-primary mt-6">
              Back to simulations
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-6 py-16">
          <ErrorBanner message={error} />
        </div>
      </AppShell>
    );
  }

  if (!loaded || !activeBranch || !bundle) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[1500px] px-6 py-10">
          <div className="glass p-6">
            <LoadingLine label="Reconstructing the timeline from recorded events" />
          </div>
        </div>
      </AppShell>
    );
  }

  const simulation = loaded.simulation;
  const firstEvent = bundle.log.events[0];
  const openedAt = firstEvent ? new Date(simulation.created_at).toLocaleString() : '—';

  return (
    <AppShell>
      <SimulationContext.Provider
        value={{
          simulation,
          branches: loaded.branches,
          activeBranch,
          log: bundle.log,
          analysis: bundle.analysis,
          setActiveBranchId,
          refresh,
          time,
          endTime,
          setTime,
          playing,
          setPlaying,
          state: state ?? bundle.log.finalState,
          stateLoading,
        }}
      >
        <div className="border-b border-white/[0.06] bg-[#0b0d14]/50">
          <div className="mx-auto max-w-[1500px] px-4 pt-5 sm:px-6">
            <div className="flex flex-wrap items-start gap-4">
              <Link
                to="/"
                className="btn-icon mt-0.5"
                aria-label="Back to simulations"
                title="Back to simulations"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">{simulation.name}</h1>
                  <Badge tone="cyan" dot>
                    {simulation.config.cpu.algorithm}
                  </Badge>
                  <Badge tone="slate">{simulation.config.processes.length} processes</Badge>
                  <Badge tone={bundle.analysis.findings.some((finding) => finding.severity === 'critical') ? 'rose' : 'emerald'}>
                    {bundle.analysis.findings.some((finding) => finding.severity === 'critical') ? 'attention needed' : 'nominal'}
                  </Badge>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                  <span className="font-mono uppercase tracking-[0.12em] text-slate-600">sim/{simulation.id.slice(0, 8)}</span>
                  <span className="text-slate-700">·</span>
                  <span>{CPU_LABELS[simulation.config.cpu.algorithm] ?? simulation.config.cpu.algorithm}</span>
                  <span className="text-slate-700">·</span>
                  <span>created {openedAt}</span>
                  <span className="text-slate-700">·</span>
                  <span className="font-mono">runs to t={bundle.log.endTime}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                  <GitBranch className="h-3.5 w-3.5 text-cyan-400/70" />
                  <span className="hidden sm:inline">Branch</span>
                  <select
                    value={activeBranch.id}
                    onChange={(event) => {
                      setPlaying(false);
                      setActiveBranchId(event.target.value);
                    }}
                    className="max-w-[160px] bg-transparent text-xs font-medium text-slate-200 focus:outline-none"
                    aria-label="Active branch"
                  >
                    {loaded.branches.map((branch) => (
                      <option key={branch.id} value={branch.id} className="bg-[#0b0d14]">
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => navigate(`/simulations/${simulation.id}/branches`)}
                  className="btn-ghost hidden px-3 py-2 text-xs sm:inline-flex"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Branches
                </button>
              </div>
            </div>

            <nav className="mt-5 flex gap-1 overflow-x-auto pb-0 no-scrollbar" aria-label="Workspace sections">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-[13px] transition-all duration-200',
                        isActive
                          ? 'border-cyan-400 bg-cyan-400/[0.06] text-cyan-200'
                          : 'border-transparent text-slate-500 hover:bg-white/[0.03] hover:text-slate-300',
                      )
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>

        <TimelineBar
          endTime={endTime}
          time={time}
          setTime={setTime}
          playing={playing}
          setPlaying={setPlaying}
          events={bundle.log.events}
          branchName={activeBranch.name}
          onFork={() => navigate(`/simulations/${simulation.id}/branches`)}
        />

        <main className="mx-auto max-w-[1500px] animate-fade-in px-4 py-7 sm:px-6">
          <Outlet />
        </main>
      </SimulationContext.Provider>
    </AppShell>
  );
}

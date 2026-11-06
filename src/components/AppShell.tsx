import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  Command,
  Cpu,
  Database,
  History,
  Keyboard,
  LayoutDashboard,
  Menu,
  Plus,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
} from 'lucide-react';
import { cn, StatusDot } from '@/components/ui';
import { supabaseEnabled } from '@/lib/supabase';

function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex h-9 w-9 items-center justify-center', className)}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="brand-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00F0FF" />
            <stop offset="100%" stopColor="#4F46E5" />
          </linearGradient>
        </defs>
        <path
          d="M20 3.6 34.1 11.8v16.4L20 36.4 5.9 28.2V11.8z"
          fill="rgba(0,240,255,0.06)"
          stroke="url(#brand-stroke)"
          strokeWidth="1.3"
        />
      </svg>
      <svg viewBox="0 0 40 40" className="relative h-5 w-5 text-accent" aria-hidden="true">
        <path
          d="M8 20h4l2.5-6.5L19 26l3-9 2 3h8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pulse-dot"
        />
      </svg>
    </span>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
      {children}
    </kbd>
  );
}

interface NavItem {
  label: string;
  icon: ReactNode;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('chronoos:sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const path = location.pathname;
  const segments = path.split('/').filter(Boolean);
  const simId = segments[0] === 'simulations' ? segments[1] : null;
  const simPath = simId ? `/simulations/${simId}` : null;
  const deepSegment = simId ? segments[2] : null;

  useEffect(() => {
    try {
      window.localStorage.setItem('chronoos:sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* storage can be blocked */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!paletteOpen && !settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, settingsOpen]);

  const workspacePages = useMemo(
    () =>
      simPath
        ? [
            { label: 'Overview', to: simPath },
            { label: 'CPU scheduler', to: `${simPath}/cpu` },
            { label: 'Memory', to: `${simPath}/memory` },
            { label: 'Disk I/O', to: `${simPath}/disk` },
            { label: 'Resources', to: `${simPath}/resources` },
            { label: 'Time machine', to: `${simPath}/time` },
            { label: 'Branches', to: `${simPath}/branches` },
            { label: 'Forensics', to: `${simPath}/forensics` },
            { label: 'Kernel logs', to: `${simPath}/events` },
          ]
        : [],
    [simPath],
  );

  const navItems: NavItem[] = [
    {
      label: 'Simulations',
      icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
      to: '/',
      active: path === '/' || path === '/new',
    },
    {
      label: 'Timeline Vault',
      icon: <Boxes className="h-[18px] w-[18px]" />,
      to: '/#vault',
      onClick: () => {
        if (path === '/') {
          document.getElementById('vault')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          navigate('/#vault');
        }
      },
    },
    {
      label: 'Telemetry',
      icon: <Activity className="h-[18px] w-[18px]" />,
      to: simPath ?? undefined,
      active: Boolean(simPath) && !deepSegment,
      disabled: !simPath,
      hint: simPath ? undefined : 'Open a simulation to inspect telemetry',
    },
    {
      label: 'Kernel Logs',
      icon: <TerminalSquare className="h-[18px] w-[18px]" />,
      to: simPath ? `${simPath}/events` : undefined,
      active: deepSegment === 'events',
      disabled: !simPath,
      hint: simPath ? undefined : 'Open a simulation to read kernel logs',
    },
  ];

  const crumb = useMemo(() => {
    if (path === '/') return ['Workspace', 'Simulations'];
    if (path === '/new') return ['Simulations', 'New simulation'];
    if (simId) {
      const labels: Record<string, string> = {
        cpu: 'CPU scheduler',
        memory: 'Memory',
        disk: 'Disk I/O',
        resources: 'Resources',
        time: 'Time machine',
        branches: 'Branches',
        forensics: 'Forensics',
        events: 'Kernel logs',
      };
      return deepSegment ? ['Simulations', labels[deepSegment] ?? 'Workspace'] : ['Simulations', 'Workspace'];
    }
    return ['Workspace'];
  }, [path, simId, deepSegment]);

  const commands = useMemo(
    () => [
      { label: 'New simulation', hint: 'Launch a new run', to: '/new', icon: <Plus className="h-4 w-4" /> },
      { label: 'All simulations', hint: 'Back to the vault', to: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
      ...workspacePages.map((page) => ({
        label: page.label,
        hint: 'Workspace',
        to: page.to,
        icon: <Cpu className="h-4 w-4" />,
      })),
      { label: 'Open settings', hint: 'Environment & storage', action: () => setSettingsOpen(true), icon: <Settings className="h-4 w-4" /> },
    ],
    [workspacePages],
  );

  const sidebarWidth = collapsed ? 'lg:w-[76px]' : 'lg:w-[248px]';

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-[-10%] h-[420px] w-[420px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
        <div className="absolute right-[-10%] top-[10%] h-[380px] w-[380px] rounded-full bg-indigo-600/[0.10] blur-[120px]" />
        <div className="absolute bottom-[-20%] left-1/3 h-[420px] w-[420px] rounded-full bg-emerald-500/[0.05] blur-[140px]" />
        <div className="absolute inset-0 bg-fine-grid bg-grid opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
      </div>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-white/[0.06] bg-[#0a0b11]/95 backdrop-blur-2xl transition-all duration-300 ease-spring lg:translate-x-0',
          sidebarWidth,
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className={cn('flex h-16 items-center gap-2.5 border-b border-white/[0.06] px-4', collapsed && 'lg:justify-center lg:px-0')}>
          <BrandMark />
          <div className={cn('min-w-0 flex-1 leading-tight', collapsed && 'lg:hidden')}>
            <p className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-white">
              ChronoOS
              <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-1 py-px font-mono text-[9px] font-medium text-cyan-300">
                2.4
              </span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-600">Time-travel kernel</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="btn-icon h-8 w-8 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className={cn('px-2.5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600', collapsed && 'lg:hidden')}>
            Observatory
          </p>
          {navItems.map((item) => {
            const content = (
              <>
                <span className={cn('shrink-0 transition-colors', item.active ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300')}>
                  {item.icon}
                </span>
                <span className={cn('flex-1 truncate', collapsed && 'lg:hidden')}>{item.label}</span>
                {item.active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_2px_rgba(0,240,255,0.5)]" />}
              </>
            );
            const base = cn(
              'group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-all duration-200 ease-spring',
              collapsed && 'lg:justify-center lg:px-0',
              item.active
                ? 'border border-cyan-400/20 bg-gradient-to-r from-cyan-400/[0.12] to-transparent text-cyan-100'
                : item.disabled
                  ? 'cursor-not-allowed border border-transparent text-slate-600'
                  : 'border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
            );

            if (item.disabled) {
              return (
                <span key={item.label} title={item.hint} className={base} aria-disabled="true">
                  {content}
                </span>
              );
            }
            return (
              <Link
                key={item.label}
                to={item.to ?? '/'}
                onClick={item.onClick}
                title={collapsed ? item.label : undefined}
                className={base}
              >
                {content}
              </Link>
            );
          })}

          <div className="pt-5">
            <p className={cn('px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600', collapsed && 'lg:hidden')}>
              Workspace
            </p>
            {workspacePages.length === 0 ? (
              <div className={cn('rounded-xl border border-dashed border-white/[0.07] px-3 py-3 text-[11px] leading-relaxed text-slate-600', collapsed && 'lg:hidden')}>
                Open a simulation to unlock timeline telemetry.
              </div>
            ) : (
              workspacePages.map((page) => (
                <Link
                  key={page.to}
                  to={page.to}
                  title={collapsed ? page.label : undefined}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                    collapsed && 'lg:justify-center lg:px-0',
                    path === page.to ? 'text-cyan-300' : 'text-slate-500 hover:text-slate-200',
                  )}
                >
                  <span className={cn('h-1 w-1 shrink-0 rounded-full', path === page.to ? 'bg-cyan-400' : 'bg-slate-700 group-hover:bg-slate-500')} />
                  <span className={cn('truncate', collapsed && 'lg:hidden')}>{page.label}</span>
                </Link>
              ))
            )}
          </div>
        </nav>

        <div className="space-y-2 border-t border-white/[0.06] p-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-100',
              collapsed && 'lg:justify-center lg:px-0',
            )}
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings className="h-[18px] w-[18px] text-slate-500 group-hover:text-slate-300" />
            <span className={cn('flex-1 text-left', collapsed && 'lg:hidden')}>Settings</span>
            <Kbd>⌘,</Kbd>
          </button>

          <div className={cn('flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2', collapsed && 'lg:justify-center lg:border-0 lg:bg-transparent lg:px-0')}>
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/30 to-indigo-500/40 text-[11px] font-semibold text-cyan-100 ring-1 ring-white/10">
              PV
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0b11] bg-emerald-400" />
            </span>
            <div className={cn('min-w-0 flex-1 leading-tight', collapsed && 'lg:hidden')}>
              <p className="truncate text-xs font-medium text-slate-200">Local workspace</p>
              <p className="truncate text-[10px] text-slate-500">Owner · offline-first</p>
            </div>
            <ShieldCheck className={cn('h-4 w-4 text-emerald-400/70', collapsed && 'lg:hidden')} />
          </div>

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={cn(
              'hidden w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition-colors hover:text-slate-300 lg:flex',
              collapsed && 'lg:justify-center lg:px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            <span className={cn(collapsed && 'lg:hidden')}>Collapse</span>
            {!collapsed && <span className="ml-auto font-mono text-[10px] text-slate-700">[</span>}
          </button>
        </div>
      </aside>

      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-300 ease-spring', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]')}>
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#090a0f]/75 backdrop-blur-2xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="btn-icon lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>

            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden items-center gap-2 text-slate-600 sm:flex">
                <History className="h-3.5 w-3.5" />
                <span className="text-[11px] uppercase tracking-[0.16em]">ChronoOS</span>
                <span className="text-slate-700">/</span>
              </span>
              {crumb.map((item, index) => (
                <span key={`${item}-${index}`} className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'truncate',
                      index === crumb.length - 1 ? 'font-medium text-slate-200' : 'text-slate-500',
                      index === 0 && 'hidden sm:inline',
                    )}
                  >
                    {item}
                  </span>
                  {index < crumb.length - 1 && <span className="text-slate-700">/</span>}
                </span>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 text-[11px] font-medium text-emerald-300 md:flex">
                <StatusDot tone="emerald" />
                <span>Engine nominal</span>
                <span className="text-emerald-400/40">·</span>
                <span className="font-mono text-[10px] text-emerald-400/80">60Hz tick</span>
              </div>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200 md:flex"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Search</span>
                <Kbd>⌘K</Kbd>
              </button>

              {path !== '/new' && (
                <div className="laser-frame shadow-glow">
                  <Link
                    to="/new"
                    className="inline-flex items-center gap-1.5 rounded-[15px] bg-[#0b0d14] px-3.5 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100 sm:px-4"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">New simulation</span>
                    <span className="sm:hidden">New</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-white/[0.05] px-6 py-5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
            <p className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-500/60" />
              ChronoOS v2.4 · deterministic scheduling kernel
            </p>
            <p className="flex items-center gap-3 font-mono">
              <span>{supabaseEnabled ? 'storage: supabase' : 'storage: local'}</span>
              <span className="text-slate-700">·</span>
              <span>engine: in-browser</span>
            </p>
          </div>
        </footer>
      </div>

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setPaletteOpen(false)}
          onRun={(command) => {
            setPaletteOpen(false);
            if (command.action) command.action();
            else if (command.to) navigate(command.to);
          }}
        />
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function CommandPalette({
  commands,
  onClose,
  onRun,
}: {
  commands: Array<{ label: string; hint: string; to?: string; action?: () => void; icon: ReactNode }>;
  onClose: () => void;
  onRun: (command: { label: string; hint: string; to?: string; action?: () => void; icon: ReactNode }) => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-md" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-xl animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d14]/95 shadow-lift backdrop-blur-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
          <Search className="h-4 w-4 text-cyan-400/70" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor((value) => Math.min(value + 1, Math.max(filtered.length - 1, 0)));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor((value) => Math.max(value - 1, 0));
              }
              if (event.key === 'Enter' && filtered[cursor]) onRun(filtered[cursor]);
            }}
            placeholder="Jump to a page or action…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
          />
          <Kbd>ESC</Kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">No matches for “{query}”.</li>}
          {filtered.map((command, index) => (
            <li key={`${command.label}-${index}`}>
              <button
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => onRun(command)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  index === cursor ? 'bg-cyan-400/10 text-cyan-100' : 'text-slate-300 hover:bg-white/[0.04]',
                )}
              >
                <span className={cn('shrink-0', index === cursor ? 'text-cyan-300' : 'text-slate-500')}>{command.icon}</span>
                <span className="flex-1 truncate">{command.label}</span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{command.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2 text-[10px] text-slate-600">
          <span className="flex items-center gap-2">
            <Command className="h-3 w-3" /> ChronoOS command bar
          </span>
          <span className="flex items-center gap-2">
            <Keyboard className="h-3 w-3" />
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <Kbd>↵</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [cleared, setCleared] = useState(false);

  const reset = () => {
    try {
      window.localStorage.removeItem('chronoos:database:v1');
      setCleared(true);
      window.setTimeout(() => window.location.reload(), 600);
    } catch {
      setCleared(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ChronoOS settings"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-lg animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d14]/95 shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Workspace settings</h2>
            <p className="text-[11px] text-slate-500">Environment, engine and storage</p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon h-8 w-8" aria-label="Close settings">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          {[
            { icon: <Cpu className="h-4 w-4" />, label: 'Simulation engine', value: 'In-browser TypeScript kernel', tone: 'text-emerald-300' },
            { icon: <Database className="h-4 w-4" />, label: 'Persistence', value: supabaseEnabled ? 'Supabase project' : 'Browser local storage', tone: 'text-cyan-300' },
            { icon: <ScrollText className="h-4 w-4" />, label: 'Version', value: 'ChronoOS 2.4.0 Pro', tone: 'text-indigo-300' },
            { icon: <Activity className="h-4 w-4" />, label: 'Tick rate', value: '60 Hz deterministic', tone: 'text-emerald-300' },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <span className="text-slate-500">{row.icon}</span>
              <span className="flex-1 text-sm text-slate-300">{row.label}</span>
              <span className={cn('text-xs font-medium', row.tone)}>{row.value}</span>
            </div>
          ))}
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
            <p className="text-xs font-medium text-rose-200">Danger zone</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Removes every simulation, branch and recorded event stored in this browser. This cannot be undone.
            </p>
            <button type="button" onClick={reset} className="btn mt-3 border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-400/20">
              {cleared ? 'Cleared — reloading…' : 'Reset local workspace'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

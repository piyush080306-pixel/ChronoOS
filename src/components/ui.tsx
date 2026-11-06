import type { ReactNode } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type Tone = 'slate' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo';

const TONE_TEXT: Record<Tone, string> = {
  slate: 'text-slate-300',
  cyan: 'text-cyan-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
  indigo: 'text-indigo-300',
};

const TONE_BADGE: Record<Tone, string> = {
  slate: 'border-white/10 bg-white/[0.04] text-slate-400',
  cyan: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300',
  emerald: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  rose: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  indigo: 'border-indigo-400/25 bg-indigo-400/10 text-indigo-300',
};

const TONE_GLOW: Record<Tone, string> = {
  slate: '',
  cyan: 'shadow-[0_0_28px_rgba(0,240,255,0.08)]',
  emerald: 'shadow-[0_0_28px_rgba(0,255,133,0.08)]',
  amber: 'shadow-[0_0_28px_rgba(255,184,0,0.08)]',
  rose: 'shadow-[0_0_28px_rgba(244,63,94,0.08)]',
  indigo: 'shadow-[0_0_28px_rgba(99,102,241,0.08)]',
};

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('glass relative overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = 'slate',
  mono = true,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  mono?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:border-cyan-400/25 hover:bg-white/[0.04]',
        TONE_GLOW[tone],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {icon && <span className={cn('opacity-60 transition-opacity group-hover:opacity-100', TONE_TEXT[tone])}>{icon}</span>}
      </div>
      <p className={cn('mt-2 truncate text-2xl font-semibold tracking-tight', TONE_TEXT[tone], mono && 'font-mono tabular-nums')}>
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ message, icon, hint }: { message: string; icon?: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-500">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-300">{message}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-200 shadow-[0_0_24px_rgba(244,63,94,0.08)]"
    >
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

export function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <span className="relative flex h-9 w-9 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-cyan-400/40" />
        <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-glow" />
      </span>
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

export function CardSkeleton() {
  return (
    <div className="glass space-y-4 p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-5 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'slate', dot = false }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium', TONE_BADGE[tone])}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'emerald' ? 'bg-emerald-400' : tone === 'amber' ? 'bg-amber-400' : tone === 'rose' ? 'bg-rose-400' : 'bg-cyan-400')} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone = 'emerald', pulse = true }: { tone?: Tone; pulse?: boolean }) {
  const color =
    tone === 'emerald' ? 'bg-emerald-400' : tone === 'amber' ? 'bg-amber-400' : tone === 'rose' ? 'bg-rose-400' : 'bg-cyan-400';
  return (
    <span className="relative flex h-2 w-2">
      {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color)} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-400/80">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toFixed(digits);
}

export function fmtTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export const SEVERITY_STYLES = {
  info: 'border-sky-400/25 bg-sky-400/[0.06] text-sky-200',
  warning: 'border-amber-400/25 bg-amber-400/[0.06] text-amber-200',
  critical: 'border-rose-400/30 bg-rose-400/[0.07] text-rose-200',
} as const;

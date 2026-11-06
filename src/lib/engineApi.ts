import { computeAnalytics, type Analytics } from '@/engine/analytics';
import type { ChronoEvent } from '@/engine/events';
import { explain, type Finding } from '@/engine/forensics';
import { createDefaultConfig } from '@/engine/presets';
import {
  forkSimulation,
  logFromStored,
  reconstructAt,
  runSimulation,
  type SimulationLog,
  type Snapshot,
} from '@/engine/simulator';
import type { BranchOverrides, ChronoState, SimulationConfig } from '@/engine/types';

export interface LogAnalysis {
  analytics: Analytics;
  findings: Finding[];
}

export interface EngineLogBundle {
  log: SimulationLog;
  analysis: LogAnalysis;
}

export interface StoredLogPayload {
  config: SimulationConfig;
  events: ChronoEvent[];
  snapshots: Snapshot[];
}

/**
 * The engine runs in the browser by default so the app works with a single
 * `npm run dev` (no Python service to start). If VITE_ENGINE_URL points at the
 * optional Python engine, requests are proxied to it instead.
 */
const ENGINE_BASE = ((import.meta.env.VITE_ENGINE_URL as string | undefined) ?? '').trim().replace(/\/+$/, '');

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ENGINE_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new Error('The simulation engine is not reachable. Unset VITE_ENGINE_URL to run it in the browser.');
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`The simulation engine returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) {
    const error = payload as { error?: string; details?: string[] } | null;
    const details = error?.details?.length ? `: ${error.details.join('; ')}` : '';
    throw new Error(`${error?.error ?? `Engine request failed (${response.status})`}${details}`);
  }
  return payload as T;
}

function analyse(log: SimulationLog): LogAnalysis {
  return {
    analytics: computeAnalytics(log.finalState, log.endTime),
    findings: explain(log.events),
  };
}

function bundle(log: SimulationLog): EngineLogBundle {
  return { log, analysis: analyse(log) };
}

function storedToLog(stored: StoredLogPayload): SimulationLog {
  if (!stored || !stored.config || !Array.isArray(stored.events)) {
    throw new Error('This timeline is missing its saved configuration or events.');
  }
  return logFromStored(stored.config, stored.events, Array.isArray(stored.snapshots) ? stored.snapshots : []);
}

export async function fetchDefaultConfig(): Promise<SimulationConfig> {
  if (!ENGINE_BASE) return createDefaultConfig();
  const payload = await requestJson<{ config: SimulationConfig }>('/api/presets/default', { method: 'GET' });
  if (!payload?.config) throw new Error('The engine returned no default configuration.');
  return payload.config;
}

export async function runSimulationRemote(config: SimulationConfig): Promise<EngineLogBundle> {
  if (!ENGINE_BASE) return bundle(runSimulation(config));
  return postJson<EngineLogBundle>('/api/simulations/run', { config });
}

export async function hydrateLog(stored: StoredLogPayload): Promise<EngineLogBundle> {
  if (!ENGINE_BASE) return bundle(storedToLog(stored));
  return postJson<EngineLogBundle>('/api/logs/hydrate', stored);
}

export async function forkLog(stored: StoredLogPayload, overrides: BranchOverrides, time: number): Promise<EngineLogBundle> {
  if (!ENGINE_BASE) return bundle(forkSimulation(storedToLog(stored), overrides, time));
  return postJson<EngineLogBundle>('/api/logs/fork', { ...stored, overrides, time });
}

export async function reconstructState(stored: StoredLogPayload, time: number): Promise<ChronoState> {
  if (!ENGINE_BASE) return reconstructAt(storedToLog(stored), time);
  const payload = await postJson<{ state: ChronoState }>('/api/logs/reconstruct', { ...stored, time });
  if (!payload?.state) throw new Error('The engine returned no state for this moment.');
  return payload.state;
}

export function toStoredPayload(log: SimulationLog): StoredLogPayload {
  return { config: log.config, events: log.events, snapshots: log.snapshots };
}

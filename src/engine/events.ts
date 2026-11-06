import type { HeadDirection, MemoryAlgorithm } from './types';

interface EventBase<T extends string, P> {
  type: T;
  timestamp: number;
  processId: string | null;
  resourceId: string | null;
  payload: P;
  description: string;
}

export type ChronoEventDraft =
  | EventBase<'PROCESS_CREATED', { arrival: number; burst: number; priority: number; memory: number }>
  | EventBase<'PROCESS_ARRIVED', Record<string, never>>
  | EventBase<'PROCESS_READY', { reason: 'ADMITTED' | 'PREEMPTED' | 'QUANTUM_EXPIRED'; remaining: number }>
  | EventBase<'PROCESS_RUNNING', { remaining: number }>
  | EventBase<'PROCESS_WAITING', { reason: 'MEMORY' }>
  | EventBase<'PROCESS_TERMINATED', { turnaround: number; waiting: number }>
  | EventBase<'CPU_CONTEXT_SWITCH', { from: string; to: string }>
  | EventBase<'CPU_IDLE', Record<string, never>>
  | EventBase<'MEMORY_ALLOCATED', { start: number; size: number; algorithm: MemoryAlgorithm }>
  | EventBase<'MEMORY_RELEASED', { start: number; size: number }>
  | EventBase<'MEMORY_ALLOCATION_FAILED', { size: number; totalFree: number; largestFree: number }>
  | EventBase<'DISK_REQUEST_CREATED', { cylinder: number; arrival: number }>
  | EventBase<
      'DISK_HEAD_MOVED',
      { from: number; to: number; distance: number; direction: HeadDirection; kind: 'SEEK' | 'TRAVEL' | 'JUMP' }
    >
  | EventBase<'DISK_REQUEST_COMPLETED', { cylinder: number; arrival: number; completion: number }>
  | EventBase<'RESOURCE_REQUEST_ISSUED', { scriptIndex: number; vector: number[] }>
  | EventBase<'RESOURCE_RELEASE_ISSUED', { scriptIndex: number; vector: number[] }>
  | EventBase<'RESOURCE_ALLOCATED', { vector: number[]; fromWaiting: boolean }>
  | EventBase<'RESOURCE_RELEASED', { vector: number[] }>
  | EventBase<'RESOURCE_REQUEST_BLOCKED', { vector: number[]; reason: string }>
  | EventBase<'RESOURCE_REJECTED', { vector: number[]; reason: string }>
  | EventBase<'RESOURCE_SAFETY_CHECKED', { safe: boolean; sequence: string[] }>
  | EventBase<'DEADLOCK_DETECTED', { pids: string[] }>;

export type EventType = ChronoEventDraft['type'];

export type ChronoEvent = ChronoEventDraft & { seq: number };

export const EVENT_TYPES: EventType[] = [
  'PROCESS_CREATED',
  'PROCESS_ARRIVED',
  'PROCESS_READY',
  'PROCESS_RUNNING',
  'PROCESS_WAITING',
  'PROCESS_TERMINATED',
  'CPU_CONTEXT_SWITCH',
  'CPU_IDLE',
  'MEMORY_ALLOCATED',
  'MEMORY_RELEASED',
  'MEMORY_ALLOCATION_FAILED',
  'DISK_REQUEST_CREATED',
  'DISK_HEAD_MOVED',
  'DISK_REQUEST_COMPLETED',
  'RESOURCE_REQUEST_ISSUED',
  'RESOURCE_RELEASE_ISSUED',
  'RESOURCE_ALLOCATED',
  'RESOURCE_RELEASED',
  'RESOURCE_REQUEST_BLOCKED',
  'RESOURCE_REJECTED',
  'RESOURCE_SAFETY_CHECKED',
  'DEADLOCK_DETECTED',
];

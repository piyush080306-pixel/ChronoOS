import type { ChronoEvent } from './events';

export type Severity = 'info' | 'warning' | 'critical';

export interface Finding {
  seq: number;
  time: number;
  severity: Severity;
  title: string;
  detail: string;
}

const BLOCK_REASONS: Record<string, string> = {
  UNSAFE_STATE: 'Avoided deadlock: granting it would leave the system in an unsafe state',
  INSUFFICIENT_AVAILABLE: 'Waiting: not enough free instances of the resource',
};

export function explain(events: ChronoEvent[]): Finding[] {
  const findings: Finding[] = [];
  const add = (event: ChronoEvent, severity: Severity, title: string, detail: string) =>
    findings.push({ seq: event.seq, time: event.timestamp, severity, title, detail });

  const latencies = events
    .filter((event) => event.type === 'DISK_REQUEST_COMPLETED')
    .map((event) => (event.type === 'DISK_REQUEST_COMPLETED' ? event.payload.completion - event.payload.arrival : 0));
  const averageLatency = latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;

  for (const event of events) {
    switch (event.type) {
      case 'PROCESS_WAITING':
        add(event, 'warning', `${event.processId} is waiting for memory`, event.description);
        break;
      case 'MEMORY_ALLOCATION_FAILED': {
        const { size, totalFree, largestFree } = event.payload;
        if (totalFree >= size) {
          add(
            event,
            'critical',
            'External fragmentation blocked an allocation',
            `${totalFree} MB is free in total, but the largest contiguous hole is ${largestFree} MB, so a ${size} MB request fails.`,
          );
        } else {
          add(event, 'warning', 'Memory exhausted', `Only ${totalFree} MB is free and ${size} MB was requested.`);
        }
        break;
      }
      case 'RESOURCE_REQUEST_BLOCKED':
        add(
          event,
          event.payload.reason === 'UNSAFE_STATE' ? 'warning' : 'info',
          `${event.processId} request blocked`,
          BLOCK_REASONS[event.payload.reason] ?? event.description,
        );
        break;
      case 'RESOURCE_REJECTED':
        add(event, 'info', `${event.processId} request rejected`, event.payload.reason);
        break;
      case 'DEADLOCK_DETECTED':
        add(
          event,
          'critical',
          'Deadlock',
          `Processes ${event.payload.pids.join(', ')} are waiting on each other and can never proceed.`,
        );
        break;
      case 'CPU_IDLE':
        add(event, 'info', 'CPU idle', `No process was ready at t=${event.timestamp}.`);
        break;
      case 'DISK_REQUEST_COMPLETED': {
        const latency = event.payload.completion - event.payload.arrival;
        if (latencies.length >= 3 && latency >= 2 * averageLatency && latency >= 10) {
          add(
            event,
            'warning',
            `Starved disk request ${event.resourceId}`,
            `Cylinder ${event.payload.cylinder} waited ${latency} time units, over twice the average of ${averageLatency.toFixed(1)}.`,
          );
        }
        break;
      }
      default:
        break;
    }
  }
  return findings;
}

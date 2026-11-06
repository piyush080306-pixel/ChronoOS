import type { Recorder } from '../recorder';
import type { DiskRequestState, HeadDirection, SimulationConfig } from '../types';

type MoveKind = 'SEEK' | 'TRAVEL' | 'JUMP';

interface Stop {
  to: number;
  kind: MoveKind;
  direction: HeadDirection;
}

interface Plan {
  stops: Stop[];
  target: DiskRequestState;
}

function opposite(direction: HeadDirection): HeadDirection {
  return direction === 'UP' ? 'DOWN' : 'UP';
}

function ahead(requests: DiskRequestState[], position: number, direction: HeadDirection): DiskRequestState[] {
  return requests.filter((request) =>
    direction === 'UP' ? request.cylinder >= position : request.cylinder <= position,
  );
}

function nearest(requests: DiskRequestState[], position: number): DiskRequestState {
  let best = requests[0];
  for (const request of requests.slice(1)) {
    if (Math.abs(request.cylinder - position) < Math.abs(best.cylinder - position)) best = request;
  }
  return best;
}

function nearestInSweep(requests: DiskRequestState[], position: number, direction: HeadDirection): DiskRequestState {
  const candidates = ahead(requests, position, direction);
  let best = candidates[0];
  for (const request of candidates.slice(1)) {
    const better = direction === 'UP'
      ? request.cylinder < best.cylinder
      : request.cylinder > best.cylinder;
    if (better) best = request;
  }
  return best;
}

function planNext(
  head: number,
  direction: HeadDirection,
  arrived: DiskRequestState[],
  algorithm: SimulationConfig['disk']['algorithm'],
  cylinders: number,
): Plan {
  const last = cylinders - 1;
  switch (algorithm) {
    case 'FCFS':
      return { stops: [], target: arrived[0] };
    case 'SSTF':
      return { stops: [], target: nearest(arrived, head) };
    case 'LOOK':
    case 'SCAN': {
      const stops: Stop[] = [];
      let position = head;
      let sweep = direction;
      if (ahead(arrived, position, sweep).length === 0) {
        if (algorithm === 'SCAN') {
          const boundary = sweep === 'UP' ? last : 0;
          stops.push({ to: boundary, kind: 'TRAVEL', direction: sweep });
          position = boundary;
        }
        sweep = opposite(sweep);
      }
      return { stops, target: nearestInSweep(arrived, position, sweep) };
    }
    case 'CSCAN': {
      const stops: Stop[] = [];
      let position = head;
      if (ahead(arrived, position, direction).length === 0) {
        const boundary = direction === 'UP' ? last : 0;
        const restart = direction === 'UP' ? 0 : last;
        stops.push(
          { to: boundary, kind: 'TRAVEL', direction },
          { to: restart, kind: 'JUMP', direction },
        );
        position = restart;
      }
      return { stops, target: nearestInSweep(arrived, position, direction) };
    }
    case 'CLOOK': {
      const stops: Stop[] = [];
      let position = head;
      if (ahead(arrived, position, direction).length === 0) {
        const extreme = direction === 'UP'
          ? Math.min(...arrived.map((request) => request.cylinder))
          : Math.max(...arrived.map((request) => request.cylinder));
        stops.push({ to: extreme, kind: 'JUMP', direction });
        position = extreme;
      }
      return { stops, target: nearestInSweep(arrived, position, direction) };
    }
  }
}

function sweepFor(
  head: number,
  direction: HeadDirection,
  arrived: DiskRequestState[],
  algorithm: SimulationConfig['disk']['algorithm'],
  cylinders: number,
): { plan: Plan; sweep: HeadDirection } {
  const plan = planNext(head, direction, arrived, algorithm, cylinders);
  const reversed = (algorithm === 'LOOK' || algorithm === 'SCAN') && ahead(arrived, head, direction).length === 0;
  const sweep = reversed ? opposite(direction) : direction;
  return { plan, sweep };
}

export function runDiskScheduler(rec: Recorder, config: SimulationConfig, startTime: number): void {
  const algorithm = config.disk.algorithm;
  const cylinders = config.disk.cylinders;

  for (const request of rec.state.disk.requests) {
    if (request.created) continue;
    rec.emit({
      type: 'DISK_REQUEST_CREATED',
      timestamp: request.arrival,
      processId: null,
      resourceId: request.id,
      payload: { cylinder: request.cylinder, arrival: request.arrival },
      description: `Disk request ${request.id} for cylinder ${request.cylinder} queued`,
    });
  }

  let clock = startTime;

  const move = (to: number, kind: MoveKind, direction: HeadDirection) => {
    const from = rec.state.disk.head;
    const distance = Math.abs(to - from);
    if (distance === 0) return;
    clock += distance;
    rec.emit({
      type: 'DISK_HEAD_MOVED',
      timestamp: clock,
      processId: null,
      resourceId: null,
      payload: { from, to, distance, direction, kind },
      description: `Head moved ${from} to ${to} (${distance} cylinders, ${kind.toLowerCase()})`,
    });
  };

  for (;;) {
    const pending = rec.state.disk.requests.filter((request) => !request.served);
    if (pending.length === 0) break;

    const arrived = pending
      .filter((request) => request.arrival <= clock)
      .sort((left, right) => left.arrival - right.arrival);

    if (arrived.length === 0) {
      clock = Math.min(...pending.map((request) => request.arrival));
      continue;
    }

    const { plan, sweep } = sweepFor(
      rec.state.disk.head,
      rec.state.disk.direction,
      arrived,
      algorithm,
      cylinders,
    );
    for (const stop of plan.stops) move(stop.to, stop.kind, stop.direction);
    const seekDirection: HeadDirection = plan.target.cylinder === rec.state.disk.head
      ? sweep
      : plan.target.cylinder > rec.state.disk.head ? 'UP' : 'DOWN';
    move(plan.target.cylinder, 'SEEK', seekDirection);
    rec.emit({
      type: 'DISK_REQUEST_COMPLETED',
      timestamp: clock,
      processId: null,
      resourceId: plan.target.id,
      payload: { cylinder: plan.target.cylinder, arrival: plan.target.arrival, completion: clock },
      description: `Request ${plan.target.id} (cylinder ${plan.target.cylinder}) served at t=${clock}`,
    });
  }
}

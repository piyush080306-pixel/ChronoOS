from typing import Any

from chronoos.engine.events import make_event
from chronoos.engine.memory import find_hole, memory_stats
from chronoos.engine.recorder import Recorder
from chronoos.errors import EngineError

PRIORITY_ALGORITHMS = ("PRIORITY_PREEMPTIVE", "PRIORITY_NONPREEMPTIVE")


def _find(state: dict[str, Any], pid: str) -> dict[str, Any] | None:
    return next((process for process in state["processes"] if process["pid"] == pid), None)


def _process_of(state: dict[str, Any], pid: str) -> dict[str, Any]:
    process = _find(state, pid)
    if process is None:
        raise EngineError(f"Unknown process {pid}")
    return process


def _primary_key(ctx: dict[str, Any], process: dict[str, Any], remaining: int) -> int:
    algorithm = ctx["algorithm"]
    if algorithm == "SRTF":
        return remaining
    if algorithm in PRIORITY_ALGORITHMS:
        return process["priority"] if ctx["lowerIsHigher"] else -process["priority"]
    if algorithm == "SJF":
        return process["burst"]
    return process["arrival"]


def _compare_keys(left: list[int], right: list[int]) -> int:
    for index in range(max(len(left), len(right))):
        difference = (left[index] if index < len(left) else 0) - (right[index] if index < len(right) else 0)
        if difference != 0:
            return difference
    return 0


def _full_key(ctx: dict[str, Any], process: dict[str, Any]) -> list[int]:
    order = ctx["order"].get(process["pid"], 0)
    return [_primary_key(ctx, process, process["remaining"]), process["arrival"], order]


def _pick_next(state: dict[str, Any], ctx: dict[str, Any]) -> str | None:
    queue = state["cpu"]["readyQueue"]
    if not queue:
        return None
    if ctx["algorithm"] == "RR":
        return queue[0]
    best: str | None = None
    best_key: list[int] = []
    for pid in queue:
        process = _find(state, pid)
        if process is None:
            continue
        if ctx["algorithm"] == "FCFS":
            key = [process["arrival"], ctx["order"].get(pid, 0)]
        else:
            key = _full_key(ctx, process)
        if best is None or _compare_keys(key, best_key) < 0:
            best = pid
            best_key = key
    return best


def _remaining_at(state: dict[str, Any], pid: str, time: int) -> int:
    process = _process_of(state, pid)
    return process["remaining"] - (time - state["cpu"]["runStart"])


def _admit_arrivals(rec: Recorder, ctx: dict[str, Any], ordered: list[str], time: int) -> None:
    for pid in ordered:
        process = _process_of(rec.state, pid)
        if not process["arrived"] and process["arrival"] <= time:
            rec.emit(
                make_event(
                    "PROCESS_ARRIVED",
                    time,
                    pid,
                    None,
                    {},
                    f"{process['name']} arrived and requests {process['memory']} MB",
                )
            )

    for pid in ordered:
        process = _process_of(rec.state, pid)
        admissible = process["arrived"] and process["state"] in ("NEW", "WAITING")
        if not admissible:
            continue
        memory = rec.state["memory"]
        start = find_hole(memory["blocks"], process["memory"], ctx["memoryAlgorithm"], memory["lastAllocStart"])
        if start is not None:
            rec.emit(
                make_event(
                    "MEMORY_ALLOCATED",
                    time,
                    pid,
                    None,
                    {"start": start, "size": process["memory"], "algorithm": ctx["memoryAlgorithm"]},
                    f"{process['name']} allocated {process['memory']} MB at address {start}",
                )
            )
            rec.emit(
                make_event(
                    "PROCESS_READY",
                    time,
                    pid,
                    None,
                    {"reason": "ADMITTED", "remaining": process["remaining"]},
                    f"{process['name']} admitted to the ready queue",
                )
            )
        elif process["state"] == "NEW":
            stats = memory_stats(memory["blocks"], memory["totalMb"])
            rec.emit(
                make_event(
                    "PROCESS_WAITING",
                    time,
                    pid,
                    None,
                    {"reason": "MEMORY"},
                    f"{process['name']} waits: no contiguous hole of {process['memory']} MB "
                    f"(largest free {stats['largestFreeMb']} MB)",
                )
            )
            rec.emit(
                make_event(
                    "MEMORY_ALLOCATION_FAILED",
                    time,
                    pid,
                    None,
                    {
                        "size": process["memory"],
                        "totalFree": stats["freeMb"],
                        "largestFree": stats["largestFreeMb"],
                    },
                    f"Allocation of {process['memory']} MB for {process['name']} failed "
                    f"(free {stats['freeMb']} MB, largest hole {stats['largestFreeMb']} MB)",
                )
            )


def _terminate_finished(rec: Recorder, time: int) -> None:
    state = rec.state
    pid = state["cpu"]["running"]
    if pid is None:
        return
    process = _process_of(state, pid)
    if _remaining_at(state, pid, time) > 0:
        return
    memory_start = process["memoryStart"]
    if memory_start is None:
        raise EngineError(f"{pid} is running without memory")
    turnaround = time - process["arrival"]
    waiting = turnaround - process["burst"]
    rec.emit(
        make_event(
            "PROCESS_TERMINATED",
            time,
            pid,
            None,
            {"turnaround": turnaround, "waiting": waiting},
            f"{process['name']} completed at t={time} (turnaround {turnaround}, waiting {waiting})",
        )
    )
    rec.emit(
        make_event(
            "MEMORY_RELEASED",
            time,
            pid,
            None,
            {"start": memory_start, "size": process["memory"]},
            f"{process['memory']} MB released from {process['name']}",
        )
    )


def _preempt_if_needed(rec: Recorder, ctx: dict[str, Any], time: int) -> None:
    state = rec.state
    pid = state["cpu"]["running"]
    if pid is None or not state["cpu"]["readyQueue"]:
        return
    process = _process_of(state, pid)
    remaining = _remaining_at(state, pid, time)

    if ctx["algorithm"] == "RR":
        elapsed = time - state["cpu"]["runStart"]
        if elapsed > 0 and elapsed % ctx["quantum"] == 0:
            rec.emit(
                make_event(
                    "PROCESS_READY",
                    time,
                    pid,
                    None,
                    {"reason": "QUANTUM_EXPIRED", "remaining": remaining},
                    f"{process['name']} used its {ctx['quantum']} unit quantum and returns to the ready queue",
                )
            )
            return

    if ctx["algorithm"] not in ("SRTF", "PRIORITY_PREEMPTIVE"):
        return
    best = _pick_next(state, ctx)
    if best is None:
        return
    best_process = _process_of(state, best)
    best_primary = _primary_key(ctx, best_process, best_process["remaining"])
    running_primary = _primary_key(ctx, process, remaining)
    if best_primary >= running_primary:
        return
    rec.emit(
        make_event(
            "PROCESS_READY",
            time,
            pid,
            None,
            {"reason": "PREEMPTED", "remaining": remaining},
            f"{process['name']} preempted by {best_process['name']}",
        )
    )


def _dispatch(rec: Recorder, ctx: dict[str, Any], time: int) -> None:
    state = rec.state
    if state["cpu"]["running"] is not None:
        return
    next_pid = _pick_next(state, ctx)
    if next_pid is not None:
        process = _process_of(state, next_pid)
        previous = state["cpu"]["lastRun"]
        if previous is not None and previous != next_pid:
            rec.emit(
                make_event(
                    "CPU_CONTEXT_SWITCH",
                    time,
                    next_pid,
                    None,
                    {"from": previous, "to": next_pid},
                    f"Context switch {previous} to {next_pid}",
                )
            )
        rec.emit(
            make_event(
                "PROCESS_RUNNING",
                time,
                next_pid,
                None,
                {"remaining": process["remaining"]},
                f"{process['name']} starts running with {process['remaining']} units remaining",
            )
        )
    elif not state["cpu"]["idle"]:
        rec.emit(make_event("CPU_IDLE", time, None, None, {}, "CPU is idle: no process is ready"))


def _next_decision_time(state: dict[str, Any], ctx: dict[str, Any], time: int) -> int | None:
    candidates: list[int] = []
    pid = state["cpu"]["running"]
    if pid is not None:
        process = _process_of(state, pid)
        run_start = state["cpu"]["runStart"]
        candidates.append(run_start + process["remaining"])
        if ctx["algorithm"] == "RR":
            elapsed = time - run_start
            candidates.append(run_start + (elapsed // ctx["quantum"] + 1) * ctx["quantum"])
    for process in state["processes"]:
        if not process["arrived"]:
            candidates.append(process["arrival"])
    return min(candidates) if candidates else None


def run_cpu_scheduler(rec: Recorder, config: dict[str, Any], start_time: int) -> None:
    ctx = {
        "algorithm": config["cpu"]["algorithm"],
        "quantum": config["cpu"]["quantum"],
        "lowerIsHigher": config["cpu"]["priorityLowerIsHigher"],
        "order": {process["pid"]: index for index, process in enumerate(config["processes"])},
        "memoryAlgorithm": config["memory"]["algorithm"],
    }
    ordered = [process["pid"] for process in config["processes"]]

    time = start_time
    while True:
        _terminate_finished(rec, time)
        _admit_arrivals(rec, ctx, ordered, time)
        if all(process["state"] == "TERMINATED" for process in rec.state["processes"]):
            break
        _preempt_if_needed(rec, ctx, time)
        _dispatch(rec, ctx, time)
        next_time = _next_decision_time(rec.state, ctx, time)
        if next_time is None:
            break
        time = next_time

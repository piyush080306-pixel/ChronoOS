from typing import Any

from chronoos.engine.memory import memory_stats


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def compute_analytics(state: dict[str, Any], end_time: int) -> dict[str, Any]:
    processes = []
    for process in state["processes"]:
        turnaround = None if process["completion"] is None else process["completion"] - process["arrival"]
        processes.append(
            {
                "pid": process["pid"],
                "name": process["name"],
                "arrival": process["arrival"],
                "burst": process["burst"],
                "completion": process["completion"],
                "turnaround": turnaround,
                "waiting": None if turnaround is None else turnaround - process["burst"],
                "responseTime": None
                if process["firstRun"] is None
                else process["firstRun"] - process["arrival"],
            }
        )

    completed = [process for process in processes if process["completion"] is not None]
    run_segments = list(state["cpu"]["segments"])
    if state["cpu"]["openSegment"] is not None:
        run_segments.append(state["cpu"]["openSegment"])
    cpu_busy = sum(segment["end"] - segment["start"] for segment in run_segments if segment["kind"] == "RUN")
    latencies = [request["completion"] - request["arrival"] for request in state["disk"]["completed"]]
    response_times = [process["responseTime"] for process in processes if process["responseTime"] is not None]

    return {
        "endTime": end_time,
        "processes": processes,
        "completedCount": len(completed),
        "totalCount": len(processes),
        "avgWaiting": _average([process["waiting"] or 0 for process in completed]),
        "avgTurnaround": _average([process["turnaround"] or 0 for process in completed]),
        "avgResponse": _average(response_times),
        "throughput": len(completed) / end_time if end_time > 0 else None,
        "cpuBusy": cpu_busy,
        "cpuUtilizationPct": (cpu_busy / end_time) * 100 if end_time > 0 else 0,
        "contextSwitches": state["cpu"]["contextSwitches"],
        "memory": memory_stats(state["memory"]["blocks"], state["memory"]["totalMb"]),
        "disk": {
            "totalMovement": state["disk"]["totalMovement"],
            "completed": len(state["disk"]["completed"]),
            "total": len(state["disk"]["requests"]),
            "avgLatency": _average(latencies),
            "maxLatency": max(latencies) if latencies else None,
        },
        "resources": {
            "safe": state["resources"]["safe"],
            "deadlockPids": (state["resources"]["deadlock"] or {}).get("pids", []),
        },
    }

import copy
from typing import Any

from chronoos.engine.cpu import run_cpu_scheduler
from chronoos.engine.disk import run_disk_scheduler
from chronoos.engine.events import make_event
from chronoos.engine.recorder import Recorder
from chronoos.engine.reducer import apply_event, create_initial_state
from chronoos.engine.resource_manager import run_resource_manager


def _canonicalize(drafts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = sorted(range(len(drafts)), key=lambda index: (drafts[index]["timestamp"], index))
    return [{**drafts[index], "seq": seq} for seq, index in enumerate(order)]


def _fold(state: dict[str, Any], events: list[dict[str, Any]], start: float, end: float) -> dict[str, Any]:
    for event in events:
        if event["timestamp"] <= start or event["timestamp"] > end:
            continue
        state = apply_event(state, event)
    return state


def _end_time(events: list[dict[str, Any]]) -> int:
    return max([0] + [event["timestamp"] for event in events])


def build_snapshots(config: dict[str, Any], events: list[dict[str, Any]], end_time: int) -> list[dict[str, Any]]:
    interval = config["snapshotInterval"]
    if interval <= 0:
        return []
    snapshots: list[dict[str, Any]] = []
    state = create_initial_state(config)
    cursor = 0
    last_seq = -1
    time = interval
    while time <= end_time:
        while cursor < len(events) and events[cursor]["timestamp"] <= time:
            state = apply_event(state, events[cursor])
            last_seq = events[cursor]["seq"]
            cursor += 1
        if last_seq >= 0 and not (snapshots and snapshots[-1]["seq"] == last_seq):
            snapshots.append({"timestamp": time, "seq": last_seq, "state": copy.deepcopy(state)})
        time += interval
    return snapshots


def _finish_log(config: dict[str, Any], drafts: list[dict[str, Any]]) -> dict[str, Any]:
    events = _canonicalize(drafts)
    end_time = _end_time(events)
    return {
        "config": config,
        "events": events,
        "snapshots": build_snapshots(config, events, end_time),
        "finalState": _fold(create_initial_state(config), events, float("-inf"), float("inf")),
        "endTime": end_time,
    }


def run_simulation(config: dict[str, Any]) -> dict[str, Any]:
    rec = Recorder(create_initial_state(config))
    for process in config["processes"]:
        rec.emit(
            make_event(
                "PROCESS_CREATED",
                0,
                process["pid"],
                None,
                {
                    "arrival": process["arrival"],
                    "burst": process["burst"],
                    "priority": process["priority"],
                    "memory": process["memory"],
                },
                f"{process['name']} created (burst {process['burst']}, priority {process['priority']}, "
                f"memory {process['memory']} MB)",
            )
        )
    run_cpu_scheduler(rec, config, 0)
    run_disk_scheduler(rec, config, 0)
    run_resource_manager(rec, config, 0)
    return _finish_log(config, rec.drafts)


def log_from_stored(config: dict[str, Any], events: list[dict[str, Any]], snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "config": config,
        "events": events,
        "snapshots": snapshots,
        "finalState": _fold(create_initial_state(config), events, float("-inf"), float("inf")),
        "endTime": _end_time(events),
    }


def reconstruct_at(log: dict[str, Any], time: int) -> dict[str, Any]:
    eligible = [snapshot for snapshot in log["snapshots"] if snapshot["timestamp"] <= time]
    snapshot = eligible[-1] if eligible else None
    if snapshot is None:
        return _fold(create_initial_state(log["config"]), log["events"], float("-inf"), time)
    base = copy.deepcopy(snapshot["state"])
    return _fold(base, log["events"], snapshot["timestamp"], time)


def apply_overrides(config: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    def pick(value: Any, fallback: Any) -> Any:
        return fallback if value is None else value

    return {
        **config,
        "cpu": {
            **config["cpu"],
            "algorithm": pick(overrides.get("cpuAlgorithm"), config["cpu"]["algorithm"]),
            "quantum": pick(overrides.get("cpuQuantum"), config["cpu"]["quantum"]),
        },
        "memory": {
            **config["memory"],
            "algorithm": pick(overrides.get("memoryAlgorithm"), config["memory"]["algorithm"]),
        },
        "disk": {**config["disk"], "algorithm": pick(overrides.get("diskAlgorithm"), config["disk"]["algorithm"])},
    }


def _domain_of(event_type: str) -> str:
    if event_type.startswith("DISK_"):
        return "DISK"
    if event_type.startswith("RESOURCE_") or event_type == "DEADLOCK_DETECTED":
        return "RESOURCE"
    return "CPU"


def fork_simulation(parent: dict[str, Any], overrides: dict[str, Any], time: int) -> dict[str, Any]:
    """Re-simulate only the domains whose algorithm changed; every other domain keeps its recorded history."""
    config = apply_overrides(parent["config"], overrides)
    cpu_changed = any(
        overrides.get(key) is not None for key in ("cpuAlgorithm", "cpuQuantum", "memoryAlgorithm")
    )
    disk_changed = overrides.get("diskAlgorithm") is not None

    kept: list[dict[str, Any]] = []
    for event in parent["events"]:
        keep = True
        if event["timestamp"] > time:
            domain = _domain_of(event["type"])
            if domain == "CPU":
                keep = not cpu_changed
            elif domain == "DISK":
                keep = not disk_changed
        if keep:
            kept.append({key: value for key, value in event.items() if key != "seq"})

    rec = Recorder(reconstruct_at(parent, time))
    if cpu_changed:
        run_cpu_scheduler(rec, config, time)
    if disk_changed:
        run_disk_scheduler(rec, config, time)
    return _finish_log(config, [*kept, *rec.drafts])

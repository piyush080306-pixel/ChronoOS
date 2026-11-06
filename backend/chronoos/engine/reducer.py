from typing import Any

from chronoos.engine.memory import allocate_at, initial_memory_blocks, release_owner


def create_initial_state(config: dict[str, Any]) -> dict[str, Any]:
    disk = config["disk"]
    resources = config["resources"]
    return {
        "processes": [
            {
                "pid": process["pid"],
                "name": process["name"],
                "arrival": process["arrival"],
                "burst": process["burst"],
                "priority": process["priority"],
                "memory": process["memory"],
                "state": "NEW",
                "arrived": False,
                "remaining": process["burst"],
                "firstRun": None,
                "completion": None,
                "memoryStart": None,
            }
            for process in config["processes"]
        ],
        "cpu": {
            "running": None,
            "runStart": 0,
            "idle": False,
            "readyQueue": [],
            "lastRun": None,
            "contextSwitches": 0,
            "segments": [],
            "openSegment": None,
        },
        "memory": {
            "totalMb": config["memory"]["totalMb"],
            "blocks": initial_memory_blocks(config["memory"]["totalMb"]),
            "failures": 0,
            "lastAllocStart": 0,
        },
        "disk": {
            "cylinders": disk["cylinders"],
            "head": disk["head"],
            "direction": disk["direction"],
            "requests": [
                {
                    "id": request["id"],
                    "cylinder": request["cylinder"],
                    "arrival": request["arrival"],
                    "created": False,
                    "served": False,
                }
                for request in disk["requests"]
            ],
            "completed": [],
            "totalMovement": 0,
        },
        "resources": {
            "names": [resource_type["name"] for resource_type in resources["types"]],
            "total": [resource_type["total"] for resource_type in resources["types"]],
            "available": [resource_type["total"] for resource_type in resources["types"]],
            "processes": [
                {"pid": process["pid"], "max": list(process["max"]), "allocation": [0 for _ in process["max"]]}
                for process in resources["processes"]
            ],
            "script": [
                {
                    "index": index,
                    "time": entry["time"],
                    "pid": entry["pid"],
                    "type": entry["type"],
                    "vector": list(entry["vector"]),
                    "done": False,
                }
                for index, entry in enumerate(resources["script"])
            ],
            "waiting": [],
            "safe": None,
            "safeSequence": [],
            "deadlock": None,
        },
    }


def _find_process(state: dict[str, Any], pid: str) -> dict[str, Any] | None:
    return next((process for process in state["processes"] if process["pid"] == pid), None)


def _patch_process(state: dict[str, Any], pid: str, patch: dict[str, Any]) -> None:
    process = _find_process(state, pid)
    if process is not None:
        process.update(patch)


def _close_segment(cpu: dict[str, Any], timestamp: int) -> None:
    open_segment = cpu["openSegment"]
    if open_segment is None:
        return
    if timestamp > open_segment["start"]:
        cpu["segments"].append({**open_segment, "end": timestamp})
    cpu["openSegment"] = None


def _add_vectors(left: list[int], right: list[int], sign: int) -> list[int]:
    return [value + sign * amount for value, amount in zip(left, right)]


def apply_event(state: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
    """Apply one event to the state in place and return it. Shared by live runs and replay."""
    pid = event["processId"] or ""
    timestamp = event["timestamp"]
    payload = event["payload"]
    event_type = event["type"]
    cpu = state["cpu"]

    if event_type == "PROCESS_CREATED":
        return state

    if event_type == "PROCESS_ARRIVED":
        _patch_process(state, pid, {"arrived": True})
        return state

    if event_type == "PROCESS_READY":
        if cpu["running"] == pid:
            _close_segment(cpu, timestamp)
            cpu["running"] = None
        if pid not in cpu["readyQueue"]:
            cpu["readyQueue"].append(pid)
        _patch_process(state, pid, {"state": "READY", "remaining": payload["remaining"]})
        return state

    if event_type == "PROCESS_RUNNING":
        _close_segment(cpu, timestamp)
        current = _find_process(state, pid)
        cpu["running"] = pid
        cpu["runStart"] = timestamp
        cpu["idle"] = False
        cpu["lastRun"] = pid
        cpu["readyQueue"] = [queued for queued in cpu["readyQueue"] if queued != pid]
        cpu["openSegment"] = {"kind": "RUN", "pid": pid, "start": timestamp, "end": timestamp}
        first_run = current["firstRun"] if current is not None and current["firstRun"] is not None else timestamp
        _patch_process(state, pid, {"state": "RUNNING", "remaining": payload["remaining"], "firstRun": first_run})
        return state

    if event_type == "PROCESS_WAITING":
        _patch_process(state, pid, {"state": "WAITING"})
        return state

    if event_type == "PROCESS_TERMINATED":
        if cpu["running"] == pid:
            _close_segment(cpu, timestamp)
            cpu["running"] = None
        cpu["readyQueue"] = [queued for queued in cpu["readyQueue"] if queued != pid]
        _patch_process(state, pid, {"state": "TERMINATED", "remaining": 0, "completion": timestamp})
        return state

    if event_type == "CPU_CONTEXT_SWITCH":
        cpu["contextSwitches"] += 1
        return state

    if event_type == "CPU_IDLE":
        _close_segment(cpu, timestamp)
        cpu["running"] = None
        cpu["idle"] = True
        cpu["openSegment"] = {"kind": "IDLE", "pid": None, "start": timestamp, "end": timestamp}
        return state

    if event_type == "MEMORY_ALLOCATED":
        memory = state["memory"]
        memory["blocks"] = allocate_at(memory["blocks"], pid, payload["start"], payload["size"])
        memory["lastAllocStart"] = payload["start"]
        _patch_process(state, pid, {"memoryStart": payload["start"]})
        return state

    if event_type == "MEMORY_RELEASED":
        memory = state["memory"]
        memory["blocks"] = release_owner(memory["blocks"], pid)
        _patch_process(state, pid, {"memoryStart": None})
        return state

    if event_type == "MEMORY_ALLOCATION_FAILED":
        state["memory"]["failures"] += 1
        return state

    if event_type == "DISK_REQUEST_CREATED":
        for request in state["disk"]["requests"]:
            if request["id"] == event["resourceId"]:
                request["created"] = True
        return state

    if event_type == "DISK_HEAD_MOVED":
        disk = state["disk"]
        disk["head"] = payload["to"]
        disk["direction"] = payload["direction"]
        disk["totalMovement"] += payload["distance"]
        return state

    if event_type == "DISK_REQUEST_COMPLETED":
        disk = state["disk"]
        served = next((request for request in disk["requests"] if request["id"] == event["resourceId"]), None)
        for request in disk["requests"]:
            if request["id"] == event["resourceId"]:
                request["served"] = True
        if served is not None:
            disk["completed"].append(
                {
                    "id": served["id"],
                    "cylinder": served["cylinder"],
                    "arrival": served["arrival"],
                    "completion": timestamp,
                }
            )
        return state

    if event_type in ("RESOURCE_REQUEST_ISSUED", "RESOURCE_RELEASE_ISSUED"):
        for entry in state["resources"]["script"]:
            if entry["index"] == payload["scriptIndex"]:
                entry["done"] = True
        return state

    if event_type == "RESOURCE_ALLOCATED":
        resources = state["resources"]
        resources["available"] = _add_vectors(resources["available"], payload["vector"], -1)
        for process in resources["processes"]:
            if process["pid"] == pid:
                process["allocation"] = _add_vectors(process["allocation"], payload["vector"], 1)
        if payload["fromWaiting"]:
            resources["waiting"] = [request for request in resources["waiting"] if request["pid"] != pid]
        return state

    if event_type == "RESOURCE_RELEASED":
        resources = state["resources"]
        resources["available"] = _add_vectors(resources["available"], payload["vector"], 1)
        for process in resources["processes"]:
            if process["pid"] == pid:
                process["allocation"] = _add_vectors(process["allocation"], payload["vector"], -1)
        return state

    if event_type == "RESOURCE_REQUEST_BLOCKED":
        state["resources"]["waiting"].append({"pid": pid, "vector": payload["vector"], "since": timestamp})
        return state

    if event_type == "RESOURCE_REJECTED":
        return state

    if event_type == "RESOURCE_SAFETY_CHECKED":
        state["resources"]["safe"] = payload["safe"]
        state["resources"]["safeSequence"] = payload["sequence"]
        return state

    if event_type == "DEADLOCK_DETECTED":
        state["resources"]["deadlock"] = {"pids": payload["pids"], "time": timestamp}
        return state

    raise ValueError(f"Unknown event type {event_type}")

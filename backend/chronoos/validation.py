from typing import Any

from chronoos.engine.events import EVENT_TYPE_SET
from chronoos.errors import ValidationError

CPU_ALGORITHMS = ("FCFS", "SJF", "SRTF", "PRIORITY_PREEMPTIVE", "PRIORITY_NONPREEMPTIVE", "RR")
MEMORY_ALGORITHMS = ("FIRST_FIT", "BEST_FIT", "WORST_FIT", "NEXT_FIT")
DISK_ALGORITHMS = ("FCFS", "SSTF", "SCAN", "CSCAN", "LOOK", "CLOOK")
HEAD_DIRECTIONS = ("UP", "DOWN")
RESOURCE_MODES = ("AVOIDANCE", "DETECTION")
SCRIPT_TYPES = ("REQUEST", "RELEASE")

MAX_PROCESSES = 50
MAX_BURST = 1000
MAX_ARRIVAL = 10000
MAX_MEMORY_MB = 1_000_000
MAX_CYLINDERS = 10000
MAX_DISK_REQUESTS = 200
MAX_RESOURCE_TYPES = 8
MAX_RESOURCE_PROCESSES = 50
MAX_SCRIPT_ENTRIES = 200
MAX_UNITS = 100


class _Checker:
    """Collects every problem in a payload so the caller sees all of them at once."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def fail(self, message: str) -> None:
        self.errors.append(message)

    def integer(self, value: Any, path: str, minimum: int, maximum: int) -> int:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value, float) and not value.is_integer()):
            self.fail(f"{path} must be a whole number")
            return minimum
        number = int(value)
        if number < minimum or number > maximum:
            self.fail(f"{path} must be between {minimum} and {maximum}")
        return number

    def text(self, value: Any, path: str, max_length: int = 40) -> str:
        if not isinstance(value, str) or not value.strip():
            self.fail(f"{path} must be a non-empty text value")
            return ""
        if len(value) > max_length:
            self.fail(f"{path} must be at most {max_length} characters")
        return value.strip()

    def choice(self, value: Any, path: str, options: tuple[str, ...]) -> str:
        if value not in options:
            self.fail(f"{path} must be one of {', '.join(options)}")
            return options[0]
        return value

    def boolean(self, value: Any, path: str) -> bool:
        if not isinstance(value, bool):
            self.fail(f"{path} must be true or false")
            return False
        return value

    def items(self, value: Any, path: str, maximum: int) -> list[Any]:
        if not isinstance(value, list):
            self.fail(f"{path} must be a list")
            return []
        if len(value) > maximum:
            self.fail(f"{path} may contain at most {maximum} entries")
        return value

    def mapping(self, value: Any, path: str) -> dict[str, Any]:
        if not isinstance(value, dict):
            self.fail(f"{path} must be an object")
            return {}
        return value

    def unique(self, values: list[str], path: str) -> None:
        if len(set(values)) != len(values):
            self.fail(f"{path} must not contain duplicates")

    def raise_if_failed(self) -> None:
        if self.errors:
            raise ValidationError(self.errors)


def _validate_processes(check: _Checker, raw: Any, memory_total: int) -> list[dict[str, Any]]:
    entries = check.items(raw, "processes", MAX_PROCESSES)
    if not entries:
        check.fail("processes must contain at least one process")
    processes = []
    for index, entry in enumerate(entries):
        path = f"processes[{index}]"
        item = check.mapping(entry, path)
        memory = check.integer(item.get("memory"), f"{path}.memory", 1, MAX_MEMORY_MB)
        if memory_total and memory > memory_total:
            check.fail(f"{path}.memory ({memory} MB) is larger than total memory ({memory_total} MB)")
        processes.append(
            {
                "pid": check.text(item.get("pid"), f"{path}.pid", 16),
                "name": check.text(item.get("name"), f"{path}.name", 60),
                "arrival": check.integer(item.get("arrival"), f"{path}.arrival", 0, MAX_ARRIVAL),
                "burst": check.integer(item.get("burst"), f"{path}.burst", 1, MAX_BURST),
                "priority": check.integer(item.get("priority"), f"{path}.priority", -MAX_UNITS, MAX_UNITS),
                "memory": memory,
            }
        )
    check.unique([process["pid"] for process in processes], "process ids")
    return processes


def _validate_cpu(check: _Checker, raw: Any) -> dict[str, Any]:
    item = check.mapping(raw, "cpu")
    return {
        "algorithm": check.choice(item.get("algorithm"), "cpu.algorithm", CPU_ALGORITHMS),
        "quantum": check.integer(item.get("quantum"), "cpu.quantum", 1, MAX_UNITS),
        "priorityLowerIsHigher": check.boolean(item.get("priorityLowerIsHigher"), "cpu.priorityLowerIsHigher"),
    }


def _validate_memory(check: _Checker, raw: Any) -> dict[str, Any]:
    item = check.mapping(raw, "memory")
    return {
        "totalMb": check.integer(item.get("totalMb"), "memory.totalMb", 1, MAX_MEMORY_MB),
        "algorithm": check.choice(item.get("algorithm"), "memory.algorithm", MEMORY_ALGORITHMS),
    }


def _validate_disk(check: _Checker, raw: Any) -> dict[str, Any]:
    item = check.mapping(raw, "disk")
    cylinders = check.integer(item.get("cylinders"), "disk.cylinders", 1, MAX_CYLINDERS)
    requests = []
    for index, entry in enumerate(check.items(item.get("requests", []), "disk.requests", MAX_DISK_REQUESTS)):
        path = f"disk.requests[{index}]"
        request = check.mapping(entry, path)
        requests.append(
            {
                "id": check.text(request.get("id"), f"{path}.id", 16),
                "cylinder": check.integer(request.get("cylinder"), f"{path}.cylinder", 0, cylinders - 1),
                "arrival": check.integer(request.get("arrival"), f"{path}.arrival", 0, MAX_ARRIVAL),
            }
        )
    check.unique([request["id"] for request in requests], "disk request ids")
    return {
        "cylinders": cylinders,
        "head": check.integer(item.get("head"), "disk.head", 0, cylinders - 1),
        "direction": check.choice(item.get("direction"), "disk.direction", HEAD_DIRECTIONS),
        "algorithm": check.choice(item.get("algorithm"), "disk.algorithm", DISK_ALGORITHMS),
        "requests": requests,
    }


def _vector(check: _Checker, raw: Any, path: str, length: int) -> list[int]:
    if not isinstance(raw, list) or len(raw) != length:
        check.fail(f"{path} must list exactly {length} amounts")
        return [0] * length
    return [check.integer(amount, f"{path}[{index}]", 0, MAX_UNITS) for index, amount in enumerate(raw)]


def _validate_resources(check: _Checker, raw: Any) -> dict[str, Any]:
    item = check.mapping(raw, "resources")
    types = []
    for index, entry in enumerate(check.items(item.get("types", []), "resources.types", MAX_RESOURCE_TYPES)):
        path = f"resources.types[{index}]"
        resource_type = check.mapping(entry, path)
        types.append(
            {
                "name": check.text(resource_type.get("name"), f"{path}.name", 30),
                "total": check.integer(resource_type.get("total"), f"{path}.total", 0, MAX_UNITS),
            }
        )
    check.unique([resource_type["name"] for resource_type in types], "resource names")
    width = len(types)

    processes = []
    for index, entry in enumerate(check.items(item.get("processes", []), "resources.processes", MAX_RESOURCE_PROCESSES)):
        path = f"resources.processes[{index}]"
        process = check.mapping(entry, path)
        processes.append(
            {
                "pid": check.text(process.get("pid"), f"{path}.pid", 16),
                "max": _vector(check, process.get("max"), f"{path}.max", width),
            }
        )

    script = []
    for index, entry in enumerate(check.items(item.get("script", []), "resources.script", MAX_SCRIPT_ENTRIES)):
        path = f"resources.script[{index}]"
        step = check.mapping(entry, path)
        script.append(
            {
                "time": check.integer(step.get("time"), f"{path}.time", 0, MAX_ARRIVAL),
                "pid": check.text(step.get("pid"), f"{path}.pid", 16),
                "type": check.choice(step.get("type"), f"{path}.type", SCRIPT_TYPES),
                "vector": _vector(check, step.get("vector"), f"{path}.vector", width),
            }
        )
    check.unique([process["pid"] for process in processes], "resource process ids")
    return {
        "mode": check.choice(item.get("mode"), "resources.mode", RESOURCE_MODES),
        "types": types,
        "processes": processes,
        "script": script,
    }


def validate_config(raw: Any) -> dict[str, Any]:
    """Return a normalized simulation config or raise ValidationError listing every problem."""
    check = _Checker()
    root = check.mapping(raw, "config")
    memory = _validate_memory(check, root.get("memory"))
    config = {
        "seed": check.integer(root.get("seed", 0), "seed", -(2**31), 2**31 - 1),
        "snapshotInterval": check.integer(root.get("snapshotInterval"), "snapshotInterval", 0, MAX_ARRIVAL),
        "processes": _validate_processes(check, root.get("processes"), memory["totalMb"]),
        "cpu": _validate_cpu(check, root.get("cpu")),
        "memory": memory,
        "disk": _validate_disk(check, root.get("disk")),
        "resources": _validate_resources(check, root.get("resources")),
    }
    check.raise_if_failed()
    return config


def validate_stored_log(raw: Any) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Validate the config, events, and snapshots that describe a stored timeline."""
    check = _Checker()
    root = check.mapping(raw, "log")
    raw_events = check.items(root.get("events"), "events", 1_000_000)
    raw_snapshots = check.items(root.get("snapshots", []), "snapshots", 1_000_000)
    events = []
    for index, entry in enumerate(raw_events):
        path = f"events[{index}]"
        event = check.mapping(entry, path)
        if event.get("type") not in EVENT_TYPE_SET:
            check.fail(f"{path}.type is not a known event type")
        events.append(
            {
                "seq": check.integer(event.get("seq"), f"{path}.seq", 0, 2**31 - 1),
                "timestamp": check.integer(event.get("timestamp"), f"{path}.timestamp", 0, 2**31 - 1),
                "type": event.get("type"),
                "processId": event.get("processId"),
                "resourceId": event.get("resourceId"),
                "payload": check.mapping(event.get("payload", {}), f"{path}.payload"),
                "description": str(event.get("description", "")),
            }
        )
    snapshots = []
    for index, entry in enumerate(raw_snapshots):
        path = f"snapshots[{index}]"
        snapshot = check.mapping(entry, path)
        snapshots.append(
            {
                "timestamp": check.integer(snapshot.get("timestamp"), f"{path}.timestamp", 0, 2**31 - 1),
                "seq": check.integer(snapshot.get("seq"), f"{path}.seq", 0, 2**31 - 1),
                "state": check.mapping(snapshot.get("state"), f"{path}.state"),
            }
        )
    check.raise_if_failed()
    config = validate_config(root.get("config"))
    return config, events, snapshots


def validate_overrides(raw: Any) -> dict[str, Any]:
    check = _Checker()
    root = check.mapping(raw if raw is not None else {}, "overrides")
    overrides: dict[str, Any] = {}
    if root.get("cpuAlgorithm") is not None:
        overrides["cpuAlgorithm"] = check.choice(root["cpuAlgorithm"], "overrides.cpuAlgorithm", CPU_ALGORITHMS)
    if root.get("cpuQuantum") is not None:
        overrides["cpuQuantum"] = check.integer(root["cpuQuantum"], "overrides.cpuQuantum", 1, MAX_UNITS)
    if root.get("memoryAlgorithm") is not None:
        overrides["memoryAlgorithm"] = check.choice(root["memoryAlgorithm"], "overrides.memoryAlgorithm", MEMORY_ALGORITHMS)
    if root.get("diskAlgorithm") is not None:
        overrides["diskAlgorithm"] = check.choice(root["diskAlgorithm"], "overrides.diskAlgorithm", DISK_ALGORITHMS)
    check.raise_if_failed()
    return overrides


def validate_time(raw: Any, end_time: int, path: str = "time") -> int:
    check = _Checker()
    value = check.integer(raw, path, 0, 2**31 - 1)
    if value > end_time:
        check.fail(f"{path} must be between 0 and the timeline end ({end_time})")
    check.raise_if_failed()
    return value

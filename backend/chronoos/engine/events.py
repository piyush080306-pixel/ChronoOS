from typing import Any

EVENT_TYPES = [
    "PROCESS_CREATED",
    "PROCESS_ARRIVED",
    "PROCESS_READY",
    "PROCESS_RUNNING",
    "PROCESS_WAITING",
    "PROCESS_TERMINATED",
    "CPU_CONTEXT_SWITCH",
    "CPU_IDLE",
    "MEMORY_ALLOCATED",
    "MEMORY_RELEASED",
    "MEMORY_ALLOCATION_FAILED",
    "DISK_REQUEST_CREATED",
    "DISK_HEAD_MOVED",
    "DISK_REQUEST_COMPLETED",
    "RESOURCE_REQUEST_ISSUED",
    "RESOURCE_RELEASE_ISSUED",
    "RESOURCE_ALLOCATED",
    "RESOURCE_RELEASED",
    "RESOURCE_REQUEST_BLOCKED",
    "RESOURCE_REJECTED",
    "RESOURCE_SAFETY_CHECKED",
    "DEADLOCK_DETECTED",
]

EVENT_TYPE_SET = frozenset(EVENT_TYPES)


def make_event(
    event_type: str,
    timestamp: int,
    process_id: str | None,
    resource_id: str | None,
    payload: dict[str, Any],
    description: str,
) -> dict[str, Any]:
    return {
        "type": event_type,
        "timestamp": timestamp,
        "processId": process_id,
        "resourceId": resource_id,
        "payload": payload,
        "description": description,
    }

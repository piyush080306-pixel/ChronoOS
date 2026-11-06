from decimal import ROUND_HALF_UP, Decimal
from typing import Any

BLOCK_REASONS = {
    "UNSAFE_STATE": "Avoided deadlock: granting it would leave the system in an unsafe state",
    "INSUFFICIENT_AVAILABLE": "Waiting: not enough free instances of the resource",
}


def _to_fixed_one(value: float) -> str:
    """Match JavaScript's Number.prototype.toFixed(1), which rounds exact ties upward."""
    return str(Decimal(value).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def explain(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    def add(event: dict[str, Any], severity: str, title: str, detail: str) -> None:
        findings.append(
            {"seq": event["seq"], "time": event["timestamp"], "severity": severity, "title": title, "detail": detail}
        )

    latencies = [
        event["payload"]["completion"] - event["payload"]["arrival"]
        for event in events
        if event["type"] == "DISK_REQUEST_COMPLETED"
    ]
    average_latency = sum(latencies) / len(latencies) if latencies else 0

    for event in events:
        event_type = event["type"]
        payload = event["payload"]
        if event_type == "PROCESS_WAITING":
            add(event, "warning", f"{event['processId']} is waiting for memory", event["description"])
        elif event_type == "MEMORY_ALLOCATION_FAILED":
            size, total_free, largest_free = payload["size"], payload["totalFree"], payload["largestFree"]
            if total_free >= size:
                add(
                    event,
                    "critical",
                    "External fragmentation blocked an allocation",
                    f"{total_free} MB is free in total, but the largest contiguous hole is {largest_free} MB, "
                    f"so a {size} MB request fails.",
                )
            else:
                add(event, "warning", "Memory exhausted", f"Only {total_free} MB is free and {size} MB was requested.")
        elif event_type == "RESOURCE_REQUEST_BLOCKED":
            add(
                event,
                "warning" if payload["reason"] == "UNSAFE_STATE" else "info",
                f"{event['processId']} request blocked",
                BLOCK_REASONS.get(payload["reason"], event["description"]),
            )
        elif event_type == "RESOURCE_REJECTED":
            add(event, "info", f"{event['processId']} request rejected", payload["reason"])
        elif event_type == "DEADLOCK_DETECTED":
            add(
                event,
                "critical",
                "Deadlock",
                f"Processes {', '.join(payload['pids'])} are waiting on each other and can never proceed.",
            )
        elif event_type == "CPU_IDLE":
            add(event, "info", "CPU idle", f"No process was ready at t={event['timestamp']}.")
        elif event_type == "DISK_REQUEST_COMPLETED":
            latency = payload["completion"] - payload["arrival"]
            if len(latencies) >= 3 and latency >= 2 * average_latency and latency >= 10:
                add(
                    event,
                    "warning",
                    f"Starved disk request {event['resourceId']}",
                    f"Cylinder {payload['cylinder']} waited {latency} time units, over twice the average of "
                    f"{_to_fixed_one(average_latency)}.",
                )
    return findings

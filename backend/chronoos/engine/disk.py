from typing import Any

from chronoos.engine.events import make_event
from chronoos.engine.recorder import Recorder

Request = dict[str, Any]
Stop = dict[str, Any]


def _opposite(direction: str) -> str:
    return "DOWN" if direction == "UP" else "UP"


def _ahead(requests: list[Request], position: int, direction: str) -> list[Request]:
    if direction == "UP":
        return [request for request in requests if request["cylinder"] >= position]
    return [request for request in requests if request["cylinder"] <= position]


def _nearest(requests: list[Request], position: int) -> Request:
    best = requests[0]
    for request in requests[1:]:
        if abs(request["cylinder"] - position) < abs(best["cylinder"] - position):
            best = request
    return best


def _nearest_in_sweep(requests: list[Request], position: int, direction: str) -> Request:
    candidates = _ahead(requests, position, direction)
    best = candidates[0]
    for request in candidates[1:]:
        if direction == "UP":
            better = request["cylinder"] < best["cylinder"]
        else:
            better = request["cylinder"] > best["cylinder"]
        if better:
            best = request
    return best


def _plan_next(
    head: int, direction: str, arrived: list[Request], algorithm: str, cylinders: int
) -> tuple[list[Stop], Request]:
    last = cylinders - 1
    if algorithm == "FCFS":
        return [], arrived[0]
    if algorithm == "SSTF":
        return [], _nearest(arrived, head)
    if algorithm in ("LOOK", "SCAN"):
        stops: list[Stop] = []
        position = head
        sweep = direction
        if not _ahead(arrived, position, sweep):
            if algorithm == "SCAN":
                boundary = last if sweep == "UP" else 0
                stops.append({"to": boundary, "kind": "TRAVEL", "direction": sweep})
                position = boundary
            sweep = _opposite(sweep)
        return stops, _nearest_in_sweep(arrived, position, sweep)
    if algorithm == "CSCAN":
        stops = []
        position = head
        if not _ahead(arrived, position, direction):
            boundary = last if direction == "UP" else 0
            restart = 0 if direction == "UP" else last
            stops.append({"to": boundary, "kind": "TRAVEL", "direction": direction})
            stops.append({"to": restart, "kind": "JUMP", "direction": direction})
            position = restart
        return stops, _nearest_in_sweep(arrived, position, direction)
    if algorithm == "CLOOK":
        stops = []
        position = head
        if not _ahead(arrived, position, direction):
            cylinders_arrived = [request["cylinder"] for request in arrived]
            extreme = min(cylinders_arrived) if direction == "UP" else max(cylinders_arrived)
            stops.append({"to": extreme, "kind": "JUMP", "direction": direction})
            position = extreme
        return stops, _nearest_in_sweep(arrived, position, direction)
    raise ValueError(f"Unknown disk algorithm {algorithm}")


def _sweep_for(
    head: int, direction: str, arrived: list[Request], algorithm: str, cylinders: int
) -> tuple[list[Stop], Request, str]:
    stops, target = _plan_next(head, direction, arrived, algorithm, cylinders)
    reversed_sweep = algorithm in ("LOOK", "SCAN") and not _ahead(arrived, head, direction)
    sweep = _opposite(direction) if reversed_sweep else direction
    return stops, target, sweep


def run_disk_scheduler(rec: Recorder, config: dict[str, Any], start_time: int) -> None:
    algorithm = config["disk"]["algorithm"]
    cylinders = config["disk"]["cylinders"]

    for request in rec.state["disk"]["requests"]:
        if request["created"]:
            continue
        rec.emit(
            make_event(
                "DISK_REQUEST_CREATED",
                request["arrival"],
                None,
                request["id"],
                {"cylinder": request["cylinder"], "arrival": request["arrival"]},
                f"Disk request {request['id']} for cylinder {request['cylinder']} queued",
            )
        )

    clock = start_time

    def move(to: int, kind: str, direction: str) -> None:
        nonlocal clock
        origin = rec.state["disk"]["head"]
        distance = abs(to - origin)
        if distance == 0:
            return
        clock += distance
        rec.emit(
            make_event(
                "DISK_HEAD_MOVED",
                clock,
                None,
                None,
                {"from": origin, "to": to, "distance": distance, "direction": direction, "kind": kind},
                f"Head moved {origin} to {to} ({distance} cylinders, {kind.lower()})",
            )
        )

    while True:
        pending = [request for request in rec.state["disk"]["requests"] if not request["served"]]
        if not pending:
            break

        arrived = sorted(
            (request for request in pending if request["arrival"] <= clock),
            key=lambda request: request["arrival"],
        )

        if not arrived:
            clock = min(request["arrival"] for request in pending)
            continue

        stops, target, sweep = _sweep_for(
            rec.state["disk"]["head"], rec.state["disk"]["direction"], arrived, algorithm, cylinders
        )
        for stop in stops:
            move(stop["to"], stop["kind"], stop["direction"])
        head = rec.state["disk"]["head"]
        if target["cylinder"] == head:
            seek_direction = sweep
        else:
            seek_direction = "UP" if target["cylinder"] > head else "DOWN"
        move(target["cylinder"], "SEEK", seek_direction)
        rec.emit(
            make_event(
                "DISK_REQUEST_COMPLETED",
                clock,
                None,
                target["id"],
                {"cylinder": target["cylinder"], "arrival": target["arrival"], "completion": clock},
                f"Request {target['id']} (cylinder {target['cylinder']}) served at t={clock}",
            )
        )

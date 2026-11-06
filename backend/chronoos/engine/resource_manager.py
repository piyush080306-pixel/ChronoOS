from typing import Any

from chronoos.engine.recorder import Recorder
from chronoos.engine.bankers import check_safety, detect_deadlock, fits_within, need_of
from chronoos.engine.events import make_event


def describe_vector(names: list[str], vector: list[int]) -> str:
    parts = [f"{amount} x {names[index]}" for index, amount in enumerate(vector) if amount > 0]
    return ", ".join(parts) if parts else "nothing"


def _is_valid_vector(vector: list[int], length: int) -> bool:
    return (
        len(vector) == length
        and all(isinstance(amount, int) and not isinstance(amount, bool) and amount >= 0 for amount in vector)
        and any(amount > 0 for amount in vector)
    )


def _sequence_key(sequence: list[str]) -> str:
    return ">".join(sequence)


def run_resource_manager(rec: Recorder, config: dict[str, Any], start_time: int) -> None:
    mode = config["resources"]["mode"]
    pending = sorted(
        (entry for entry in rec.state["resources"]["script"] if not entry["done"]),
        key=lambda entry: (entry["time"], entry["index"]),
    )

    def try_grant(pid: str, vector: list[int], time: int, from_waiting: bool) -> bool:
        resources = rec.state["resources"]
        described = describe_vector(resources["names"], vector)
        if not fits_within(vector, resources["available"]):
            if not from_waiting:
                rec.emit(
                    make_event(
                        "RESOURCE_REQUEST_BLOCKED",
                        time,
                        pid,
                        None,
                        {"vector": vector, "reason": "INSUFFICIENT_AVAILABLE"},
                        f"{pid} blocked waiting for {described}: not enough free instances",
                    )
                )
            return False

        if mode == "AVOIDANCE":
            available = [free - amount for free, amount in zip(resources["available"], vector)]
            processes = [
                {**process, "allocation": [held + amount for held, amount in zip(process["allocation"], vector)]}
                if process["pid"] == pid
                else process
                for process in resources["processes"]
            ]
            if not check_safety(available, processes)["safe"]:
                if not from_waiting:
                    rec.emit(
                        make_event(
                            "RESOURCE_REQUEST_BLOCKED",
                            time,
                            pid,
                            None,
                            {"vector": vector, "reason": "UNSAFE_STATE"},
                            f"{pid} blocked: granting {described} would leave the system in an unsafe state",
                        )
                    )
                return False

        suffix = " (from wait queue)" if from_waiting else ""
        rec.emit(
            make_event(
                "RESOURCE_ALLOCATED",
                time,
                pid,
                None,
                {"vector": vector, "fromWaiting": from_waiting},
                f"{pid} granted {described}{suffix}",
            )
        )
        return True

    def handle_request(entry: dict[str, Any], time: int) -> None:
        resources = rec.state["resources"]
        pid = entry["pid"]
        vector = entry["vector"]
        rec.emit(
            make_event(
                "RESOURCE_REQUEST_ISSUED",
                time,
                pid,
                None,
                {"scriptIndex": entry["index"], "vector": vector},
                f"{pid} requests {describe_vector(resources['names'], vector)}",
            )
        )
        process = next((candidate for candidate in resources["processes"] if candidate["pid"] == pid), None)

        def reject(reason: str) -> None:
            rec.emit(
                make_event(
                    "RESOURCE_REJECTED",
                    time,
                    pid,
                    None,
                    {"vector": vector, "reason": reason},
                    f"Request by {pid} rejected: {reason}",
                )
            )

        if process is None:
            return reject("unknown process")
        if not _is_valid_vector(vector, len(resources["names"])):
            return reject("invalid resource vector")
        if any(waiting["pid"] == pid for waiting in resources["waiting"]):
            return reject("process is already blocked")
        if not fits_within(vector, need_of(process)):
            return reject("exceeds remaining declared maximum claim")
        try_grant(pid, vector, time, False)

    def handle_release(entry: dict[str, Any], time: int) -> None:
        resources = rec.state["resources"]
        pid = entry["pid"]
        vector = entry["vector"]
        rec.emit(
            make_event(
                "RESOURCE_RELEASE_ISSUED",
                time,
                pid,
                None,
                {"scriptIndex": entry["index"], "vector": vector},
                f"{pid} releases {describe_vector(resources['names'], vector)}",
            )
        )
        process = next((candidate for candidate in resources["processes"] if candidate["pid"] == pid), None)
        if (
            process is None
            or not _is_valid_vector(vector, len(resources["names"]))
            or not fits_within(vector, process["allocation"])
        ):
            rec.emit(
                make_event(
                    "RESOURCE_REJECTED",
                    time,
                    pid,
                    None,
                    {"vector": vector, "reason": "release exceeds current allocation"},
                    f"Release by {pid} rejected: it does not hold that many instances",
                )
            )
            return
        rec.emit(
            make_event(
                "RESOURCE_RELEASED",
                time,
                pid,
                None,
                {"vector": vector},
                f"{pid} released {describe_vector(resources['names'], vector)}",
            )
        )
        for waiting in list(rec.state["resources"]["waiting"]):
            current = next(
                (candidate for candidate in rec.state["resources"]["waiting"] if candidate["pid"] == waiting["pid"]),
                None,
            )
            if current is not None:
                try_grant(current["pid"], current["vector"], time, True)

    def refresh_safety(time: int) -> None:
        resources = rec.state["resources"]
        result = check_safety(resources["available"], resources["processes"])
        changed = result["safe"] != resources["safe"] or _sequence_key(result["sequence"]) != _sequence_key(
            resources["safeSequence"]
        )
        if not changed:
            return
        if result["safe"]:
            description = f"System is SAFE. Safe sequence: {' -> '.join(result['sequence']) or 'none'}"
        else:
            description = "System is UNSAFE: no complete safe sequence exists"
        rec.emit(
            make_event(
                "RESOURCE_SAFETY_CHECKED",
                time,
                None,
                None,
                {"safe": result["safe"], "sequence": result["sequence"]},
                description,
            )
        )

    def refresh_deadlock(time: int) -> None:
        resources = rec.state["resources"]
        if resources["deadlock"] is not None or not resources["waiting"]:
            return
        pids = detect_deadlock(resources["available"], resources["processes"], resources["waiting"])
        if not pids:
            return
        rec.emit(
            make_event(
                "DEADLOCK_DETECTED",
                time,
                None,
                None,
                {"pids": pids},
                f"DEADLOCK detected among {', '.join(pids)}",
            )
        )

    refresh_safety(start_time)
    for entry in pending:
        time = max(entry["time"], start_time)
        if entry["type"] == "REQUEST":
            handle_request(entry, time)
        else:
            handle_release(entry, time)
        refresh_safety(time)
        refresh_deadlock(time)

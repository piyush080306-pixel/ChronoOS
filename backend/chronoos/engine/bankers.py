from typing import Any


def need_of(process: dict[str, Any]) -> list[int]:
    return [maximum - allocated for maximum, allocated in zip(process["max"], process["allocation"])]


def fits_within(request: list[int], available: list[int]) -> bool:
    return all(amount <= free for amount, free in zip(request, available))


def check_safety(available: list[int], processes: list[dict[str, Any]]) -> dict[str, Any]:
    work = list(available)
    finished: set[str] = set()
    sequence: list[str] = []
    progressed = True

    while progressed:
        progressed = False
        for process in processes:
            if process["pid"] in finished:
                continue
            if not fits_within(need_of(process), work):
                continue
            work = [free + amount for free, amount in zip(work, process["allocation"])]
            finished.add(process["pid"])
            sequence.append(process["pid"])
            progressed = True

    return {"safe": len(finished) == len(processes), "sequence": sequence}


def detect_deadlock(
    available: list[int], processes: list[dict[str, Any]], waiting: list[dict[str, Any]]
) -> list[str]:
    work = list(available)
    finished: set[str] = {
        process["pid"] for process in processes if all(amount == 0 for amount in process["allocation"])
    }
    progressed = True

    while progressed:
        progressed = False
        for process in processes:
            if process["pid"] in finished:
                continue
            request = next((entry for entry in waiting if entry["pid"] == process["pid"]), None)
            if request is not None and not fits_within(request["vector"], work):
                continue
            work = [free + amount for free, amount in zip(work, process["allocation"])]
            finished.add(process["pid"])
            progressed = True

    return [process["pid"] for process in processes if process["pid"] not in finished]

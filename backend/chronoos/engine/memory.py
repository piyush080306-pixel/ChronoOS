from typing import Any

Block = dict[str, Any]


def initial_memory_blocks(total_mb: int) -> list[Block]:
    return [{"start": 0, "size": total_mb, "pid": None}]


def find_hole(blocks: list[Block], size: int, algorithm: str, last_alloc_start: int) -> int | None:
    holes = [block for block in blocks if block["pid"] is None and block["size"] >= size]
    if not holes:
        return None

    if algorithm == "FIRST_FIT":
        return holes[0]["start"]

    if algorithm in ("BEST_FIT", "WORST_FIT"):
        direction = 1 if algorithm == "BEST_FIT" else -1
        chosen = holes[0]
        for hole in holes[1:]:
            if (hole["size"] - chosen["size"]) * direction < 0:
                chosen = hole
        return chosen["start"]

    start_index = next((i for i, block in enumerate(blocks) if block["start"] >= last_alloc_start), -1)
    origin = 0 if start_index == -1 else start_index
    for offset in range(len(blocks)):
        block = blocks[(origin + offset) % len(blocks)]
        if block["pid"] is None and block["size"] >= size:
            return block["start"]
    return None


def allocate_at(blocks: list[Block], pid: str, start: int, size: int) -> list[Block]:
    index = next(
        (
            i
            for i, block in enumerate(blocks)
            if block["pid"] is None and block["start"] <= start and start + size <= block["start"] + block["size"]
        ),
        -1,
    )
    if index == -1:
        raise ValueError(f"No free memory at {start} for {pid}")
    hole = blocks[index]
    pieces: list[Block] = []
    if start > hole["start"]:
        pieces.append({"start": hole["start"], "size": start - hole["start"], "pid": None})
    pieces.append({"start": start, "size": size, "pid": pid})
    tail = hole["start"] + hole["size"] - (start + size)
    if tail > 0:
        pieces.append({"start": start + size, "size": tail, "pid": None})
    return [*blocks[:index], *pieces, *blocks[index + 1 :]]


def release_owner(blocks: list[Block], pid: str) -> list[Block]:
    released = [{**block, "pid": None} if block["pid"] == pid else dict(block) for block in blocks]
    merged: list[Block] = []
    for block in released:
        last = merged[-1] if merged else None
        if last is not None and last["pid"] is None and block["pid"] is None:
            last["size"] += block["size"]
        else:
            merged.append(dict(block))
    return merged


def memory_stats(blocks: list[Block], total_mb: int) -> dict[str, Any]:
    free = [block for block in blocks if block["pid"] is None]
    free_mb = sum(block["size"] for block in free)
    largest_free_mb = max((block["size"] for block in free), default=0)
    used_mb = total_mb - free_mb
    external = free_mb - largest_free_mb
    return {
        "usedMb": used_mb,
        "freeMb": free_mb,
        "largestFreeMb": largest_free_mb,
        "freeHoles": len(free),
        "utilizationPct": (used_mb / total_mb) * 100 if total_mb > 0 else 0,
        "externalFragmentationMb": external,
        "fragmentationPct": (external / free_mb) * 100 if free_mb > 0 else 0,
    }

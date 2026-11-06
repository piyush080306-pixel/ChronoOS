from typing import Any


def create_default_config() -> dict[str, Any]:
    return {
        "seed": 42,
        "snapshotInterval": 5,
        "processes": [
            {"pid": "P1", "name": "Browser", "arrival": 0, "burst": 8, "priority": 2, "memory": 256},
            {"pid": "P2", "name": "Compiler", "arrival": 1, "burst": 4, "priority": 1, "memory": 128},
            {"pid": "P3", "name": "Database", "arrival": 2, "burst": 9, "priority": 3, "memory": 512},
            {"pid": "P4", "name": "Backup", "arrival": 3, "burst": 5, "priority": 4, "memory": 384},
            {"pid": "P5", "name": "Editor", "arrival": 5, "burst": 3, "priority": 1, "memory": 128},
        ],
        "cpu": {"algorithm": "RR", "quantum": 2, "priorityLowerIsHigher": True},
        "memory": {"totalMb": 1024, "algorithm": "FIRST_FIT"},
        "disk": {
            "cylinders": 200,
            "head": 53,
            "direction": "UP",
            "algorithm": "LOOK",
            "requests": [
                {"id": "R1", "cylinder": 98, "arrival": 0},
                {"id": "R2", "cylinder": 183, "arrival": 2},
                {"id": "R3", "cylinder": 37, "arrival": 4},
                {"id": "R4", "cylinder": 122, "arrival": 6},
                {"id": "R5", "cylinder": 14, "arrival": 8},
                {"id": "R6", "cylinder": 124, "arrival": 10},
                {"id": "R7", "cylinder": 65, "arrival": 12},
                {"id": "R8", "cylinder": 67, "arrival": 14},
            ],
        },
        "resources": {
            "mode": "AVOIDANCE",
            "types": [{"name": "Printer", "total": 2}, {"name": "Scanner", "total": 1}],
            "processes": [
                {"pid": "P1", "max": [1, 1]},
                {"pid": "P2", "max": [2, 0]},
                {"pid": "P3", "max": [1, 1]},
                {"pid": "P4", "max": [2, 1]},
            ],
            "script": [
                {"time": 1, "pid": "P1", "type": "REQUEST", "vector": [1, 0]},
                {"time": 2, "pid": "P2", "type": "REQUEST", "vector": [1, 0]},
                {"time": 4, "pid": "P3", "type": "REQUEST", "vector": [1, 1]},
                {"time": 6, "pid": "P1", "type": "RELEASE", "vector": [1, 0]},
                {"time": 7, "pid": "P1", "type": "REQUEST", "vector": [0, 1]},
                {"time": 9, "pid": "P2", "type": "RELEASE", "vector": [1, 0]},
                {"time": 10, "pid": "P4", "type": "REQUEST", "vector": [2, 0]},
                {"time": 14, "pid": "P3", "type": "RELEASE", "vector": [1, 1]},
            ],
        },
    }

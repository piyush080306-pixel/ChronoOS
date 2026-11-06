from typing import Any

from chronoos.engine.reducer import apply_event


class Recorder:
    """Collects events emitted by the schedulers and applies each one to the live state."""

    def __init__(self, initial_state: dict[str, Any]):
        self.state = initial_state
        self.drafts: list[dict[str, Any]] = []

    def emit(self, event: dict[str, Any]) -> None:
        self.drafts.append(event)
        self.state = apply_event(self.state, event)

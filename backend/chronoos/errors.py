class ValidationError(ValueError):
    """Raised when a request payload does not describe a valid simulation."""

    def __init__(self, details: list[str]):
        super().__init__("; ".join(details))
        self.details = details


class EngineError(RuntimeError):
    """Raised when the simulation reaches a state that should be impossible."""

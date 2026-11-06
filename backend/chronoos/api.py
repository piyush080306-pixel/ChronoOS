import logging
from typing import Any, Callable

from chronoos import __version__
from chronoos.engine.analytics import compute_analytics
from chronoos.engine.forensics import explain
from chronoos.engine.presets import create_default_config
from chronoos.engine.simulator import fork_simulation, log_from_stored, reconstruct_at, run_simulation
from chronoos.validation import (
    validate_config,
    validate_overrides,
    validate_stored_log,
    validate_time,
)

logger = logging.getLogger("chronoos.api")

Handler = Callable[[Any], dict[str, Any]]


def _analysis(log: dict[str, Any]) -> dict[str, Any]:
    return {
        "analytics": compute_analytics(log["finalState"], log["endTime"]),
        "findings": explain(log["events"]),
    }


def _stored_log(body: Any) -> dict[str, Any]:
    config, events, snapshots = validate_stored_log(body)
    return log_from_stored(config, events, snapshots)


def health(_: Any) -> dict[str, Any]:
    return {"status": "ok", "service": "chronoos-engine", "version": __version__}


def default_preset(_: Any) -> dict[str, Any]:
    return {"config": create_default_config()}


def simulation_run(body: Any) -> dict[str, Any]:
    config = validate_config(body.get("config") if isinstance(body, dict) else None)
    log = run_simulation(config)
    logger.info(
        "run simulation: %d processes, %d events, end t=%d, %d snapshots",
        len(config["processes"]),
        len(log["events"]),
        log["endTime"],
        len(log["snapshots"]),
    )
    return _bundle(log)


def _bundle(log: dict[str, Any]) -> dict[str, Any]:
    return {"log": log, "analysis": _analysis(log)}


def log_hydrate(body: Any) -> dict[str, Any]:
    return _bundle(_stored_log(body))


def log_analysis(body: Any) -> dict[str, Any]:
    return _analysis(_stored_log(body))


def log_reconstruct(body: Any) -> dict[str, Any]:
    log = _stored_log(body)
    time = validate_time(body.get("time"), log["endTime"])
    return {"time": time, "state": reconstruct_at(log, time)}


def log_fork(body: Any) -> dict[str, Any]:
    log = _stored_log(body)
    overrides = validate_overrides(body.get("overrides"))
    time = validate_time(body.get("time"), log["endTime"])
    forked = fork_simulation(log, overrides, time)
    logger.info("fork at t=%d with overrides %s: %d events", time, overrides or "none", len(forked["events"]))
    return _bundle(forked)


ROUTES: dict[tuple[str, str], Handler] = {
    ("GET", "/api/health"): health,
    ("GET", "/api/presets/default"): default_preset,
    ("POST", "/api/simulations/run"): simulation_run,
    ("POST", "/api/logs/hydrate"): log_hydrate,
    ("POST", "/api/logs/analysis"): log_analysis,
    ("POST", "/api/logs/reconstruct"): log_reconstruct,
    ("POST", "/api/logs/fork"): log_fork,
}


def resolve(method: str, path: str) -> tuple[Handler | None, bool]:
    """Return (handler, path_exists) so the server can distinguish 404 from 405."""
    handler = ROUTES.get((method, path))
    if handler is not None:
        return handler, True
    return None, any(route_path == path for _, route_path in ROUTES)

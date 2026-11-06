import argparse
import json
import logging
import os
import sys
import time
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from chronoos import __version__
from chronoos.api import resolve
from chronoos.errors import EngineError, ValidationError

MAX_BODY_BYTES = 5 * 1024 * 1024
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787

logger = logging.getLogger("chronoos.server")


class EngineRequestHandler(BaseHTTPRequestHandler):
    server_version = f"ChronoOS/{__version__}"
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - signature defined by base class
        return

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        # The frontend runs on a different dev-server origin and sends JSON, so browsers preflight.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_error(self, status: int, message: str, details: list[str] | None = None) -> None:
        payload: dict[str, Any] = {"error": message}
        if details:
            payload["details"] = details
        self._send_json(status, payload)

    def _read_body(self) -> Any:
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            raise ValidationError(["request body is required"])
        try:
            length = int(length_header)
        except ValueError as error:
            raise ValidationError(["Content-Length header is not a number"]) from error
        if length > MAX_BODY_BYTES:
            raise OverflowError
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValidationError([f"request body is not valid JSON: {error.msg if hasattr(error, 'msg') else error}"]) from error

    def _dispatch(self, method: str) -> None:
        started = time.perf_counter()
        path = self.path.split("?", 1)[0]
        status = HTTPStatus.INTERNAL_SERVER_ERROR
        try:
            handler, path_exists = resolve(method, path)
            if handler is None:
                if path_exists:
                    status = HTTPStatus.METHOD_NOT_ALLOWED
                    self._send_error(status, f"{method} is not allowed on {path}")
                else:
                    status = HTTPStatus.NOT_FOUND
                    self._send_error(status, f"No endpoint at {path}")
                return

            body = self._read_body() if method == "POST" else None
            payload = handler(body)
            status = HTTPStatus.OK
            self._send_json(status, payload)
        except OverflowError:
            status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE
            self._send_error(status, "request body is larger than 5 MB")
        except ValidationError as error:
            status = HTTPStatus.BAD_REQUEST
            logger.warning("rejected %s %s: %s", method, path, error)
            self._send_error(status, "Invalid request", error.details)
        except EngineError as error:
            status = HTTPStatus.UNPROCESSABLE_ENTITY
            logger.error("engine failure on %s %s: %s", method, path, error)
            self._send_error(status, str(error))
        except Exception:  # noqa: BLE001 - last-resort guard so the server never drops a connection silently
            status = HTTPStatus.INTERNAL_SERVER_ERROR
            logger.error("unhandled error on %s %s\n%s", method, path, traceback.format_exc())
            self._send_error(status, "Internal engine error. See the backend log for details.")
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info("%s %s -> %d (%.1f ms)", method, path, int(status), elapsed_ms)

    def do_GET(self) -> None:  # noqa: N802 - name required by BaseHTTPRequestHandler
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Content-Length", "0")
        self._send_cors_headers()
        self.end_headers()


def create_server(host: str, port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), EngineRequestHandler)


def configure_logging() -> None:
    level = os.environ.get("CHRONOOS_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        stream=sys.stderr,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="chronoos", description="ChronoOS simulation engine API")
    parser.add_argument("--host", default=os.environ.get("CHRONOOS_API_HOST", DEFAULT_HOST))
    parser.add_argument("--port", type=int, default=int(os.environ.get("CHRONOOS_API_PORT", DEFAULT_PORT)))
    args = parser.parse_args(argv)

    configure_logging()
    try:
        server = create_server(args.host, args.port)
    except OSError as error:
        logger.error("cannot listen on %s:%d: %s", args.host, args.port, error)
        logger.error("another program may be using this port; set CHRONOOS_API_PORT to a free port")
        return 1

    logger.info("ChronoOS engine listening on http://%s:%d", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("shutdown requested")
    finally:
        server.server_close()
        logger.info("engine stopped")
    return 0

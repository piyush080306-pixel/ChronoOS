import copy
import json
import threading
import unittest
import urllib.error
import urllib.request

from chronoos.engine.presets import create_default_config
from chronoos.engine.simulator import run_simulation
from chronoos.server import create_server


class ApiIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server("127.0.0.1", 0)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, method: str, path: str, body=None, raw: bytes | None = None):
        data = raw if raw is not None else (json.dumps(body).encode("utf-8") if body is not None else None)
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=data,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_health(self):
        status, body = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")

    def test_default_preset(self):
        status, body = self.request("GET", "/api/presets/default")
        self.assertEqual(status, 200)
        self.assertEqual(body["config"], create_default_config())

    def test_run_returns_log_matching_direct_engine_call(self):
        config = create_default_config()
        status, body = self.request("POST", "/api/simulations/run", {"config": config})
        self.assertEqual(status, 200)
        self.assertEqual(body["log"], json.loads(json.dumps(run_simulation(config))))

    def test_run_rejects_invalid_config_with_details(self):
        config = copy.deepcopy(create_default_config())
        config["cpu"]["algorithm"] = "LIFO"
        status, body = self.request("POST", "/api/simulations/run", {"config": config})
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "Invalid request")
        self.assertTrue(any("cpu.algorithm" in d for d in body["details"]))

    def test_malformed_json_is_bad_request(self):
        status, body = self.request("POST", "/api/simulations/run", raw=b"{not json")
        self.assertEqual(status, 400)
        self.assertIn("not valid JSON", body["details"][0])

    def test_missing_body_is_bad_request(self):
        status, body = self.request("POST", "/api/simulations/run")
        self.assertEqual(status, 400)

    def test_unknown_path_is_not_found(self):
        status, _ = self.request("GET", "/api/unknown")
        self.assertEqual(status, 404)

    def test_wrong_method_is_not_allowed(self):
        status, _ = self.request("GET", "/api/simulations/run")
        self.assertEqual(status, 405)

    def test_logs_analysis_and_fork_and_reconstruct_round_trip(self):
        config = create_default_config()
        _, run_body = self.request("POST", "/api/simulations/run", {"config": config})
        log = run_body["log"]
        stored = {"config": log["config"], "events": log["events"], "snapshots": log["snapshots"]}

        status, analysis = self.request("POST", "/api/logs/analysis", stored)
        self.assertEqual(status, 200)
        self.assertIn("analytics", analysis)
        self.assertIn("findings", analysis)

        status, state = self.request("POST", "/api/logs/reconstruct", {**stored, "time": 50})
        self.assertEqual(status, 200)
        self.assertEqual(state["time"], 50)

        status, forked = self.request(
            "POST", "/api/logs/fork", {**stored, "time": 20, "overrides": {"cpuAlgorithm": "FCFS"}}
        )
        self.assertEqual(status, 200)
        self.assertEqual(forked["log"]["config"]["cpu"]["algorithm"], "FCFS")

    def test_reconstruct_rejects_time_beyond_end(self):
        config = create_default_config()
        _, run_body = self.request("POST", "/api/simulations/run", {"config": config})
        log = run_body["log"]
        stored = {"config": log["config"], "events": log["events"], "snapshots": log["snapshots"]}
        status, _ = self.request("POST", "/api/logs/reconstruct", {**stored, "time": log["endTime"] + 1})
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()

import copy
import unittest

from chronoos.engine.presets import create_default_config
from chronoos.engine.simulator import run_simulation
from chronoos.errors import ValidationError
from chronoos.validation import validate_config, validate_overrides, validate_time


def _config_with(**changes):
    config = create_default_config()
    for key, value in changes.items():
        config[key] = value
    return config


def _process(index: int, **overrides):
    process = {"pid": f"P{index}", "name": f"Job {index}", "arrival": 0, "burst": 5, "priority": 1, "memory": 16}
    process.update(overrides)
    return process


class ValidConfigTests(unittest.TestCase):
    def test_default_preset_is_valid_and_runs(self):
        config = validate_config(create_default_config())
        self.assertEqual(len(run_simulation(config)["events"]), 117)

    def test_accepts_every_cpu_algorithm(self):
        for algorithm in ["FCFS", "SJF", "SRTF", "PRIORITY_PREEMPTIVE", "PRIORITY_NONPREEMPTIVE", "RR"]:
            with self.subTest(algorithm=algorithm):
                config = create_default_config()
                config["cpu"]["algorithm"] = algorithm
                validate_config(config)

    def test_accepts_every_disk_algorithm_and_direction(self):
        for algorithm in ["FCFS", "SSTF", "SCAN", "CSCAN", "LOOK", "CLOOK"]:
            for direction in ["UP", "DOWN"]:
                with self.subTest(algorithm=algorithm, direction=direction):
                    config = create_default_config()
                    config["disk"]["algorithm"] = algorithm
                    config["disk"]["direction"] = direction
                    validate_config(config)


class InvalidConfigTests(unittest.TestCase):
    def assert_rejected(self, config, fragment: str):
        with self.assertRaises(ValidationError) as raised:
            validate_config(config)
        self.assertTrue(
            any(fragment in detail for detail in raised.exception.details),
            f"expected a detail containing {fragment!r}, got {raised.exception.details}",
        )

    def test_rejects_missing_config(self):
        with self.assertRaises(ValidationError):
            validate_config(None)

    def test_rejects_unknown_cpu_algorithm(self):
        config = create_default_config()
        config["cpu"]["algorithm"] = "LIFO"
        self.assert_rejected(config, "cpu.algorithm")

    def test_rejects_unknown_memory_algorithm(self):
        config = create_default_config()
        config["memory"]["algorithm"] = "RANDOM"
        self.assert_rejected(config, "memory.algorithm")

    def test_rejects_non_integer_burst(self):
        config = create_default_config()
        config["processes"][0]["burst"] = 2.5
        self.assert_rejected(config, "burst")

    def test_rejects_empty_pid(self):
        config = create_default_config()
        config["processes"][0]["pid"] = "   "
        self.assert_rejected(config, "pid")

    def test_reports_every_problem_at_once(self):
        config = create_default_config()
        config["cpu"]["algorithm"] = "LIFO"
        config["disk"]["direction"] = "LEFT"
        with self.assertRaises(ValidationError) as raised:
            validate_config(config)
        self.assertGreaterEqual(len(raised.exception.details), 2)

    def test_rejects_request_outside_disk_range(self):
        config = create_default_config()
        config["disk"]["requests"][0]["cylinder"] = config["disk"]["cylinders"]
        self.assert_rejected(config, "cylinder")


class BoundaryConfigTests(unittest.TestCase):
    def test_accepts_exactly_fifty_processes(self):
        processes = [_process(i) for i in range(50)]
        validate_config(_config_with(processes=processes))

    def test_rejects_fifty_one_processes(self):
        processes = [_process(i) for i in range(51)]
        with self.assertRaises(ValidationError):
            validate_config(_config_with(processes=processes))

    def test_burst_limits_are_inclusive(self):
        validate_config(_config_with(processes=[_process(1, burst=1)]))
        validate_config(_config_with(processes=[_process(1, burst=1000)]))
        with self.assertRaises(ValidationError):
            validate_config(_config_with(processes=[_process(1, burst=0)]))
        with self.assertRaises(ValidationError):
            validate_config(_config_with(processes=[_process(1, burst=1001)]))

    def test_arrival_limit_is_inclusive(self):
        validate_config(_config_with(processes=[_process(1, arrival=10000)]))
        with self.assertRaises(ValidationError):
            validate_config(_config_with(processes=[_process(1, arrival=10001)]))

    def test_memory_limits_are_inclusive(self):
        config = create_default_config()
        config["memory"]["totalMb"] = 1_000_000
        validate_config(config)
        config["memory"]["totalMb"] = 1_000_001
        with self.assertRaises(ValidationError):
            validate_config(config)

    def test_rejects_more_than_two_hundred_disk_requests(self):
        config = create_default_config()
        config["disk"]["requests"] = [
            {"id": f"R{i}", "cylinder": i % config["disk"]["cylinders"], "arrival": i} for i in range(201)
        ]
        with self.assertRaises(ValidationError):
            validate_config(config)


class TimeAndOverrideTests(unittest.TestCase):
    def test_time_is_bounded_by_end_time(self):
        self.assertEqual(validate_time(0, 299), 0)
        self.assertEqual(validate_time(299, 299), 299)
        with self.assertRaises(ValidationError):
            validate_time(300, 299)
        with self.assertRaises(ValidationError):
            validate_time(-1, 299)

    def test_time_must_be_integer(self):
        with self.assertRaises(ValidationError):
            validate_time("12", 299)

    def test_overrides_accept_known_algorithms(self):
        validate_overrides({"cpuAlgorithm": "FCFS"})

    def test_overrides_reject_unknown_algorithm(self):
        with self.assertRaises(ValidationError):
            validate_overrides({"cpuAlgorithm": "MAGIC"})


if __name__ == "__main__":
    unittest.main()

import copy
import json
import unittest
from pathlib import Path

from chronoos.api import _analysis
from chronoos.engine.simulator import run_simulation
from chronoos.validation import validate_config

SHARED = Path(__file__).resolve().parents[2] / "shared" / "parity"


def _load(name: str) -> dict:
    return json.loads((SHARED / name).read_text(encoding="utf-8"))


def _normalize(value):
    return json.loads(json.dumps(value))


def _first_event_difference(actual: dict, expected: dict) -> str:
    for index, (a, e) in enumerate(zip(actual["events"], expected["events"])):
        if a != e:
            return f"events[{index}] differ: python={a} typescript={e}"
    if len(actual["events"]) != len(expected["events"]):
        return f"event count differs: python={len(actual['events'])} typescript={len(expected['events'])}"
    return "non-event fields differ"


class ParityWithTypeScriptTests(unittest.TestCase):
    cases = _load("cases.json")["cases"]
    golden = {case["name"]: case for case in _load("golden.json")["cases"]}

    def test_every_shared_case_has_golden_output(self):
        self.assertEqual(sorted(c["name"] for c in self.cases), sorted(self.golden))

    def test_python_engine_matches_typescript_output(self):
        for case in self.cases:
            with self.subTest(case=case["name"]):
                config = validate_config(copy.deepcopy(case["config"]))
                expected = self.golden[case["name"]]
                log = _normalize(run_simulation(config))
                if log != expected["log"]:
                    self.fail(_first_event_difference(log, expected["log"]))
                analysis = _normalize(_analysis(log))
                self.assertEqual(analysis["analytics"], expected["analytics"])
                self.assertEqual(analysis["findings"], expected["findings"])


if __name__ == "__main__":
    unittest.main()

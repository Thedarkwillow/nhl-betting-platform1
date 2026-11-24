"""Offline smoke and fail-closed tests for NFL history archiving."""
import importlib.util
import json
import gzip
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "nfl_history", Path(__file__).resolve().parents[1] / "scripts/collect-nfl-history.py")
HISTORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HISTORY)

class FakeFrame:
    def __init__(self, rows):
        self.rows = rows
        self.columns = list(rows[0]) if rows else []
    def __len__(self):
        return len(self.rows)
    def to_dicts(self):
        return list(self.rows)

class HistoryTest(unittest.TestCase):
    def test_required_player_identity_and_nonempty_archive(self):
        with tempfile.TemporaryDirectory() as d:
            previous = HISTORY.ROOT
            try:
                HISTORY.ROOT = Path(d)
                frame = FakeFrame([{"season": 2025, "week": 1, "player_id": "p1",
                                    "passing_yards": 150}])
                result = HISTORY.store(Path(d) / "outputs/nfl/history/2025", "player_weekly", frame)
                self.assertEqual(result["records"], 1)
                archive = Path(d) / result["path"]
                with gzip.open(archive, "rt") as f:
                    payload = json.load(f)
                self.assertTrue(payload["retrospectivePlayerStatsNotPregameLines"])
                self.assertFalse(payload["commercialDisplayCleared"])
                self.assertEqual(payload["rows"][0]["passing_yards"], 150)
            finally:
                HISTORY.ROOT = previous
    def test_reject_empty_or_anonymous_stats(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                HISTORY.store(Path(d), "player_weekly", FakeFrame([]))
            with self.assertRaises(ValueError):
                HISTORY.store(Path(d), "player_weekly", FakeFrame([{"season": 2025, "week": 1}]))
    def test_research_source_provenance(self):
        self.assertIn("nextgen_passing", HISTORY.SOURCES)
        self.assertIn("pfr_def", HISTORY.SOURCES)
        self.assertIn("kicking_pbp", HISTORY.SOURCES)
        self.assertIn("pbp_specialty_events", HISTORY.SOURCES)
        self.assertIn("punter_player_id", HISTORY.REQUIRED_SPECIALTY)
        self.assertIn("receiver_player_id", HISTORY.REQUIRED_SPECIALTY)


    def test_missing_specialty_source_fields_cannot_be_archived(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, "Specialty event dataset lacks"):
                HISTORY.store(Path(d), "pbp_specialty_events", FakeFrame([{
                    "season":2025, "week":1, "game_id":"2025_01_A_B",
                    "play_id":17, "qtr":1
                }]))
            self.assertFalse((Path(d) / "pbp_specialty_events.json.gz").exists())

    def test_valid_specialty_archive_is_outcome_only_not_pregame_quote(self):
        with tempfile.TemporaryDirectory() as d:
            original_root = HISTORY.ROOT
            try:
                HISTORY.ROOT = Path(d)
                row = {key: None for key in HISTORY.REQUIRED_SPECIALTY}
                row.update({"season":2025, "week":1,"game_id":"2025_01_A_B",
                            "play_id":17,"play_type":"run","qtr":1})
                got = HISTORY.store(Path(d),"pbp_specialty_events",FakeFrame([row]))
                with gzip.open(Path(d)/"pbp_specialty_events.json.gz","rt") as fp:
                    payload=json.load(fp)
                self.assertEqual(got["records"],1)
                self.assertTrue(payload["specialtyOutcomeOnlyNotPregameAvailable"])
                self.assertFalse(payload["modelFeatureProductionReady"])
                self.assertFalse(payload["commercialDisplayCleared"])
            finally:
                HISTORY.ROOT = original_root

if __name__ == "__main__":
    unittest.main()

"""Fail-closed regression tests: NFL 2026 historical refresh must never erase prior rows."""
import importlib.util
import unittest
from pathlib import Path

module_file = Path(__file__).resolve().parents[1] / "scripts/refresh-nfl-2026-final-history.py"
spec = importlib.util.spec_from_file_location("nfl_refresh", module_file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FakeSeries:
    def __init__(self, values): self.values = values
    def drop_nulls(self): return FakeSeries([v for v in self.values if v is not None])
    def to_list(self): return self.values

class FakeFrame:
    def __init__(self, rows):
        self.rows = rows
        self.columns = list(rows[0].keys()) if rows else []
    def __len__(self): return len(self.rows)
    def to_dicts(self): return self.rows
    def select(self, name):
        return FakeSelected([row[name] for row in self.rows])

class FakeSelected:
    def __init__(self, values): self.values = values
    def to_series(self): return FakeSeries(self.values)

class NFLRefreshTests(unittest.TestCase):
    def test_reject_partial_source_and_wrong_season(self):
        old = {"recordCount": 2}
        short = FakeFrame([{"season":2026,"week":9,"player_id":"a"}])
        with self.assertRaisesRegex(RuntimeError, "fewer records"):
            module.validate_refresh(old, short, "player_weekly")
        wrong = FakeFrame([{"season":2025,"week":9,"player_id":"a"},
                           {"season":2025,"week":9,"player_id":"b"}])
        with self.assertRaisesRegex(RuntimeError, "beyond 2026"):
            module.validate_refresh(old, wrong, "player_weekly")
    def test_reject_missing_identity_columns(self):
        with self.assertRaisesRegex(RuntimeError, "required"):
            module.validate_refresh({"recordCount":0},FakeFrame([{"week":9}]),"schedule")
    def test_accept_complete_current_season_history(self):
        obj=FakeFrame([{"season":2026,"week":9,"player_id":"a"},
                       {"season":2026,"week":9,"player_id":"b"}])
        module.validate_refresh({"recordCount":2},obj,"player_weekly")

    def test_optional_roster_and_snap_count_require_exact_identity(self):
        roster = FakeFrame([{"season":2026,"week":11,"team":"SF","gsis_id":"x"}])
        with self.assertRaisesRegex(RuntimeError, "identity"):
            module.validate_optional({"recordCount":0},
                FakeFrame([{"season":2026,"week":11,"team":"SF"}]),"weekly_rosters")
        module.validate_optional({"recordCount":1},roster,"weekly_rosters")
        snaps = FakeFrame([{"season":2026,"week":11,"game_id":"2026_11_A_B",
                             "pfr_player_id":"pfr1"}])
        module.validate_optional({"recordCount":1},snaps,"snap_counts")
        with self.assertRaisesRegex(RuntimeError, "PFR"):
            module.validate_optional({"recordCount":0},
                FakeFrame([{"season":2026,"week":11,"game_id":"1"}]),"snap_counts")
    def test_optional_refresh_cannot_erase_or_import_wrong_seasons(self):
        x = FakeFrame([{"season":2026,"week":11,"team":"SF","gsis_id":"x"}])
        with self.assertRaisesRegex(RuntimeError, "fewer rows"):
            module.validate_optional({"recordCount":2},x,"weekly_rosters")
        wrong = FakeFrame([{"season":2025,"week":11,"team":"SF","gsis_id":"x"}])
        with self.assertRaisesRegex(RuntimeError, "other seasons"):
            module.validate_optional({"recordCount":1},wrong,"weekly_rosters")

    def test_specialist_refresh_requires_preserved_unique_identities(self):
        prior = {"rows":[{"game_id":"g","play_id":1}]}
        good = FakeFrame([{"game_id":"g","play_id":1},{"game_id":"g","play_id":2}])
        module.validate_identity_preservation(prior, good, ("game_id","play_id"))
        with self.assertRaisesRegex(RuntimeError, "omits"):
            module.validate_identity_preservation(prior, FakeFrame([{"game_id":"g","play_id":2}]), ("game_id","play_id"))
        with self.assertRaisesRegex(RuntimeError, "duplicate"):
            module.validate_identity_preservation(prior, FakeFrame([{"game_id":"g","play_id":1},{"game_id":"g","play_id":1}]), ("game_id","play_id"))

if __name__=="__main__": unittest.main()

import importlib.util, pathlib, unittest
p=pathlib.Path(__file__).resolve().parents[1]/"scripts/reconcile-nba-dated-injury-cohort.py"
s=importlib.util.spec_from_file_location("cohort",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_names_and_clocks(self):
  self.assertIn("nikolajokic",m.names("Jokić, Nikola"))
  self.assertIsNone(m.utc("2026-11-01T01:30:00",True))
  self.assertIsNone(m.utc("2026-10-24T19:00:00"))
  self.assertEqual(m.ident("0022600123"),"22600123")
 def test_empty_cohort_never_claims_resolution(self):
  x=m.reconcile([],[],[],[],[],[],[])
  self.assertFalse(x["originalAggregateReproduced"]);self.assertFalse(x["original135RowLevelReconciliationVerified"]);self.assertEqual(x["newCandidateMappings"],0)

 def test_supplemental_roster_requires_dated_coverage(self):
  from datetime import datetime, timezone
  cutoff=datetime(2026,10,25,tzinfo=timezone.utc)
  row=dict(league="nba",season=2027,team_abbr="BOS",player_id=123,player_name="Fixture Player",valid_from="2026-10-20T00:00:00Z",valid_to=None,last_seen="2026-10-26T00:00:00Z")
  self.assertEqual(m.supplemental_espn_ids([row],m.names("Fixture Player"),"BOS",cutoff),{"123"})
  self.assertEqual(m.supplemental_espn_ids([{**row,"valid_from":"2026-10-26T00:00:00Z"}],m.names("Fixture Player"),"BOS",cutoff),set())
  self.assertEqual(m.supplemental_espn_ids([{**row,"last_seen":"2026-10-24T00:00:00Z"}],m.names("Fixture Player"),"BOS",cutoff),set())

 def test_exact_alias_requires_current_season_team_and_no_conflicts(self):
  row=dict(league="nba",source="nba_stats",athlete_id_source="espn",source_player_id="123",athlete_id="456",team_id="2",match_method="exact_name",match_confidence=1.0,valid_from=2026,valid_to=2027)
  self.assertEqual(m.exact_alias_candidate([row],"123",{"2"},set(),{},{}),"456")
  self.assertIsNone(m.exact_alias_candidate([{**row,"valid_to":2026}],"123",{"2"},set(),{},{}))
  self.assertIsNone(m.exact_alias_candidate([row],"123",{"3"},set(),{},{}))
  self.assertIsNone(m.exact_alias_candidate([row],"123",{"2"},{"789"},{},{}))
  self.assertIsNone(m.exact_alias_candidate([row,{**row,"athlete_id":"789"}],"123",{"2"},set(),{},{}))

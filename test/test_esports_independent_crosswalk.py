import unittest,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from esports_independent_crosswalk import resolve,scope,audit
class Test(unittest.TestCase):
 def setUp(self):
  self.r={"id":"row","league":"CS","source":"underdog","is_demo":False,"status":"active","player":{"id":"p","name":"Alias","team":"A"},"event":{"id":None,"opponent":"B","starts_at":"2026-11-25T10:00:00Z"},"observed_at":"2026-11-25T01:00:00Z","market":{"stat":"kills_on_maps_1_2","period":"full_game"}}
  self.f={"sport":"CS2","startsAt":self.r["event"]["starts_at"],"teams":["A","B"],"rosterAliases":["alias"],"matchEvidenceId":"external:1","bestOf":3,"scheduleRef":"https://example.org/schedule","rosterRef":"https://example.org/roster","matchRef":"https://example.org/match"}
  self.a={"kind":"restricted_independent_esports_research_v1","sourceDocumentSha256":"fixture","quarantinedSourceObservations":[self.r]}
  self.e={"kind":"restricted_esports_manual_crosswalk_review_v1","sourceDocumentSha256":"fixture","matchEvidence":[self.f],"playerEventLinks":[{"sourceOfferId":"row","providerPlayerId":"p","matchEvidenceId":"external:1","alias":"alias","market":"kills","maps":[1,2],"steamIdCandidate":"76561198000000001","steamIdIndependentlyVerified":False}]}
 def test_null_provider_event_resolved_without_fabrication(self):
  self.assertEqual(len(resolve(self.r,[self.f])),1)
  self.assertIsNone(self.r["event"]["id"])
  self.assertEqual(scope(self.r,"CS2"),("kills",[1,2]))
 def test_ambiguous_or_wrong_scope_rejected(self):
  self.assertEqual(audit(self.a,{**self.e,"matchEvidence":[self.f,self.f]})["excluded"]["missing_or_ambiguous_fixture"],1)
  self.assertEqual(audit(self.a,{**self.e,"matchEvidence":[{**self.f,"bestOf":1}]})["excluded"]["unknown_or_invalid_scope"],1)
  self.assertIsNone(scope(self.r,"VALORANT"))
 def test_late_review_never_qualifies(self):
  history=[{"player":"76561198000000001","event":f"{n}|{m}","date":"2026-11-20","kills":12} for n in range(10) for m in (1,2)]
  x=audit(self.a,self.e,history)
  self.assertEqual(x["counts"]["candidateHistorySufficient"],1)
  self.assertEqual(x["qualified"],0)
  self.assertFalse(x["modelPromoted"])
  self.assertEqual(x["excluded"]["steam_identity_not_corroborated"],1)

 def test_explicit_scope_candidates_for_other_games(self):
  for league,sport,stat in [("VAL","VALORANT","kills_on_maps_1_2"),("DOTA","DOTA2","last_hits_on_games_1_2"),("LOL","LOL","creep_score_on_game_1"),("COD","COD","deaths_on_map_1")]:
   row={**self.r,"league":league,"market":{"stat":stat,"period":"full_game"}}
   self.assertIsNotNone(scope(row,sport))
   self.assertIsNone(scope({**row,"market":{"stat":"kills","period":"full_game"}},sport))
  self.assertIsNone(scope({**self.r,"market":{"stat":"kills_on_maps_1_3","period":"full_game"}},"CS2"))
  self.assertIsNone(scope({**self.r,"market":{"stat":"kills_on_maps_1_2","period":"map 1"}},"CS2"))

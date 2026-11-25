import pathlib,sys,unittest
from datetime import datetime,timezone,timedelta
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from datasportsapi_quota_guard import blocked_until,quota_result
class Tests(unittest.TestCase):
 def test_shared_checkpoint(self):
  now=datetime(2026,11,25,3,tzinfo=timezone.utc)
  doc={"kind":"datasportsapi_quota_checkpoint_v1","source":"DataSportsAPI","observedAt":"2026-11-25T02:22:09Z","reason":"quota_exceeded","retryAfterSeconds":77871,"blockedUntil":"2026-11-26T00:00:00Z"}
  self.assertEqual(blocked_until([doc],now),datetime(2026,11,26,tzinfo=timezone.utc))
  self.assertIsNone(blocked_until([doc],datetime(2026,11,26,tzinfo=timezone.utc)))
  self.assertIsNone(blocked_until([{**doc,"source":"other"}],now))
 def test_archive_result_and_fallback(self):
  now=datetime(2026,11,25,3,tzinfo=timezone.utc)
  class C:rateLimitReason="rate_limited";rateLimitRetryAfterSeconds=None
  r=quota_result(C(),now)
  self.assertEqual(r["rateLimitRetryAfterSeconds"],120)
  doc=dict(kind="datasportsapi_restricted_game_archive_v1",source="DataSportsAPI",observedAt=now.isoformat(),report=r)
  self.assertEqual(blocked_until([doc],now),now+timedelta(seconds=120))

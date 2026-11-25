import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from nba_verified_absence_replay import features
class Test(unittest.TestCase):
 def test_fixed_prior_usage_stress(self):
  p=[dict(tip=i,minutes=30,points=19,rebounds=5) for i in range(20)]
  t=[dict(usage=20) for _ in range(8)]
  a,b,l=features(p,t,"points",19.5)
  self.assertEqual(l,.1);self.assertGreater(b,a)
  a,b,l=features(p,t,"rebounds",5.5)
  self.assertEqual(l,0);self.assertEqual(a,b)
  self.assertIsNone(features(p,t[:4],"points",19.5))

import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from cs2_static_hltv_research import compare
class Test(unittest.TestCase):
 def test_full_map_and_alias_guard(self):
  a=[dict(event="a",date="2026-01-01",map="mirage",team=str(i//5),teamScore=13 if i<5 else 8,player=str(i),alias="p"+str(i),kills=i,deaths=i+1) for i in range(10)]
  b=[{**r,"event":"b","player":"hltv:"+r["player"]} for r in a];b[0]["alias"]="wrong"
  x=compare(a,b);self.assertEqual(x["mapMatches"],1);self.assertEqual(x["oneToOneCandidates"],9);self.assertEqual(x["authoritativeLinksAdded"],0)

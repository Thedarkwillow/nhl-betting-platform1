"""Natural Stat Trick authorized HTML collection; never log or store access key."""
import os, json, datetime as dt, urllib.request, urllib.parse, urllib.error,time
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
DIR=ROOT/"outputs/natural-stat-trick"
HOST="https://data.naturalstattrick.com"
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def url_for(mode):
 if mode=="test":return HOST+"/game.php?season=20172018&game=21138"
 current=dt.datetime.now(dt.timezone.utc)
 y=current.year if current.month>=7 else current.year-1
 season=str(y)+str(y+1)
 return HOST+"/teamtable.php?"+urllib.parse.urlencode({"fromseason":season,"thruseason":season,"stype":2,"sit":"5v5","score":"all","rate":"n","team":"all","loc":"B","gpf":410})
def get(url,key):
 if not url.startswith(HOST+"/") or not key:raise ValueError("missing_key_or_invalid_host")
 req=urllib.request.Request(url,headers={"nst-key":key,"User-Agent":"PrivateSportsResearch/1.0","Accept":"text/html"})
 with urllib.request.build_opener(NoRedirect()).open(req,timeout=25) as r:
  raw=r.read(4_000_001)
  if len(raw)>4_000_000:raise ValueError("body_bound")
  return raw.decode("utf-8",errors="replace")
def tables(html):
 soup=BeautifulSoup(html,"html.parser")
 result=[]
 for t in soup.find_all("table"):
  h=t.find("thead");b=t.find("tbody")
  if not h or not b:continue
  head=[c.get_text(" ",strip=True) for c in h.find_all("tr")[-1].find_all(["th","td"],recursive=False)]
  rows=[[c.get_text(" ",strip=True) for c in tr.find_all(["td","th"],recursive=False)] for tr in b.find_all("tr")]
  rows=[r for r in rows if len(r)==len(head)]
  if rows and head:result.append({"headers":head,"rows":rows})
 return result
def valid_team(t):
 heads=[s.strip().lower() for s in t["headers"]]
 return "team" in heads and "cf%" in heads and "xgf%" in heads and len(t["rows"])==32 and len({r[heads.index("team")] for r in t["rows"]})==32
def main():
 mode=os.environ.get("NST_MODE","test")
 key=os.environ.get("NATURAL_STAT_TRICK_API_KEY","").strip()
 now=dt.datetime.now(dt.timezone.utc);DIR.mkdir(parents=True,exist_ok=True)
 r={"kind":"private_nst_collection_status_v1","observedAt":now.isoformat(),"mode":mode,"status":"missing_secret","requests":0,"meteredRequests":0,"modelPromoted":False}
 if mode not in ("test","current"):raise ValueError("invalid mode")
 if key:
  if mode=="current" and os.environ.get("NST_APPROVED")!="true":r["status"]="approval_not_enabled"
  else:
   r["requests"]=1;r["meteredRequests"]=int(mode=="current");r["standardTokensMaximum"]=10*int(mode=="current")
   try:
    ts=tables(get(url_for(mode),key))
    valid=[t for t in ts if valid_team(t)] if mode=="current" else [t for t in ts if len(t["rows"])>=2 and any(x.lower() in ("cf","cf%","xgf","xgf%","player","team","shots","sog") for x in t["headers"])]
    if valid:
     r["status"]="validated_historical_test" if mode=="test" else "validated_current_team_table"
     r["tables"]=len(valid);r["rows"]=sum(len(t["rows"]) for t in valid)
     if mode=="current":
      name=now.strftime("%Y%m%dT%H%M%SZ")+".json"
      with (DIR/name).open("x") as f:json.dump({"kind":"private_nst_5v5_team_snapshot_v1","observedAt":now.isoformat(),"source":url_for(mode),"tables":valid,"researchOnly":True},f)
      r["archive"]=name
    else:r["status"]="schema_unverified"
   except urllib.error.HTTPError as e:r["status"]="http_"+str(e.code)
   except Exception:r["status"]="network_or_schema_unverified"
 (DIR/(mode+"-status-latest.json")).write_text(json.dumps(r,indent=2)+"\n")
 print(json.dumps(r))
if __name__=="__main__":main()

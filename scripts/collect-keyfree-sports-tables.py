"""Owner-authorized public table research, no keys, no login/bot evasion.
One page per source, robots respected, strict table schemas, private only.
"""
import argparse,datetime as dt,json,re,time,urllib.request,urllib.error,urllib.robotparser,urllib.parse
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
DIR=ROOT/"outputs/keyfree-source-tables"
UA="PrivateSportsResearch/1.0"
SOURCES={
 "natural_stat_trick":("https://www.naturalstattrick.com/teamtable.php?fromseason=20262027&toseason=20262027&stype=2&sit=5v5&score=all&rate=n&team=all&loc=B&gpf=410","nhl_advanced"),
 "hockey_reference":("https://www.hockey-reference.com/leagues/NHL_2027_standings.html","nhl_standings"),
 "sumer_offense":("https://sumersports.com/teams/offensive/","nfl_epa"),
 "sumer_defense":("https://sumersports.com/teams/defensive/","nfl_epa"),
 "pro_football_reference":("https://www.pro-football-reference.com/years/2026/opp.htm","nfl_defense"),
 "fantasypros":("https://www.fantasypros.com/nfl/reports/snap-count-analysis/?scoring=PPR&snaps=0","nfl_usage"),
 "rbsdm":("https://rbsdm.com/","nfl_efficiency"),
 "fantasy_life":("https://www.fantasylife.com/nfl/utilization-report/season-stats","nfl_routes"),
}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
OPENER=urllib.request.build_opener(NoRedirect())
def get(url,limit=3_000_000):
 with OPENER.open(urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"text/html,text/plain"}),timeout=18) as r:
  raw=r.read(limit+1)
  if len(raw)>limit:raise ValueError("body_bound")
  return raw.decode("utf-8",errors="replace")
def allowed(url,fetch=get):
 u=urllib.parse.urlsplit(url)
 try:txt=fetch(u.scheme+"://"+u.netloc+"/robots.txt",500_000)
 except urllib.error.HTTPError as e:
  if e.code==404:return True
  return False
 except Exception:return False
 rp=urllib.robotparser.RobotFileParser();rp.parse(txt.splitlines())
 return rp.can_fetch(UA,url)
def norm(x):return re.sub(r"\s+"," ",x).strip().lower()
def num(x):
 s=x.replace(",","").replace("%","").strip()
 try:v=float(s)
 except ValueError:return None
 return v if -1000000<=v<=1000000 else None
def tables(html):
 soup=BeautifulSoup(html,"html.parser")
 for table in soup.select("table, [role=table], [role=grid]"):
  rows=[]
  for tr in table.select("tr, [role=row]"):
   cells=tr.find_all(["th","td"],recursive=False) or tr.select("[role=columnheader], [role=cell], [role=gridcell], [role=rowheader]")
   if cells:
    out=[]
    for c in cells:
     # Full player anchor, not concatenated desktop/mobile duplicate names.
     links=c.find_all("a",href=True)
     anchor=links[0].get("title") or links[0].get_text(" ",strip=True) if links else None
     if links:
      named=links[0].select_one(".full-name, .player-name, .player-name-full")
      if named:anchor=named.get_text(" ",strip=True)
     if anchor:
      # Desktop full name followed by a separate abbreviated mobile label.
      anchor=re.sub(r"\s+[A-Z]\.\s+[A-Za-z][\w.\-\u2019\u0027]+(?:\s+(?:II|III|IV))?$","",anchor).strip()
     if anchor and len(anchor.split())<2:
      anchor=None
     full=c.select_one(".full-name, .player-name, [data-player-name]")
     if full:
      val=full.get("data-player-name") or full.get_text(" ",strip=True)
      if len(val.split())>=2:anchor=val
     out.append({"text":c.get_text(" ",strip=True),"name":anchor,"stat":c.get("data-stat")})
    rows.append(out)
  if rows:yield rows
# Only declared columns. No inferred positional substitutes.
REQUIRED={
 "nhl_advanced":[("team","team"),("cf%","corsiPct"),("xgf%","xGoalsPct")],
 "nhl_standings":[("gp","games"),("gf","goalsFor"),("ga","goalsAgainst")],
 "nfl_epa":[("team","team"),("season","season"),("epa/play","epaPerPlay"),("success %","successPct"),("epa/pass","epaPass"),("epa/rush","epaRush")],
 "nfl_defense":[("tm","team"),("g","games"),("pa","pointsAllowed")],
 "nfl_usage":[("player","player"),("team","team"),("games","games"),("snaps","snaps"),("snap %","snapPct"),("tgt %","targetPerSnapPct"),("rush %","rushPerSnapPct")],
 "nfl_efficiency":[("team","team"),("off epa/play","offEpa"),("def epa/play","defEpa"),("off sr","offSuccessPct"),("def sr","defSuccessPct")],
 "nfl_routes":[("player","player"),("team","team"),("routes","routePct"),("tprr","targetsPerRoutePct"),("targets","targetSharePct"),("gms","games")],
}
NFL_TEAMS="ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS".split()
NHL_TEAMS="ANA BOS BUF CGY CAR CHI COL CBJ DAL DET EDM FLA LAK MIN MTL NSH NJD NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WSH WPG".split()
NFL_NAMES="Arizona Cardinals|Atlanta Falcons|Baltimore Ravens|Buffalo Bills|Carolina Panthers|Chicago Bears|Cincinnati Bengals|Cleveland Browns|Dallas Cowboys|Denver Broncos|Detroit Lions|Green Bay Packers|Houston Texans|Indianapolis Colts|Jacksonville Jaguars|Kansas City Chiefs|Las Vegas Raiders|Los Angeles Chargers|Los Angeles Rams|Miami Dolphins|Minnesota Vikings|New England Patriots|New Orleans Saints|New York Giants|New York Jets|Philadelphia Eagles|Pittsburgh Steelers|Seattle Seahawks|San Francisco 49ers|Tampa Bay Buccaneers|Tennessee Titans|Washington Commanders".split("|")
NHL_NAMES="Anaheim Ducks|Boston Bruins|Buffalo Sabres|Calgary Flames|Carolina Hurricanes|Chicago Blackhawks|Colorado Avalanche|Columbus Blue Jackets|Dallas Stars|Detroit Red Wings|Edmonton Oilers|Florida Panthers|Los Angeles Kings|Minnesota Wild|Montreal Canadiens|Nashville Predators|New Jersey Devils|New York Islanders|New York Rangers|Ottawa Senators|Philadelphia Flyers|Pittsburgh Penguins|Seattle Kraken|San Jose Sharks|St Louis Blues|Tampa Bay Lightning|Toronto Maple Leafs|Utah Mammoth|Vancouver Canucks|Vegas Golden Knights|Washington Capitals|Winnipeg Jets".split("|")
def team(value,kind):
 clubs=NHL_TEAMS if kind.startswith("nhl") else NFL_TEAMS
 names=NHL_NAMES if kind.startswith("nhl") else NFL_NAMES
 v=norm(value).replace(".","").strip("* ")
 v=re.sub(r"^\d+\s*","",v)
 if v.upper() in clubs:return v.upper()
 if len(v)%2==0 and v[:len(v)//2]==v[len(v)//2:] and v[:len(v)//2].upper() in clubs:return v[:len(v)//2].upper()
 alias={"jac":"JAX","wsh":"WAS","la":"LAR"} if not kind.startswith("nhl") else {"sj":"SJS","nj":"NJD","la":"LAK","tb":"TBL"}
 if v in alias:return alias[v]
 return dict(zip(map(norm,names),clubs)).get(v)
def parse(html,kind):
 output=[];needed=REQUIRED[kind]
 for rows in tables(html):
  for h,header in enumerate(rows[:5]):
   keys=[norm(c["text"]).strip("↕↑↓▲▼ ").replace("↕","").replace("▼","").replace("▲","").strip() for c in header]
   if kind=="nfl_routes":keys=["player" if x=="players" else x for x in keys]
   merged_route_id=kind=="nfl_routes" and "player" in keys and "team" not in keys
   if kind=="nhl_standings" and keys and keys[0]=="":keys[0]="team"
   req=([("team","team")]+needed if kind=="nhl_standings" else needed)
   if merged_route_id:req=[(k,v) for k,v in req if v!="team"]
   if any(keys.count(k)!=1 for k,_ in req):continue
   positions={out:keys.index(k) for k,out in req}
   for r in rows[h+1:]:
    if len(r)<=max(positions.values()):continue
    d={}
    for name,i in positions.items():
     c=r[i];v=c["text"]
     if name=="team":d[name]=team(c["name"] or v,kind) or team(v,kind)
     elif name=="player":
      if merged_route_id:
       match=re.fullmatch(r"(.+?)\s+(WR|RB|TE|QB)\s+([A-Z]{2,3})",v)
       d[name]=match.group(1) if match else None
       d["team"]=team(match.group(3),kind) if match else None
      else:d[name]=c["name"] or None
     else:
      if kind=="nfl_routes" and name.endswith("Pct") and "%" not in v:d[name]=None
      else:d[name]=num(v)
    if not d.get("team") or any(v is None for v in d.values()):continue
    if "player" in positions and len(d["player"].split())<2:continue
    if "season" in d and d["season"]!=2026:continue
    if kind=="nfl_routes" and (d["games"]<3 or d["games"]>18):continue
    if any(not 0<=v<=100 for k,v in d.items() if k.endswith("Pct")):continue
    output.append(d)
   break
 exact={}
 for x in output:
  key=(x["team"],x.get("player"))
  exact.setdefault(key,[]).append(x)
 return [a[0] for a in exact.values() if len(a)==1]
def diagnose(html):
 return [{"headers":[str(c["text"])[:70] for c in row],"cellCount":len(row)} for t in list(tables(html))[:5] for row in t[:2] if all(len(c["text"])<80 for c in row)]
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--retry-schema",action="store_true");args=ap.parse_args()
 now=dt.datetime.now(dt.timezone.utc)
 report={"kind":"private_owner_authorized_keyfree_tables_v1","generatedAt":now.isoformat(),"providers":{},"publicRows":0,"modelPromoted":False}
 data={}
 if args.retry_schema:
  prior=json.loads((DIR/"status-latest.json").read_text());report["providers"]=prior["providers"].copy();report["priorArchive"]=prior.get("archive");report["retainedStatusesFrom"]=prior["generatedAt"]
 for key,(url,kind) in SOURCES.items():
  if args.retry_schema and report["providers"].get(key,{}).get("status")!="schema_or_coverage_unverified":continue
  if not allowed(url):report["providers"][key]={"status":"robots_or_policy_unavailable"};continue
  try:
   html=get(url);rows=parse(html,kind)
   minimum=20 if kind in ("nhl_advanced","nhl_standings","nfl_epa","nfl_defense","nfl_efficiency","nfl_usage","nfl_routes") else 1
   if len(rows)<minimum:report["providers"][key]={"status":"schema_or_coverage_unverified","parsedRows":len(rows),"tableDiagnostics":diagnose(html)};continue
   data[key]={"source":url,"kind":kind,"observedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"rows":rows,"historicalPublicationTimingVerified":False,"researchOnly":True}
   report["providers"][key]={"status":"table_observed_private","rows":len(rows),"productionReady":False}
  except urllib.error.HTTPError as e:report["providers"][key]={"status":"http_"+str(e.code)}
  except Exception:report["providers"][key]={"status":"network_or_schema_refused"}
  time.sleep(2)
 DIR.mkdir(parents=True,exist_ok=True)
 if data:
  stamp=now.strftime("%Y%m%dT%H%M%SZ")
  p=DIR/(stamp+".json")
  with p.open("x") as f:json.dump({"kind":"private_keyfree_source_snapshot_v1","generatedAt":now.isoformat(),"sources":data,"modelPromoted":False},f)
  report["archive"]=str(p.relative_to(ROOT))
 (DIR/"status-latest.json").write_text(json.dumps(report,indent=2)+"\n")
 print(json.dumps({"providers":report["providers"],"publicRows":0,"modelPromoted":False}))
if __name__=="__main__":main()

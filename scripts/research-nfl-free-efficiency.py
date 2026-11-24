"""Free NFL offensive/defensive efficiency using licensed nflverse PBP.
Historical reconstruction only; no FTN fields, provider keys or raw PBP exported.
"""
import collections as C
import gzip,json,math,datetime as dt
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
YEARS=(2024,2025,2026)
def num(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def avg(v):return sum(v)/len(v) if v else None
def clamp(x,lo,hi):return max(lo,min(hi,x))
def aggregate(rows,year):
    groups=C.defaultdict(list);seen=set();bad=set()
    for r in rows:
        if r.get("season")!=year or r.get("season_type")!="REG" or not isinstance(r.get("week"),int) or not 1<=r["week"]<=18:continue
        if not r.get("game_id") or r.get("play_id") is None or not r.get("posteam") or not r.get("defteam") or r.get("posteam")==r.get("defteam"):continue
        if r.get("play_type") not in ("pass","run") or r.get("qb_kneel")==1 or r.get("qb_spike")==1 or not num(r.get("epa")):continue
        pid=(r["game_id"],r["play_id"])
        if pid in seen:bad.add(r["game_id"])
        seen.add(pid)
        k=(r["game_id"],r["week"],r["posteam"],r["defteam"],r["play_type"])
        groups[k].append(r["epa"])
    result=[]
    for (g,w,o,d,typ),v in sorted(groups.items()):
        if g in bad or len(v)<5:continue
        result.append({"season":year,"week":w,"gameId":g,"offense":o,"defense":d,"type":typ,"plays":len(v),"epaPerPlay":avg(v),"successRate":avg([int(x>0) for x in v])})
    return result
def context(rows,year,week,team,opp,typ):
    # Same season, strict prior weeks, not whole-season current aggregates.
    a=[r for r in rows if r["season"]==year and r["week"]<week and r["type"]==typ]
    o=sorted([x for x in a if x["offense"]==team],key=lambda x:x["week"])[-5:]
    d=sorted([x for x in a if x["defense"]==opp],key=lambda x:x["week"])[-5:]
    if min(len(o),len(d))<3 or len(a)<24:return None
    if len({x["gameId"] for x in o})!=len(o) or len({x["gameId"] for x in d})!=len(d):return None
    return {"offenseEPA":avg([x["epaPerPlay"] for x in o]),"defenseAllowedEPA":avg([x["epaPerPlay"] for x in d]),"leagueEPA":avg([x["epaPerPlay"] for x in a]),"offenseSuccess":avg([x["successRate"] for x in o]),"defenseAllowedSuccess":avg([x["successRate"] for x in d]),"leagueSuccess":avg([x["successRate"] for x in a]),"offenseGames":len(o),"defenseGames":len(d)}
MARKETS={"passing_yards":("pass","passing_yards", "attempts",10),"receiving_yards":("pass","receiving_yards","targets",2),"receptions":("pass","receptions","targets",2),"rushing_yards":("run","rushing_yards","carries",3)}
def trial(rows,players):
    outcomes={m:{str(y):{"n":0,"base":0.,"shadow":0.,"weeks":set()} for y in YEARS[1:]} for m in MARKETS}
    mem=C.defaultdict(list)
    for (y,w),group in sorted(_group(players).items()):
        for p in group:
            pid=p.get("player_id");team=p.get("recent_team") or p.get("team");opp=p.get("opponent_team")
            if not pid or not team or not opp:continue
            prior=[r for r in mem[pid] if (r.get("recent_team") or r.get("team"))==team][-5:]
            if len(prior)!=5 or y not in YEARS[1:]:continue
            for m,(typ,field,usage,min_usage) in MARKETS.items():
                if not num(p.get(field)) or any(not num(r.get(field)) or not num(r.get(usage)) for r in prior):continue
                if avg([r[usage] for r in prior])<min_usage:continue
                c=context(rows,y,w,team,opp,typ)
                if not c:continue
                base=avg([r[field] for r in prior])
                # Predeclared bounded efficiency sensitivity; not fitted to test results.
                factor=clamp(1+.20*(c["offenseEPA"]+c["defenseAllowedEPA"]-2*c["leagueEPA"])+.20*(c["defenseAllowedSuccess"]-c["leagueSuccess"]),.8,1.2)
                pred=base*factor;z=outcomes[m][str(y)]
                z["n"]+=1;z["base"]+=abs(base-p[field]);z["shadow"]+=abs(pred-p[field]);z["weeks"].add(w)
        for r in group:
            if r.get("player_id"):mem[r["player_id"]].append(r)
    return {m:{y:{"decidedPlayerGames":z["n"],"weeks":len(z["weeks"]),"last5MAE":z["base"]/z["n"] if z["n"] else None,"efficiencyMAE":z["shadow"]/z["n"] if z["n"] else None} for y,z in ys.items()} for m,ys in outcomes.items()}
def _group(players):
    g=C.defaultdict(list);seen=C.Counter((r.get("season"),r.get("week"),r.get("player_id")) for r in players)
    for r in players:
        k=(r.get("season"),r.get("week"),r.get("player_id"))
        if k[0] in YEARS and isinstance(k[1],int) and 1<=k[1]<=18 and r.get("season_type","REG")=="REG" and k[2] and seen[k]==1:g[k[:2]].append(r)
    return g
def read_players(year):
    f=ROOT/"outputs/nfl/history"/str(year)/"player_weekly.json.gz"
    with gzip.open(f,"rt") as z:d=json.load(z)
    if d.get("dataset")!="player_weekly" or d.get("sport")!="NFL" or d.get("recordCount")!=len(d["rows"]):raise ValueError("bad cached weekly source")
    return d["rows"]
def main():
    import nflreadpy as nfl
    rows=[];players=[]
    fields=["season","season_type","week","game_id","play_id","posteam","defteam","play_type","qb_kneel","qb_spike","epa"]
    for y in YEARS:
        d=nfl.load_pbp(seasons=y)
        if not set(fields).issubset(d.columns):raise ValueError("PBP EPA source schema missing")
        result=aggregate(d.select(fields).to_dicts(),y)
        if not result:raise ValueError("empty EPA source")
        rows.extend(result);players.extend(read_players(y))
    metrics=trial(rows,players)
    if not any(v["2026"]["decidedPlayerGames"]>0 for v in metrics.values()):raise ValueError("no matched evaluation")
    out=ROOT/"outputs/nfl/backtests";out.mkdir(parents=True,exist_ok=True)
    payload={"kind":"private_nfl_open_efficiency_research_v1","generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"source":"nflverse play-by-play (CC BY 4.0; attribution retained)","teamGameTypeRows":len(rows),"byMarket":metrics,"sameWeekEmbargo":True,"modelPromoted":False,"prospective":False,"calibrated":False,"ftnFieldsUsed":False,"note":"rbsdm-style EPA/success based on nflverse, not scraped rbsdm or SumerSports. Conditional on recorded participation; historical publication timing not reconstructed."}
    (out/"free-efficiency-latest.json").write_text(json.dumps(payload,indent=2)+"\n")
    print(json.dumps({"kind":payload["kind"],"teamGameTypeRows":len(rows),"matched2026":{k:v["2026"]["decidedPlayerGames"] for k,v in metrics.items()}}))
if __name__=="__main__":main()

#!/usr/bin/env python3
"""Offline free NFL usage research; source: nflverse play-by-play and player stats.
Not route participation, an independently frozen forecast, or a betting return."""
from collections import defaultdict,Counter
from pathlib import Path
import gzip,json,math
ROOT=Path(__file__).resolve().parents[1]
YEARS=(2024,2025,2026)
SPECS={"receiving_targets":("targets","target"),"receptions":("receptions","target"),"receiving_yards":("receiving_yards","target"),"receiving_touchdowns":("receiving_tds","target"),"rushing_attempts":("carries","carry"),"rushing_yards":("rushing_yards","carry"),"rushing_touchdowns":("rushing_tds","carry")}
def num(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def mean(v):return sum(v)/len(v)
def read(y,k):
    with gzip.open(ROOT/"outputs/nfl/history"/str(y)/(k+".json.gz"),"rt") as f:d=json.load(f)
    if d.get("sport")!="NFL" or d.get("dataset")!=k or d.get("recordCount")!=len(d.get("rows",[])) or d.get("retrospectivePlayerStatsNotPregameLines") is not True:raise ValueError("invalid archive")
    return d["rows"]
def regular(r,y):return r.get("season")==y and isinstance(r.get("week"),int) and 1<=r["week"]<=18 and r.get("season_type","REG")=="REG"
def aggregate(plays,y):
    team=defaultdict(Counter);player=defaultdict(Counter);seen=set();opponents={};weeks={}
    for p in plays:
        if not regular(p,y):continue
        gid,play,t,o=p.get("game_id"),p.get("play_id"),p.get("posteam"),p.get("defteam")
        if not gid or play is None:continue
        if (gid,play) in seen:raise ValueError("duplicate play")
        seen.add((gid,play))
        if not t or not o or t==o:continue
        k=(gid,t)
        if k in opponents and opponents[k]!=o:raise ValueError("conflicting opponent")
        opponents[k]=o;weeks[k]=p["week"]
        kind=None;pid=None
        if p.get("play_type")=="pass" and p.get("pass_attempt")==1 and p.get("receiver_player_id"):
            kind="target";pid=p["receiver_player_id"]
        elif p.get("play_type")=="run" and p.get("rush_attempt")==1 and p.get("rusher_player_id"):
            kind="carry";pid=p["rusher_player_id"]
        if kind is None:continue
        if not isinstance(pid,str) or not pid:continue
        zone=p.get("yardline_100");red=num(zone) and 0<zone<=20
        for c in (team[k],player[(gid,t,pid)]):
            c[kind]+=1
            if red:c["red_"+kind]+=1
    return team,player,opponents,weeks
def forecasts(prior,own,defense,league,stat,kind):
    if len(prior)<5 or min(len(own),len(defense))<3 or len(league)<24:return None
    last=prior[-5:];long=prior[-10:]
    if any(x["total"]<=0 for x in last):return None
    n=sum(x["opportunities"] for x in long)
    if n<(10 if kind=="target" else 10):return None
    base=mean([x["value"] for x in last])
    share=sum(x["opportunities"] for x in last)/sum(x["total"] for x in last)
    volume=mean(own[-5:]);ref=mean(league)
    if ref<=0:return None
    factor=max(.8,min(1.2,1+(mean(defense[-5:])/ref-1)*.5))
    usage=share*volume*sum(x["value"] for x in long)/n
    matchup=usage*factor
    result={"last5":base,"share_volume":usage,"matchup":matchup,"blend":.5*base+.5*matchup}
    if stat.endswith("_tds"):
        red=sum(x["red"] for x in long)
        # Red-zone efficiency is a conservative count proxy; TDs outside the
        # red zone are retained in the actual and cannot be called red-zone TDs.
        if red>=3:
            ratio=(red/n)
            recent=sum(x["red"] for x in last)/max(1,sum(x["opportunities"] for x in last))
            adj=max(.8,min(1.2,1+.5*(recent/ratio-1)))
            result["redzone_blend"]=.5*base+.5*matchup*adj
        else:result["redzone_blend"]=result["blend"]
    return result
def evaluate(data):
    errors=defaultdict(lambda:defaultdict(lambda:[0,0.,0.]));counts=Counter();weeks_seen=defaultdict(set)
    for y in YEARS:
        plays,rows=data[y];team,person,opp_of,week_of=aggregate(plays,y)
        hist=defaultdict(list);own=defaultdict(list);defense=defaultdict(list);league=defaultdict(list)
        byweek=defaultdict(list)
        for p in rows:
            if regular(p,y) and isinstance(p.get("player_id"),str):byweek[p["week"]].append(p)
        game_team=defaultdict(list)
        for (gid,t),week in week_of.items():game_team[(week,t)].append(gid)
        for week,batch in sorted(byweek.items()):
            updates=[];seen=set()
            for p in batch:
                pid,t=p["player_id"],p.get("team",p.get("recent_team"));o=p.get("opponent_team")
                if pid in seen:raise ValueError("duplicate weekly player")
                seen.add(pid)
                gs=game_team[(week,t)]
                if len(gs)!=1 or opp_of.get((gs[0],t))!=o:continue
                gid=gs[0];a=person.get((gid,t,pid));tot=team.get((gid,t))
                if not a or not tot:continue
                for market,(stat,kind) in SPECS.items():
                    if not num(p.get(stat)) or a[kind]<=0 or tot[kind]<=0:continue
                    h=(pid,t,market)
                    # Forecast made from preceding weeks only, on observed
                    # current exposure cohort; NOT a pregame availability model.
                    f=forecasts(hist[h],own[(t,kind)],defense[(o,kind)],league[kind],stat,kind)
                    if f and y>=2025:
                        k=(y,market);counts[k]+=1;weeks_seen[k].add(week)
                        for name,pred in f.items():
                            e=pred-p[stat];row=errors[k][name]
                            row[0]+=1;row[1]+=abs(e);row[2]+=e*e
                    updates.append((h,{"value":p[stat],"opportunities":a[kind],"total":tot[kind],"red":a["red_"+kind]}))
            for h,v in updates:hist[h].append(v)
            for (gid,t),c in team.items():
                if week_of[(gid,t)]!=week:continue
                for kind in ("target","carry"):
                    if c[kind]<=0:continue
                    own[(t,kind)].append(c[kind]);defense[(opp_of[(gid,t)],kind)].append(c[kind]);league[kind].append(c[kind])
    def score(k):
        return {n:{"mae":round(e[1]/e[0],6),"rmse":round(math.sqrt(e[2]/e[0]),6)} for n,e in errors[k].items() if e[0]}
    markets={}
    for m in SPECS:
        a,b=(2025,m),(2026,m);train,test=score(a),score(b);choice=min(train,key=lambda n:train[n]["mae"]) if counts[a]>=100 and len(weeks_seen[a])>=5 else None
        markets[m]={"trainingRows":counts[a],"testRows":counts[b],"testWeeks":len(weeks_seen[b]),"training":train,"evaluation":test,"selectedFrom2025Only":choice}
    return {"kind":"nfl_free_pbp_usage_research_v1","source":"nflverse (CC BY 4.0 where applicable)","trainingSeason":2025,"testSeason":2026,"markets":markets,"trueRoutesRunAvailable":False,"modelPromoted":False,"prospective":False,"actualLineAccuracy":None,"limitations":"Conditional on current observed target/carry and archived player row. Not a verified pregame universe. Share denominator is identifiable targeted passes or carries in cached source, not all routes or offensive snaps. Missing players do not become zeros. Current week outcomes embargoed. Retrospective test, no authenticated quote, settlement or ROI."}
def main():
    result=evaluate({y:(read(y,"pbp_specialty_events"),read(y,"player_weekly")) for y in YEARS})
    if not any(x["testRows"]>=30 and x["selectedFrom2025Only"] for x in result["markets"].values()):raise ValueError("insufficient matched source sample")
    (ROOT/"outputs/nfl/backtests/free-pbp-usage-latest.json").write_text(json.dumps(result,indent=2)+"\n")
if __name__=="__main__":main()

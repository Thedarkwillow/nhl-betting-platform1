"""Prior-date LoL count forecasts; no actual current-game inputs in features.
ChainCC research attribution: https://chaincc.lol/free/data/ (CC BY 4.0).
GPTilt/Leaguepedia series metadata: https://huggingface.co/datasets/gptilt/lol-esports-matches (CC BY-SA 3.0; research only).
No original offers or production approval."""
import csv,gzip,hashlib,io,json,re,sys,urllib.request,urllib.error
from collections import defaultdict,Counter,deque
from datetime import date,timedelta
from statistics import mean
from math import isfinite
MARKETS=("kills","deaths","assists","creep_score")
ROLES={"top":"top","jng":"jungle","jg":"jungle","jungle":"jungle","mid":"mid","middle":"mid","bot":"bot","adc":"bot","bottom":"bot","sup":"support","support":"support"}
def norm(x):return re.sub(r"[^a-z0-9]","",str(x or "").casefold())
def field(r,*keys):return next((r[k] for k in keys if r.get(k) not in (None,"")),None)
def num(x):
    try:
        v=float(x)
        return v if isfinite(v) and v>=0 else None
    except (ValueError,TypeError):return None
def integer(x):
    n=num(x);return int(n) if n is not None and n.is_integer() else None
def duration(x):
    if isinstance(x,str) and re.fullmatch(r"\d{1,3}:\d{2}",x):
        a,b=map(int,x.split(":"));v=a*60+b if b<60 else None
    else:
        # Published seconds-scale field; reject values that could be minutes.
        v=integer(x)
    return v if v is not None and 600<=v<=5400 else None
def get(url,cap):
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"LoLHistoricalResearch/1.0"}),timeout=50) as f:raw=f.read(cap+1)
    if len(raw)>cap:raise ValueError("source bound")
    return raw
def read_players(raw):
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as f:unpacked=f.read(180_000_001)
    if len(unpacked)>180_000_000:raise ValueError("expanded bound")
    rd=csv.DictReader(io.StringIO(unpacked.decode("utf-8-sig")));cols=rd.fieldnames
    rows=[]
    for r in rd:
        try:
            day=str(field(r,"date","game_date","datetime","game_datetime"))[:10];date.fromisoformat(day)
            p=field(r,"player_id","playerid","player_name","playername","player");g=field(r,"game_id","gameid")
            t=field(r,"team_id","teamid","teamname","team_name","team");label=field(r,"teamname","team_name","team")
            role=ROLES.get(str(field(r,"position","role")).lower())
            vals={m:integer(r.get(m)) for m in MARKETS[:3]};vals["creep_score"]=integer(field(r,"total_cs","totalcs","creep_score","cs"))
            if not p or not g or not t or not label or not role or None in vals.values():continue
            x=dict(event=str(g),player=str(p),date=day,team=str(t),teamLabel=str(label),role=role,side=str(r.get("side") or "").lower(),champion=field(r,"champion","champion_name"),league=r.get("league"),patch=r.get("patch"),won=integer(r.get("result")),duration=duration(field(r,"game_duration_seconds","duration_seconds","gamelength","game_length","duration","game_duration","game_length_seconds")),series=field(r,"series_id","match_id","seriesid","matchid"),ordinal=integer(field(r,"game_number","game","map_number","game_index")),**vals)
            for k,keys in {"damage":("dpm","damage_per_minute"),"gold":("earnedgoldshare","earned_gold_share","goldshare","gold_share"),"vision":("vspm","vision_score_per_minute"),"gold15":("golddiffat15","gold_diff_at_15","gold_diff_at15")}.items():
                val=field(r,*keys)
                try:
                    z=float(val)
                    if isfinite(z):x[k]=z
                except (ValueError,TypeError):pass
            rows.append(x)
        except (ValueError,TypeError,KeyError):continue
    return rows,cols
def complete_games(rows):
    by=defaultdict(list);out=[];excluded=Counter()
    for r in rows:by[r["event"]].append(r)
    for a in by.values():
        teams=defaultdict(list)
        for r in a:teams[r["team"]].append(r)
        if len(a)!=10 or len({r["player"] for r in a})!=10 or len({r["date"] for r in a})!=1 or len(teams)!=2 or any(len(t)!=5 or len({r["role"] for r in t})!=5 for t in teams.values()):
            excluded["incomplete_or_duplicate_game"]+=1;continue
        ds={r["duration"] for r in a}
        dur=next(iter(ds)) if len(ds)==1 else None
        ids=list(teams);good=True
        for t,opp in ((ids[0],ids[1]),(ids[1],ids[0])):
            kills=sum(r["kills"] for r in teams[t])
            if any(r["kills"]+r["assists"]>kills for r in teams[t]):good=False
            for r in teams[t]:
                r.update(opponent=opp,teamKills=kills,opponentKills=sum(q["kills"] for q in teams[opp]),duration=dur,opponentLabel=teams[opp][0]["teamLabel"])
        if not good:excluded["impossible_kill_participation"]+=1;continue
        out.append(a)
    return out,dict(excluded)
def score(s,k,y,p):
    a=s[k];a[0]+=1;a[1]+=abs(y-p)
def evaluate(games):
    by=defaultdict(list)
    for a in games:by[a[0]["date"]].append(a)
    dates=sorted(by);cut=dates[int(.8*len(dates))] if len(dates)>=5 else None
    ph=defaultdict(lambda:deque(maxlen=30));th=defaultdict(lambda:deque(maxlen=30));allow=defaultdict(lambda:deque(maxlen=30));roleallow=defaultdict(lambda:deque(maxlen=50));globalrole=defaultdict(lambda:deque(maxlen=1000))
    scores=defaultdict(lambda:[0,0.]);matched=defaultdict(lambda:[0,0.,0.]);cover=Counter()
    for day in dates:
        for a in by[day]:
            if not cut or day<cut:continue
            for t in {r["team"] for r in a}:
                r=next(r for r in a if r["team"]==t);own=list(th[t]);opp=list(th[r["opponent"]]);oa=list(allow[r["opponent"]])
                if len(own)>=5 and len(opp)>=5 and len(oa)>=5:
                    base=mean(x["teamKills"] for x in own[-20:]);pred=(2*base+mean(oa[-20:]))/3
                    z=matched["team_kills|opponent"];z[0]+=1;z[1]+=abs(base-r["teamKills"]);z[2]+=abs(pred-r["teamKills"])
                    od=[x["duration"] for x in own if x["duration"]];dd=[x["duration"] for x in opp if x["duration"]]
                    if len(od)>=5 and len(dd)>=5 and r["duration"]:
                        z=matched["game_duration_seconds|team_opponent"];z[0]+=1;z[1]+=abs(mean(od)-r["duration"]);z[2]+=abs((mean(od)+mean(dd))/2-r["duration"])
            for r in a:
                h=list(ph[r["player"]])[-20:];own=list(th[r["team"]]);opp=list(th[r["opponent"]]);oa=list(allow[r["opponent"]])
                if len(h)<10:continue
                dur=[x for x in h if x["duration"]]
                teamdur=[x["duration"] for x in own if x["duration"]];oppdur=[x["duration"] for x in opp if x["duration"]]
                projected_duration=(2*mean(x["duration"] for x in dur[-5:])+mean(teamdur)+mean(oppdur))/4 if len(dur)>=10 and len(teamdur)>=5 and len(oppdur)>=5 else None
                tk=sum(x["teamKills"] for x in h)
                pred_team=(2*mean(x["teamKills"] for x in own)+mean(oa))/3 if len(own)>=5 and len(oa)>=5 else None
                if pred_team is not None and tk>0 and r["teamKills"]>0:
                    kp=(sum(x["kills"]+x["assists"] for x in h)+5)/(tk+10)
                    z=matched["kill_participation|prior_share"];z[0]+=1;z[1]+=abs(mean((x["kills"]+x["assists"])/x["teamKills"] for x in h if x["teamKills"]>0)-(r["kills"]+r["assists"])/r["teamKills"]);z[2]+=abs(kp-(r["kills"]+r["assists"])/r["teamKills"])
                for m in MARKETS:
                    base=mean(x[m] for x in h);y=r[m]
                    def compare(name,p):
                        z=matched[m+"|"+name];z[0]+=1;z[1]+=abs(base-y);z[2]+=abs(p-y)
                    if projected_duration and len(dur)>=10:
                        rate=sum(x[m] for x in dur)/sum(x["duration"] for x in dur);compare("duration_rate_blend",.5*base+.5*rate*projected_duration)
                    if pred_team is not None and tk>0 and m in ("kills","assists"):
                        share=sum(x[m] for x in h)/tk;compare("team_kill_share_blend",.5*base+.5*share*pred_team)
                    arole=list(roleallow[r["opponent"],r["role"],m]);gr=list(globalrole[r["role"],m])
                    if len(arole)>=10 and len(gr)>=50 and mean(gr)>0:
                        ratio=max(.8,min(1.2,(len(arole)*mean(arole)/mean(gr)+30)/(len(arole)+30)))
                        compare("opponent_position_blend",base*(.5+.5*ratio))
                    # Historical form only. Current damage, gold, vision and early-game stats never enter forecasts.
                    for feature in ("damage","gold","vision","gold15"):
                        v=[x[feature] for x in h if feature in x]
                        if len(v)>=10:
                            cover[feature]+=int(m=="kills")
                            if m in ("kills","assists","creep_score") and feature!="gold15" and mean(v)>0:
                                ratio=max(.85,min(1.15,mean(v[-5:])/mean(v)));compare("prior_"+feature+"_form",base*(.5+.5*ratio))
        for a in sorted(by[day],key=lambda a:a[0]["event"]):
            for t in {r["team"] for r in a}:
                r=next(r for r in a if r["team"]==t);th[t].append(r);allow[t].append(r["opponentKills"])
            for r in a:
                ph[r["player"]].append(r)
                for m in MARKETS:
                    roleallow[r["opponent"],r["role"],m].append(r[m]);globalrole[r["role"],m].append(r[m])
    return {"holdoutStart":cut,"completeGames":len(games),"durationGames":sum(bool(a[0]["duration"]) for a in games),"historicalFeatureCoverage":dict(cover),"comparisons":{k:{"n":z[0],"baselineMAE":z[1]/z[0],"candidateMAE":z[2]/z[0]} for k,z in matched.items() if z[0]},"priorDatesOnly":True,"observedTeamRoleConditional":True,"modelPromoted":False}
def bind_series(games,metadata):
    # Only exact published game identifiers. No inferred series from dates or team names.
    ix=defaultdict(list)
    for r in metadata:
        for k in {r.get("game_id"),r.get("riot_game_id")} - {None,""}:ix[str(k)].append(r)
    out=[];counts=Counter()
    for a in games:
        first=a[0];native={(r.get("series"),r.get("ordinal")) for r in a}
        if len(native)==1 and first.get("series") and type(first.get("ordinal")) is int and 1<=first["ordinal"]<=7:
            series,ordinal=next(iter(native));counts["native_explicit_scope"]+=1
        else:
            candidates=[r for r in ix.get(first["event"],[]) if str(r.get("datetime_utc",""))[:10]==first["date"] and {norm(r.get("team_blue")),norm(r.get("team_red"))}=={norm(first["teamLabel"]),norm(first["opponentLabel"])} and r.get("match_id") and integer(r.get("game_number")) in range(1,8)]
            if len(candidates)!=1:counts["missing_or_ambiguous_explicit_scope"]+=1;continue
            series="gptilt:"+str(candidates[0]["match_id"]);ordinal=integer(candidates[0]["game_number"]);counts["exact_cross_source_scope"]+=1
        out.extend({**r,"event":str(series)+"|"+str(ordinal)} for r in a)
    return out,dict(counts)
def calibration(rows,scope):
    # Fixed diagnostic thresholds, not archived betting lines. Fit bins in first 60% dates,
    # calibration 60-80%, score final 20%; only earlier-day outcomes in empirical distributions.
    thresholds={"kills":[2.5,4.5,6.5],"deaths":[2.5,4.5,6.5],"assists":[4.5,7.5,10.5],"creep_score":[149.5,199.5,249.5]}
    by=defaultdict(list)
    for r in rows:by[r["date"]].append(r)
    days=sorted(by)
    if len(days)<10:return {"status":"insufficient_dates","actualPropLines":0}
    cal,hold=days[int(.6*len(days))],days[int(.8*len(days))];history=defaultdict(lambda:deque(maxlen=20));bins=defaultdict(lambda:[0,0]);sc=defaultdict(lambda:[0,0.,0.,0,0])
    for day in days:
        for r in by[day]:
            for m in MARKETS:
                a=history[r["player"],m]
                if len(a)<10:continue
                for t in thresholds[m]:
                    t=int(t*scope)+.5; p=(1+sum(x>t for x in a))/(len(a)+2);y=int(r[m]>t);k=m,min(4,int(p*5))
                    if cal<=day<hold:bins[k][0]+=1;bins[k][1]+=y
                    elif day>=hold:
                        n,w=bins[k]
                        if n<100:continue
                        q=(w+30*p)/(n+30);z=sc[m];z[0]+=1;z[1]+=(p-y)**2;z[2]+=(q-y)**2;z[3]+=y;z[4]+=int(p>.5)==y
        for r in sorted(by[day],key=lambda r:(r["event"],r["player"])):
            for m in MARKETS:history[r["player"],m].append(r[m])
    return {"calibrationStart":cal,"holdoutStart":hold,"markets":{m:{"thresholdObservations":z[0],"rawBrier":z[1]/z[0],"calibratedBrier":z[2]/z[0],"higherFrequency":z[3]/z[0]} for m,z in sc.items() if z[0]},"syntheticThresholds":True,"dependentThresholdRows":True,"actualPropLines":0,"prospectiveApproval":False}
def main():
    rows=[];sources=[]
    for y in (2025,2026):
        raw=get(f"https://chaincc.lol/data/chaincc-players-{y}.csv.gz",25_000_000);a,cols=read_players(raw);rows.extend(a);sources.append({"season":y,"sha256":hashlib.sha256(raw).hexdigest(),"rows":len(a),"columns":cols})
    games,excluded=complete_games(rows);meta=[];status="unavailable";source=None
    try:
        import pyarrow.parquet as pq
        raw=get("https://huggingface.co/datasets/gptilt/lol-esports-matches/resolve/5bffe7a/games/games.parquet",15_000_000)
        meta=pq.read_table(io.BytesIO(raw),columns=["game_id","riot_game_id","datetime_utc","team_blue","team_red","match_id","game_number"]).to_pylist();status="read";source=hashlib.sha256(raw).hexdigest()
    except Exception as e:status=type(e).__name__
    scoped,coverage=bind_series(games,meta)
    from esports_scope_history import evaluate as ev,series_rows
    scopes=[ev(scoped,MARKETS,idx) for idx in ((1,2),(1,2,3))]
    calibrations={"singleGame":calibration([r for a in games for r in a],1)}
    for idx in ((1,2),(1,2,3)):calibrations["maps1-"+str(len(idx))]=calibration(series_rows(scoped,MARKETS,idx),len(idx))
    print(json.dumps({"kind":"lol_specialist_research_v1","sources":sources,"excluded":excluded,"specialists":evaluate(games),"seriesSource":{"status":status,"sha256":source,"rows":len(meta),"coverage":coverage},"seriesScopes":scopes,"calibration":calibrations,"paidRequests":0,"rawRowsPublished":0,"actualPropLines":0,"modelPromoted":False}))
if __name__=="__main__":main()

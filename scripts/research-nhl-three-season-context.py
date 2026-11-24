#!/usr/bin/env python3
"""Private retrospective numeric forecast research. Never publish source rows."""
import collections as C
import csv, io, json, math, os, sys, urllib.request, zipfile
from datetime import date
from pathlib import Path
def mean(xs):
    values=xs if hasattr(xs,'__len__') else tuple(xs)
    return sum(values)/len(values)

SEASONS=(2023,2024,2025)
BASE="https://peter-tanner.com/moneypuck/downloads/seasonPlayersSummary/"
CANDIDATES=("form","prior_mean","recent_rate","quality_rate","opponent_rate","quality_opponent","blended")
def nonnegative(raw):
    if raw is None or not str(raw).strip(): raise ValueError("blank source field")
    v=float(raw)
    if not math.isfinite(v) or v<0: raise ValueError("invalid source value")
    return v
def normalize(row, season, role):
    if row.get("situation")!="all": return None
    gid=int(row["gameId"])
    if not str(gid).startswith(str(season)+"02"): return None
    day=date.fromisoformat(str(row["gameDate"])[:4]+"-"+str(row["gameDate"])[4:6]+"-"+str(row["gameDate"])[6:8]) if len(str(row["gameDate"]))==8 else date.fromisoformat(row["gameDate"])
    if day.year not in (season,season+1): raise ValueError("invalid season date")
    team,opp=row["playerTeam"],row["opposingTeam"]
    if not team or not opp or team==opp: raise ValueError("invalid teams")
    t=nonnegative(row["icetime"]); pid=int(row["playerId"])
    if pid<=0 or t>3900: raise ValueError("invalid participation")
    if t==0: return None
    if role=="skaters":
        sog,g=nonnegative(row["I_F_shotsOnGoal"]),nonnegative(row["I_F_goals"])
        quality={"shotsOnGoal":nonnegative(row["I_F_xOnGoal"]),"goals":nonnegative(row["I_F_xGoals"])}
        actual={"shotsOnGoal":sog,"goals":g}
    else:
        on,g=nonnegative(row["ongoal"]),nonnegative(row["goals"])
        xon,xg=nonnegative(row["xOnGoal"]),nonnegative(row["xGoals"])
        if on<g or xon<xg: raise ValueError("invalid goalie shot accounting")
        actual={"saves":on-g};quality={"saves":xon-xg}
    if any(not v.is_integer() for v in actual.values()): raise ValueError("non-integer count")
    return dict(season=season,day=day.isoformat(),game=gid,player=pid,team=team,opponent=opp,role=role,toi=t,actual=actual,quality=quality)
def download_archive(season,role):
    url=f"{BASE}{role}/{season}.zip"
    request=urllib.request.Request(url,headers={"User-Agent":"Private-NHL-Research/1.0"})
    with urllib.request.urlopen(request,timeout=65) as response:
        data=response.read(100_000_001)
    if len(data)>100_000_000: raise ValueError("archive byte bound")
    rows=[];seen=set()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        members=[m for m in z.infolist() if not m.is_dir() and m.filename.lower().endswith(".csv")]
        if not members or sum(m.file_size for m in members)>500_000_000: raise ValueError("invalid archive inventory")
        for member in members:
            with z.open(member) as raw:
                reader=csv.DictReader(io.TextIOWrapper(raw,encoding="utf-8-sig",newline=""))
                if not reader.fieldnames or not {"playerId","gameId","gameDate","situation"}.issubset(reader.fieldnames): continue
                for row in reader:
                    x=normalize(row,season,role)
                    if x is None: continue
                    key=(x["game"],x["player"])
                    if key in seen: raise ValueError("duplicate source game")
                    seen.add(key);rows.append(x)
    if len(rows)<(30000 if role=="skaters" else 1500): raise ValueError("incomplete regular season archive")
    return rows
def estimates(prior, opp, league):
    if len(prior)<5 or len(opp)<5 or len(league)<20: return None
    counts=[x[0] for x in prior]; last=prior[-20:]; ten=prior[-10:]; five=prior[-5:]
    expected=.65*mean(x[1] for x in ten)+.35*mean(x[1] for x in five)
    total_t=sum(x[1] for x in last)
    ref=mean(league)
    if total_t<=0 or ref<=0:return None
    base=.5*mean(counts[-5:])+.3*mean(counts[-10:])+.2*mean(counts)
    rate=sum(x[0] for x in last)*expected/total_t
    quality=sum(x[2] for x in last)*expected/total_t
    factor=max(.8,min(1.2,1+(mean(opp)/ref-1)*len(opp)/(len(opp)+20)))
    return dict(form=base,prior_mean=mean(counts),recent_rate=rate,quality_rate=quality,opponent_rate=rate*factor,quality_opponent=quality*factor,blended=(base+rate+quality*factor)/3)
def evaluate(rows):
    hist=C.defaultdict(list); team=C.defaultdict(lambda:C.deque(maxlen=20)); league=C.defaultdict(lambda:C.deque(maxlen=1200)); days=C.defaultdict(list)
    for r in rows:days[r["day"]].append(r)
    # Cache all-date numeric error totals, not individual forecasts.
    results=C.defaultdict(lambda:C.defaultdict(lambda:[0,0.,0.,0.]))
    counts=C.Counter();games=C.defaultdict(set);dates=C.defaultdict(set)
    for day,batch in sorted(days.items()):
        updates=[];event=C.defaultdict(list)
        for r in batch:
            event[r["game"]].append(r)
            for m,y in r["actual"].items():
                key=(r["player"],m)
                # Opponent shot generation for saves; opponent allowance for shooters.
                metric="offenseSOG" if m=="saves" else m
                pred=estimates(hist[key],team[(r["opponent"],metric)],league[metric])
                if pred and r["season"] in (2024,2025):
                    k=(r["season"],m);counts[k]+=1;games[k].add(r["game"]);dates[k].add(day)
                    for name,p in pred.items():
                        a=results[k][name];e=p-y;a[0]+=1;a[1]+=abs(e);a[2]+=e*e;a[3]+=e
                updates.append((key,(y,r["toi"],r["quality"][m])))
        # Same-day outcomes become available only after all forecasts.
        for k,val in updates:hist[k].append(val)
        for _,group in event.items():
            sk=[r for r in group if r["role"]=="skaters"]
            teams=C.defaultdict(list)
            for r in sk:teams[r["team"]].append(r)
            if len(teams)!=2 or any(len(a)!=18 for a in teams.values()):continue
            for t,players in teams.items():
                other=next(s for s in teams if s!=t)
                if any(r["opponent"]!=other for r in players):raise ValueError("game opponent conflict")
                for metric,m,source in [("shotsOnGoal","shotsOnGoal",teams[other]),("goals","goals",teams[other]),("offenseSOG","shotsOnGoal",players)]:
                    value=sum(r["actual"][m] for r in source)
                    team[(t,metric)].append(value);league[metric].append(value)
    def summarize(k):
        return {n:{"mae":round(v[1]/v[0],6),"rmse":round(math.sqrt(v[2]/v[0]),6),"bias":round(v[3]/v[0],6)} for n,v in results[k].items() if v[0]}
    report={}
    for m in ("shotsOnGoal","goals","saves"):
        a,b=(2024,m),(2025,m);train,test=summarize(a),summarize(b)
        selected=min(CANDIDATES,key=lambda x:(train[x]["mae"],CANDIDATES.index(x))) if counts[a]>=100 and len(dates[a])>=20 else None
        report[m]={"trainRows":counts[a],"testRows":counts[b],"testGames":len(games[b]),"testDates":len(dates[b]),"selectedFrom2024Only":selected,"training":train,"evaluation":test}
    return {"kind":"nhl_three_season_moneypuck_numeric_lab_v1","source":"MoneyPuck.com game-by-game regular-season archives","warmupSeason":2023,"trainingSeason":2024,"evaluationSeason":2025,"markets":report,"conditionalOnObservedAppearance":True,"originalPregameLineupVerified":False,"independentProspectiveValidation":False,"modelPromoted":False,"sourceRowsPublished":False,"limitations":"Retrospective evaluation, seasons previously inspected; source-reported final game identity and participation. Past-only same-day embargo. No actual line, payout or betting hit rate."}
def main():
    rows=[];counts={}
    for season in SEASONS:
        for role in ("skaters","goalies"):
            group=download_archive(season,role);rows.extend(group);counts[f"{season}:{role}"]=len(group)
    report=evaluate(rows);report["sourceCounts"]=counts
    if any(not x["selectedFrom2024Only"] or x["testRows"]<100 for x in report["markets"].values()):raise ValueError("insufficient chronological samples")
    dest=Path("outputs/backtests/nhl-three-season-context-latest.json");dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,indent=2)+"\n")
    print("Historical aggregate forecast audit generated privately.")
if __name__=="__main__":main()

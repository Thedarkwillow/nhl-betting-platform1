#!/usr/bin/env python3
"""NFL private numeric source-feature ablation, not prop direction or payout research."""
import collections as C
import gzip,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
YEARS=(2024,2025,2026)
SPECS={
 "passing_yards":("QB","passing_yards","attempts","passing","avg_intended_air_yards"),
 "passing_attempts":("QB","attempts","attempts","passing","avg_time_to_throw"),
 "passing_completions":("QB","completions","attempts","passing","completion_percentage_above_expectation"),
 "rushing_yards":("QB RB FB WR","rushing_yards","carries","rushing","rush_yards_over_expected_per_att"),
 "rushing_attempts":("QB RB FB WR","carries","carries","rushing","percent_attempts_gte_eight_defenders"),
 "receiving_yards":("RB FB WR TE","receiving_yards","targets","receiving","avg_yac_above_expectation"),
 "receptions":("RB FB WR TE","receptions","targets","receiving","catch_percentage"),
 "receiving_targets":("RB FB WR TE","targets","targets","receiving","percent_share_of_intended_air_yards")}
def num(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def mean(xs):return sum(xs)/len(xs)
def regular(r,y):return r.get("season")==y and isinstance(r.get("week"),int) and 1<=r["week"]<=18 and r.get("season_type",r.get("game_type","REG"))=="REG"
def read(y,k):
    path=ROOT/"outputs/nfl/history"/str(y)/(k+".json.gz")
    with gzip.open(path,"rt") as f:d=json.load(f)
    if d.get("sport")!="NFL" or d.get("dataset")!=k or d.get("recordCount")!=len(d.get("rows",[])) or d.get("retrospectivePlayerStatsNotPregameLines") is not True:raise ValueError("invalid cached source")
    return d["rows"]
def identity_map(rows):
    g=C.defaultdict(set);p=C.defaultdict(set)
    for r in rows:
        a,b=r.get("gsis_id"),r.get("pfr_id")
        if isinstance(a,str) and a and isinstance(b,str) and b:g[a].add(b);p[b].add(a)
    return {a:next(iter(bs)) for a,bs in g.items() if len(bs)==1 and len(p[next(iter(bs))])==1}
def indexed(rows,y,idfield,teamfield=None):
    result=C.defaultdict(list);seen=set();conflicts=set()
    for r in rows:
        if not regular(r,y) or not r.get(idfield):continue
        key=(r[idfield],r["week"])
        if key in seen:conflicts.add(key)
        seen.add(key);result[r[idfield]].append(r)
    return {k:sorted([r for r in rs if (k,r["week"]) not in conflicts],key=lambda r:r["week"]) for k,rs in result.items()}
def source_features(p,m,prior,team_rows,snaps,ngs,idmap,week):
    roles,stat,usage,kind,field=SPECS[m]
    if p.get("position") not in roles.split():return None
    known=[r for r in prior if num(r.get(stat)) and num(r.get(usage))]
    if len(known)<5:return None
    recent=known[-5:];u=mean([r[usage] for r in recent]);minu=10 if usage=="attempts" else 2
    if u<minu:return None
    base=mean([r[stat] for r in recent])
    own=p.get("team");opp=p.get("opponent_team")
    before=[r for r in team_rows if r["week"]<week and num(r.get(stat))]
    ownstat=[r[stat] for r in before if r.get("team")==own][-5:]
    allowed=[r[stat] for r in before if r.get("opponent_team")==opp][-5:]
    league=[r[stat] for r in before]
    if min(len(ownstat),len(allowed))<3 or len(league)<24 or mean(league)<=0:return None
    prev=known[-10:];total=sum(r[usage] for r in prev)
    if total<=0:return None
    opportunity=u*sum(r[stat] for r in prev)/total
    ref=mean(league)
    cap=lambda x:max(.7,min(1.3,x))
    core=[base,opportunity,base*cap(mean(allowed)/ref),base*cap(mean(ownstat)/ref)]
    # PFR and NGS are delayed two weeks in historical reconstruction; no current-week charts.
    sid=idmap.get(p.get("player_id"));s=[r["offense_pct"] for r in snaps.get(sid,[]) if r["week"]<=week-2 and r.get("team")==own and num(r.get("offense_pct")) and 0<=r["offense_pct"]<=100][-5:]
    s=[x/100 if x>1 else x for x in s]
    n=[r[field] for r in ngs[kind].get(p.get("player_id"),[]) if r["week"]<=week-2 and r.get("team_abbr")==own and num(r.get(field))][-5:]
    if len(s)<3 or len(n)<3:return {"base":base,"core":core,"extended":None}
    return {"base":base,"core":core,"extended":core+[mean(s),mean(n)]}
def fit(xs,ys,bases,penalty=10.):
    if len(xs)<100:return None
    width=len(xs[0]);mu=[mean([x[j] for x in xs]) for j in range(width)]
    sd=[max(1e-6,math.sqrt(mean([(x[j]-mu[j])**2 for x in xs]))) for j in range(width)]
    z=[[ (a-b)/c for a,b,c in zip(x,mu,sd)] for x in xs]
    residual=[y-b for y,b in zip(ys,bases)];intercept=mean(residual)
    error=[v-intercept for v in residual];w=[0.]*width
    for _ in range(30):
        for j in range(width):
            old=w[j];den=sum(x[j]*x[j] for x in z)+penalty
            step=(sum(x[j]*e for x,e in zip(z,error))-penalty*old)/den
            w[j]+=step
            error=[e-step*x[j] for x,e in zip(z,error)]
    return (mu,sd,w,intercept)
def predict(model,x,base):
    mu,sd,w,a=model
    return base+a+sum(v*(r-m)/s for v,r,m,s in zip(w,x,mu,sd))
def replay(raw):
    hist=C.defaultdict(list);samples=C.defaultdict(list);coverage=C.Counter()
    for y in YEARS:
        d=raw[y];idmap=identity_map(d["weekly_rosters"]);snaps=indexed(d["snap_counts"],y,"pfr_player_id")
        ngs={k:indexed(d["nextgen_"+k],y,"player_gsis_id") for k in ("passing","rushing","receiving")}
        teams=sorted([r for r in d["team_weekly"] if regular(r,y)],key=lambda r:r["week"])
        players=C.defaultdict(list)
        for r in d["player_weekly"]:
            if regular(r,y) and r.get("player_id"):players[r["week"]].append(r)
        for week,batch in sorted(players.items()):
            seen=set()
            for p in batch:
                pid=p["player_id"]
                if pid in seen:raise ValueError("duplicate player week")
                seen.add(pid)
                if y==2024:continue
                for m,spec in SPECS.items():
                    if not num(p.get(spec[1])):continue
                    f=source_features(p,m,hist[pid],teams,snaps,ngs,idmap,week)
                    if f is None:continue
                    coverage[(y,m,"core")]+=1
                    if f["extended"] is not None:coverage[(y,m,"extended")]+=1
                    samples[(y,m)].append((week,p[spec[1]],f))
            for p in batch:hist[p["player_id"]].append(p)
    results={}
    for m in SPECS:
        train=[r for r in samples[(2025,m)] if r[2]["extended"] is not None]
        test=[r for r in samples[(2026,m)] if r[2]["extended"] is not None]
        report={"matchedTrainingRows":len(train),"matchedTestRows":len(test),"coreTestRows":coverage[(2026,m,"core")],"testWeeks":len({x[0] for x in test})}
        models={key:fit([r[2][key] for r in train],[r[1] for r in train],[r[2]["base"] for r in train]) for key in ("core","extended")}
        if all(v is not None for v in models.values()) and len(test)>=30:
            out=C.defaultdict(list)
            for _,actual,f in test:
                out["last5"].append(f["base"]-actual)
                for k,model in models.items():out[k].append(predict(model,f[k],f["base"])-actual)
            report["scores"]={k:{"mae":round(mean([abs(x) for x in e]),6),"rmse":round(math.sqrt(mean([x*x for x in e])),6),"bias":round(mean(e),6)} for k,e in out.items()}
        else:report["scores"]=None
        results[m]=report
    return {"kind":"nfl_lagged_ngs_pfr_numeric_ablation_v1","source":"nflverse archived team/player stats, PFR snap counts, Next Gen Stats","trainSeason":2025,"evaluationSeason":2026,"sameWeekEmbargo":True,"advancedMinimumLagWeeks":2,"byMarket":results,"conditionalOnObservedParticipation":True,"modelPromoted":False,"bettingHitRate":None,"prospective":False,"note":"Retrospective as-of reconstruction, 2026 already observed; matched subsets only. PFR ID joins via unambiguous archived roster crosswalk; NGS exact GSIS IDs. FTN separate earlier comparison remains research-only; not part of this ablation. No historical pregame publication timestamps or expected weather/injury certainty."}
def main():
    keys=["player_weekly","team_weekly","weekly_rosters","snap_counts","nextgen_passing","nextgen_rushing","nextgen_receiving"]
    raw={y:{k:read(y,k) for k in keys} for y in YEARS}
    result=replay(raw)
    dest=ROOT/"outputs/nfl/backtests/lagged-ngs-pfr-ablation-latest.json"
    dest.write_text(json.dumps(result,indent=2)+"\n")
if __name__=="__main__":main()

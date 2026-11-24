#!/usr/bin/env python3
"""Dedicated faceoff-count challenger, chronological and conditional on appearance."""
import collections as C, importlib.util, json, math
from pathlib import Path
spec=importlib.util.spec_from_file_location("core",Path(__file__).with_name("research-nhl-expanded-probabilities.py"))
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
base=core.lab.normalize
LINES=(4.5,7.5,10.5)
def normalize(row,season,role):
    r=base(row,season,role)
    if not r or role!="skaters":return r
    try:
        w=core.lab.nonnegative(row.get("faceoffsWon"));l=core.lab.nonnegative(row.get("faceoffsLost"))
        # MoneyPuck includes both individual and faceoff report win fields.
        # Require agreement when both are present; no inferred losing counts.
        alias=row.get("I_F_faceOffsWon")
        if alias not in (None,"") and core.lab.nonnegative(alias)!=w:raise ValueError("conflicting wins")
        if not w.is_integer() or not l.is_integer():raise ValueError("non-integer")
        r["draws"]=(int(w),int(w+l))
    except (ValueError,TypeError):pass
    return r
def estimate(prior,opp):
    # All eligibility comes from prior opportunities, not current outcome.
    if len(prior)<8:return None
    recent=prior[-10:];attempts=[n for w,n in recent]
    if core.lab.mean(attempts)<4:return None
    last=prior[-20:];wins=sum(w for w,n in last);n=sum(n for w,n in last)
    if n<30:return None
    p=(wins+10)/(n+20)
    # Opponent team faceoff wins per draw; shrink toward league-neutral 50%.
    ow=sum(w for w,n in opp[-10:]);on=sum(n for w,n in opp[-10:])
    q=(ow+25)/(on+50) if len(opp)>=5 and on>=100 else None
    adjusted=max(.1,min(.9,p+.5*(.5-q))) if q is not None else p
    return attempts,p,adjusted,q is not None
def mixture(attempts,p,line):
    # Distribution of actual past attempts, integrated with a conditional
    # binomial win law. No future attempts or observed target-game usage.
    k=math.floor(line)
    return sum(sum(math.comb(n,j)*p**j*(1-p)**(n-j) for j in range(max(0,k+1),n+1)) for n in attempts)/len(attempts)
def evaluate(rows):
    days=C.defaultdict(list);history=C.defaultdict(list);team=C.defaultdict(list);scores=C.defaultdict(lambda:C.defaultdict(lambda:[0,0.,0.,0.]));counts=C.Counter();games=C.defaultdict(set);dates=C.defaultdict(set)
    for r in rows:days[r["day"]].append(r)
    for day,batch in sorted(days.items()):
        events=C.defaultdict(list);updates=[]
        for r in batch:
            events[r["game"]].append(r)
            if "draws" not in r:continue
            actual,n=r["draws"];prior=history[r["player"]];fit=estimate(prior,team[r["opponent"]]);updates.append((r["player"],r["draws"]))
            if not fit or not fit[3] or r["season"] not in (2024,2025):continue
            attempts,p,q,_=fit;wins=[(w,1,0) for w,_ in prior[-60:]]
            form=.5*core.lab.mean(w[0] for w in wins[-5:])+.3*core.lab.mean(w[0] for w in wins[-10:])+.2*core.lab.mean(w[0] for w in wins)
            season=r["season"];counts[season]+=1;games[season].add(r["game"]);dates[season].add(day)
            for name,mu,prob in (("form",form,lambda line:core.mass(wins,form,line)),("attempts_win_rate",core.lab.mean(attempts)*p,lambda line:mixture(attempts,p,line)),("opponent_adjusted",core.lab.mean(attempts)*q,lambda line:mixture(attempts,q,line))):
                a=scores[season][name];a[3]+=abs(actual-mu)
                for line in LINES:
                    predicted=min(.999999,max(.000001,prob(line)));y=int(actual>line)
                    a[0]+=1;a[1]+=(predicted-y)**2;a[2]-=math.log(predicted if y else 1-predicted)
        for pid,value in updates:history[pid].append(value)
        for event in events.values():
            sides=C.defaultdict(list)
            for r in event:sides[r["team"]].append(r)
            if len(sides)!=2 or any(len(v)!=18 or any("draws" not in r for r in v) for v in sides.values()):continue
            totals={t:(sum(r["draws"][0] for r in v),sum(r["draws"][1] for r in v)) for t,v in sides.items()}
            a,b=totals.values()
            if a[1]!=b[1] or a[0]+b[0]!=a[1] or a[1]<=0:continue
            for t,value in totals.items():team[t].append(value)
    def metrics(year):
        return {name:{"thresholds":v[0],"brier":v[1]/v[0],"logLoss":v[2]/v[0],"mae":v[3]/counts[year]} for name,v in scores[year].items() if v[0]}
    train,test=metrics(2024),metrics(2025)
    chosen=min(train,key=lambda k:(train[k]["brier"],k)) if counts[2024]>=100 and len(dates[2024])>=20 else None
    return {"kind":"nhl_faceoff_attempt_win_rate_research_v1","trainingAppearances":counts[2024],"evaluationAppearances":counts[2025],"evaluationGames":len(games[2025]),"evaluationDates":len(dates[2025]),"selectedFromTrainingOnly":chosen,"training":train,"evaluation":test,"status":"evaluated" if chosen and counts[2025]>=100 else "insufficient_exact_attempt_or_opponent_history","priorRoleFilterMeanAttempts":4,"sameDayWithheld":True,"syntheticThresholds":True,"conditionalOnAppearance":True,"actualOfferLines":False,"calibrated":False,"modelPromoted":False}
def main():
    core.lab.normalize=normalize
    rows=[]
    for year in core.lab.SEASONS:rows.extend(core.lab.download_archive(year,"skaters"))
    report=evaluate(rows)
    report["sourceRowsWithExactWinsAndLosses"]=sum("draws" in r for r in rows)
    dest=Path("outputs/backtests/nhl-faceoff-opportunity-latest.json");dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(report,indent=2)+"\n")
    print("Private faceoff opportunity report saved.")
if __name__=="__main__":main()

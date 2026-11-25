"""Chronological diagnostics, no real offer lines or production approval."""
from collections import defaultdict,deque,Counter
from math import log
from statistics import mean
import json,sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss,log_loss
from lightgbm import LGBMRegressor
from scipy.stats import nbinom,poisson
from lol_specialist_research import MARKETS,integer,norm,duration
from esports_scope_history import series_rows
TH={"kills":[2.5,4.5,6.5],"deaths":[2.5,4.5,6.5],"assists":[4.5,7.5,10.5],"creep_score":[149.5,199.5,249.5]}
def scope_recovery(games,metadata):
    # Diagnose exact-ID rejects; recover only unique exact ID with independently
    # matching duration and both teams, allowing +/-1 UTC date discrepancy.
    from datetime import date
    ix=defaultdict(list)
    for r in metadata:
        for k in {r.get("game_id"),r.get("riot_game_id")}-{None,""}:ix[str(k)].append(r)
    recovered=[];counts=Counter()
    for a in games:
        r=a[0];cs=ix.get(r["event"],[])
        if not cs:counts["no_exact_id"]+=1;continue
        cs=[x for x in cs if x.get("match_id") and integer(x.get("game_number")) in range(1,8)]
        if len(cs)!=1:counts["ambiguous_id_or_scope"]+=1;continue
        x=cs[0]
        if {norm(x.get("team_blue")),norm(x.get("team_red"))}!={norm(r["teamLabel"]),norm(r["opponentLabel"])}:counts["team_name_disagreement"]+=1;continue
        try:delta=abs((date.fromisoformat(str(x["datetime_utc"])[:10])-date.fromisoformat(r["date"])).days)
        except (ValueError,TypeError,KeyError):counts["invalid_date"]+=1;continue
        if delta==0:counts["already_exact"]+=1;continue
        if delta!=1 or not r["duration"] or duration(x.get("gamelength")) is None or abs(duration(x["gamelength"])-r["duration"])>2:counts["date_duration_mismatch"]+=1;continue
        counts["adjacent_date_duration_candidate"]+=1
        # Candidate only: no scope promotion without clock provenance.
    return dict(counts)
def rows_features(rows):
    d=defaultdict(list);h=defaultdict(lambda:deque(maxlen=20));out=defaultdict(list)
    for r in rows:d[r["date"]].append(r)
    for day in sorted(d):
        for r in d[day]:
            for m in MARKETS:
                a=list(h[r["player"],m])
                if len(a)<10:continue
                avg=mean(a);var=float(np.var(a,ddof=1));recent=mean(a[-5:]);med=float(np.median(a))
                out[m].append((day,r["event"],r["player"],r[m],a,[avg,recent,med,var,mean(a[-10:]),len(a)]))
        for r in sorted(d[day],key=lambda r:(r["event"],r["player"])):
            for m in MARKETS:h[r["player"],m].append(r[m])
    return out
def evaluate(rows,scope):
    fs=rows_features(rows);out={}
    for m,rs in fs.items():
        days=sorted({r[0] for r in rs})
        if len(days)<20:continue
        c,h=days[int(.6*len(days))],days[int(.8*len(days))]
        dev=[r for r in rs if r[0]<c];cal=[r for r in rs if c<=r[0]<h];test=[r for r in rs if r[0]>=h]
        if min(len(dev),len(cal),len(test))<100:continue
        # Fixed LightGBM settings, development only; matched holdout MAE.
        model=LGBMRegressor(n_estimators=120,num_leaves=15,min_child_samples=50,learning_rate=.05,random_state=42,n_jobs=2,verbosity=-1)
        model.fit([r[5] for r in dev],[r[3] for r in dev]);pred=np.maximum(0,model.predict([r[5] for r in test]))
        def probs(a):
            z=[]
            for day,event,player,y,v,f in a:
                mu=max(.001,f[0]);var=f[3]
                for t in TH[m]:
                    t=int(t*scope)+.5;p=(1+sum(x>t for x in v))/(len(v)+2)
                    # NB moment estimate, Poisson when underdispersed.
                    nb=nbinom.sf(t,mu*mu/(var-mu),mu/var) if var>mu+.001 else poisson.sf(t,mu)
                    z.append((p,int(y>t),float(nb)))
            return np.asarray(z)
        a,b=probs(cal),probs(test)
        if len(set(a[:,1]))!=2:continue
        p,y,nb=b.T
        logits=lambda x:np.log(np.clip(x,1e-6,1-1e-6)/np.clip(1-x,1e-6,1-1e-6)).reshape(-1,1)
        lr=LogisticRegression(C=1,max_iter=300).fit(logits(a[:,0]),a[:,1])
        iso=IsotonicRegression(out_of_bounds="clip").fit(a[:,0],a[:,1])
        variants={"empirical":p,"logistic":lr.predict_proba(logits(p))[:,1],"isotonic":iso.predict(p),"negativeBinomialOrPoisson":nb}
        out[m]={"development":len(dev),"calibration":len(cal),"test":len(test),"calibrationStart":c,"holdoutStart":h,"last20MAE":mean(abs(r[5][0]-r[3]) for r in test),"lightgbmMAE":float(np.mean(np.abs(pred-np.array([r[3] for r in test])))),"thresholdObservations":len(y),"scores":{k:{"brier":float(brier_score_loss(y,v)),"logLoss":float(log_loss(y,np.clip(v,1e-6,1-1e-6),labels=[0,1]))} for k,v in variants.items()}}
    return {"markets":out,"syntheticThresholds":True,"dependentThresholdRows":True,"priorDatesOnly":True,"modelPromoted":False,"actualPropLines":0}
def dependence(scoped):
    # Historical same-player map residual vectors. Exact two/three-map scope,
    # chronological development/calibration split, preserve paired residuals.
    g=defaultdict(dict);bad=set()
    for r in scoped:
        try:series,i=r["event"].rsplit("|",1);i=int(i)
        except (ValueError,KeyError):continue
        k=series,r["player"]
        if i in g[k]:bad.add(k)
        g[k][i]=r
    out={}
    for n in (2,3):
        d=defaultdict(list)
        for k,a in g.items():
            if k in bad or not all(i in a for i in range(1,n+1)):continue
            rs=[a[i] for i in range(1,n+1)]
            if len({x["date"] for x in rs})!=1 or len({x["team"] for x in rs})!=1:continue
            d[rs[0]["date"]].append((k,rs))
        days=sorted(d)
        if len(days)<10:continue
        cut=days[int(.8*len(days))];hist=defaultdict(lambda:deque(maxlen=20));res=defaultdict(lambda:deque(maxlen=2000));scores=defaultdict(lambda:[0,0.,0.]);rng=np.random.default_rng(42)
        for day in days:
            pending=[]
            for (series,player),rs in d[day]:
                for m in MARKETS:
                    a=hist[player,m];vals=np.asarray([r[m] for r in rs])
                    if len(a)>=10:
                        base=np.mean(np.asarray(a),axis=0);r=vals-base
                        if day>=cut and len(res[m])>=100:
                            v=np.asarray(res[m]);ix=rng.integers(0,len(v),size=(256,n))
                            joint=np.maximum(0,base+v[ix[:,0]]).sum(axis=1)
                            indep=np.maximum(0,base+np.column_stack([v[ix[:,i],i] for i in range(n)])).sum(axis=1)
                            line=int(mean(base)*n)+.5;y=int(vals.sum()>line)
                            z=scores[m];z[0]+=1;z[1]+=(np.mean(indep>line)-y)**2;z[2]+=(np.mean(joint>line)-y)**2
                        pending.append((m,r))
            for m,r in pending:res[m].append(r)
            for (series,player),rs in d[day]:
                for m in MARKETS:hist[player,m].append([r[m] for r in rs])
        out[str(n)]={"holdoutStart":cut,"markets":{m:{"n":z[0],"independentBrier":z[1]/z[0],"correlatedBrier":z[2]/z[0]} for m,z in scores.items() if z[0]}}
    return {"scopes":out,"syntheticPriorMeanLines":True,"samePlayerOnly":True,"conditionedOnCompleteSeries":True,"originalJointForecastFrozen":False,"modelPromoted":False}
def main():
    from lol_specialist_research import get,read_players,complete_games,bind_series
    import io,pyarrow.parquet as pq
    rows=[]
    for y in (2025,2026):
        a,_=read_players(get(f"https://chaincc.lol/data/chaincc-players-{y}.csv.gz",25_000_000));rows.extend(a)
    games,ex=complete_games(rows)
    raw=get("https://huggingface.co/datasets/gptilt/lol-esports-matches/resolve/5bffe7a/games/games.parquet",15_000_000)
    meta=pq.read_table(io.BytesIO(raw),columns=["game_id","riot_game_id","datetime_utc","team_blue","team_red","match_id","game_number","gamelength"]).to_pylist()
    scoped,c=bind_series(games,meta)
    data={"single":evaluate([r for a in games for r in a],1)}
    for n in (2,3):data["maps1-"+str(n)]=evaluate(series_rows(scoped,MARKETS,tuple(range(1,n+1))),n)
    print(json.dumps({"kind":"lol_advanced_research_v1","scopeDiagnostics":scope_recovery(games,meta),"scopeCoverage":c,"models":data,"dependence":dependence(scoped),"actualPropLines":0,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":main()

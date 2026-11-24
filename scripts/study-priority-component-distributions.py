#!/usr/bin/env python3
"""Prespecified chronological distribution lab. Never use holdout to select weights."""
import json, math
from pathlib import Path
import numpy as np
from lightgbm import LGBMRegressor,LGBMClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
ROOT=Path(__file__).resolve().parents[1]
LINES={"nhl_points":[.5,1.5,2.5],"nfl_passing_attempts":[24.5,29.5,34.5],"nfl_receiving_yards":[24.5,49.5,74.5]}
Q=[.1,.25,.5,.75,.9]
def weights(rows):
    from collections import Counter
    c=Counter(str(x["gameId"]) for x in rows)
    return np.array([1/c[str(x["gameId"])] for x in rows])
def metrics(p,y):
    p=np.clip(p,1e-5,1-1e-5); return {"n":len(y),"hitRate":float(np.mean((p>=.5)==y)),"brier":float(np.mean((p-y)**2)),"logLoss":float(-np.mean(y*np.log(p)+(1-y)*np.log(1-p)))}
def main():
    raw=json.loads((ROOT/"outputs/research/priority-component-features-private.json").read_text())["rows"]
    result={}
    for market,lines in LINES.items():
        rows=[x for x in raw if x["market"]==market and math.isfinite(x["actual"]) and math.isfinite(x["base"])]
        dates=sorted({r["date"] for r in rows if r["split"]=="train"})
        if len(dates)<12: continue
        cut=dates[int(.8*len(dates))]
        train=[r for r in rows if r["split"]=="train" and r["date"]<cut]
        cal=[r for r in rows if r["split"]=="train" and r["date"]>=cut]
        test=[r for r in rows if r["split"]=="holdout"]
        if min(len(train),len(cal),len(test))<50: continue
        if set(str(r["gameId"]) for r in train)&set(str(r["gameId"]) for r in test): raise ValueError("Game overlap")
        fields=sorted({k for r in train for k,v in r["features"].items() if isinstance(v,(float,int)) and math.isfinite(v)})
        def X(a): return np.array([[r["features"].get(k) if isinstance(r["features"].get(k),(int,float)) else np.nan for k in fields] for r in a],dtype=float)
        def Y(a): return np.array([r["actual"] for r in a],dtype=float)
        a,b,c=X(train),X(cal),X(test); y,z,t=Y(train),Y(cal),Y(test)
        kw=dict(n_estimators=100,num_leaves=15,max_depth=4,min_child_samples=30,learning_rate=.04,random_state=42,n_jobs=2,verbosity=-1)
        preds=[]
        for q in Q:
            model=LGBMRegressor(objective="quantile",alpha=q,**kw).fit(a,y,sample_weight=weights(train))
            preds.append(model.predict(c))
        quant=np.sort(np.asarray(preds),axis=0); qs=np.asarray(Q)[:,None]
        loss=np.maximum(qs*(t-quant),(qs-1)*(t-quant))
        # Fixed low-complexity challenger: reduce variance in sparse QB cohort.
        # Fit imputation/scaling/weights on training partition only.
        ridge=make_pipeline(SimpleImputer(strategy="median"),StandardScaler(),Ridge(alpha=30))
        ridge.fit(a,y,ridge__sample_weight=weights(train))
        ridge_pred=ridge.predict(c)
        scores={}
        for line in lines:
            ya=(y>line).astype(int);yc=(z>line).astype(int);yt=(t>line).astype(int)
            if len(set(ya))<2 or len(set(yc))<2: continue
            model=LGBMClassifier(objective="binary",**kw).fit(a,ya,sample_weight=weights(train))
            pc=model.predict_proba(b)[:,1];p=model.predict_proba(c)[:,1]
            iso=IsotonicRegression(out_of_bounds="clip",y_min=.005,y_max=.995).fit(pc,yc,sample_weight=weights(cal))
            base=np.array([r["base"] for r in test]); prior=(1+sum(ya))/(len(ya)+2)
            logistic=make_pipeline(SimpleImputer(strategy="median"),StandardScaler(),LogisticRegression(C=.1,max_iter=1000))
            logistic.fit(a,ya,logisticregression__sample_weight=weights(train))
            lp=logistic.predict_proba(c)[:,1]
            scores[str(line)]={"regularizedLogistic":metrics(lp,yt),"raw":metrics(p,yt),"calibratedResearch":metrics(iso.predict(p),yt),"priorRate":metrics(np.full(len(yt),prior),yt),"originalNumericBaselineHitRate":float(np.mean((base>line)==yt)),"alwaysHigher":float(np.mean(yt)),"alwaysLower":float(np.mean(1-yt))}
        result[market]={"training":len(train),"calibration":len(cal),"holdout":len(test),"holdoutGames":len(set(str(r["gameId"]) for r in test)),"featureCount":len(fields),"quantilePinballLoss":float(np.mean(loss)),"quantile80IntervalCoverage":float(np.mean((t>=quant[0])&(t<=quant[-1]))),"regularizedRidgeMAE":float(np.mean(abs(t-ridge_pred))),"medianMAE":float(np.mean(abs(t-quant[2]))),"baselineMAE":float(np.mean(abs(t-np.array([r["base"] for r in test])))),"thresholds":scores}
    if set(result)!=set(LINES): raise ValueError("Missing priority market cohort")
    out={"kind":"priority_component_lightgbm_quantile_v1","markets":result,"historicalSyntheticThresholdsOnly":True,"calibratedForLivePlatform":False,"modelPromoted":False}
    (ROOT/"outputs/research/priority-component-distribution-latest.json").write_text(json.dumps(out,indent=2)+"\n")
    print(json.dumps(out))
if __name__=="__main__": main()

#!/usr/bin/env python3
"""Train portable shadow coefficients only on declared pre-2026/2026-27 training split."""
import json, datetime as dt, math, os
from pathlib import Path
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
FIELDS={"nhl_points":["recent5","recent20","goals","assists","shootingRate","ice"],"nfl_receiving_yards":["base","recent5","opportunity"],"nfl_passing_attempts":["base","recent5","opportunity"]}
LINES={"nhl_points":[.5,1.5,2.5],"nfl_receiving_yards":[24.5,49.5,74.5],"nfl_passing_attempts":[24.5,29.5,34.5]}
EXPANDED=json.loads((ROOT/"src/priority-expanded-ml-markets.json").read_text())
EXPANDED_MODE=os.environ.get("PRIORITY_EXPANDED_ML")=="1"
if EXPANDED_MODE:
    FIELDS.update({k:v["fields"] for k,v in EXPANDED.items()})
    LINES.update({k:v["lines"] for k,v in EXPANDED.items()})
GOALIE_ONLY=os.environ.get("PRIORITY_GOALIE_ONLY")=="1"
if GOALIE_ONLY:
    FIELDS={"nhl_saves":EXPANDED["nhl_saves"]["fields"]}
    LINES={"nhl_saves":EXPANDED["nhl_saves"]["lines"]}
def main():
    rows=json.loads((ROOT/"outputs/research/priority-component-features-private.json").read_text())["rows"]
    models={};scores={};skipped={}
    seen=set()
    for r in rows:
        key=(r["market"],str(r["gameId"]),str(r["playerId"]))
        if key in seen: raise ValueError("duplicate market/game/player evidence")
        seen.add(key)
    for market,fields in FIELDS.items():
        cohort=[r for r in rows if r["market"]==market and all(isinstance(r["features"].get(k),(int,float)) and math.isfinite(r["features"][k]) for k in fields)]
        train=[r for r in cohort if r["split"]=="train" and r["date"]<("2026-07-01" if market.startswith("nhl") else "2026-01")]
        test=[r for r in cohort if r["split"]=="holdout"]
        if {str(r["gameId"]) for r in train}&{str(r["gameId"]) for r in test}:raise ValueError("overlapping evidence")
        if min(len(train),len(test))<50:
            skipped[market]={"train":len(train),"holdout":len(test),"reason":"insufficient evidence"}
            continue
        x=lambda a:np.array([[r["features"][k] for k in fields] for r in a])
        a,b=x(train),x(test);scale=StandardScaler().fit(a);a,b=scale.transform(a),scale.transform(b)
        count=Counter(str(r["gameId"]) for r in train);w=np.array([1/count[str(r["gameId"])] for r in train])
        models[market]={};scores[market]={}
        for line in LINES[market]:
            y=np.array([r["actual"]>line for r in train]);z=np.array([r["actual"]>line for r in test])
            if min(np.sum(y),np.sum(~y))<10:continue
            fit=LogisticRegression(C=.1,max_iter=1000).fit(a,y,sample_weight=w);p=fit.predict_proba(b)[:,1]
            models[market][str(line)]={"fields":fields,"means":scale.mean_.tolist(),"scales":scale.scale_.tolist(),"coefficients":fit.coef_[0].tolist(),"intercept":float(fit.intercept_[0])}
            scores[market][str(line)]={"n":len(test),"hitRate":float(np.mean((p>=.5)==z)),"brier":float(np.mean((p-z)**2)),"baselineHitRate":float(np.mean(np.array([r["base"]>line for r in test])==z)),"alwaysHigher":float(np.mean(z)),"alwaysLower":float(np.mean(~z))}
    d={"kind":"priority_common_features_logistic_v1","generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"trainedThrough":{"NHL":"2026-06-30","NFL":"2025 regular season"},"models":models,"historicalSyntheticHoldout":scores,"skippedMarkets":skipped,"researchOnly":True,"modelPromoted":False}
    dest=ROOT/"outputs/research"/("priority-goalie-ml-artifact.json" if GOALIE_ONLY else "priority-expanded-ml-artifact.json" if EXPANDED_MODE else "priority-common-ml-artifact.json");dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(d,indent=2)+"\n")
    print(json.dumps({"commonFeatureHoldout":scores,"modelPromoted":False}))
if __name__=="__main__":main()

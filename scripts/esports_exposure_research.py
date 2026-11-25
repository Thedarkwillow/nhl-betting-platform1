"""Historical rate x projected exposure. Current map length is never a feature."""
from collections import Counter,defaultdict
from datetime import date
from statistics import mean

def evaluate(rows,markets,exposure):
    seen=Counter((r.get("event"),r.get("player")) for r in rows)
    days=defaultdict(list)
    for r in rows:
        try:
            date.fromisoformat(r["date"])
            if seen[r["event"],r["player"]]!=1 or type(r.get(exposure)) is not int or r[exposure]<=0:continue
            if not all(type(r.get(m)) is int and r[m]>=0 for m in markets):continue
            days[r["date"]].append(r)
        except (KeyError,TypeError,ValueError):continue
    dates=sorted(days);cut=dates[int(.8*len(dates))] if len(dates)>=5 else None
    history=defaultdict(list);team_history=defaultdict(list);scores=defaultdict(lambda:[0,0.,0.,0.]);conditional=defaultdict(lambda:[0,0.,0.]);round_audit=[0,0.,0.]
    for day in dates:
        for r in days[day]:
            a=history[r["player"]][-20:]
            if not cut or day<cut or len(a)<10:continue
            expected=mean(x[exposure] for x in a[-5:])
            team=team_history[r.get("team")][-20:] if r.get("team") else []
            opp=team_history[r.get("opponent")][-20:] if r.get("opponent") else []
            expected_context=(10*expected+sum(team)+sum(opp))/(10+len(team)+len(opp))
            if len(team)>=5 and len(opp)>=5:
                round_audit[0]+=1;round_audit[1]+=abs(expected-r[exposure]);round_audit[2]+=abs(expected_context-r[exposure])
            for m in markets:
                baseline=mean(x[m] for x in a)
                rate=sum(x[m] for x in a)/sum(x[exposure] for x in a)
                projected=rate*expected
                s=scores[m];s[0]+=1;s[1]+=abs(baseline-r[m]);s[2]+=abs(projected-r[m]);s[3]+=abs((baseline+projected)/2-r[m])
                if len(team)>=5 and len(opp)>=5:
                    z=conditional[m];z[0]+=1;z[1]+=abs(baseline-r[m]);z[2]+=abs((baseline+rate*expected_context)/2-r[m])
        seen_teams=set()
        for r in sorted(days[day],key=lambda x:(x["event"],x["player"])):
            history[r["player"]].append(r)
            key=(r["event"],r.get("team"))
            if key[1] and key not in seen_teams:seen_teams.add(key);team_history[key[1]].append(r[exposure])
    return {"exposure":exposure,"validRows":sum(map(len,days.values())),"holdoutStart":cut,"markets":{m:{"n":s[0],"last20MAE":s[1]/s[0],"rateTimesProjectedExposureMAE":s[2]/s[0],"fixedBlendMAE":s[3]/s[0]} for m,s in scores.items() if s[0]},"conditionalTeamOpponentExposure":{m:{"n":z[0],"last20MAE":z[1]/z[0],"blendMAE":z[2]/z[0]} for m,z in conditional.items() if z[0]},"conditionalExposureForecast":{"n":round_audit[0],"playerMAE":round_audit[1]/round_audit[0] if round_audit[0] else None,"teamOpponentMAE":round_audit[2]/round_audit[0] if round_audit[0] else None},"observedTeamOpponentConditional":True,"priorDatesOnly":True,"usesActualCurrentExposure":False,"actualPropLines":0,"modelPromoted":False}

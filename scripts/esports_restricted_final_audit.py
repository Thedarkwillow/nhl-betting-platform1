"""Read verified result evidence from private storage, emit aggregate counts only."""
import json,sys
from pathlib import Path
from collections import Counter
from esports_result_contract import result
from esports_independent_crosswalk import resolve,scope
def main(root):
    d=Path(root)
    archive=json.loads((d/"normalized.json").read_text())
    review=json.loads((d/"identity-review.json").read_text())
    if archive.get("sourceDocumentSha256")!=review.get("sourceDocumentSha256") or review.get("reviewedAfterOriginalObservation") is not True:raise ValueError("capture binding")
    final_path=d/"official-finals.json"
    finals=json.loads(final_path.read_text()) if final_path.exists() else []
    if not isinstance(finals,list):raise ValueError("final contract")
    counts=Counter()
    for r in archive.get("quarantinedSourceObservations",[]):
        matches=resolve(r,review.get("matchEvidence",[]))
        if len(matches)!=1:counts["identity_pending"]+=1;continue
        f=matches[0];s=scope(r,f["sport"])
        links=[x for x in review.get("playerEventLinks",[]) if x.get("sourceOfferId")==r.get("id") and x.get("providerPlayerId")==r.get("player",{}).get("id") and x.get("matchEvidenceId")==f["matchEvidenceId"] and x.get("steamIdIndependentlyVerified") is True]
        if len(links)!=1 or not s:counts["identity_pending"]+=1;continue
        final=[x for x in finals if x.get("matchEvidenceId")==f["matchEvidenceId"] and x.get("sport")==f["sport"]]
        if len(final)!=1:counts["official_final_pending"]+=1;continue
        o={"sport":f["sport"],"stat":s[0],"maps":s[1],"matchEvidenceId":f["matchEvidenceId"],"verifiedPlayerId":links[0]["steamIdCandidate"],"identityVerified":True,"scoringVerified":links[0].get("scoringContractIndependentlyVerified") is True,"line":r.get("line")}
        g=result(o,final[0])
        counts[g["status"]]+=1
    print(json.dumps({"kind":"restricted_esports_final_evidence_audit_v1","counts":dict(counts),"originalForecastFrozen":False,"prospectiveAccuracy":None,"platformSettlementVerified":False,"paidRequests":0,"rawRowsPublished":0}))
if __name__=="__main__":main(sys.argv[1])

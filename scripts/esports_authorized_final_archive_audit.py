"""Read-only audit of explicitly authorized final-result documents; no provider calls.
All five sports use the strict existing result contract. Missing files remain pending."""
import json,sys
from collections import Counter,defaultdict
from pathlib import Path
from esports_result_contract import result,RULES
def audit(root):
    base=Path(root)/"outputs/esports/authorized-final-results";counts={s:Counter() for s in RULES};files=0
    for p in sorted(base.glob("*.json"))[-200:]:
        try:
            if p.stat().st_size>4_000_000:continue
            d=json.loads(p.read_text())
            if d.get("kind")!="authorized_esports_final_result_batch_v1" or d.get("sourceAuthorized") is not True:continue
            files+=1;offers=d.get("offers",[]);finals=defaultdict(list)
            for f in d.get("finals",[]):finals[f.get("sport"),f.get("matchEvidenceId")].append(f)
            for o in offers:
                s=o.get("sport")
                if s not in counts:continue
                a=finals[s,o.get("matchEvidenceId")]
                if len(a)!=1:counts[s]["missing_or_duplicate_final"]+=1;continue
                g=result(o,a[0]);counts[s][g["status"]]+=1
        except (OSError,ValueError,TypeError,KeyError):continue
    return {"kind":"esports_authorized_final_archive_audit_v1","files":files,"sports":{s:dict(c) for s,c in counts.items()},"automatedCollectionVerified":False,"sourceClaimsRequireIndependentReview":True,"platformSettlementVerified":False,"paidRequests":0,"rawRowsPublished":0}
if __name__=="__main__":print(json.dumps(audit(sys.argv[1])))

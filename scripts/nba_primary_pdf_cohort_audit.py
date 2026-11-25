"""Verify dated reconstructed OUT rows against NBA-published PDFs, no raw public output."""
import collections,datetime,hashlib,io,json,os,pathlib,re,sys,time,unicodedata,urllib.request
from zoneinfo import ZoneInfo
ET=ZoneInfo("America/New_York")
TEAM=dict(zip("ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split(),"Atlanta Hawks|Boston Celtics|Brooklyn Nets|Charlotte Hornets|Chicago Bulls|Cleveland Cavaliers|Dallas Mavericks|Denver Nuggets|Detroit Pistons|Golden State Warriors|Houston Rockets|Indiana Pacers|LA Clippers|Los Angeles Lakers|Memphis Grizzlies|Miami Heat|Milwaukee Bucks|Minnesota Timberwolves|New Orleans Pelicans|New York Knicks|Oklahoma City Thunder|Orlando Magic|Philadelphia 76ers|Phoenix Suns|Portland Trail Blazers|Sacramento Kings|San Antonio Spurs|Toronto Raptors|Utah Jazz|Washington Wizards".split("|")))
def norm(s):return re.sub("[^a-z0-9]","",unicodedata.normalize("NFKD",str(s)).encode("ascii","ignore").decode().lower())
def time_at(s):
    t=datetime.datetime.fromisoformat(s)
    if t.tzinfo is None:raise ValueError("clock")
    return t.astimezone(ET)
def url_for(t):return "https://ak-static.cms.nba.com/referee/injury/Injury-Report_"+t.strftime("%Y-%m-%d_%I_%M%p")+".pdf"
def extract(raw,t):
    import pdfplumber
    expected="Injury Report: "+t.strftime("%m/%d/%y %I:%M %p")
    current_match=current_team=current_day=None;out=[]
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        if not 1<=len(pdf.pages)<=20:raise ValueError("page count")
        for page in pdf.pages:
            text=page.extract_text() or ""
            if norm(expected) not in norm(text):raise ValueError("timestamp header")
            words=page.extract_words(x_tolerance=2,y_tolerance=2)
            by=[]
            for w in sorted(words,key=lambda w:(w["top"],w["x0"])):
                if not by or abs(w["top"]-by[-1][0]["top"])>3:by.append([w])
                else:by[-1].append(w)
            edges=None
            for line in by:
                line.sort(key=lambda w:w["x0"])
                labels={w["text"]:w["x0"] for w in line}
                if all(k in labels for k in ("Matchup","Team","Player","Current","Reason")):
                    edges=[labels[k]-4 for k in ("Matchup","Team","Player","Current","Reason")]
                    continue
                if edges is None:continue
                cols=[[] for _ in range(6)]
                for w in line:
                    col=sum(w["x0"]>=x for x in edges);cols[col].append(w["text"])
                d,match,team,player,status,_=[" ".join(x).strip() for x in cols]
                dates=re.findall(r"\d{2}/\d{2}/\d{4}",d)
                if dates:current_day=datetime.datetime.strptime(dates[0],"%m/%d/%Y").date().isoformat();current_match=current_team=None
                if re.fullmatch(r"[A-Z]{2,3}@[A-Z]{2,3}",match):current_match=match;current_team=None
                if team:current_team=team
                if current_day and current_match and current_team and player and status in ("Out","Available","Questionable","Doubtful","Probable"):
                    out.append((current_day,current_match,norm(current_team),norm(player),status))
    return out
def verify(rows,fetch):
    by=collections.defaultdict(list);counts=collections.Counter();evidence=[]
    for r in rows:
        t=time_at(r["reportAt"]);cut=time_at(r["cutoffAt"])
        if not t<=cut or (cut-t).total_seconds()>21600 or t.year!=2026 or t.month!=10 or not 24<=t.day<=31 or not r.get("reportName") or r["team"] not in TEAM:
            counts["invalid_reconstructed_binding"]+=1;continue
        by[t].append(r)
    if len(by)>64:raise ValueError("bounded report budget")
    for t,batch in sorted(by.items()):
        url=url_for(t)
        try:raw=fetch(url);entries=extract(raw,t);digest=hashlib.sha256(raw).hexdigest()
        except urllib.error.HTTPError as e:
            counts["source_unavailable"]+=len(batch)
            if e.code in (403,429):
                counts["unattempted_after_refusal"]+=sum(len(v) for k,v in by.items() if k>t);break
            continue
        except (ValueError,OSError):counts["source_or_parse_unavailable"]+=len(batch);continue
        for r in batch:
            day=t.date().isoformat();match=r["away"]+"@"+r["home"];team=norm(TEAM[r["team"]]);player=norm(r["reportName"])
            hits=[x for x in entries if x[:4]==(day,match,team,player)]
            status="primary_dated_out_verified" if len(hits)==1 and hits[0][4]=="Out" else "primary_row_missing_or_conflicting"
            counts[status]+=1
            evidence.append({"rowSha256":hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest(),"sourceUrl":url,"sourceSha256":digest,"status":status})
    return {"kind":"nba_primary_pdf_reconstructed_cohort_v1","reconstructedRows":len(rows),"distinctDatedReports":len(by),"counts":dict(counts),"originalImmutableRowsVerified":False,"untouchedHoldoutVerified":False,"freezeApproved":False,"paidRequests":0,"rawRowsPublished":0},evidence
def main():
    doc=json.loads(pathlib.Path(sys.argv[1]).read_text())
    if doc.get("kind")!="nba_reconstructed_all_unmapped_v1" or len(doc.get("rows",[]))!=135:raise ValueError("cohort")
    def fetch(url):
        time.sleep(1)
        req=urllib.request.Request(url,headers={"User-Agent":"NBAHistoricalResearch/1.0"})
        with urllib.request.urlopen(req,timeout=25) as r:
            if r.geturl()!=url:raise ValueError("redirect")
            raw=r.read(2_000_001)
        if not raw.startswith(b"%PDF") or len(raw)>2_000_000:raise ValueError("pdf contract")
        return raw
    result,evidence=verify(doc["rows"],fetch)
    dest=pathlib.Path(sys.argv[2]);fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as f:json.dump({"summary":result,"evidence":evidence},f)
    print(json.dumps(result))
if __name__=="__main__":main()

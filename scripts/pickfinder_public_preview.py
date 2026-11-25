"""Owner-reported authorized public PickFinder page capture; independent observations only."""
import datetime as dt, hashlib, json, os, pathlib, re, sys, time, urllib.error, urllib.request
from html.parser import HTMLParser
from zoneinfo import ZoneInfo
UTC=dt.timezone.utc
BASE="https://www.pickfinder.app/"
SPORTS=("cs2","valorant","league-of-legends","dota-2","call-of-duty","nba","nhl","nfl")
class Text(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style","template"):self.skip+=1
    def handle_endtag(self,tag):
        if tag in ("script","style","template"):self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip and data.strip():self.parts.append(" ".join(data.split()))
def parse(raw,book,sport,now):
    p=Text();p.feed(raw.decode("utf-8"))
    text=" ".join(p.parts)
    dates=set(re.findall(r"Updated:\s*([A-Z][a-z]{2} \d{1,2}, \d{4})",text))
    if len(dates)!=1:raise ValueError("missing or ambiguous update date")
    day=dt.datetime.strptime(dates.pop(),"%b %d, %Y").date()
    report={"pageUpdateDate":day.isoformat(),"dateMatchesReceiptET":day==now.astimezone(ZoneInfo("America/New_York")).date(),"rows":[],"originalOffersVerified":0,"quoteFreshnessVerified":False,"fullBoard":False}
    area=re.search(r"Top 3 picks\s+(.+?)\s+(?:How these are picked|The rest of the board)",text)
    if not area:
        if re.search(r"There are no .{1,150} props on the board right now",text):report["status"]="reported_empty_preview";return report
        raise ValueError("preview missing")
    # Use ranked summary plus the repeated visible player card, matchup and weekday clock.
    pattern=r"(?P<player>[^:]{1,80}):\s*(?P<side>More|Less|Higher|Lower|Over|Under)\s+(?P<line>\d+(?:\.\d+)?)\s+(?P<market>[^,]{1,100}),"
    seen=set()
    for part in re.split(r"(?:^|\s)[123]\.\s*(?:[123]\.\s*)?",area.group(1)):
        m=re.match(pattern,part.strip())
        if not m:continue
        row=m.groupdict();row["player"]=row["player"].strip()
        if not re.search(r"\b"+re.escape(row["player"])+r"\b",part[m.end():],re.I):continue
        t=re.search(r"\b([A-Za-z0-9.\-]{1,15}\s+(?:vs|@)\s+[A-Za-z0-9.\-]{1,15})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*@\s*(\d{1,2}:\d{2}\s*[AP]M)\s*ET\b",part[m.end():])
        if not t:continue
        row.update(platform=book,sport=sport,line=float(row["line"]),matchup=t[1],displayStart=t[2]+" "+t[3]+" ET",observedAt=now.isoformat(),source="pickfinder_public_preview",sourceOfferId=None,eligibleForForecast=False)
        row["side"]="Higher" if row["side"] in ("More","Higher","Over") else "Lower"
        k=(row["player"],row["market"],row["line"],row["side"],row["matchup"])
        if k not in seen:seen.add(k);report["rows"].append(row)
    if not 1<=len(report["rows"])<=3:raise ValueError("preview card count")
    report["status"]="observed_preview";return report
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**kw):return None
def run(root):
    if os.getenv("RESTRICTED_DESTINATION_VERIFIED")!="1" or not (root/".git").exists():raise ValueError("private checkout")
    dest=root/"research/pickfinder-preview"/(os.environ["GITHUB_RUN_ID"]+"-"+os.environ["GITHUB_RUN_ATTEMPT"]);dest.mkdir(parents=True,exist_ok=False)
    results={};requests=0;stop=False
    for sport in SPORTS:
        for book in ("prizepicks","underdog"):
            if stop:break
            url=BASE+"best-"+book+"-picks/"+sport;key=book+"-"+sport
            requests+=1
            try:
                req=urllib.request.Request(url,headers={"User-Agent":"AuthorizedPickFinderResearch/1.0","Accept":"text/html"})
                with urllib.request.build_opener(NoRedirect()).open(req,timeout=20) as resp:raw=resp.read(4_000_001)
                if len(raw)>4_000_000:raise ValueError("byte cap")
                now=dt.datetime.now(UTC);r=parse(raw,book,sport,now)
                r.update(sourceUrl=url,sha256=hashlib.sha256(raw).hexdigest(),receivedAt=now.isoformat())
                with (dest/(key+".json")).open("x") as f:json.dump(r,f,sort_keys=True)
                results[key]={"status":r["status"],"rows":len(r["rows"]),"pageUpdateDate":r["pageUpdateDate"],"sameDay":r["dateMatchesReceiptET"]}
            except urllib.error.HTTPError as e:
                results[key]={"status":"http_error","code":e.code};stop=e.code in (401,403,429)
            except Exception as e:results[key]={"status":"failed_closed","reason":type(e).__name__}
            if not stop:time.sleep(2)
        if stop:break
    report={"requests":requests,"stoppedOnRefusal":stop,"pages":results,"individualObservations":sum(x.get("rows",0) for x in results.values()),"originalOffersVerified":0,"freshnessVerified":0,"rawRowsPublished":0}
    with (dest/"receipt.json").open("x") as f:json.dump(report,f,sort_keys=True)
    print(json.dumps(report))
def test():
    now=dt.datetime(2026,11,25,8,tzinfo=UTC)
    html=b"<p>Updated: Nov 25, 2026</p><h2>Top 3 picks</h2><ol><li>1. PlayerA: More 26.5 Maps 1-2 Kills, 10 of 10<h3>PlayerA</h3><p>More 26.5 Maps 1-2 Kills</p><p>AA vs BB</p><p>Wed @ 5:30AM ET</p></li></ol><h2>How these are picked</h2>"
    r=parse(html,"prizepicks","cs2",now);assert len(r["rows"])==1 and r["rows"][0]["line"]==26.5 and not r["rows"][0]["eligibleForForecast"]
    assert parse(b"<p>Updated: Nov 24, 2026</p><p>There are no fixed-payout CS2 PrizePicks props on the board right now.</p>","prizepicks","cs2",now)["status"]=="reported_empty_preview"
    try:parse(b"<p>Updated: Nov 25, 2026</p>Sign in","underdog","cs2",now)
    except ValueError:pass
    else:raise AssertionError("login page accepted")
if __name__=="__main__":
    if sys.argv[1]=="--test":test()
    else:run(pathlib.Path(sys.argv[1]).resolve())

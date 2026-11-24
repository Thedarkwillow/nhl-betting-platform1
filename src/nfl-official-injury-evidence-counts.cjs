"use strict";
/** Source-native NFL.com status totals, no implied healthy/active players.
 * The original official report must already exist as a first-Git archive.
 * Never use a snapshot committed after a frozen bet to revise the old input.
 */
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const validSource=x=>typeof x==="string"&&
 /^https:\/\/(?:fantasy-www|www)\.nfl\.com\/news\/[a-z0-9-]+$/.test(x);
function summarize(archive,{firstGitAt,now}={}){
 const at=time(now),git=time(firstGitAt),cap=time(archive?.capturedAt);
 const empty={kind:"nfl_first_party_reported_injury_counts_v1",
  officialFirstGitVerified:false,capturedAt:null,rows:0,out:0,
  questionable:0,doubtful:0,ambiguous:0,
  activeGamedayVerified:false,missingMeansHealthy:false,
  approvedSelections:0,providerRequests:0,modelPromoted:false};
 if(archive?.kind!=="nfl_first_party_published_game_status_v1"||
    archive?.missingIsHealthy!==false||archive?.activeGameRosterVerified!==false||
    !Array.isArray(archive.sources)||archive.sources.length===0||
    !archive.sources.every(validSource)||!Array.isArray(archive.rows)||
    ![at,git,cap].every(Number.isFinite)||
    cap>git+1000||git>at||at-cap>12*3600000||
    cap>at)return empty;
 const out={...empty,officialFirstGitVerified:true,capturedAt:archive.capturedAt};
 const seen=new Set();
 for(const x of archive.rows){
  if(x?.season!==2026||!Number.isInteger(x.week)||x.week<1||x.week>18||
     !/^[A-Z]{2,3}$/.test(x.team??"")||
     !/^00-\d{7}$/.test(x.gsisId??"")||
     !Number.isFinite(time(x.modifiedAt))||time(x.modifiedAt)>cap)continue;
  const k=[x.team,x.gsisId,x.season,x.week].join("|");
  if(seen.has(k)){out.ambiguous++;continue;}seen.add(k);
  if(!["out","questionable","doubtful"].includes(x.status))continue;
  out.rows++;out[x.status]++;
 }
 return out;
}
module.exports={summarize};

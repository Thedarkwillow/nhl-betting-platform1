"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {validate,providerSummary,files}=require("../scripts/private-source-history-connections.cjs");
const sha=b=>crypto.createHash("sha1").update("blob "+b.length+"\0").update(b).digest("hex");
test("only pinned historical research is accepted",()=>{
 const row={gameId:1,playerId:1,gameDate:"2026-11-01",team:"A",opponent:"B",minutes:20,points:10,rebounds:3,assists:4,steals:1,blocks:0,turnovers:1,threePointersMade:2};
 const doc={kind:"nba_historical_mirror_research_v1",season:"2026-27",source:"Hugging Face cbratkovics/nba-game-logs",historicalAppearancesOnly:true,officialFinalClockVerified:false,capturedAt:"2026-11-24T18:20:18Z",gameCount:1,rows:[row]};
 const raw=Buffer.from(JSON.stringify(doc));
 assert.equal(validate(raw,"2026-27",sha(raw)).rows,1);
 assert.throws(()=>validate(raw,"2026-27","a".repeat(40)),/blob/);
 for(const x of [{...doc,kind:"nba_private_partner_board_v1"},{...doc,officialFinalClockVerified:true},{...doc,rows:[{...row,gameDate:"2026-11-24"}]}]){
  const b=Buffer.from(JSON.stringify(x));assert.throws(()=>validate(b,"2026-27",sha(b)));
 }
 assert.equal(files.length,4);
});
test("separate provider records count native fixtures and completed maps but never certify original offers",()=>{
 const x=providerSummary({kind:"restricted_esports_free_provider_observations_v1",grid:{fixtures:[{title:"LOL"}]},pandascore:{fixtures:[{title:"CS2"}]},opendota:{games:[{players:[{},{}]}]}});
 assert.equal(x.LOL.nativeFixtures,1);assert.equal(x.CS2.nativeFixtures,1);assert.equal(x.DOTA2.nativePlayerRows,2);
 assert.ok(Object.values(x).every(t=>t.originalOffersVerified===0&&t.independentlyVerifiedMapRows===0));
 assert.throws(()=>providerSummary({kind:"authorized_esports_original_offer_export_v1"}));
});

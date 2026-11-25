'use strict';
// Manual research comparison of selected frozen candidates; never submit or optimize a wager.
const {summarize}=require('../src/lineup-dependence-bounds-research.cjs');
function inspect(legs,now){
 const t=Date.parse(now);
 if(!Number.isFinite(t)||!Array.isArray(legs)||legs.length<2||legs.length>6)throw Error('invalid research selection');
 const ids=new Set(),platform=legs[0]?.platform;
 if(!['PrizePicks','Underdog'].includes(platform))throw Error('platform');
 for(const l of legs){
  if(!l||l.platform!==platform||typeof l.id!=='string'||!l.id||ids.has(l.id)||l.researchOnly!==true||!l.playerId||!l.gameId||!['Higher','Lower'].includes(l.side)||!Number.isFinite(l.line)||!Number.isFinite(l.probability)||l.probability<0||l.probability>1||!Number.isFinite(Date.parse(l.frozenAt))||Date.parse(l.frozenAt)>t||!Number.isFinite(Date.parse(l.startsAt))||Date.parse(l.startsAt)<=t)throw Error('invalid candidate');
  ids.add(l.id);
 }
 // Do not pretend conditional estimates are unconditional marginal probabilities.
 const comparable=legs.every(l=>l.probabilityConditionalOnDecided===false);
 const result=comparable?summarize(legs):null;
 return {kind:'local_pick_builder_research_v1',platform,size:legs.length,selection:legs.map(l=>l.id),dependenceSensitivity:result,conditionalMarginalsOnly:!comparable,entryTermsVerified:false,correlationVerified:false,platformEligibilityVerified:false,payout:null,expectedValue:null,researchOnly:true,bettingEligible:false,wagersPlaced:0};
}
module.exports={inspect};
if(require.main===module){try{const fs=require('node:fs');const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const r=inspect(input.legs,new Date().toISOString());if(!process.argv[3])throw Error('private output required');fs.writeFileSync(process.argv[3],JSON.stringify(r)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({state:'research_builder_saved',size:r.size,conditionalMarginalsOnly:r.conditionalMarginalsOnly,wagersPlaced:0,rawRowsPublished:0}));}catch{console.error('Research builder rejected selection');process.exitCode=1;}}

"use strict";
const fs=require("node:fs"),path=require("node:path");
const {assessNhlModelReadiness}=require("../src/nhl-model-release-gate.cjs");
const ROOT=path.resolve(__dirname,"..");
function main(){
 const report=JSON.parse(fs.readFileSync(path.join(ROOT,"outputs/grading/nhl-latest.json"),"utf8"));
 const assessment=assessNhlModelReadiness(report.individualPropAudit?.explicitProspective);
 const artifact={...assessment,generatedAt:new Date().toISOString(),
  originalGradingGeneratedAt:report.generatedAt??null,
  scope:"private_precommitted_model_selected_individual_props",
  noVendorRequests:true};
 const file=path.join(ROOT,"outputs/health/nhl-prospective-model-release-latest.json");
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(artifact,null,2)+"\n");
 console.log(JSON.stringify({selected:assessment.selectedPregamePicks,graded:assessment.graded,
  decided:assessment.decided,pending:assessment.pending,
  modelPromotionAllowed:false,issues:assessment.unresolved}));
 return artifact;
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};

"use strict";
function calibrationStatus(report,{minimumDecisions=200,minimumDates=20}={}){
 const graded=(report?.graded||[]).filter(p=>p.correct!==null&&Number.isFinite(p.probability)&&p.probability>0&&p.probability<1);
 const dates=new Set(graded.map(p=>p.gameDate)).size;
 const sufficient=graded.length>=minimumDecisions&&dates>=minimumDates;
 const brier=graded.length?graded.reduce((s,p)=>s+(p.probability-(p.correct?1:0))**2,0)/graded.length:null;
 return {calibrated:false,eligibleForCalibration:sufficient,decisions:graded.length,distinctGameDates:dates,brierScore:brier,reason:sufficient?"Enough observations to attempt out-of-sample calibration; not yet validated":"Insufficient real pregame graded predictions for calibration",warning:"A Brier score alone does not establish calibration. Do not display probabilities as verified."};
}
module.exports={calibrationStatus};

"use strict";
// A deep-link token is a candidate only, never original-app authentication.
function parseProjectionToken(token,side,line){
 if(typeof token!=="string"||token.length>100||!Number.isFinite(line)||line<0)return null;
 const m=/^([1-9][0-9]{0,29})-([ou])-([0-9]+(?:\.[0-9]+)?)$/.exec(token);
 if(!m||Number(m[3])!==line||(m[2]==="o"?"Higher":"Lower")!==side)return null;
 return {projectionIdCandidate:m[1],direction:side,line};
}
module.exports={parseProjectionToken};

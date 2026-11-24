"use strict";
// Source: https://sportsgameodds.com/docs/data-types/stats
// Important NHL exception: "points" is goals; "goals+assists" is hockey points.
const NHL_STAT_TO_MARKET=Object.freeze({
  points:"goals",
  "goals+assists":"points",
  assists:"assists",
  shots_onGoal:"shotsOnGoal",
  blocks:"blockedShots",
  goalie_saves:"saves"
});
const HISTORICAL_BOOK_FIELDS=Object.freeze({
  openLine:"openOverUnder",
  closeLine:"closeOverUnder",
  openPrice:"openOdds",
  closePrice:"closeOdds"
});
function marketForStatID(statID){
 if(typeof statID!=="string" || !Object.hasOwn(NHL_STAT_TO_MARKET,statID))return null;
 return NHL_STAT_TO_MARKET[statID];
}
function bookmakerCloseLine(book){
 if(!book || typeof book!=="object")return null;
 const v=book[HISTORICAL_BOOK_FIELDS.closeLine];
 if(v===null||v===undefined||v==="")return null;
 const number=Number(v);
 return Number.isFinite(number)&&number>=0?number:null;
}
module.exports={NHL_STAT_TO_MARKET,HISTORICAL_BOOK_FIELDS,marketForStatID,bookmakerCloseLine};

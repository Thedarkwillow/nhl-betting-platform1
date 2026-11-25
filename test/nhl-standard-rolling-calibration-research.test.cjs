"use strict";
const test=require("node:test"),a=require("node:assert/strict"),{evaluate}=require("../src/nhl-standard-rolling-calibration-research.cjs");
function rows(days){return Array.from({length:days},(_,i)=>Array.from({length:20},(_,j)=>({market:"shotsOnGoal",gameStartAt:`2026-11-${String(i+1).padStart(2,"0")}T20:00:00Z`,outcome:{status:"decided",side:j<8?"Higher":"Lower"},shadow:{decisions:{champion:{side:"Higher"}},variants:{champion:{status:"research_only",probabilities:{higher:.65,lower:.35}}}}}))).flat();}
test("rolling calibration never uses current day or insufficient previous dates",()=>{a.deepEqual(evaluate(rows(5)).markets,{});const r=evaluate(rows(6));a.equal(r.markets.shotsOnGoal.n,20);a.equal(r.markets.shotsOnGoal.dates,1);a.ok(r.markets.shotsOnGoal.calibratedBrier<r.markets.shotsOnGoal.championBrier);a.equal(r.originalForecastFrozen,false);a.equal(r.modelPromoted,false);});

test("lag sensitivity excludes previous calendar day",()=>{a.deepEqual(evaluate(rows(6),{minimumDayGap:2}).markets,{});const r=evaluate(rows(7),{minimumDayGap:2});a.equal(r.markets.shotsOnGoal.n,20);a.equal(r.minimumDayGap,2);a.equal(r.finalAvailabilityTimestampVerified,false);});

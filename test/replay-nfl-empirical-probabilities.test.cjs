'use strict';
const t=require('node:test'),a=require('node:assert/strict');
const {replay}=require('../scripts/replay-nfl-empirical-probabilities.cjs');
const rows=Array.from({length:15},(_,i)=>({year:2024,week:i+1,playerId:'fixture',stats:{carries:10,rushing_yards:20}}));
const target={year:2025,week:1,playerId:'fixture',stats:{carries:10,rushing_yards:20}};
t('prior-only synthetic replay reports finite scores and calibration bins',()=>{
 const x=replay([...rows,target]).find(x=>x.market==='rushing_yards');
 a.equal(x.n,1);a.ok(Number.isFinite(x.logLoss));a.ok(Number.isFinite(x.brier));
 a.equal(x.bins.reduce((s,b)=>s+b.n,0),1);
 a.deepEqual(replay([...rows,target]),replay([target,...rows].reverse()));
});
t('short history and duplicate player weeks fail safely',()=>{
 a.deepEqual(replay([...rows.slice(0,14),target]),[]);
 a.throws(()=>replay([...rows,target,target]),/duplicate/);
});
t('same target probability does not depend on target outcome',()=>{
 const x=replay([...rows,target]).find(x=>x.market==='rushing_yards');
 const y=replay([...rows,{...target,stats:{carries:10,rushing_yards:99}}]).find(x=>x.market==='rushing_yards');
 a.equal(x.bins.find(b=>b.n).meanProbability,y.bins.find(b=>b.n).meanProbability);
 a.notEqual(x.brier,y.brier);
});

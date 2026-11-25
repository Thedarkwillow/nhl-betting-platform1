'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inspect}=require('../scripts/pickfinder-local-builder.cjs'),{persist}=require('../scripts/pickfinder-alert-inbox.cjs');
test('manual builder cannot assert payout or joint probability and rejects mixed platforms',()=>{
 const now='2026-11-25T12:00:00Z',a={platform:'PrizePicks',id:'a',playerId:'p',gameId:'g',side:'Higher',line:5.5,probability:.65,probabilityConditionalOnDecided:true,researchOnly:true,frozenAt:'2026-11-25T11:55:00Z',startsAt:'2026-11-25T18:00:00Z'},b={...a,id:'b',playerId:'p2'};
 const x=inspect([a,b],now);assert.equal(x.payout,null);assert.equal(x.dependenceSensitivity,null);assert.equal(x.bettingEligible,false);assert.throws(()=>inspect([a,{...b,platform:'Underdog'}],now));
});
test('private inbox is idempotent and does not send external notifications',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pf-inbox-'));try{const r={id:'fixture',state:'condition_met',receipt:'a'.repeat(64)};assert.equal(persist(root,[r]),1);assert.equal(persist(root,[r]),0);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'research/pickfinder-alert-inbox',r.receipt+'.json'))).notificationSent,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});

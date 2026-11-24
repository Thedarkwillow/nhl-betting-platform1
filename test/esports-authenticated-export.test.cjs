"use strict";
const t=require("node:test"),a=require("node:assert/strict"),{official,validate}=require("../scripts/collect-authorized-esports-export.cjs");
t("strict HTTPS host boundary",()=>{a.ok(official("PrizePicks","https://www.prizepicks.com/export"));a.ok(!official("PrizePicks","https://prizepicks.com.evil.test/export"));a.ok(!official("Underdog","http://underdogsports.com/export"));a.ok(!official("PrizePicks","https://user:secret@prizepicks.com/export"));});
t("unknown or demo export fails closed",()=>{a.throws(()=>validate({},"PrizePicks",new Date().toISOString()));});

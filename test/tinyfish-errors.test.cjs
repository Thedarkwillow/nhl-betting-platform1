"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {isInsufficientCredits}=require("../src/tinyfish-errors.cjs");
test("TinyFish insufficient credit is not retryable",()=>{
 assert.equal(isInsufficientCredits(402,JSON.stringify({error:{code:"INSUFFICIENT_CREDITS"}})),true);
 assert.equal(isInsufficientCredits(500,JSON.stringify({error:{code:"INSUFFICIENT_CREDITS"}})),false);
 assert.equal(isInsufficientCredits(402,JSON.stringify({error:{code:"OTHER"}})),false);
 assert.equal(isInsufficientCredits(402,""),false);
});

"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {examples,fit,predict,evaluate}=require("../scripts/independent-chronological-challenger.cjs");
const day=i=>new Date(Date.UTC(2023,0,1+i)).toISOString().slice(0,10);
function rows(){return Array.from({length:1000},(_,i)=>({sport:"NBA",player:"P",scope:"full_game",event:String(i),date:day(i),start:Date.parse(day(i)),end:Date.parse(day(i)),known:Date.parse(day(i)),values:{points:10+i%7}}));}
test("features do not use target stat or same-date history",()=>{
 const a=rows().slice(0,20),x=examples(a).at(-1);a.at(-1).values.points=99;const y=examples(a).at(-1);
 assert.equal(x.base,y.base);assert.deepEqual(x.features,y.features);assert.equal(x.threshold,y.threshold);assert.notEqual(x.y,y.y);
 a[18].known=a[19].start;assert.equal(examples(a).at(-1).vals.length,x.vals.length-1);
});
test("ridge challenger and separate calibration/holdout",()=>{
 const a=rows(),r=evaluate(a,{train:day(330),calibrate:day(660)}),g=r.groups['["NBA","full_game","points"]'];
 assert.equal(g.holdout,340);assert.equal(g.challenger.n,g.baseline.n);assert.ok(Number.isFinite(g.challenger.logLoss));assert.ok(g.approxCluster95Interval);assert.equal(r.modelPromoted,false);assert.equal(r.thresholdType,"synthetic_prior_mean_half_point");
 const changed=rows();for(let i=660;i<changed.length;i++)changed[i].values.points=99;
 const e=examples(a),f=examples(changed),train=x=>x.filter(z=>z.date<day(330));assert.deepEqual(fit(train(e)),fit(train(f)));assert.equal(predict(e[0],fit(train(e))),predict(f[0],fit(train(f))));
});
test("sparse data remains unqualified",()=>{const r=evaluate(rows().slice(0,50));assert.equal(Object.values(r.groups)[0].status,"insufficient_sample");});

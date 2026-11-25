"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{validate}=require("../scripts/validate-execution-roadmap.cjs");
test("checked milestone requires exact evidence; pending must not be falsely logged",()=>{const l="- [x] **[ESP-001]** scoped test\n",e="| ESP-001 | 2026-11-25 | [run](https://github.com/a/b/actions/runs/123) |\n";assert.equal(validate(l).valid,false);assert.equal(validate(l+e).valid,true);assert.equal(validate(l.replace("[x]","[ ]")+e).valid,false);assert.equal(validate(l+l+e).valid,false);});

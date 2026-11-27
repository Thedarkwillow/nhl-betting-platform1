'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const workflow=name=>fs.readFileSync(path.join(__dirname,'../.github/workflows',name+'.yml'),'utf8').split('\n').filter(line=>!/^\s*#/.test(line)).join('\n');
test('dedicated research workflows retain sole ownership of shared report generation and archival',()=>{
 const advanced=workflow('private-advanced-component-evidence'),yardage=workflow('private-seven-priority-nov16-research'),paper=workflow('private-nhl-validation-paper-audit');
 for(const token of ['scripts/backtest-nfl-yardage-volume-efficiency.cjs','outputs/nfl/backtests/yardage-volume-efficiency-latest.json']){
  assert.ok(yardage.includes(token));assert.ok(!advanced.includes(token));assert.ok(!paper.includes(token));
 }
 for(const token of ['scripts/report-nhl-validation-and-paper-audit.cjs','outputs/health/nhl-validation-and-paper-audit-latest.json','outputs/research/market-calibration-v3']){
  assert.ok(paper.includes(token));assert.ok(!advanced.includes(token));assert.ok(!yardage.includes(token));
 }
 for(const token of ['scripts/report-advanced-component-evidence.cjs','src/nfl-position-kicker-context-trial.cjs','outputs/health/advanced-component-evidence-latest.json','outputs/nfl/backtests/position-kicker-context-latest.json','outputs/health/nhl-form-usage-position-v4-latest.json','outputs/health/nhl-standard-tail-weight-v5-latest.json'])assert.ok(advanced.includes(token));
 assert.match(advanced,/git rebase -q origin\/main \|\| \{ git rebase --abort; exit 1; \}/);
 assert.match(advanced,/git push -q origin HEAD:main/);
 assert.doesNotMatch(advanced,/git push.*(?:--force| -f )/);
});

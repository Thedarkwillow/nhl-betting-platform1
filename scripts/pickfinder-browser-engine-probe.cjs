'use strict';
// Read-only browser-engine comparison. No account data, raw DOM, or cookies are logged.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {Builder}=require('selenium-webdriver');
const chrome=require('selenium-webdriver/chrome');
const {pacific}=require('./pacific-morning-capture-gate.cjs');
const {ORIGIN}=require('./pickfinder-browser.cjs');
const {openHostedBoard}=require('./pickfinder-unattended-runner.cjs');
const fixture='<!doctype html><html><body><div>Premium</div><button aria-label="Open user menu">Menu</button><button>NBA</button><table><tbody><tr><td><a href="/players/nba/a">Fixture A</a></td></tr><tr><td><a href="/players/nba/b">Fixture B</a></td></tr></tbody></table><button aria-label="Next page">Next</button></body></html>';
function snapshot(){
 const body=document.body;
 return {premium:body.innerText.split('\n').some(x=>x.trim()==='Premium'),
  userMenu:!!document.querySelector('button[aria-label="Open user menu"]'),
  tables:document.querySelectorAll('table').length,
  profileRows:[...document.querySelectorAll('tbody tr')].filter(r=>r.querySelector('a[href*="/players/"]')).length,
  nextPage:!!document.querySelector('button[aria-label="Next page"]')};
}
function sameOrigin(url){try{return new URL(url).origin===ORIGIN;}catch{return false;}}
function allowed(){const p=pacific(new Date());return ![5,6,8,9].includes(p.hour);}
async function driver(){
 const options=new chrome.Options().addArguments('--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-logging');
 return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}
async function waitPremium(d){
 await d.wait(async()=>{if(!sameOrigin(await d.getCurrentUrl()))return false;const x=await d.executeScript(snapshot);return x.premium&&x.userMenu;},15000);
}
// The hosted wrapper exposes only newPage/close; use the actual page context.
async function browserState(page){return page.context().storageState();}
function sameCounts(a,b){return ['premium','userMenu','tables','profileRows','nextPage'].every(k=>a[k]===b[k]);}
async function safeStage(name,fn){try{return await fn();}catch{throw new Error('probe_stage:'+name);}}
async function fixtureRun(){
 const browser=await chromium.launch({headless:true});
 let d;
 try{
  const page=await browser.newPage();await page.setContent(fixture);
  const pw=await page.evaluate(snapshot);
  const state=await browserState(page);assert.ok(Array.isArray(state.cookies));assert.ok(Array.isArray(state.origins));
  d=await driver();await d.get('data:text/html;charset=utf-8,'+encodeURIComponent(fixture));
  const se=await d.executeScript(snapshot);
  assert.deepEqual(pw,{premium:true,userMenu:true,tables:1,profileRows:2,nextPage:true});
  assert.deepEqual(se,pw);assert.equal(sameCounts(pw,se),true);assert.equal(sameCounts(pw,{...se,profileRows:3}),false);
  console.log(JSON.stringify({state:'offline_fixture_verified',playwright:pw,selenium:se,liveVerified:false}));
 }finally{if(d)await d.quit();await browser.close();}
}
async function live(){
 if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.PICKFINDER_AUTOMATION_AUTHORIZED!=='1'||!allowed())throw Error('live_not_authorized_or_protected_hour');
 let context,d;
 try{
  const start=Date.now(), opened=await openHostedBoard(chromium,process.env);
  context=opened.context;const page=opened.page;
  if(!sameOrigin(page.url()))throw Error('unexpected_origin');
  const pw=await page.evaluate(snapshot),pwMs=Date.now()-start;
  if(!pw.premium||!pw.userMenu)throw Error('playwright_auth_unverified');
  console.log(JSON.stringify({engine:'playwright',state:'premium_board_observed',elapsedMs:pwMs,...pw}));
  if(!allowed())throw Error('protected_hour');
  // Transfer only the authorized first-party browser state in memory; no disk/export/logs.
  const state=await safeStage('playwright_session_state',()=>browserState(page));
  const startSe=Date.now();d=await safeStage('selenium_launch',()=>driver());
  await d.manage().setTimeouts({pageLoad:20000,script:10000});
  await safeStage('selenium_initial_navigation',()=>d.get(ORIGIN+'/props'));
  if(!sameOrigin(await d.getCurrentUrl()))throw Error('selenium_origin_unverified');
  const host=new URL(ORIGIN).hostname;
  for(const c of state.cookies){
   const domain=String(c.domain).replace(/^\./,'');
   if(!(host===domain||host.endsWith('.'+domain))||!['pickfinder.app','www.pickfinder.app'].includes(domain))continue;
   if(c.expires>0&&c.expires<=Date.now()/1000)continue;
   const cookie={name:c.name,value:c.value,domain:c.domain,path:c.path,secure:c.secure,httpOnly:c.httpOnly};
   if(c.expires>0)cookie.expiry=Math.floor(c.expires);
   if(['Strict','Lax','None'].includes(c.sameSite))cookie.sameSite=c.sameSite;
   await safeStage('selenium_cookie_import',()=>d.manage().addCookie(cookie));
  }
  const local=state.origins.find(x=>x.origin===ORIGIN)?.localStorage||[];
  await safeStage('selenium_origin_storage',()=>d.executeScript(function(items){for(const x of items)localStorage.setItem(x.name,x.value);},local));
  await safeStage('selenium_refresh',()=>d.navigate().refresh());await safeStage('selenium_premium_verification',()=>waitPremium(d));
  const se=await d.executeScript(snapshot);
  console.log(JSON.stringify({engine:'selenium',state:'premium_board_observed',elapsedMs:Date.now()-startSe,...se}));
  console.log(JSON.stringify({state:'live_read_only_probe_verified',sameObservedCounts:sameCounts(pw,se),fullCoverageVerified:false,originalOffersVerified:false,rawDataPublished:false}));
 }finally{if(d)await d.quit();if(context)await context.close();}
}
(async()=>{if(process.argv[2]==='live')await live();else await fixtureRun();})().catch(e=>{const allowed=/^probe_stage:(playwright_session_state|selenium_launch|selenium_initial_navigation|selenium_cookie_import|selenium_origin_storage|selenium_refresh|selenium_premium_verification)$/.test(e?.message||'');console.error(JSON.stringify({state:'browser_engine_probe_failed_closed',stage:allowed?e.message.slice(12):'other_or_gate',accountDataLogged:false}));process.exitCode=1;});

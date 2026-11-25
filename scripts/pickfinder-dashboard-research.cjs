'use strict';
// Capture visible sporting tables and cards only, without account details or actions.
async function captureDashboard(page,name){
 if(!['Games','Discrepancies','Popular'].includes(name))throw Error('dashboard scope');
 const url=new URL(page.url());if(url.origin!=='https://www.pickfinder.app'||!['/games','/discrepancies','/popular'].includes(url.pathname))throw Error('route');
 const observedAt=new Date().toISOString();
 const snapshot=await page.evaluate(()=>{
  const visible=e=>e.getClientRects().length>0;
  const cell=c=>({text:c.innerText.trim().slice(0,1000),labels:[...c.querySelectorAll('img[alt]')].map(i=>i.alt.slice(0,100))});
  const tables=[...document.querySelectorAll('main table')].filter(visible).map(t=>({headers:[...t.querySelectorAll('thead th')].map(cell),rows:[...t.querySelectorAll('tbody tr')].filter(visible).map(tr=>[...tr.cells].map(cell))}));
  const cards=[...document.querySelectorAll('main a[href*="/players/"],main a[href*="/games/"]')].filter(visible).flatMap(a=>{
   const u=new URL(a.href);if(u.origin!==location.origin)return [];
   return [{path:u.pathname,prop:u.searchParams.get('prop'),text:a.innerText.trim().slice(0,1000),displayedTimes:[...a.querySelectorAll('time[datetime]')].filter(visible).map(t=>({datetime:t.getAttribute('datetime'),label:t.innerText.trim().slice(0,100)}))}];
  });
  return {tables,cards};
 });
 return {name,path:url.pathname,observedAt,...snapshot,originalOffersVerified:false,modelInputsApproved:false};
}
module.exports={captureDashboard};

"use strict";
const targets={
 skaters:"https://moneypuck.com/moneypuck/playerData/seasonSummary/2026/regular/skaters.csv",
 goalies:"https://moneypuck.com/moneypuck/playerData/seasonSummary/2026/regular/goalies.csv",
 teams:"https://moneypuck.com/moneypuck/playerData/seasonSummary/2026/regular/teams.csv",
 faceoffGoalies:"https://www.dailyfaceoff.com/starting-goalies",
 faceoffLines:"https://www.dailyfaceoff.com/teams/san-jose-sharks/line-combinations"
};
async function main(){
 for(const [name,url]of Object.entries(targets)){
  try{
   const res=await fetch(url,{signal:AbortSignal.timeout(22000),headers:{"User-Agent":"NHL-Research-Licensed-Data-Adapter/1.0","Accept":"text/csv,text/html"}});
   const body=await res.text(),csv=body.includes(",")&&name!=="faceoffGoalies"&&name!=="faceoffLines";
   const out={name,status:res.status,bytes:Buffer.byteLength(body),type:res.headers.get("content-type")};
   if(csv)out.columns=body.split(/\r?\n/,1)[0].replace(/^\uFEFF/,"").split(",").slice(0,145);
   else {out.hasConfirmed=/Confirmed/.test(body);out.hasUpdated=/Last updated/.test(body);
    out.hasNextData=/__NEXT_DATA__/.test(body);out.hasAppJson=/application\/ld\+json/.test(body);
    out.hasDate=/2026-11-0[23]/.test(body);out.hasGoalieText=/starting goalie/i.test(body);
    out.headings=[...body.matchAll(/<h[123][^>]*>(.{0,250}?)<\/h[123]>/gi)].slice(0,3).map(x=>x[1].replace(/<[^>]+>/g,""));
    const i=body.indexOf('<script id="__NEXT_DATA__"'),open=i>=0?body.indexOf('>',i):-1,close=open>=0?body.indexOf('</script>',open):-1;
    const m=open>=0&&close>=0?[null,body.slice(open+1,close)]:null;
    if(m){try{
      const data=JSON.parse(m[1]),paths=[];
      function walk(v,p,d){
       if(d>7||paths.length>75||v===null||typeof v!=="object")return;
       if(Array.isArray(v)){if(v.length)walk(v[0],p+"[0]",d+1);return;}
       for(const [key,val]of Object.entries(v)){
        if(/goalie|starter|team|line|combination|player|report|date|updated|source|confirmed|matchup|games/i.test(key)){
          paths.push({path:p+"."+key,type:Array.isArray(val)?"array("+val.length+")":typeof val,keys:val&&typeof val==="object"&&!Array.isArray(val)?Object.keys(val).slice(0,15):null});
        }
        if(val&&typeof val==="object")walk(val,p+"."+key,d+1);
       }
      } walk(data,"root",0);
      out.nextDataRoot=Object.keys(data);out.pageProps=Object.keys(data.props?.pageProps||{});
      out.paths=paths.slice(0,75);
      if(name==="faceoffGoalies"){
       const row=data.props?.pageProps?.data?.[0]||{};
       out.gameKeys=Object.keys(row);
       out.statusFields=Object.fromEntries(Object.entries(row).filter(([k,v])=>/status|confirmed|source|updated|date|time|news/i.test(k)).map(([k,v])=>[k,typeof v==="string"?v.slice(0,120):typeof v]));
      }
      if(name==="faceoffLines"){
       const l=data.props?.pageProps?.combinations||{};
       out.firstLineKeys=Object.keys(l.lines?.[0]||{});
       out.firstLineShape=Object.fromEntries(Object.entries(l.lines?.[0]||{}).map(([k,v])=>[k,Array.isArray(v)?{type:"array",length:v.length,firstKeys:Object.keys(v[0]||{})}:v&&typeof v==="object"?{type:"object",keys:Object.keys(v).slice(0,25)}:typeof v]));
       out.playerKeys=Object.keys(l.players?.[0]||{});
      }
     }catch(e){out.jsonError=e.message;}}
    }
   console.log(JSON.stringify(out));
  }catch(e){console.log(JSON.stringify({name,error:e.message}));}
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={targets,main};

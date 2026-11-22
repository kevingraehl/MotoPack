import {designRequest} from './designs.mjs';
import {cleanBugReport,reportLimit} from './bug-report.mjs';
import {account} from './account.mjs';
const path='/MotoPack';

const reply=(text,status)=>new Response(text,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function cleanSummary(input){
  const {dimensions,outline,axis,pattern,cells,series,banks,parts}=input;
  const finite=n=>Number.isFinite(n)&&Math.abs(n)<=100000;
  if(!Array.isArray(dimensions)||dimensions.length!==3||!dimensions.every(n=>finite(n)&&n>0)||
    !Array.isArray(outline)||outline.length<2||outline.length>2000||
    !outline.every(p=>Array.isArray(p)&&p.length===2&&p.every(finite))||
    !['vertical','flat','cross'].includes(axis)||!['regular','offset','short','custom','customShort'].includes(pattern)||
    ![cells,series,banks].every(n=>Number.isInteger(n)&&n>0&&n<=100000)||
    !Array.isArray(parts)||parts.length>500||!parts.every(v=>['Frame','Motor','Controller','Other'].includes(v)))throw Error();
  return {date:new Date().toISOString().slice(0,10),dimensions,outline,axis,pattern,cells,series,banks,parts};
}
async function submit(request,env,kind){
  const bug=kind==='bug-report';
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply('Submit through motoPack.',403);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return reply('Expected JSON.',415);
  if(!request.body)return reply('A summary is required.',400);
  const limit=bug?reportLimit:100000;
  if(Number(request.headers.get('Content-Length'))>limit)return reply('Summary too large.',413);
  if(!(await env.SUBMIT_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return reply('Try again in a minute.',429);
  const reader=request.body.getReader(),decoder=new TextDecoder();
  let text='',size=0;
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>limit){await reader.cancel();return reply('Summary too large.',413);}
    text+=decoder.decode(value,{stream:true});
  }
  let data;
  try{
    const input=JSON.parse(text+decoder.decode());
    if(bug)data=cleanBugReport(input);
    else data=cleanSummary(input);
  }catch{return reply('Invalid submission.',400);}
  const receipt=crypto.randomUUID();
  const id=bug?'bug-reports/'+data.date.slice(0,10)+'/'+receipt:data.date+'/'+receipt;
  if(bug&&data.screenshot){
    const key=id+'.jpg',bytes=Uint8Array.from(atob(data.screenshot.split(',')[1]),c=>c.charCodeAt(0));
    await env.SUMMARIES.put(key,bytes);data.screenshot=key;
  }
  await env.SUMMARIES.put(id,JSON.stringify(data));
  const response=reply('Saved',201);response.headers.set('X-MotoPack-Receipt',bug?receipt:id);return response;
}
async function visit(request,env){
  if(request.method!=='POST')return reply('Use POST.',405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply('Start through motoPack.',403);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return reply('Expected JSON.',415);
  if(Number(request.headers.get('Content-Length'))>1024)return reply('Check-in too large.',413);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  if(!(await env.SUBMIT_LIMIT.limit({key:'visit:'+ip})).success)return reply('Try again in a minute.',429);
  let data;
  try{data=await request.json();}catch{return reply('Invalid check-in.',400);}
  const email=String(data?.name||'').trim().toLowerCase();
  if(data?.agreed!==true||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply('Enter a valid email.',400);
  const date=new Date().toISOString();
  await env.SUMMARIES.put('visits/'+date+'/'+crypto.randomUUID(),JSON.stringify({name:email,date,ip}),{expirationTtl:30*86400});
  return Response.json({saved:true},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname===path+'/designs'||url.pathname.startsWith(path+'/designs/'))return designRequest(request,env.SUMMARIES,async()=>(await env.SUBMIT_LIMIT.limit({key:'share:'+request.headers.get('CF-Connecting-IP')})).success);
    if(url.pathname.startsWith(path+'/account/'))return account(request,env);
    if(url.pathname===path+'/visit')return visit(request,env);
    if([path+'/summary',path+'/bug-report'].includes(url.pathname))return request.method==='POST'?submit(request,env,url.pathname.split('/').pop()):reply('Use POST.',405);
    if(url.pathname!==path&&url.pathname!==path+'/')return reply('Page not found.',404);
    if(!['GET','HEAD'].includes(request.method))return reply('Use GET or HEAD.',405);
    if(url.pathname.endsWith('/')){url.pathname=path;return Response.redirect(url.toString(),308);}
    const asset=new URL('/wizard.html',url);
    const served=await env.ASSETS.fetch(new Request(asset,request));
    const response=new Response(served.body,served);
    response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    response.headers.set('Content-Security-Policy',"frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
    return response;
  }
};

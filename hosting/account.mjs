const encoder = new TextEncoder();
let accessCertCache = { t: 0, team: "", keys: null };

const b64urlBytes = (value) => {
  let s = String(value).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

async function accessKeys(team) {
  if (accessCertCache.keys && accessCertCache.team === team && Date.now() - accessCertCache.t < 3600e3) {
    return accessCertCache.keys;
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) return [];
  const body = await res.json();
  accessCertCache = { t: Date.now(), team, keys: body.keys || [] };
  return accessCertCache.keys;
}

async function verifyAccount(env, token) {
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.MOTOPACK_ACCESS_AUD) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
  } catch { return null; }
  if (header?.alg !== "RS256" || !payload || typeof payload !== "object") return null;
  try {
    const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
  } catch { return null; }
  const now = Date.now() / 1000;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.MOTOPACK_ACCESS_AUD)) return null;
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  if (!(payload.exp > now) || (payload.nbf && payload.nbf > now + 60)) return null;
  const email = payload.email ? String(payload.email).toLowerCase() : "";
  return email||null;
}
export async function account(request,env){
  const send=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
  const email=await verifyAccount(env,request.headers.get('Cf-Access-Jwt-Assertion'));
  if(!email)return send({error:'Sign in with Cloudflare Access.'},401);
  const expected=request.headers.get('X-MotoPack-Account');
  if(expected&&expected!==email)return send({error:'Account changed.'},409);
  const path=new URL(request.url).pathname.slice('/MotoPack/account/'.length);
  const build=/^builds\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(path);
  const prefix='builds/'+encodeURIComponent(email)+'/';
  const key='projects/'+email;
  if(request.method==='GET'){
    if(path==='start')return Response.redirect(new URL('/MotoPack/?account=ready',request.url),303);
    if(path==='me')return send({email});
    if(path==='builds'){
      const cursor=new URL(request.url).searchParams.get('cursor')||undefined;
      const page=await env.SUMMARIES.list({prefix,limit:100,cursor});
      const items=page.keys.map(k=>({id:k.name.slice(prefix.length),name:k.metadata?.name||'Untitled build',updated:k.metadata?.updated||''}));
      if(!cursor&&(await env.SUMMARIES.list({prefix:key,limit:1})).keys.some(k=>k.name===key))items.push({id:'legacy',name:'Previously saved project',updated:''});
      return send({items,cursor:page.list_complete?null:page.cursor});
    }
    if(build){const doc=await env.SUMMARIES.get(prefix+build[1],'json');return doc?send(doc):send({},404);}
    if(path==='project')return send(await env.SUMMARIES.get(key,'json'));
    if(path==='frames'){const list=await env.SUMMARIES.list({prefix:'shared-frame/',limit:100});return send(list.keys.map(k=>({id:k.name.slice(13),name:k.metadata?.name||'Shared frame'})));}
    if(/^[a-f0-9-]{36}$/.test(path))return send(await env.SUMMARIES.get('shared-frame/'+path,'json'));
  }
  if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return send({},403);
  if(!build&&!['visit','project','frames'].includes(path))return send({},404);
  if(!request.body||!request.headers.get('content-type')?.startsWith('application/json'))return send({},415);
  if(!(await env.SUBMIT_LIMIT.limit({key:email})).success)return send({},429);
  const reader=request.body.getReader(),chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>(path==='visit'?1024:20*1024*1024)){await reader.cancel();return send({},413);}chunks.push(value);}
  let data;try{data=JSON.parse(await new Blob(chunks).text());}catch{return send({},400);}
  if(path==='visit'){
    if(data?.agreed!==true)return send({},400);
    const date=new Date().toISOString();
    await env.SUMMARIES.put('visits/'+date+'/'+crypto.randomUUID(),JSON.stringify({name:email,date,ip:request.headers.get('CF-Connecting-IP')}),{expirationTtl:30*86400});
  }else if(build){
    if(data?.version!==1||!data.settings||typeof data.name!=='string'||data.name.length>100)return send({},400);
    await env.SUMMARIES.put(prefix+build[1],JSON.stringify(data),{metadata:{name:data.name,updated:new Date().toISOString()}});
  }else if(path==='project'){if(data?.version!==1||!data.settings)return send({},400);await env.SUMMARIES.put(key,JSON.stringify(data));}
  else{
    const d=data?.drawing;
    if(data.consent!==true||!d?.image||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(d.image.url)||!(d.scale>0)||![d.image.w,d.image.h].every(n=>Number.isInteger(n)&&n>0&&n<=16384))return send({},400);
    const name=String(data.name||'Shared frame').trim().slice(0,60);
    let model=null;
    if(data.model){
      const {asset,rotation}=data.model;
      if(!asset||![rotation,asset.hi,asset.lo].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||!Array.isArray(asset.v)||!asset.v.every(Number.isFinite)||!Array.isArray(asset.i)||!asset.i.every(i=>Number.isInteger(i)&&i>=0&&3*i<asset.v.length))return send({},400);
      model={asset:{v:asset.v,i:asset.i,lo:asset.lo,hi:asset.hi},rotation};
    }
    await env.SUMMARIES.put('shared-frame/'+crypto.randomUUID(),JSON.stringify({name,image:{url:d.image.url,w:d.image.w,h:d.image.h},scale:d.scale,model}),{metadata:{name}});
  }
  return send({saved:true});
}

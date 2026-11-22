const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const maxBytes=12*1024*1024;
function clean(input){
  const text=(value,max,required=false)=>{
    if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error();
    return value.trim();
  };
  const {scope,solids,cells}=input;
  if(!['public','unlisted'].includes(scope)||!Array.isArray(solids)||solids.length>4000||
    !Array.isArray(cells)||cells.length>20000||!(solids.length+cells.length))throw Error();
  const color=n=>Number.isInteger(n)&&n>=0&&n<=0xffffff;
  const valid=n=>Number.isFinite(n)&&Math.abs(n)<=1e7;
  return {title:text(input.title,80,true),owner:text(input.owner,32,true),bike:text(input.bike,80),notes:text(input.notes,1200),scope,
    cells:cells.map(cell=>{
      if(!Array.isArray(cell)||cell.length!==17||!cell.slice(0,16).every(valid)||!color(cell[16]))throw Error();
      return cell;
    }),
    solids:solids.map(({points,tint,opacity})=>{
      if(typeof points!=='string'||!color(tint)||!Number.isFinite(opacity)||opacity<=0||opacity>1)throw Error();
      const raw=atob(points);
      if(!raw.length||raw.length%36)throw Error();
      const coords=new Float32Array(Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer);
      if(!coords.every(valid))throw Error();
      return {points,tint,opacity};
    })};
}
export async function designRequest(req,store,limit=async()=>true){
  const url=new URL(req.url),suffix=url.pathname.slice('/MotoPack/designs'.length);
  if(req.method==='GET'){
    if(!suffix){
      const cursor=url.searchParams.get('cursor')||undefined;
      if(cursor&&cursor.length>1000)return json({error:'Invalid page.'},400);
      const page=await store.list({prefix:'design-public/',cursor,limit:24});
      return json({items:page.keys.map(k=>({id:k.name.split('/')[1],...k.metadata})),cursor:page.list_complete?null:page.cursor});
    }
    const id=suffix.slice(1);
    if(!uuid.test(id))return json({error:'Design not found.'},404);
    const value=await store.get('design/'+id);
    return value?new Response(value,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}):json({error:'Design not found.'},404);
  }
  if(req.method!=='POST'||suffix)return json({error:'Unsupported request.'},405);
  if(req.headers.get('Origin')!==url.origin)return json({error:'Open the share form to publish.'},403);
  if(req.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'Expected JSON.'},415);
  if(!await limit())return json({error:'Try again in a minute.'},429);
  let design;
  try{
    const reader=req.body.getReader(),chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();return json({error:'This view is too large. Hide a detailed part and share again.'},413);}chunks.push(value);}
    design=clean(JSON.parse(await new Blob(chunks).text()));
  }catch{return json({error:'Check the design name, nickname and visible parts.'},400);}
  const id=crypto.randomUUID();
  await store.put('design/'+id,JSON.stringify(design));
  if(design.scope==='public'){
    const {title,owner,bike}=design;
    await store.put('design-public/'+id,'1',{metadata:{title,owner,bike}});
  }
  return json({id},201);
}

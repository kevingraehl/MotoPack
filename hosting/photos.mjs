const prefix='community-photo/';
const respond=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function photos(request,env,id){
  const url=new URL(request.url);
  if(id&&!/^[0-9a-f-]{36}$/.test(id))return respond({},404);
  if(request.method==='GET'){
    if(id){
      const photo=await env.SUMMARIES.get(prefix+id,'json');
      return photo?respond(photo):respond({},404);
    }
    const page=await env.SUMMARIES.list({prefix,limit:50,cursor:url.searchParams.get('cursor')||undefined});
    return respond({items:page.keys.map(k=>({id:k.name.slice(prefix.length),...k.metadata})),cursor:page.list_complete?null:page.cursor});
  }
  if(request.method!=='POST'||id)return respond({},405);
  if(request.headers.get('Origin')!==url.origin)return respond({},403);
  if(!request.body||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return respond({},415);
  if(!(await env.SUBMIT_LIMIT.limit({key:'photo:'+request.headers.get('CF-Connecting-IP')})).success)return respond({error:'Please try again in a minute.'},429);
  const reader=request.body.getReader(),chunks=[];let size=0;
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.length;
    if(size>6*1024*1024){await reader.cancel();return respond({error:'Choose a smaller photo.'},413);}
    chunks.push(value);
  }
  let data;
  try{data=JSON.parse(await new Blob(chunks).text());}catch{return respond({},400);}
  const {name,credit,image,scale,consent}=data||{};
  if(consent!==true||typeof name!=='string'||!name.trim()||name.length>60||
    typeof credit!=='string'||credit.length>60||!(scale===null||Number.isFinite(scale)&&scale>0)||
    ![image?.w,image?.h].every(n=>Number.isInteger(n)&&n>0&&n<=2200)||
    typeof image?.url!=='string'||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image.url))return respond({error:'Check the frame name and photo.'},400);
  const metadata={name:name.trim(),credit:credit.trim()},photoId=crypto.randomUUID();
  await env.SUMMARIES.put(prefix+photoId,JSON.stringify({...metadata,image:{url:image.url,w:image.w,h:image.h},scale}),{metadata});
  return respond({id:photoId},201);
}

// Local pilot host: node conversion-server.cjs. Owner report: node conversion-server.cjs report
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createInterface}=require('node:readline');
const directory=process.env.CELL_BENCH_DATA||path.join(os.homedir(),'.cell-bench');
const file=path.join(directory,'conversion-summaries.jsonl');
const route='/MotoPack/';
const assets=path.join(__dirname,'Open Cell Bench.html');
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
function summary(data){
  const {dimensions,outline,axis,pattern,cells,series,banks,parts}=data;
  if(!Array.isArray(dimensions)||dimensions.length!==3||!dimensions.every(n=>finite(n,0,100000))
    ||!Array.isArray(outline)||outline.length<2||outline.length>2000||!outline.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>finite(n,-100000,100000)))
    ||!['vertical','flat','cross'].includes(axis)||!['regular','offset','short','custom','customShort'].includes(pattern)
    ||![cells,series,banks].every(n=>Number.isInteger(n)&&finite(n,1,100000))||!Array.isArray(parts)||parts.length>500||!parts.every(s=>['Frame','Motor','Controller','Other'].includes(s)))throw Error('Invalid layout');
  return {date:new Date().toISOString().slice(0,10),dimensions,outline,axis,pattern,cells,series,banks,parts};
}
async function report(){
  if(!fs.existsSync(file)){console.log('No design summaries yet.');return;}
  const lines=createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
  for await(const line of lines){const s=JSON.parse(line);console.log(s.date,s.cells+' cells',s.series+'S',s.banks+' bank(s)',s.pattern,s.dimensions.join(' x ')+' mm',s.parts.join(', '));}
}
if(process.argv[2]==='report')report().catch(e=>{console.error(e.message);process.exitCode=1;});
else http.createServer(async(req,res)=>{
  const pathname=req.url.split('?')[0];
  if(req.method==='GET'&&pathname!==route&&(pathname==='/'||['/motopack','/battery-layout-wizard'].includes(pathname.replace(/\/$/,'').toLowerCase()))){res.writeHead(301,{Location:route}).end();return;}
  if((req.method==='GET'||req.method==='HEAD')&&pathname===route){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});if(req.method==='HEAD')res.end();else fs.createReadStream(assets).on('error',()=>res.destroy()).pipe(res);return;
  }
  if(pathname===route+'designs'||pathname.startsWith(route+'designs/')){
    try{
      const {designRequest}=await import('./hosting/designs.mjs');
      const store={
        async put(key,value,options){
          const dest=path.join(directory,key);
          await fs.promises.mkdir(path.dirname(dest),{recursive:true,mode:0o700});
          const temp=dest+'.tmp';
          await fs.promises.writeFile(temp,options?JSON.stringify(options.metadata):value,{mode:0o600});
          await fs.promises.rename(temp,dest);
        },
        async get(key){try{return await fs.promises.readFile(path.join(directory,key),'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}},
        async list({prefix,cursor,limit}){
          const dir=path.join(directory,prefix);
          let ids;try{ids=await fs.promises.readdir(dir);}catch(e){if(e.code!=='ENOENT')throw e;ids=[];}
          ids=ids.filter(id=>!id.endsWith('.tmp')&&(!cursor||id>cursor)).sort();
          const page=ids.slice(0,limit),keys=await Promise.all(page.map(async id=>({name:prefix+id,metadata:JSON.parse(await this.get(prefix+id))})));
          return {keys,cursor:page.at(-1),list_complete:ids.length<=limit};
        }
      };
      const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})});
      const response=await designRequest(request,store);
      res.writeHead(response.status,Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(503).end();}
    return;
  }
  const visit=pathname===route+'visit',bug=pathname===route+'bug-report';
  if(req.method!=='POST'||!visit&&!bug&&pathname!==route+'summary'){res.writeHead(404).end();return;}
  if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.writeHead(415).end();return;}
  if((visit||bug)&&req.headers.origin!=='http://'+req.headers.host){res.writeHead(403).end();return;}
  const {cleanBugReport,reportLimit}=await import('./hosting/bug-report.mjs');
  let chunks=[],size=0;
  try{
    for await(const chunk of req){size+=chunk.length;if(size>(bug?reportLimit:100000)){res.writeHead(413).end();return;}chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(bug){
      const data=cleanBugReport(input),id=require('node:crypto').randomUUID();
      const folder=path.join(directory,'bug-reports',id);
      await fs.promises.mkdir(folder,{recursive:true,mode:0o700});
      if(data.screenshot){
        await fs.promises.writeFile(path.join(folder,'screenshot.jpg'),Buffer.from(data.screenshot.split(',')[1],'base64'),{mode:0o600});
        data.screenshot='screenshot.jpg';
      }
      await fs.promises.writeFile(path.join(folder,'report.json'),JSON.stringify(data,null,2),{mode:0o600});
      res.writeHead(201,{'Cache-Control':'no-store','X-MotoPack-Receipt':id}).end();return;
    }
    if(visit&&(typeof input.name!=='string'||!input.name.trim()||input.name.length>254||input.agreed!==true))throw Error();
    const data=visit?{name:input.name.trim(),ip:req.socket.remoteAddress,date:new Date().toISOString()}:summary(input);
    const destination=visit?path.join(directory,'wizard-visits.jsonl'):file;
    try{await fs.promises.mkdir(directory,{recursive:true,mode:0o700});await fs.promises.appendFile(destination,JSON.stringify(data)+'\n',{mode:0o600});}
    catch{res.writeHead(503).end();return;}
    res.writeHead(201,{'Cache-Control':'no-store'}).end();
  }catch{res.writeHead(400).end();}
}).listen(Number(process.env.PORT||8185),'127.0.0.1',function(){console.log('motoPack at http://127.0.0.1:'+this.address().port+route);});

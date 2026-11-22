// File decoding runs locally, including the Open CASCADE reader in a dedicated worker.
async function codecBytes(name){
  const compressed=Uint8Array.from(atob(caseCodecs[name]),c=>c.charCodeAt(0));
  return new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
async function importStepMesh(file){
  const [runtime,wasm,data]=await Promise.all([codecBytes('occt'),codecBytes('wasm'),file.arrayBuffer()]);
  const url=URL.createObjectURL(new Blob([runtime,`
    self.onmessage=async({data})=>{
      try{
        const occt=await occtimportjs({wasmBinary:data.wasm});
        const model=occt.ReadStepFile(new Uint8Array(data.file),{linearUnit:'millimeter',linearDeflectionType:'bounding_box_ratio',linearDeflection:.0005,angularDeflection:.35});
        if(!model.success||!model.meshes.length)throw Error('No solid or surface bodies found in this STEP file.');
        const v=[],i=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
        for(const m of model.meshes){
          const offset=v.length/3;
          if(i.length+m.index.array.length>750000)throw Error('This model exceeds the sketch editor limit of 250,000 triangles. Export the enclosure body separately.');
          for(const x of m.attributes.position.array){const a=v.length%3;lo[a]=Math.min(lo[a],x);hi[a]=Math.max(hi[a],x);v.push(+x.toFixed(6));}
          for(const k of m.index.array)i.push(offset+k);
        }
        postMessage({v,i,lo,hi,bodies:model.meshes.length});
      }catch(e){postMessage({error:String(e.message||e)});}
    };`],{type:'text/javascript'}));
  const worker=new Worker(url);
  try{return await new Promise((resolve,reject)=>{
    worker.onerror=e=>reject(Error(e.message));worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);
    worker.postMessage({wasm,file:data},[wasm,data]);
  });}finally{worker.terminate();URL.revokeObjectURL(url);}
}
function stepSection(m,plane,fraction){
  const [u,v,n]=stepAxes(plane),z=m.lo[n]+fraction*(m.hi[n]-m.lo[n]);
  const nodes=new Map(),edges=new Set();
  const eps=.00002;
  function node(x,y){const key=Math.round(x/eps)+','+Math.round(y/eps);if(!nodes.has(key))nodes.set(key,{xy:[x,y],adj:new Set()});return key;}
  for(let i=0;i<m.i.length;i+=3){
    const ids=m.i.slice(i,i+3).map(k=>k*3),hits=new Set();
    for(let j=0;j<3;j++){
      const a=ids[j],b=ids[(j+1)%3],za=m.v[a+n],zb=m.v[b+n];
      if((za<=z)===(zb<=z))continue;
      const t=(z-za)/(zb-za);hits.add(node(m.v[a+u]+t*(m.v[b+u]-m.v[a+u]),-(m.v[a+v]+t*(m.v[b+v]-m.v[a+v]))));
    }
    if(hits.size!==2)continue;
    const [a,b]=hits;nodes.get(a).adj.add(b);nodes.get(b).adj.add(a);edges.add([a,b].sort().join('|'));
  }
  const loops=[];
  for(const edge of edges){
    const [start,next]=edge.split('|');let previous=start,current=next;
    const p=[nodes.get(start).xy];edges.delete(edge);
    while(current!==start){
      p.push(nodes.get(current).xy);
      const candidate=[...nodes.get(current).adj].find(k=>k!==previous&&edges.has([current,k].sort().join('|')));
      if(!candidate)break;
      edges.delete([current,candidate].sort().join('|'));previous=current;current=candidate;
    }
    if(current===start&&p.length>=3){const loop=cleanLoop(p,.015);if(Math.abs(sketchArea(loop))>.01)loops.push(loop);}
  }
  return loops.sort((a,b)=>Math.abs(sketchArea(b))-Math.abs(sketchArea(a)));
}
const sketchUnits={mm:1,cm:10,in:25.4,pt:25.4/72,pc:25.4/6};
function svgOutlines(text){
  const ns='http://www.w3.org/2000/svg',doc=new DOMParser().parseFromString(text,'image/svg+xml'),root=doc.documentElement;
  if(root.localName!=='svg'||doc.querySelector('parsererror'))throw Error('The file does not contain a valid SVG drawing.');
  const hidden=document.createElement('div');hidden.style.cssText='position:fixed;top:0;left:-10000px;width:1000px;height:1000px;visibility:hidden';
  const svg=document.createElementNS(ns,'svg');hidden.append(svg);document.body.append(hidden);
  const attrs='transform d points x y width height rx ry cx cy r'.split(' ');
  function copy(src,parent){
    for(const elem of src.children){
      if(!['g','path','polygon','polyline','rect','circle','ellipse'].includes(elem.localName))continue;
      const dst=document.createElementNS(ns,elem.localName);for(const k of attrs)if(elem.hasAttribute(k))dst.setAttribute(k,elem.getAttribute(k));
      parent.append(dst);if(elem.localName==='g')copy(elem,dst);
    }
  }
  try{
    const vb=root.getAttribute('viewBox');if(vb)svg.setAttribute('viewBox',vb);
    const w=root.getAttribute('width')||'',h=root.getAttribute('height')||'';
    svg.setAttribute('width',vb?'1000':w||'1000');svg.setAttribute('height',vb?'1000':h||'1000');
    if(root.hasAttribute('transform')){const g=document.createElementNS(ns,'g');g.setAttribute('transform',root.getAttribute('transform'));svg.append(g);copy(root,g);}else copy(root,svg);
    const loops=[],inv=svg.getScreenCTM().inverse();
    for(const shape of svg.querySelectorAll('path,polygon,polyline,rect,circle,ellipse')){
      const mat=inv.multiply(shape.getScreenCTM()),project=p=>{const q=new DOMPoint(p.x,p.y).matrixTransform(mat);return [q.x,q.y];};
      let pts=[];
      if(shape.points){
        pts=Array.from(shape.points,project);
        if(shape.localName==='polyline'&&pts.length&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])>.001)continue;
      }else{
        if(shape.localName==='path'&&((shape.getAttribute('d').match(/[mM]/g)||[]).length!==1))continue;
        const len=shape.getTotalLength();if(!len)continue;
        const a=shape.getPointAtLength(0),b=shape.getPointAtLength(len);
        if(Math.hypot(a.x-b.x,a.y-b.y)>.01)continue;
        for(let j=0;j<=600;j++)pts.push(project(shape.getPointAtLength(j*len/600)));
      }
      pts=cleanLoop(pts,.001);if(pts.length>=3)loops.push(pts);
    }
    const physical=w.trim().match(/^([\d.+e-]+)\s*(mm|cm|in|pt|pc)$/i);
    const scale=physical?(vb?+physical[1]*sketchUnits[physical[2].toLowerCase()]/svg.viewBox.baseVal.width:25.4/96):null;
    return {widthMm:physical?+physical[1]*sketchUnits[physical[2].toLowerCase()]:null,loops:loops.sort((a,b)=>Math.abs(sketchArea(b))-Math.abs(sketchArea(a))),scale};
  }finally{hidden.remove();}
}
let pdfRuntime;
async function openSketchPdf(file){
  if(!pdfRuntime)pdfRuntime=(async()=>{
    const [module,worker]=await Promise.all(['pdf','pdfWorker'].map(async name=>URL.createObjectURL(new Blob([await codecBytes(name)],{type:'text/javascript'}))));
    const api=await import(module);api.GlobalWorkerOptions.workerSrc=worker;return api;
  })();
  const api=await pdfRuntime;
  return api.getDocument({data:await file.arrayBuffer(),isEvalSupported:false,useSystemFonts:true}).promise;
}
function sketchRaster(canvas){
  return {url:canvas.toDataURL('image/jpeg',.88),w:canvas.width,h:canvas.height};
}
async function rasterPdf(pdf,num){
  const page=await pdf.getPage(num),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:2000/Math.max(base.width,base.height)});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return sketchRaster(canvas);
}
async function rasterPhoto(file){
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    const scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
    return sketchRaster(c);
  }finally{URL.revokeObjectURL(url);}
}
function inspectSketchStep(host,d){
  const renderer=new THREE.WebGLRenderer({antialias:true}),scene=new THREE.Scene();
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x24322f);
  const m=d.step,geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(m.v,3));geo.setIndex(m.i);geo.computeVertexNormals();
  const body=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x9ebbb1,metalness:.2,roughness:.63,side:THREE.DoubleSide}));
  const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geo,25),new THREE.LineBasicMaterial({color:0x273f37}));
  scene.add(body,lines,new THREE.HemisphereLight(0xffffff,0x52665e,1.3));
  const light=new THREE.DirectionalLight(0xffffff,1.35);scene.add(light);
  const middle=new THREE.Vector3(...m.lo.map((v,i)=>(v+m.hi[i])/2)),size=new THREE.Vector3(...m.hi).sub(new THREE.Vector3(...m.lo)),radius=size.length()*.57;
  const [u,v,n]=stepAxes(d.plane),extent=size.toArray();
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(extent[u]*1.1,extent[v]*1.1),new THREE.MeshBasicMaterial({color:0xf9b75e,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}));
  plane.position.copy(middle);plane.position.setComponent(n,m.lo[n]+extent[n]*d.slice/100);
  if(n===0)plane.rotation.set(Math.PI/2,Math.PI/2,0,'ZXY');else if(n===1)plane.rotation.x=Math.PI/2;
  scene.add(plane);
  const camera=new THREE.PerspectiveCamera(35,1,Math.max(.001,radius/5000),radius*100);
  camera.up.set(0,0,1);
  let az=.64,el=.38,zoom=1,previous=null;
  function draw(){
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    const distance=radius*zoom/Math.sin(camera.fov*Math.PI/360)*Math.max(1,h/w);
    camera.position.set(Math.cos(az)*Math.cos(el),Math.sin(az)*Math.cos(el),Math.sin(el)).multiplyScalar(distance).add(middle);
    camera.lookAt(middle);light.position.copy(camera.position);light.target.position.copy(middle);scene.add(light.target);renderer.render(scene,camera);
  }
  const canvas=renderer.domElement;host.replaceChildren(canvas);canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);previous=[e.clientX,e.clientY];};
  canvas.onpointermove=e=>{if(previous){az-=(e.clientX-previous[0])*.009;el=Math.max(-1.55,Math.min(1.55,el+(e.clientY-previous[1])*.009));previous=[e.clientX,e.clientY];draw();}};
  canvas.onpointerup=canvas.onpointercancel=()=>{previous=null;};
  canvas.onwheel=e=>{e.preventDefault();zoom=Math.min(6,Math.max(.15,zoom*(e.deltaY>0?1.12:1/1.12)));draw();};
  const resize=new ResizeObserver(draw);resize.observe(host);draw();
  return ()=>{resize.disconnect();for(const obj of [body,lines,plane]){obj.geometry.dispose();obj.material.dispose();}renderer.dispose();renderer.forceContextLoss();host.replaceChildren();};
}

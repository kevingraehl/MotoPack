// Net 0 is pack negative. The positive end of Sg and negative end of S(g+1)
// belong to net g. Only metal on one physical bank face can form one flat part.
function nickelDistance(p,a,b){
  const x=b.u-a.u,y=b.v-a.v,length=x*x+y*y;
  const t=length?Math.max(0,Math.min(1,((p.u-a.u)*x+(p.v-a.v)*y)/length)):0;
  return Math.hypot(p.u-a.u-t*x,p.v-a.v-t*y);
}
function nickelSegmentsMeet(a,b,c,d,width){
  const side=(p,q,r)=>(q.u-p.u)*(r.v-p.v)-(q.v-p.v)*(r.u-p.u);
  if(side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0)return true;
  return Math.min(nickelDistance(a,c,d),nickelDistance(b,c,d),nickelDistance(c,a,b),nickelDistance(d,a,b))<=width+.001;
}
function routeNickelPlates(c,m,plan,width){
  const faces=Array.from({length:c.banks*2},()=>({nets:new Map(),edges:[],plates:[]})),links=[];
  const gridPitch=c.d+Math.max(c.gap,c.rowGap)+width;
  function bucket(map,x,y){return map.get(x+','+y)||[];}
  const indexes=m.bankCells.map(cells=>{
    const map=new Map();
    for(const cell of cells){
      const key=Math.floor(cell.u/gridPitch)+','+Math.floor(cell.v/gridPitch);
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(cell);
    }
    return map;
  });
  function add(a,b,posA,posB,net,kind){
    const frontA=posA!==a.flipped,frontB=posB!==b.flipped,face=faces[2*a.bank+Number(frontA)];
    let reason='';
    if(a.bank!==b.bank)reason='Between banks';
    else if(frontA!==frontB)reason='Between terminal faces';
    else if(Math.hypot(a.u-b.u,a.v-b.v)>1.55*(c.d+Math.max(c.rowGap,c.gap)))reason='Long span';
    else{
      const near=(c.d+width)/2;
      const cells=indexes[a.bank];
      for(let x=Math.floor((Math.min(a.u,b.u)-near)/gridPitch);x<=Math.floor((Math.max(a.u,b.u)+near)/gridPitch);x++)
        for(let y=Math.floor((Math.min(a.v,b.v)-near)/gridPitch);y<=Math.floor((Math.max(a.v,b.v)+near)/gridPitch);y++)
          if(bucket(cells,x,y).some(p=>p.id!==a.id&&p.id!==b.id&&nickelDistance(p,a,b)<=near))reason='Passes over another cell';
      if(!reason&&face.edges.some(edge=>edge.net!==net&&nickelSegmentsMeet(a,b,edge.a,edge.b,width)))reason='Touches another conductor';
    }
    links.push({a,b,posA,posB,frontA,frontB,net,kind,reason});
    if(reason)return;
    face.edges.push({a,b,net});
    if(!face.nets.has(net))face.nets.set(net,[]);
    face.nets.get(net).push([a,b]);
  }
  for(let g=1;g<=c.series;g++){
    const {paths,bridge}=plan(g);
    paths.forEach((path,i)=>{for(let j=1;j<path.length;j++)add(path[j-1],path[j],i===0,i===0,g-i,'Parallel');});
    if(bridge)add(...bridge,true,false,g,'Series');
  }
  const lib=ClipperLib,scale=1000;
  const coords=path=>path.map(p=>[p.X/scale,p.Y/scale]);
  for(const face of faces)for(const [net,segments] of face.nets){
    const offset=new lib.ClipperOffset(2,30),expanded=[];
    for(const pair of segments)offset.AddPath(pair.map(p=>({X:Math.round(p.u*scale),Y:Math.round(p.v*scale)})),lib.JoinType.jtRound,lib.EndType.etOpenRound);
    offset.Execute(expanded,width*scale/2);
    if($('plateMaterial').value!=='strip'){
      const pads=new Map(segments.flat().map(p=>[p.id,p]));
      for(const p of pads.values()){
        const radius=Math.max(width/2,c.d*.39);
        const ring=Array.from({length:40},(_,i)=>{
          const angle=i*Math.PI/20;
          return {X:Math.round((p.u+radius*Math.cos(angle))*scale),Y:Math.round((p.v+radius*Math.sin(angle))*scale)};
        });
        if(!lib.Clipper.Orientation(ring))ring.reverse();
        expanded.push(ring);
      }
    }
    const union=new lib.Clipper(),tree=new lib.PolyTree();
    union.AddPaths(expanded,lib.PolyType.ptSubject,true);
    union.Execute(lib.ClipType.ctUnion,tree,lib.PolyFillType.pftNonZero,lib.PolyFillType.pftNonZero);
    for(let node=tree.GetFirst();node;node=node.GetNext())if(!node.IsHole())
      face.plates.push({net,loops:[coords(node.Contour()),...node.Childs().map(h=>coords(h.Contour()))]});
  }
  return {faces,links,jumpers:links.filter(l=>l.reason).length,plateCount:faces.reduce((n,f)=>n+f.plates.length,0)};
}
function nickelPath(loops){return loops.map(loop=>'M'+loop.map(p=>p.join(' ')).join('L')+'Z').join('');}
function downloadNickelFaces(c,m,route,width,thickness){
  const files={},text=(name,content)=>files[name]=fflate.strToU8(content);
  for(const [i,face] of route.faces.entries()){
    const stem='bank-'+(1+Math.floor(i/2))+'-'+(i%2?'near':'far');
    const shapes=face.plates.map((p,j)=>'<path id="net-'+p.net+'-plate-'+(j+1)+'" d="'+nickelPath(p.loops)+'"/>');
    text(stem+'.svg','<svg xmlns="http://www.w3.org/2000/svg" width="'+m.uSpan+'mm" height="'+m.vSpan+'mm" viewBox="'+[m.u0,m.v0,m.uSpan,m.vSpan].join(' ')+'"><g fill="none" stroke="black" stroke-width="0.1">'+shapes.join('')+'</g></svg>');
    const dxf=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,0,'ENDSEC',0,'SECTION',2,'ENTITIES'];
    for(const plate of face.plates)for(const loop of plate.loops){
      dxf.push(0,'LWPOLYLINE',100,'AcDbEntity',8,'NET_'+plate.net,100,'AcDbPolyline',90,loop.length,70,1);
      for(const [x,y] of loop)dxf.push(10,x-m.u0,20,m.v0+m.vSpan-y);
    }
    dxf.push(0,'ENDSEC',0,'EOF');text(stem+'.dxf',dxf.join('\r\n')+'\r\n');
  }
  const end=(p,pos,front)=>[p.bank+1,front?'near':'far',p.r+1,p.k+1,pos?'+':'-'];
  const rows=route.links.map(l=>[l.net,l.kind,...end(l.a,l.posA,l.frontA),...end(l.b,l.posB,l.frontB),l.reason||'Flat plate']);
  text('connections.csv',[['Net','Link','From bank','Face','Row','Column','Terminal','To bank','Face','Row','Column','Terminal','Routing'],...rows].map(row=>row.join(',')).join('\r\n'));
  text('layout.txt',$('plateMaterial').selectedOptions[0].text+' geometry review · '+c.series+' series groups\nStrip width '+width+' mm. Thickness '+thickness+' mm.\n'+route.plateCount+' flat pieces. '+route.jumpers+' links require separate routing. See connections.csv.\nBoth faces share the bank diagram coordinates. A far-face sheet is not mirrored for a flipped physical bank.\nReview fit and insulation against the real terminals. Conductor current capacity has not been calculated.');
  saveBlob(($('plateMaterial').value==='copper'?'copper':'nickel')+'-face-layouts.zip',fflate.zipSync(files,{level:1}),'application/zip');
}
function nickelBodies(c,m,route,thickness){
  const bodies=[],lip=c.holder?c.lip:0,edgeU=c.holder?c.edgeU:0,edgeV=c.holder?c.edgeV:0;
  for(const [i,face] of route.faces.entries()){
    const bank=Math.floor(i/2),front=i%2,base=bank*(c.len+2*lip+m.axialSheet)+lip+(front?c.len:-thickness);
    for(const [j,plate] of face.plates.entries()){
      const loops=plate.loops,pts=loops.flat(),holes=[];let start=loops[0].length;
      for(const loop of loops.slice(1)){holes.push(start);start+=loop.length;}
      const indices=earcut(pts.flat(),holes),tris=[];
      const at=(p,z)=>cellXYZ(c,p[0]-m.u0+edgeU,p[1]-m.v0+edgeV,base+z);
      for(let k=0;k<indices.length;k+=3){
        const v=indices.slice(k,k+3).map(n=>pts[n]);
        tris.push(v.map(p=>at(p,0)).reverse(),v.map(p=>at(p,thickness)));
      }
      for(const loop of loops)for(let k=0;k<loop.length;k++){
        const a=loop[k],b=loop[(k+1)%loop.length],p=at(a,0),q=at(b,0),r=at(b,thickness),s=at(a,thickness);
        tris.push([p,q,r],[p,r,s]);
      }
      if(c.axis!=='flat')tris.forEach(t=>t.reverse());
      bodies.push(['Bank '+(bank+1)+' '+(front?'near':'far')+' net '+plate.net+' plate '+(j+1),tris]);
    }
  }
  return bodies;
}
function previewNickel(c,m,route,thickness){
  const dialog=$('nickelViewer'),host=$('nickelStage');
  if(dialog.open){dialog.scrollIntoView({block:'nearest'});return;}
  $('nickel3D').after(dialog);dialog.show();
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{host.textContent='3D graphics unavailable on this device. The face map is available below.';return;}
  host.replaceChildren(renderer.domElement);renderer.setSize(host.clientWidth,host.clientHeight);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,host.clientWidth/host.clientHeight,.1,20000);
  scene.background=new THREE.Color(0x101b27);
  const material=new THREE.MeshBasicMaterial({color:$('plateMaterial').value==='copper'?0xc58352:0xc8d1db,side:THREE.DoubleSide});
  for(const [,tris] of nickelBodies(c,m,route,thickness)){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(tris.flat(2),3));geo.computeVertexNormals();scene.add(new THREE.Mesh(geo,material));
  }
  const cellGeo=new THREE.CylinderGeometry(c.d/2,c.d/2,c.len,18);
  const ghost=new THREE.InstancedMesh(cellGeo,new THREE.MeshBasicMaterial({color:0x6cb4be,transparent:true,opacity:.13,depthWrite:false}),m.count);
  const obj=new THREE.Object3D();if(c.axis==='vertical')obj.rotation.x=Math.PI/2;if(c.axis==='flat')obj.rotation.z=Math.PI/2;
  let index=0;const lip=c.holder?c.lip:0;
  m.bankCells.forEach((cells,b)=>cells.forEach(p=>{
    obj.position.fromArray(cellXYZ(c,p.u-m.u0+(c.holder?c.edgeU:0),p.v-m.v0+(c.holder?c.edgeV:0),b*(c.len+2*lip+m.axialSheet)+lip+c.len/2));
    obj.updateMatrix();ghost.setMatrixAt(index++,obj.matrix);
  }));scene.add(ghost);
  const center=new THREE.Vector3(m.x/2,m.y/2,m.z/2),radius=Math.hypot(m.x,m.y,m.z);
  let yaw=.8,pitch=.5,zoom=1,last;
  function paint(){const r=radius*1.9*zoom;camera.position.set(center.x+r*Math.cos(yaw)*Math.cos(pitch),center.y+r*Math.sin(yaw)*Math.cos(pitch),center.z+r*Math.sin(pitch));camera.up.set(0,0,1);camera.lookAt(center);renderer.render(scene,camera);}
  host.onpointerdown=e=>{last=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId);};
  host.onpointermove=e=>{if(!last)return;yaw-=(e.clientX-last[0])*.01;pitch=Math.max(-1.55,Math.min(1.55,pitch+(e.clientY-last[1])*.01));last=[e.clientX,e.clientY];paint();};
  host.onlostpointercapture=()=>last=null;
  host.onwheel=e=>{e.preventDefault();zoom=Math.max(.12,Math.min(4,zoom*Math.exp(e.deltaY*.001)));paint();};
  const layers=()=>{for(const mesh of scene.children)mesh.visible=mesh===ghost?$('plateCells').checked:$('plateMetal').checked;paint();};
  $('plateCells').onchange=$('plateMetal').onchange=layers;layers();dialog.addEventListener('close',()=>{scene.traverse(o=>o.geometry?.dispose());ghost.material.dispose();material.dispose();renderer.dispose();renderer.forceContextLoss();host.replaceChildren();host.onwheel=host.onpointerdown=host.onpointermove=host.onlostpointercapture=null;},{once:true});
}

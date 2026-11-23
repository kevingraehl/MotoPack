const builderDefaults={mode:'pack',holderReserve:0,miscReserve:0,wall:2,base:3,outL:168,outW:120,outH:296.5,
  front:2,rear:2,left:2,right:2,bottom:1,top:3,deckGap:5};
const dim=[0.1,3000,'any'],gap=[0,500,'any'];
const builderFields=[
  ['holderReserve','Extra holder allowance per face (mm)',gap],['miscReserve','Wrap / wires / copper per face (mm)',gap],
  ['mode','Design from',[['inner','Inside + wall thickness'],['both','Measured inside + outside'],['pack','Pack + six clearances']]],
  ['wall','Side wall (mm)',dim],['base','Floor thickness (mm)',dim],
  ['outL','Overall length (mm)',dim],['outW','Overall width (mm)',dim],['outH','Overall peak height (mm)',dim],
  ...['front','rear','left','right','bottom','top'].map(name=>[name,name+' clearance (mm)',gap])];
let corners=[],endLift=[0,0], orbitView=null,holdingCamera=false;
function makeShell(c,m,pose=placements){
  const profile=caseSketch?caseProfile(caseSketch):null;
  if(profile)c.mode='inner';
  const auto=c.mode==='pack',measured=c.mode==='both';
  const reserve=c.holderReserve+c.miscReserve;
  const origin=[c.front+reserve,c.left+reserve,c.bottom+reserve];
  const {parts,warnings}=makeSurfaceParts(c,m),core=[m.x,m.y,m.z];
  const min=[0,0,0],max=[...core];
  function extend(part){for(let i=0;i<3;i++){min[i]=Math.min(min[i],part.min[i]);max[i]=Math.max(max[i],part.min[i]+part.dim[i]);}}
  parts.forEach(extend);

  if(c.bmsMode!=='off'){
    const {matrix,size,dim}=rotationBounds(c);
    const pos=c.bmsMode==='mount'?surfaceBounds(c,m,c.bmsMount,dim,c.bmsGap):c.bmsMode==='fixed'?[c.bx,c.by,c.bz].map((v,i)=>v-origin[i]):[0,0,max[2]+c.bmsGap];
    const box={name:'BMS',min:pos,dim,bank:0,triangles:bmsBoxMesh(c).map(t=>t.map(p=>new THREE.Vector3(...p.map((v,i)=>v-size[i]/2)).applyMatrix4(matrix).toArray().map((v,i)=>v+dim[i]/2)))};
    parts.push(box);extend(box);
  }
  const horizontal=caseSketch?.endFace?1:0;
  if(profile&&caseSketch.autoPlace){
    const near=[c.front,c.left,c.bottom],far=[c.rear,c.right,c.top];
    const span=i=>core[i]+near[i]+far[i]+2*reserve;
    const pos=positionInSketch(profile,span(horizontal),span(2),horizontal?c.width:c.length,c.high);
    origin[horizontal]+=pos[0];origin[2]+=pos[1];
    const box=parts.find(p=>p.name==='BMS');
    if(box&&c.bmsMode==='fixed')box.min=[c.bx,c.by,c.bz].map((v,i)=>v-origin[i]);
  }
  if(auto&&c.bmsMode!=='fixed')for(let i=0;i<3;i++)origin[i]-=min[i];
  if(c.material!=='none'&&c.sheet&&selectedSheets(c).some(k=>(k==='banks'&&c.sheetTrim>=m.U)||(k==='rows'&&c.sheetTrim>=m.uSpan)))throw Error('Separator width reduction must leave a positive cut width.');
  if(auto){
    c.length=origin[0]+max[0]+c.rear+reserve;c.width=origin[1]+max[1]+c.right+reserve;
    c.high=max[2]+origin[2]+c.top+reserve+endLift[0];c.low=max[2]+origin[2]+c.top+reserve+endLift[1];
  }
  const roof=[[0,c.high],...corners.map(([t,d])=>[c.length*t,c.high+(c.low-c.high)*t+d]),[c.length,c.low]];
  if(auto){
    const lift=Math.max(0,max[2]+origin[2]+c.top+reserve-Math.min(...roof.map(p=>p[1])));
    c.high+=lift;c.low+=lift;for(const p of roof)p[1]+=lift;
  }
  const peak=Math.max(...roof.map(p=>p[1]));
  const tx=measured?(c.outL-c.length)/2:c.wall,ty=measured?(c.outW-c.width)/2:c.wall;
  const floor=measured?c.outH-peak:c.base;
  if(Math.min(tx,ty,floor,...roof.map(p=>p[1]))<0.01)throw Error('Check dimensions. Outer bounds must surround the inner profile with positive walls and floor.');
  function height(x){
    const i=roof.findIndex(p=>p[0]>=x);if(i<=0)return i===0?roof[0][1]:roof.at(-1)[1];
    const [a,b]=roof.slice(i-1,i+1);return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
  }
  const lo=origin[0],hi=Math.min(c.length,lo+m.x);
  const ceiling=Math.min(height(lo),height(hi),...roof.filter(p=>p[0]>lo&&p[0]<hi).map(p=>p[1]));
  m.margins=[c.length-lo-m.x,c.width-origin[1]-m.y,ceiling-origin[2]-m.z];
  const allowanceMargins=m.margins.map((v,i)=>v-reserve-[c.rear,c.right,c.top][i]);
  const shell={profile,roof,origin,tx,ty,floor,peak,height,allowanceMargins};
  preparePlacement(c,m,shell,pose);
  shell.parts=parts;shell.warnings=warnings;shell.cells=[];
  const inspectStep=profile&&caseSketch.step&&caseSketch.original?stepCellTest(c,shell):null;
  if(inspectStep){
    const model=caseSketch.step,n=stepAxes(caseSketch.plane)[2],depth=caseSketch.endFace?c.length:c.width;
    if(depth>(model.hi[n]-model.lo[n])*caseSketch.scale+.01)warnings.push('Entered inside depth exceeds the full STEP body');
  }
  const axial=cellBases[c.axis].a,r=c.d/2,l=c.len/2,halfSize=cellXYZ(c,r,r,l);
  for(let b=0;b<c.banks;b++)for(const cell of m.bankCells[b]){
    const a=b*(c.len+(c.holder?2*c.lip:0)+m.axialSheet)+(c.holder?c.lip:0)+l;
    const v=cell.v-m.v0+(c.holder?c.edgeV:0),u=cell.u-m.u0+(c.holder?c.edgeU:0);
    const xyz=cellXYZ(c,u,v,a).map((n,i)=>n+origin[i]);
    const [x,y,z]=xyz,[rx,ry,rz]=halfSize;
    const x1=Math.max(0,x-rx),x2=Math.min(c.length,x+rx);
    const top=x1>x2?Infinity:Math.min(height(x1),height(x2),...roof.filter(p=>p[0]>x1&&p[0]<x2).map(p=>p[1]))-z-rz;
    const gaps=[x-rx,c.length-x-rx,y-ry,c.width-y-ry,z-rz,top];
    if(shell.posed){
      gaps.splice(0,gaps.length,...Array(6).fill(Infinity),shell.testCell(xyz));
    }else if(profile){
      const coord=xyz[horizontal],half=halfSize[horizontal];
      const relation=endsFaceProfile(c)?diskInProfile(profile,coord,z,r):rectangleInProfile(profile,coord-half,z-rz,coord+half,z+rz);
      gaps.push(relation==='outside'?-1:relation==='touching'?0:Infinity);
    }
    if(inspectStep)gaps.push(inspectStep(xyz));
    const smallest=Math.min(...gaps),status=smallest<-.01?'outside':smallest<=.01?'touching':'clear';
    const names=['front','rear','left','right','floor','rim','case boundary','STEP surface'];
    shell.cells.push({xyz,status,id:'Bank '+(b+1)+' · row '+(cell.r+1)+' · column '+(cell.k+1),faces:names.filter((_,i)=>gaps[i]<=.01).join(', ')});
  }
  for(const part of parts){
    const lo=part.min.map((v,i)=>v+origin[i]),hi=lo.map((v,i)=>v+part.dim[i]);
    const rim=Math.min(height(lo[0]),height(hi[0]),...roof.filter(p=>p[0]>lo[0]&&p[0]<hi[0]).map(p=>p[1]));
    const followsPack=part.name!=='BMS'||c.bmsMode!=='fixed';
    const outside=shell.posed&&followsPack?shell.testBox(lo,hi)<0:
      (profile&&rectangleInProfile(profile,lo[horizontal],lo[2],hi[horizontal],hi[2])==='outside')||
      lo.some(x=>x<-.00001)||hi[0]>c.length+1e-6||hi[1]>c.width+1e-6||hi[2]>rim+1e-6;
    if(outside)warnings.push(part.name+' extends outside case');
    if(part.name==='Separator'){
      const overlap=shell.cells.some(({xyz})=>xyz.every((v,i)=>{
        const half=halfSize[i];return v+half>lo[i]+1e-6&&v-half<hi[i]-1e-6;
      }));
      if(overlap)warnings.push('Surface sheet intersects a cell envelope. Add clearance or use between-row separators.');
    }
    if(part.name!=='BMS')continue;
    if(shell.posed&&c.bmsMode==='fixed'){
      const boxLo=lo.map(n=>n-c.bmsGap),boxHi=hi.map(n=>n+c.bmsGap);
      const touches=(lo,hi)=>{
        const pts=boxPoints(lo,hi).map(p=>placedPoint(shell.relative,p));
        return boxLo.every((n,i)=>Math.max(...pts.map(p=>p[i]))>n&&Math.min(...pts.map(p=>p[i]))<boxHi[i]);
      };
      if(shell.cells.some(({xyz})=>touches(xyz.map((n,i)=>n-halfSize[i]),xyz.map((n,i)=>n+halfSize[i]))))warnings.push('Tilted cell envelope overlaps fixed BMS clearance');
      if(parts.some(p=>p!==part&&touches(p.min.map((n,i)=>n+origin[i]),p.min.map((n,i)=>n+origin[i]+p.dim[i]))))warnings.push('Tilted accessory envelope overlaps fixed BMS clearance');
      if(c.holder&&touches(origin,origin.map((n,i)=>n+core[i])))warnings.push('Check tilted holder clearance at the fixed BMS');
      continue;
    }
    const gap=c.bmsGap,over=(a,b,i)=>a<hi[i]+gap-1e-6&&b>lo[i]-gap+1e-6;
    const obstruct=shell.cells.filter(({xyz:[x,y,z]})=>over(x-halfSize[0],x+halfSize[0],0)&&over(y-halfSize[1],y+halfSize[1],1)&&over(z-halfSize[2],z+halfSize[2],2));
    if(obstruct.length)warnings.push('BMS clearance overlaps '+obstruct.length+' cell envelopes');
    else if(shell.cells.some(({xyz:[x,y,z]})=>over(x-halfSize[0],x+halfSize[0],0)&&over(y-halfSize[1],y+halfSize[1],1)&&z+halfSize[2]>hi[2]))warnings.push('Cells above box obstruct top installation');
    if(parts.some(p=>p!==part&&p.min.every((v,i)=>over(origin[i]+v,origin[i]+v+p.dim[i],i))))warnings.push('BMS clearance overlaps paper, wire or tape');
    if(c.holder){
      const axis=axial;
      for(let b=0;b<c.banks;b++)for(const end of [0,1]){
        const start=b*(c.len+2*c.lip+m.axialSheet)+end*(c.len+2*c.lip-c.plate);
        if(core.every((v,i)=>over(origin[i]+(i===axis?start:0),origin[i]+(i===axis?start+c.plate:v),i)))warnings.push('BMS clearance overlaps end-plate envelope');
      }
    }
    if(selectedSheets(c).some(k=>k==='rows'||k==='banks')&&c.material!=='none'&&c.sheet&&core.every((v,i)=>over(origin[i],origin[i]+v,i)))warnings.push('Check separator clearance inside BMS recess');
  }
  if(profile&&c.holderShape==='contour'&&endsFaceProfile(c)){
    const contour=cellContour(c,m),ends=[0,m.A].map(a=>contour.map(([u,v])=>
      placedPoint(shell.relative,cellXYZ(c,u,v,a).map((n,i)=>n+origin[i]))));
    const points=ends.flat(),near=[c.front,c.left,c.bottom],far=[c.rear,c.right,c.top],spans=[c.length,c.width,shell.peak];
    for(let i=0;i<3;i++){
      const values=points.map(p=>p[i]),min=Math.min(...values),max=Math.max(...values);
      shell.allowanceMargins[i]=Math.min(min-near[i],spans[i]-max-far[i])-reserve;
      m.margins[i]=Math.min(min,spans[i]-max);
    }
    if(c.holder){
      const rings=ends.map(end=>end.map(p=>[p[horizontal],p[2]]));
      // Tilt away from the sketch plane also sweeps the plate edges between its faces.
      const sideways=rings[0].some(([x,z],i)=>Math.hypot(x-rings[1][i][0],z-rings[1][i][1])>.001);
      if((sideways?[hull2(rings.flat())]:[rings[0]]).some(ring=>containedOutline(profile,ring)<0)||
          points.some(p=>p[axial]<-.001||p[axial]>spans[axial]+.001))warnings.push('Cell holders extend beyond the case boundary');
    }
  }else if((profile||shell.posed)&&c.holder){
    const axis=axial;
    for(let b=0;b<c.banks;b++)for(const end of [0,1]){
      const lo=[...origin],hi=origin.map((v,i)=>v+core[i]);
      lo[axis]+=b*(c.len+2*c.lip+m.axialSheet)+end*(c.len+2*c.lip-c.plate);hi[axis]=lo[axis]+c.plate;
      if(shell.posed?shell.testBox(lo,hi)<0:rectangleInProfile(profile,lo[horizontal],lo[2],hi[horizontal],hi[2])==='outside')warnings.push('Cell holders extend beyond the case boundary');
    }
  }
  shell.finished=max.map((v,i)=>v-min[i]);
  return shell;
}

// Structured strips share vertices at every bend, including the inner floor.
function caseMesh(c,s,plate=null){
  if(s.profile)return fixedCaseMesh(c,s,plate);
  const xs=[-s.tx,...s.roof.map(p=>p[0]),c.length+s.tx];
  const hs=[c.high,...s.roof.map(p=>p[1]),c.low],ys=[-s.ty,0,c.width,c.width+s.ty];
  const nx=xs.length-1,facets=[];
  const solid=(i,j,k)=>{
    if(i<0||i>=nx||j<0||j>2||k<0||k>1)return false;
    if(plate!==null)return j===2*plate;
    if(j!==1)return casePanelMode(c,j/2,false)==='attached';
    return k===0||i===0||i===nx-1;
  };
  for(let i=0;i<nx;i++)for(let j=0;j<3;j++)for(let k=0;k<2;k++){
    if(!solid(i,j,k))continue;
    const pts=[];
    for(const z of [k,k+1])for(const [a,b] of [[i,j],[i+1,j],[i+1,j+1],[i,j+1]])
      pts.push([xs[a],ys[b],z===0?-s.floor:z===1?0:hs[a]]);
    for(const [di,dj,dk,a,b,d,e] of [[0,0,-1,0,3,2,1],[0,0,1,4,5,6,7],[-1,0,0,0,4,7,3],[1,0,0,1,2,6,5],[0,-1,0,0,1,5,4],[0,1,0,3,7,6,2]]){
      if(!solid(i+di,j+dj,k+dk))facets.push([pts[a],pts[b],pts[d]],[pts[a],pts[d],pts[e]]);
    }
  }
  return facets;
}
function saveBlob(name,data,type){
  const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function clearScene(){if(orbitView)orbitView.clear();}
function createOrbit(host){
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}
  catch{host.textContent='3D needs WebGL. The side and section views remain available.';return null;}
  host.replaceChildren(renderer.domElement);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new THREE.Scene();let camera=new THREE.PerspectiveCamera(34,1,.1,30000);
  camera.up.set(0,0,1);
  scene.add(new THREE.HemisphereLight(0xffffff,0x889998,2));
  const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-1,2,4);scene.add(light);
  let parts=new THREE.Group();scene.add(parts);
  let yaw=-.85,pitch=.49,radius=350,target=new THREE.Vector3(),pan=new THREE.Vector3();
  const lens=inspectionLens(host,()=>current?.c.d||21,()=>radius*(camera.isOrthographicCamera ? .74 : 2*Math.tan(camera.fov*Math.PI/360)),paint);
  function paint(){
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';
    camera.aspect=w/h;
    if(camera.isOrthographicCamera){const span=radius*Math.max(1,lens.scale)*.37;camera.top=span/Math.min(1,w/h);camera.bottom=-camera.top;camera.right=camera.top*w/h;camera.left=-camera.right;}
    lens.project(camera,w,h);
    const d=radius*Math.max(1,lens.scale)/Math.min(1,camera.aspect);
    camera.position.set(Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)).multiplyScalar(d).add(target).add(pan);
    camera.lookAt(target.clone().add(pan));renderer.render(scene,camera);drawAxisCube(camera);
  }
  const frameLayer=makeFrameLayer(scene,paint);
  function refreshFrame(fit){
    frameLayer.refresh();
    if(fit){
      const bounds=new THREE.Box3();
      for(const obj of [...parts.children,...frameLayer.group.children])if(obj.visible)bounds.expandByObject(obj);
      if(!bounds.isEmpty()){bounds.getCenter(target);radius=Math.max(1,bounds.getSize(new THREE.Vector3()).length()*1.65);}
    }
    paint();
  }
  let last,action,bmsDrag,partDrag,pickStart;
  host.addEventListener('pointerup',e=>{
    if(pickStart&&e.pointerId===pickStart.id&&Math.hypot(e.clientX-pickStart.x,e.clientY-pickStart.y)<4)
      host.dispatchEvent(new Event('placementclick',{bubbles:true}));
    pickStart=null;
  });
  function framePointer(e,plane){
    const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height),camera);
    return ray.ray.intersectPlane(plane,new THREE.Vector3());
  }
  host.oncontextmenu=host.onauxclick=e=>e.preventDefault();
  let pickingWall=false;
  const wallDialog=$('wallDialog');
  $('pickWall').onclick=()=>{
    if(!caseSketch){alert('Draw or import a closed enclosure first.');return;}
    if(caseSketch.original&&caseSketch.step){alert('Edit the imported STEP solid in CAD, or apply a traced enclosure first.');return;}
    pickingWall=!pickingWall;$('pickWall').textContent=pickingWall?'Cancel wall selection':'Push / pull wall';
    $('wallHint').textContent=pickingWall?'Click near the wall you want to move.':'';
  };
  function pickWall(e){
    if(!pickingWall)return false;
    e.preventDefault();
    const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height),camera);
    const hit=ray.intersectObjects(parts.children.filter(obj=>obj.userData.pick==='enclosure'&&obj.isMesh))[0];
    if(!hit){$('wallHint').textContent='Click the enclosure near an edge.';return true;}
    const d=caseSketch,local=hit.object.worldToLocal(hit.point.clone()),point=[d.endFace?local.y:local.x,local.z];
    const tr=sketchTransform(d),ring=d.points.map(tr),dist=ring.map((a,i)=>pathDistance(point,a,ring[(i+1)%ring.length]));
    const i=dist.indexOf(Math.min(...dist)),j=(i+1)%ring.length,a=d.points[i],b=d.points[j];
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]),sign=Math.sign(sketchArea(d.points));
    $('wallTitle').textContent='Move wall '+(i+1)+' · '+fmt(len*d.scale)+' mm long';
    $('wallDelta').value='0';$('wallError').textContent='';wallDialog.showModal();$('wallDelta').select();
    $('applyWall').onclick=()=>{
      if(!$('wallDelta').reportValidity())return;
      const amount=$('wallDelta').valueAsNumber*sign/(len*d.scale);
      const points=d.points.map((p,k)=>k===i||k===j?[p[0]+(b[1]-a[1])*amount,p[1]-(b[0]-a[0])*amount]:p);
      try{
        const next={...d,points,original:false};validateCaseSketch(next);
        const profile=caseProfile(next),bounds=sketchBounds(profile);
        outsideSketchContour(profile,current.c.wall);
        const shift=sketchBounds(points.map(tr)).lo;next.frameOrigin=shift.map((n,i)=>n+(d.frameOrigin?.[i]||0));
        const sizeAxis=d.endFace?'width':'length';
        const oldCenter=new THREE.Vector3(current.c.length/2,current.c.width/2,current.shell.peak/2);
        const newCenter=oldCenter.clone();newCenter.setComponent(d.endFace?1:0,bounds.w/2);newCenter.z=bounds.h/2;
        const delta=newCenter.clone().sub(oldCenter),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...placements.enclosure.rotation.map(THREE.MathUtils.degToRad)));
        const compensation=new THREE.Vector3(d.endFace?0:shift[0],d.endFace?shift[0]:0,shift[1]).add(delta).applyQuaternion(q).sub(delta);
        placements.enclosure.position=placements.enclosure.position.map((n,k)=>n+compensation.getComponent(k));
        caseSketch=next;fields[sizeAxis].value=bounds.w;fields.high.value=fields.low.value=bounds.h;
        render();document.dispatchEvent(new Event('wallchanged'));wallDialog.close();$('pickWall').click();
      }catch(error){$('wallError').textContent=error.message;}
    };
    return true;
  }
  host.onpointerdown=e=>{
    if(e.isPrimary&&e.button===0&&pickWall(e))return;
    if(!e.isPrimary)return;
    pickStart=null;
    e.preventDefault();let tool=$('bmsTool').value;
    let pick=null;
    if(e.button===0&&tool==='camera'){
      const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)*2/rect.width-1,1-(e.clientY-rect.top)*2/rect.height),camera);
      const hits=ray.intersectObjects([...parts.children,...frameLayer.group.children].filter(o=>o.visible&&o.isMesh&&o.userData.pick));
      const hit=hits.find(h=>h.object.userData.pick!=='enclosure')||hits[0];
      if(hit){pick=hit.object.userData.pick;selectPlacement(pick);pickStart={id:e.pointerId,x:e.clientX,y:e.clientY};}
    }
    const selected=activeFramePart();
    if(e.button===0&&$('frameDrag').checked&&selected?.visible&&selected.id===pick){
      const origin=new THREE.Vector3(...selected.position);
      const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),origin),start=framePointer(e,plane);
      if(start){partDrag={plane,start,origin,id:selected.id,mode:$('frameDragMode').value,rotation:[...selected.rotation],startX:e.clientX};action='frame';last=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId);return;}
    }
    if(tool==='camera'&&e.button===0&&current&&fields.bmsLock.value!=='lock'){
      const box=current.shell.parts.find(p=>p.name==='BMS');
      if(box){
        const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)*2/rect.width-1,1-(e.clientY-rect.top)*2/rect.height),camera);
        const hit=ray.intersectObjects(parts.children.filter(p=>p.name==='BMS'))[0];
        if(hit){
          ray.far=hit.distance-.001;
          if(!ray.intersectObjects(parts.children.filter(p=>p.visible&&p.isMesh&&!p.material.transparent&&p.name!=='BMS')).length)tool='free';
        }
      }
    }
    if(e.button===0&&tool!=='camera'){
      if(!current||fields.bmsLock.value==='lock')return;
      const {c,m,shell}=current;
      if(tool==='pick'){
        const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height),camera);
        const hit=ray.intersectObjects(parts.children.filter(p=>p.userData.cellBodies))[0];if(!hit)return;
        const bank=hit.object.userData.bank;
        const normal=hit.face.normal.clone(),matrix=new THREE.Matrix4();hit.object.getMatrixAt(hit.instanceId,matrix);
        normal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
        const face=Object.keys(faceAxes).sort((a,b)=>{const score=k=>normal.getComponent(faceAxes[k][0])*faceAxes[k][1];return score(b)-score(a);})[0];
        fields.bmsMode.value='mount';fields.bmsMount.value=(bank+1)+'/'+face;mountRotation(fields.bmsMount.value);$('bmsTool').value='camera';render();return;
      }
      const box=shell.parts.find(p=>p.name==='BMS');if(!box)return;
      const index='XYZ'.indexOf(tool),pos=box.min.map((v,i)=>shell.origin[i]+v);
      const pose=bmsWorldPose(),center=new THREE.Vector3(...pose.position),to=center.clone();if(index>=0)to.setComponent(index,to.getComponent(index)+1);
      center.project(camera);to.project(camera);
      const sx=(to.x-center.x)*host.clientWidth/2,sy=-(to.y-center.y)*host.clientHeight/2,den=sx*sx+sy*sy;
      bmsDrag={index,pos,pose,x:e.clientX,y:e.clientY,h:den>.01?sx/den:1,v:den>.01?sy/den:0};
      if(tool==='free'){
        const centerWorld=new THREE.Vector3(...pose.position);
        const scale=(camera.isOrthographicCamera?camera.top*2:2*camera.worldToLocal(centerWorld).z*-Math.tan(camera.fov*Math.PI/360))/host.clientHeight;
        bmsDrag.right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(scale).toArray();
        bmsDrag.down=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar(-scale).toArray();
      }
      editHistory.paused=true;action='BMS';
    }else action=mouseActions[e.button];
    last=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId);
  };
  host.onpointermove=e=>{
    if(!last||!e.isPrimary)return;
    const dx=e.clientX-last[0],dy=e.clientY-last[1];last=[e.clientX,e.clientY];
    if(partDrag){
      const d=partDrag;
      if(d.mode==='move'){
        const p=framePointer(e,d.plane);
        if(!p)return;
        replaceFramePart(d.id,{position:p.sub(d.start).add(d.origin).toArray()});
      }else{
        const rotation=[...d.rotation],axis=Number(d.mode);
        rotation[axis]=(rotation[axis]+(e.clientX-d.startX)*.5)%360;
        replaceFramePart(d.id,{rotation});
      }
      frameLayer.refresh();syncFrameUI();paint();
      return;
    }
    if(action==='BMS'&&bmsDrag){
      const d=bmsDrag;
      const position=d.pose.position.map((v,i)=>v+(d.right?(e.clientX-d.x)*d.right[i]+(e.clientY-d.y)*d.down[i]:i===d.index?(e.clientX-d.x)*d.h+(e.clientY-d.y)*d.v:0));
      setBmsWorldPose({...d.pose,position});return;
    }
    if(action==='Pan'){
      const span=camera.isOrthographicCamera?camera.top*2:2*camera.position.distanceTo(target.clone().add(pan))*Math.tan(camera.fov*Math.PI/360);
      const scale=span*Math.min(1,lens.scale)/host.clientHeight,v=new THREE.Vector3();
      pan.addScaledVector(v.setFromMatrixColumn(camera.matrixWorld,0),-dx*scale);
      pan.addScaledVector(v.setFromMatrixColumn(camera.matrixWorld,1),dy*scale);
    }else if(action==='Zoom')lens.set(lens.scale*Math.exp(dy*.012));
    else if(action==='Orbit'&&!$('locked').checked){yaw-=dx*.01;pitch=Math.max(-1.57079,Math.min(1.57079,pitch+dy*.01));}
    paint();
  };
  host.onpointerup=host.onpointercancel=host.onlostpointercapture=()=>{last=null;if(partDrag){partDrag=null;scheduleSave();}if(bmsDrag){bmsDrag=null;editHistory.paused=false;if(current)recordEdit();}};

  new ResizeObserver(paint).observe(host);
  function clear(){
    for(const p of [...parts.children]){if(!p.geometry.userData.shared)p.geometry.dispose();p.material.dispose();p.dispose?.();parts.remove(p);}paint();
  }
  function preset(view,axis){
    const key=view==='Cell end'?(axis==='vertical'?'Top':axis==='cross'?'Left':'EndX'):view;
    [yaw,pitch]=({Assembly:[-.85,.49],Top:[-Math.PI/2,Math.PI/2-1e-7],Bottom:[-Math.PI/2,-Math.PI/2+1e-7],Back:[0,0],Left:[Math.PI/2,0],Right:[-Math.PI/2,0],EndX:[0,0],Front:[Math.PI,0],Side:[-Math.PI/2,0]})[key];
    camera=key==='Assembly'?new THREE.PerspectiveCamera(34,1,.1,30000):new THREE.OrthographicCamera(-1,1,1,-1,.1,30000);
    camera.up.set(0,0,1);pan.set(0,0,0);lens.restore(1);paint();
  }
  let material,outline;
  function opacity(){if(material){material.opacity=+$('opacity').value/100;outline.visible=material.opacity>0&&$('showCase').checked;paint();}}
  return {clear,preset,opacity,refreshFrame,shareGeometry:()=>captureSharedGeometry([parts,frameLayer.group]),previewPlacement(id,pose){
    if(!current)return;
    const {c,m,shell:s}=current,pivot=id==='enclosure'?[c.length/2,c.width/2,s.peak/2]:[m.x,m.y,m.z].map((n,i)=>s.origin[i]+n/2);
    const mat=placementMatrix(pose,pivot);
    for(const obj of parts.children){
      if(obj.userData.placement!==id||!obj.userData.localMatrix)continue;
      obj.matrix.multiplyMatrices(mat,obj.userData.localMatrix);
      obj.matrix.decompose(obj.position,obj.quaternion,obj.scale);
    }
    paint();
  },image(format='image/png',overview=false){
    const savedCamera=camera,savedZoom=lens.scale,savedOffset=lens.state(),savedYaw=yaw,savedPitch=pitch,savedPan=pan.clone(),savedTarget=target.clone(),savedRadius=radius;
    if(overview){
      const bounds=new THREE.Box3();
      for(const obj of [...parts.children,...frameLayer.group.children])if(obj.visible)bounds.expandByObject(obj);
      if(!bounds.isEmpty()){
        bounds.getCenter(target);
        const dim=bounds.getSize(new THREE.Vector3()),end=!!caseSketch?.endFace,aspect=host.clientWidth/Math.max(1,host.clientHeight);
        preset(end?'Back':'Right',current.c.axis);
        const halfHeight=.56*Math.max(dim.z,(end?dim.y:dim.x)/aspect,1);
        radius=Math.max(dim.length()*2,1);lens.restore(halfHeight*Math.min(1,aspect)/(.37*radius));
      }
    }
    try{
    paint();
    const source=renderer.domElement,out=document.createElement('canvas');out.width=source.width;out.height=source.height;
    const ctx=out.getContext('2d');ctx.fillStyle=getComputedStyle(host).backgroundColor;ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(source,0,0);return out.toDataURL(format,.8);
    }finally{if(overview){camera=savedCamera;radius=savedRadius;lens.restore(savedZoom,savedOffset);yaw=savedYaw;pitch=savedPitch;pan.copy(savedPan);target.copy(savedTarget);radius=savedRadius;paint();}}
  },cameraState:()=>({yaw,pitch,zoom:lens.scale,crop:lens.state(),pan:pan.toArray()}),setCamera(state){if(state&&[state.yaw,state.pitch,state.zoom].every(Number.isFinite)){if(Array.isArray(state.pan)&&state.pan.length===3&&state.pan.every(Number.isFinite))pan.fromArray(state.pan);yaw=state.yaw;pitch=state.pitch;lens.restore(state.zoom,state.crop);paint();}},update(c,m,s,tris,fitCamera=true){
    clear();
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(tris.flat(2),3));geometry.computeVertexNormals();
    const shell=new THREE.Mesh(geometry,new THREE.MeshPhongMaterial({color:0x7699a0,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}));
    parts.add(shell);
    const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x526b70}));parts.add(lines);
    material=shell.material;outline=lines;material.opacity=+$('opacity').value/100;lines.visible=material.opacity>0;
    const upright=c.axis==='vertical', dummy=new THREE.Object3D();
    const banks=[...$('layerBanks').querySelectorAll('input:checked')].map(input=>+input.value);
    shell.visible=$('showCase').checked;lines.visible=shell.visible&&material.opacity>0;
    const groups=groupMap(c,m);
    dummy.scale.set(c.d,c.len,c.d);
    const models=cellRenderParts(m.cells.length*banks.length);
    for(const bank of banks){
      const cells=m.bankCells[bank],start=m.bankOffsets[bank];
      if($('showCells').checked&&cells.length){
        const instances=models.map(([geometry,options])=>new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial(options),cells.length));
        cells.forEach((point,i)=>{
          const cell=s.cells[start+i],key=point.id+'/'+bank;
          const color=c.grouping==='on'?groupColor(groups.get(key)):0x599e93;
          instances[0].setColorAt(i,new THREE.Color(c.mode==='pack'||cell.status==='clear'?color:cell.status==='outside'?0xce3a42:0xe59a25));
          dummy.position.set(...cell.xyz);
          const sign=reversedCells.has(key)?-1:1;
          dummy.rotation.set(upright?sign*Math.PI/2:0,0,upright?0:c.axis==='cross'?(sign<0?Math.PI:0):-sign*Math.PI/2);
          dummy.updateMatrix();for(const part of instances)part.setMatrixAt(i,dummy.matrix);
        });
        instances[0].userData.cellBodies=true;instances[0].userData.bank=bank;parts.add(...instances);
        addSeriesLabels(parts,c,m,s,bank,groups);
      }
      addSheetPreview(parts,c,m,s,bank,1);
      addHolderPreview(parts,c,m,s,bank,1);
      addSquigglePreview(parts,c,m,s,bank,1);
    }
    if(!banks.length){addHolderPreview(parts,c,m,s,0,0);addSquigglePreview(parts,c,m,s,0,0);}
    for(const item of s.parts){
      if(item.bank&&!banks.includes(item.bank-1))continue;
      if(item.name==='BMS'&&!$('showBMS').checked)continue;
      if(['Paper','Separator','Tape','Wrap'].includes(item.name)&&!$('showSheets').checked)continue;
      accessoryMesh(parts,item,s.origin);
    }
    for(const obj of parts.children){
      const enclosure=obj===shell||obj===lines;
      obj.userData.pick=enclosure?'enclosure':obj.name==='BMS'?'bms':'battery';
      const fixed=enclosure||(obj.name==='BMS'&&c.bmsMode==='fixed');
      obj.userData.placement=fixed?'enclosure':'battery';
      obj.updateMatrix();obj.userData.localMatrix=obj.matrix.clone();
      obj.applyMatrix4(fixed?s.caseMatrix:s.batteryMatrix);
    }
    refreshFrame(fitCamera&&!bmsDrag&&!partDrag&&!holdingCamera);
  }};
}
function showBuilder(c,m,s){
  refreshCasePanels(c,s);
  $('caseOrient').hidden=!caseSketch;$('framePhotoLabel').hidden=!caseSketch?.image;$('framePhoto').checked=!!caseSketch?.showPhoto;
  const across=caseSketch?.endFace?'flat':'cross';
  fields.axis.options[1].text=across==='flat'?'Flat · across bike':'Flat · front to back';
  fields.axis.options[2].text=across==='cross'?'Flat · across bike':'Flat · front to back';
  $('relativeAxis').value=c.axis==='vertical'?'up':c.axis===across?'through':'along';
  if(c.axis!=='vertical')fields.axis.dataset.lastFlat=c.axis;
  syncPlacementControls();
  if(caseSketch){if(document.activeElement!==$('quickDepth'))$('quickDepth').value=+(caseSketch.endFace?c.length:c.width).toFixed(6);$('caseAngle').value=caseSketch.angle||0;}
  $('partReport').textContent=[...(s.parts.length?['Finished envelope '+s.finished.map(fmt).join(' × ')+' mm']:[]),...new Set(s.warnings)].join(' · ');
  $('bmsStl').disabled=c.bmsMode==='off';
  $('bmsAllowance').textContent=c.bmsMode==='off'?'Add the measured board or enclosure in the BMS editor to reserve its space.':'BMS box included · '+displayLength(c.bmsL,c.bmsW,c.bmsH)+'. Check connector access and cable bends.';
  $('hard').checked=c.mode!=='pack';
  const alerts=s.cells.filter(p=>p.status!=='clear'),outside=alerts.filter(p=>p.status==='outside').length;
  $('contacts').textContent=c.mode==='pack'?'Auto-size · '+m.count+' cells':outside+' outside (red) · '+(alerts.length-outside)+' touching (amber) · '+(m.count-alerts.length)+' clear';
  $('issues').hidden=c.mode==='pack'||!alerts.length;
  $('contactList').innerText=c.mode==='pack'?'':alerts.map(p=>p.id+' — '+p.status+' · '+p.faces).join('\n');
  for(const key of ['outL','outW','outH'])fields[key].parentElement.hidden=c.mode!=='both';
  for(const key of ['length','width','high','low'])fields[key].disabled=c.mode==='pack';
  $('caseNote').textContent=c.mode==='both'?'Walls are centered around the inner cavity. Overall height includes the floor.':c.mode==='pack'?'Dimensions follow the pack, holders and six clearance values.':'Enter the inside dimensions below. Walls and floor determine the outside.';
  $('caseSize').textContent='Inside '+displayLength(c.length,c.width,s.peak)+' · Outside '+displayLength(c.length+2*s.tx,c.width+2*s.ty,s.peak+s.floor)+' (peak)';
  $('fillChoice').hidden=!endsFaceProfile(c);$('fillPattern').value=c.pattern;$('skFillResult').textContent='';$('skFill').hidden=!endsFaceProfile(c);
  $('removeSketch').hidden=!s.profile;$('hard').disabled=fields.mode.disabled=!!s.profile;
  fields.wall.disabled=fields.base.disabled=!!(s.profile&&caseSketch.original);
  $('straight').disabled=$('mirror').disabled=!!s.profile;
  const sideHelp=$('side').parentElement.querySelector('p.note');
  sideHelp.dataset.original??=sideHelp.textContent;
  sideHelp.textContent=s.profile?'Click the side view to reopen the enclosure sketch.':sideHelp.dataset.original;
  if(s.profile){
    for(const key of [caseSketch.endFace?'width':'length','high','low'])fields[key].disabled=true;
    $('caseNote').textContent='Fixed side profile · '+caseSketch.name+'. '+(caseSketch.autoPlace?'Auto-position is on. ':'')+'Open the sketch to change the outline or placement.';
    $('caseSize').textContent='Inside L × W × H '+displayLength(c.length,c.width,s.peak)+' · '+(caseSketch.original?'Full STEP body · cells checked against the section and imported surfaces.':'Sketched enclosure · wall '+fmt(c.wall)+' mm · panel thickness '+fmt(c.base)+' mm');
  }
  $('caseSTL').disabled=false;
  setScope(c);const tri=caseMesh(c,s);orbitView?.update(c,m,s,tri);
  const H=Math.max(s.peak,m.z+s.origin[2]),L=Math.max(c.length,m.x+s.origin[0]),pad=L*.08;
  const side=$('side');side.setAttribute('viewBox',[-pad,-pad,L+2*pad,H+2*pad].join(' '));
  const rects=[...side.querySelectorAll('rect')];const oldH=Math.max(c.high,c.low,m.z);
  side.querySelector('path').remove();
  for(const r of rects)r.setAttribute('transform','translate('+s.origin[0]+' '+(H-oldH-s.origin[2])+')');
  if(s.posed||s.profile||c.axis==='cross'){
      side.replaceChildren();
      const horizontal=caseSketch?.endFace?1:0;
      const W=horizontal?Math.max(c.width,m.y+s.origin[1]):L;
      side.setAttribute('viewBox',[-pad,-pad,W+2*pad,H+2*pad].join(' '));
      const seen=new Set();
      for(const {xyz,status} of s.cells){
        const center=s.posed?placedPoint(s.relative,xyz):xyz;
        const y=center[horizontal],z=center[2],key=y+','+z;if(seen.has(key))continue;seen.add(key);
        const axial=cellBases[c.axis].a,flat=axial===1-horizontal,cell=document.createElementNS(side.namespaceURI,s.posed?'polygon':flat?'circle':'rect');
        const w=axial===horizontal?c.len:c.d,h=axial===2?c.len:c.d;
        const attributes=s.posed?{points:s.cellOutline.map(([x,dz])=>(y+x)+','+(H-z-dz)).join(' ')}:flat?{cx:y,cy:H-z,r:c.d/2}:{x:y-w/2,y:H-z-h/2,width:w,height:h};
        for(const [k,v] of Object.entries(attributes))cell.setAttribute(k,v);
        cell.setAttribute('fill',status==='outside'?'#dc7667':status==='touching'?'#e4ac54':'#a8cfc5');cell.setAttribute('stroke','#437369');side.append(cell);
      }
    }
  if(s.profile){
    const poly=document.createElementNS(side.namespaceURI,'polygon');
    poly.setAttribute('points',s.profile.map(([x,z])=>x+','+(H-z)).join(' '));poly.setAttribute('fill','#c7ded6');poly.setAttribute('stroke','#497164');side.prepend(poly);
    scheduleSave();return;
  }
  const pts=s.roof.map(([x,z])=>x+','+(H-z)).join(' ');
  side.insertAdjacentHTML('afterbegin','<polygon points="0,'+H+' '+pts+' '+c.length+','+H+'" fill="#edf2ea" stroke="#61776a"/>');
  side.insertAdjacentHTML('beforeend','<polyline data-add="1" points="'+pts+'" fill="none" stroke="#166459" stroke-width="3" style="cursor:crosshair"/>'+s.roof.map(([x,z],i)=>'<circle data-handle="'+i+'" cx="'+x+'" cy="'+(H-z)+'" r="'+L*.019+'" fill="#d58232"/>').join(''));
  side.dataset.h=H;
  scheduleSave();
}

const storageKey='cellbench.builder.v1';
let saveTimer;
function snapshot(){
  return {version:1,name:$('projectName').value.trim()||'Untitled pack',settings:read(),lastFlatAxis:fields.axis.dataset.lastFlat||(caseSketch&&!caseSketch.endFace?'cross':'flat'),placements:structuredClone(placements),caseSketch,frameParts,corners,endLift,omitted:[...omitted],reversed:[...reversedCells]};
}
function scheduleSave(){
  clearTimeout(saveTimer);
  if(!current)return;
  recordEdit();
  try{const draft=snapshot();buildAutosave?.checkpoint(draft);draft.view=captureView();projectStorage.setItem(storageKey+'.draft',JSON.stringify(draft));$('saveStatus').textContent=hostedProjects?'Use My builds to save this project to your account.':'Current design autosaved on this browser.';}
  catch{$('saveStatus').textContent='Use Export project to save a portable copy.';}
}
function restore(doc,buildId=null){
  if(!doc||doc.version!==1||!doc.settings||!Array.isArray(doc.corners)||doc.corners.length>200)throw Error('Invalid motoPack project.');
  const config={...defaults,...doc.settings};
  if(!doc.settings.cellModel)config.cellModel=cellCatalog.find(c=>['d','len','cellAh','nominal'].every(k=>c[k]===config[k]))?.cellModel||'custom';validateSurfaceItems(config.surfaceItems??[]);
  if(config.shift!==50){
    if(config.pattern==='offset')config.pattern='custom';
    if(config.pattern==='short')config.pattern='customShort';
  }
  if(config.locations&&(!Array.isArray(config.locations)||config.locations.some(k=>![...fields.place.options].some(o=>o.value===k))))throw Error('Invalid separator locations.');
  config.rowGap=doc.settings.rowGap??config.gap;
  for(const [key,input] of Object.entries(fields)){
    const v=config[key];
    if(input.type==='number' ? !Number.isFinite(v)||v<+input.min||v>+input.max||(input.step==='1'&&!Number.isInteger(v)) : !Array.from(input.options).some(o=>o.value===v))throw Error('Invalid project field '+key);
  }
  if(!doc.corners.every(([t,d],i)=>Number.isFinite(t)&&Number.isFinite(d)&&t>0&&t<1&&(!i||t>doc.corners[i-1][0]))||
    !Array.isArray(doc.endLift)||doc.endLift.length!==2||!doc.endLift.every(Number.isFinite)||!Array.isArray(doc.omitted))throw Error('Invalid project geometry.');
  const savedPlacement=readPlacements(doc.placements);
  validateCaseSketch(doc.caseSketch);validateFrameParts(doc.frameParts??[]);buildAutosave?.switchBuild(buildId);placements=savedPlacement;resetFrameLayout(doc.frameParts??[]);
  caseSketch=doc.caseSketch||null;
  if(caseSketch){const p=sketchBounds(caseProfile(caseSketch));config.mode='inner';config[caseSketch.endFace?'width':'length']=+p.w.toFixed(6);config.high=config.low=+p.h.toFixed(6);}
  fields.axis.dataset.lastFlat=['flat','cross'].includes(doc.lastFlatAxis)?doc.lastFlatAxis:(caseSketch&&!caseSketch.endFace?'cross':'flat');
  apply(config);corners=doc.corners;endLift=doc.endLift;omitted.clear();
  reversedCells.clear();for(const id of Array.isArray(doc.reversed)?doc.reversed:[])if(typeof id==='string'&&/^\d+-\d+\/\d+$/.test(id))reversedCells.add(id);
  for(const id of doc.omitted)omitted.add(id);
  $('projectName').value=String(doc.name||'Untitled');render();
  restoreSessionView(doc.view);
  document.dispatchEvent(new Event('designrestored'));
  buildAutosave?.ready();scheduleSave();
}
function initBuilder(){
  initViewerWorkspace();
  initFrameLayout();initConversion();initPlacementControls();
  $('framePhoto').onchange=e=>{if(caseSketch?.image){caseSketch={...caseSketch,showPhoto:e.target.checked};render();}};
  function orient(endFace,angle,axis){
    if(!caseSketch||!current)return;
    const depth=caseSketch.endFace?current.c.length:current.c.width;
    const next={...caseSketch,endFace,angle},b=sketchBounds(caseProfile(next));
    if(!Number.isFinite(angle)||b.w>1000.000001||b.h>1000.000001||Math.min(b.w,b.h)<9.999999){$('caseAngle').value=caseSketch.angle||0;return;}
    caseSketch=next;fields.length.value=endFace?depth:b.w.toFixed(6);fields.width.value=endFace?b.w.toFixed(6):depth;
    fields.high.value=fields.low.value=b.h.toFixed(6);fields.axis.value=axis;render();
  }
  $('relativeAxis').onchange=e=>{
    if(refillWizardDirection?.(e.target.value)){if(current)$('relativeAxis').value=current.c.axis==='vertical'?'up':endsFaceProfile(current.c)?'through':'along';return;}
    fields.axis.value=e.target.value==='up'?'vertical':(e.target.value==='through')===!!caseSketch?.endFace?'flat':'cross';
    fields.axis.dispatchEvent(new Event('input',{bubbles:true}));
  };
  $('turnCase').onclick=()=>orient(!caseSketch.endFace,caseSketch.angle||0,fields.axis.value);
  $('caseAngle').onchange=e=>{if(e.target.value&&e.target.checkValidity())orient(caseSketch.endFace,e.target.valueAsNumber,fields.axis.value);};
  $('caseAngle').oninput=e=>{if(e.isTrusted===false)e.target.onchange(e);};
  $('skFill').onclick=fillSketchSection;initCaseEditor();initWorkbench();setupSurfaceEditor();
  $('editBms').onclick=()=>{const d=$('bmsSetup').closest('details');d.open=true;d.scrollIntoView({block:'center'});fields.bmsL.focus({preventScroll:true});};
  $('antSize').onclick=()=>{if(fields.bmsLock.value==='lock')return;fields.bmsL.value=195;fields.bmsW.value=132;if(fields.bmsMode.value==='off')fields.bmsMode.value='after';render();};
  $('bmsTool').onchange=()=>{if($('bmsTool').value!=='camera'&&fields.bmsMode.value==='off'&&fields.bmsLock.value!=='lock'){fields.bmsMode.value='after';render();}};
  $('bmsStl').onclick=()=>{if(current&&current.c.bmsMode!=='off')saveBlob('bms-open-top-box.stl',binarySTL(bmsBoxMesh(current.c)),'application/octet-stream');};
  $('hard').oninput=e=>{
    if(e.target.checked&&current?.c.mode==='pack'){
      for(const key of ['length','width','high','low'])fields[key].value=current.c[key];
      fields.mode.value='inner';
    }else fields.mode.value=e.target.checked?'inner':'pack';
  };
  $('opacity').oninput=()=>orbitView?.opacity();
  $('viewPreset').onchange=()=>{
    const view=$('viewPreset').value;
    if(view==='Assembly')$('locked').checked=false;
    orbitView?.preset(view,fields.axis.value);
  };
  $('exportCaseStl').onclick=()=>$('caseSTL').click();
  for(const [id,format] of [['assemblyStl','stl'],['assemblyStep','step']])$(id).onclick=()=>{
    if(current)saveBlob('whole-battery.'+format,assemblyFile(format),format==='step'?'application/step':'application/octet-stream');
  };

  initViewTools();orbitView=createOrbit($('scene'));
  const side=$('side');
  let drag=null,lastHit=null;
  function coords(e,matrix){
    return new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix);
  }
  side.onpointerdown=e=>{
    if(!current)return;
    if(caseSketch){$('openSketch').click();return;}
    const {c}=current, matrix=side.getScreenCTM().inverse(),pos=coords(e,matrix),H=+side.dataset.h;
    let i=Number(e.target.dataset.handle);
    if(e.target.dataset.add){
      const t=pos.x/c.length;
      if(t<=.01||t>=.99||corners.some(p=>Math.abs(t-p[0])<.01))return;
      corners.push([t,H-pos.y-c.high-(c.low-c.high)*t]);corners.sort((a,b)=>a[0]-b[0]);i=corners.findIndex(p=>p[0]===t)+1;
    }
    if(!Number.isInteger(i))return;
    const now=performance.now();
    if(lastHit&&lastHit.i===i&&now-lastHit.time<360&&i>0&&i<=corners.length){corners.splice(i-1,1);lastHit=null;render();return;}
    lastHit={i,time:now};
    editHistory.paused=true;
    const roof=[[0,c.high],...corners.map(([t,d])=>[t*c.length,c.high+(c.low-c.high)*t+d]),[c.length,c.low]];
    drag={i,H,matrix,c:{...c},start:[...endLift],roof};side.setPointerCapture(e.pointerId);render();
  };
  side.onpointermove=e=>{
    if(!drag)return;
    const {i,H,matrix,c,start}=drag,pos=coords(e,matrix);
    let z=Math.max(10,Math.min(1000,Math.round((H-pos.y)*10)/10));
    const snapped=snapProfile(drag,i===0?0:i===corners.length+1?c.length:pos.x,z,e.altKey);z=snapped.z;$('snapHint').textContent=snapped.label;
    if(i===0||i===corners.length+1){
      const key=i===0?'high':'low',k=i===0?0:1;
      if(c.mode==='pack')endLift[k]=start[k]+z-c[key];else fields[key].value=z;
      const high=k===0?z:c.high,low=k===1?z:c.low;
      corners=drag.roof.slice(1,-1).map(([x,h])=>[x/c.length,h-high-(low-high)*x/c.length]);
    }else{
      const lo=corners[i-2]?.[0]??0,hi=corners[i]?.[0]??1;
      const t=Math.min(hi-.002,Math.max(lo+.002,snapped.x/c.length));
      corners[i-1]=[t,z-c.high-(c.low-c.high)*t];
    }
    render();
  };
  side.onpointerup=side.onpointercancel=()=>{if(drag){drag=null;editHistory.paused=false;recordEdit();}};
  $('straight').onclick=()=>{corners=[];endLift=[0,0];render();};
  $('caseSTL').onclick=()=>{if(current)saveBlob(caseSketch?'enclosure-case.stl':'open-top-case.stl',binarySTL(caseMesh(current.c,current.shell)),'application/octet-stream');};
  const library=()=>new Map(JSON.parse(projectStorage.getItem(storageKey+'.library')||'[]'));
  function list(){const menu=$('library');menu.replaceChildren();for(const name of library().keys())menu.add(new Option(name,name));}
  function safe(fn){return async()=>{try{await fn();}catch(error){$('saveStatus').textContent=error.message;}};}
  $('storeDesign').onclick=safe(()=>{const doc=snapshot(),items=library();let name=doc.name;
    for(let i=2;items.has(name);i++)name=doc.name+' ('+i+')';
    doc.name=name;items.set(name,doc);projectStorage.setItem(storageKey+'.library',JSON.stringify([...items]));list();$('library').value=name;$('projectName').value=name;scheduleSave();});
  $('loadDesign').onclick=safe(()=>{const doc=library().get($('library').value);if(doc)restore(doc);});
  const update=document.createElement('button');update.textContent='Update saved design';update.className='secondary';
  $('loadDesign').after(update);
  update.onclick=safe(()=>{const doc=snapshot(),items=library();
    if(!items.has(doc.name))throw Error('Save a named copy first, or open the saved design you want to update.');
    items.set(doc.name,doc);projectStorage.setItem(storageKey+'.library',JSON.stringify([...items]));list();$('library').value=doc.name;$('saveStatus').textContent='Updated '+doc.name;});
  $('newDesign').onclick=safe(()=>{
    buildAutosave?.switchBuild(null,true);
    apply({...defaults,mode:'pack',cols:1,rows:1,banks:1,pattern:'regular',gap:1.5,rowGap:1.5,series:1});
    placements=readPlacements();pickedObject='battery';delete fields.axis.dataset.lastFlat;resetFrameLayout();caseSketch=null;corners=[];endLift=[0,0];omitted.clear();reversedCells.clear();$('projectName').value='Untitled pack';render();buildAutosave?.ready();scheduleSave();
  });
  $('exportDesign').onclick=safe(()=>{const doc=snapshot();doc.view=captureView();saveBlob(doc.name+'.cellbench.json',JSON.stringify(doc,null,2),'application/json');});
  $('importDesign').onclick=()=>$('fileDesign').click();
  $('fileDesign').onchange=safe(async()=>{const f=$('fileDesign').files[0];$('fileDesign').value='';if(f)restore(JSON.parse(await f.text()));});
  $('projectName').oninput=scheduleSave;
  $('browseAutosaves').onclick=()=>$('topDashboard').click();
  try{list();}catch{}
}

function seriesFit(count,c,m){
  if(['split','mirror'].includes(c.groupPlan)&&c.series%c.banks)return 'Select an equal series split';
  const parallel=activeParallel(count,c,m),extra=count-c.series*parallel;
  return parallel ? c.series+'S'+parallel+'P'+(extra?' · '+extra+' spare':'') : (count<c.series?c.series+'S needs '+(c.series-count)+' more cells':'This bank layout cannot fill every series group.');
}
function searchCapacity(){
  const panel=$('fitResults');panel.replaceChildren();
  if(!current){panel.textContent='Enter valid case and cell dimensions first.';return;}
  const c={...current.c},goal=c.series*targetParallel(c);
  if(['split','mirror'].includes(c.groupPlan)&&c.series%c.banks){
    panel.textContent='To keep groups within each bank, S must divide evenly across the banks. Choose Across bank ends or change the bank count.';
    return;
  }
  let fit;
  try{
    if(caseSketch)fit=buildContourPack(c,caseProfile(caseSketch));
    else if(c.mode==='pack')fit=fitOpenPack(c,goal);
    else fit=fitFixedCase(c,goal);
    if(!fit){panel.textContent='No clear layout found. Check the case dimensions, cell direction and bank count.';return;}
    if(fit.pose)placements=fit.pose;
    if(caseSketch){caseSketch.limitParallel=true;caseSketch.requestedParallel=targetParallel(c);}
    apply(fit.c);omitted.clear();for(const id of fit.skip||[])omitted.add(id);
    alternateGroupEnds(fit.c,layout(fit.c,omitted));
    render();
    const short=goal-current.m.count;
    panel.textContent=short>0?short+' more cell positions needed. Reduce P, change banks or enlarge the case.':'';
  }catch(error){panel.textContent=error.message;}
}
function alternateGroupEnds(c,m){
  reversedCells.clear();
  for(const [id,group] of groupMap(c,m))if(group&&group%2===0)reversedCells.add(id);
}
function fitFixedCase(c,goal){
  const p=c.d+c.gap, edgeU=c.holder?2*c.edgeU:0, edgeV=c.holder?2*c.edgeV:0;
  const reserve=c.holderReserve+c.miscReserve;
  const room=columnRoom(c)-edgeU-2*reserve;
  const across=Math.min(30,Math.floor((room-c.d+1e-8)/p)+1);
  const winners=new Map();
  const axis=c.axis,pattern=c.pattern;
  {
    for(let cols=1;cols<=across;cols++){
      const shift=c.shift;
      if(['short','customShort'].includes(pattern)&&cols<2)continue;
      const trial={...c,axis,pattern,cols,shift,rows:1,banks:1};
      for(let rows=1;rows<=30;rows++){
        const settings={...trial,rows,banks:c.banks};
        let model,shell;
        try{model=layout(settings);}catch{continue;}
        const count=model.count,key=axis+pattern,score=count>=goal?count-goal:goal-count+100000;
        if(score>=(winners.get(key)?.score??Infinity))continue;
        try{shell=makeShell(settings,model);}catch{continue;}
        if(shell.allowanceMargins.some(x=>x<-.000001)||shell.warnings.length||shell.cells.some(p=>p.status!=='clear'))continue;
        if(c.holder&&holderProblem(settings,model))continue;
        winners.set(key,{settings,count,score});
      }
    }
  }
  const best=winners.values().next().value;
  return best&&{c:best.settings};
}

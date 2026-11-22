// Placement is separate from the dimensions and orientation of the repeating cell array.
const zeroPlacement=()=>({position:[0,0,0],rotation:[0,0,0]});
let placements={battery:zeroPlacement(),enclosure:zeroPlacement()},pickedObject='battery';
function readPlacements(saved={}){
  const next={};
  for(const key of ['battery','enclosure']){
    const p=saved[key]||zeroPlacement();
    for(const k of ['position','rotation'])if(!Array.isArray(p[k])||p[k].length!==3||!p[k].every(n=>Number.isFinite(n)&&Math.abs(n)<=(k==='rotation'?360:100000)))throw Error('Invalid assembly placement.');
    next[key]=structuredClone(p);
  }
  return next;
}
function placementMatrix(p,pivot){
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...p.rotation.map(THREE.MathUtils.degToRad)))
    .premultiply(new THREE.Matrix4().makeTranslation(...pivot.map((v,i)=>v+p.position[i])))
    .multiply(new THREE.Matrix4().makeTranslation(...pivot.map(v=>-v)));
}
function placedPoint(matrix,p){return new THREE.Vector3(...p).applyMatrix4(matrix).toArray();}
function boxPoints(lo,hi){
  return Array.from({length:8},(_,i)=>lo.map((v,j)=>i&(1<<j)?hi[j]:v));
}
function hull2(points){
  const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  function side(list){
    const out=[];
    for(const p of list){
      while(out.length>1){const b=out.at(-1),a=out.at(-2);if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>1e-9)break;out.pop();}
      out.push(p);
    }
    out.pop();return out;
  }
  return [...side(sorted),...side(sorted.reverse())];
}
function containedOutline(profile,points){
  let result=Infinity;
  for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length],status=diskInProfile(profile,...p,0);
    if(status==='outside')return -1;
    if(status==='touching')result=0;
    for(let j=0;j<profile.length;j++)if(segmentsCross(p,q,profile[j],profile[(j+1)%profile.length]))return -1;
  }
  return result;
}
function preparePlacement(c,m,s,pose){
  const core=[m.x,m.y,m.z],pivot=core.map((v,i)=>s.origin[i]+v/2);
  s.batteryMatrix=placementMatrix(pose.battery,pivot);
  s.caseMatrix=placementMatrix(pose.enclosure,[c.length/2,c.width/2,s.peak/2]);
  s.relative=s.caseMatrix.clone().invert().multiply(s.batteryMatrix);
  s.posed=s.relative.elements.some((v,i)=>Math.abs(v-(i%5===0?1:0))>1e-9);
  if(!s.posed)return;
  const h=caseSketch?.endFace?1:0,depth=1-h,profile=s.profile||[[0,0],[c.length,0],...s.roof.slice().reverse()];
  const maxDepth=depth===0?c.length:c.width;
  function stencil(offsets){
    const p=offsets.map(v=>new THREE.Vector3(...v).applyMatrix3(new THREE.Matrix3().setFromMatrix4(s.relative)).toArray());
    const outline=hull2(p.map(a=>[a[h],a[2]])),min=Math.min(...p.map(a=>a[depth])),max=Math.max(...p.map(a=>a[depth]));
    if(offsets===ring)s.cellOutline=outline;
    return center=>{
      const pos=placedPoint(s.relative,center);
      return Math.min(pos[depth]+min,maxDepth-pos[depth]-max,containedOutline(profile,outline.map(([x,z])=>[x+pos[h],z+pos[2]])));
    };
  }
  // Circumscribe the cell to keep the faceted fit check conservative.
  const radius=c.d/2/Math.cos(Math.PI/64),ring=[];
  for(const sign of [-1,1])for(let k=0;k<64;k++)ring.push(cellXYZ(c,radius*Math.cos(k*Math.PI/32),radius*Math.sin(k*Math.PI/32),sign*c.len/2));
  s.testCell=stencil(ring);
  // For a side tilt the circular ends and rectangular side silhouette stay exact.
  const throughVector=new THREE.Vector3().setComponent(depth,1).transformDirection(s.relative);
  if(throughVector.getComponent(depth)>1-1e-10){
    const inverse=s.relative.clone().invert();
    const localProfile=profile.map(([x,z])=>{
      const p=[0,0,z];p[h]=x;const local=placedPoint(inverse,p);return [local[h],local[2]];
    });
    const half=cellXYZ(c,c.d/2,c.d/2,c.len/2),across=cellBases[c.axis].a===depth;
    s.testCell=p=>{
      const dz=p[depth]+s.relative.elements[12+depth],x=p[h],z=p[2];
      const relation=across?diskInProfile(localProfile,x,z,c.d/2):rectangleInProfile(localProfile,x-half[h],z-half[2],x+half[h],z+half[2]);
      return Math.min(dz-half[depth],maxDepth-dz-half[depth],relation==='outside'?-1:relation==='touching'?0:Infinity);
    };
  }
  s.testBox=(lo,hi)=>stencil(boxPoints([0,0,0],hi.map((v,i)=>v-lo[i])))(lo);
  const corners=boxPoints(s.origin,s.origin.map((v,i)=>v+core[i])).map(p=>placedPoint(s.relative,p));
  const spans=[c.length,c.width,s.peak],near=[c.front,c.left,c.bottom],far=[c.rear,c.right,c.top],reserve=c.miscReserve+c.holderReserve;
  for(let i=0;i<3;i++){
    const min=Math.min(...corners.map(p=>p[i])),max=Math.max(...corners.map(p=>p[i]));
    m.margins[i]=Math.min(min,spans[i]-max);
    s.allowanceMargins[i]=Math.min(min-near[i],spans[i]-max-far[i])-reserve;
  }
}
function bmsWorldPose(){
  if(!current)return null;
  const {c,shell}=current,box=shell.parts.find(p=>p.name==='BMS');
  if(!box)return null;
  const parent=c.bmsMode==='fixed'?shell.caseMatrix:shell.batteryMatrix;
  const center=box.min.map((v,i)=>v+shell.origin[i]+box.dim[i]/2);
  const basis=new THREE.Matrix4().extractRotation(parent).multiply(rotationBounds(c).matrix);
  const angles=new THREE.Euler().setFromRotationMatrix(basis);
  return {position:placedPoint(parent,center),rotation:[angles.x,angles.y,angles.z].map(THREE.MathUtils.radToDeg)};
}
function setBmsWorldPose(pose){
  const {c,shell}=current,inv=shell.caseMatrix.clone().invert();
  const world=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...pose.rotation.map(THREE.MathUtils.degToRad)));
  const rot=new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().extractRotation(inv).multiply(world));
  const [rx,ry,rz]=[rot.x,rot.y,rot.z].map(THREE.MathUtils.radToDeg);
  const {dim}=rotationBounds({...c,rx,ry,rz}),center=placedPoint(inv,pose.position);
  const coords=center.map((v,i)=>v-dim[i]/2);
  if(coords.some(v=>Math.abs(v)>10000))return;
  fields.bmsMode.value='fixed';
  for(const [i,key] of ['rx','ry','rz','bx','by','bz'].entries())fields[key].value=[rx,ry,rz,...coords][i];
  render();
}
function syncPlacementControls(){
  if(!$('objectPick'))return;
  const choices=[['battery','Battery pack'],['enclosure','Enclosure'],...frameParts.map(p=>[p.id,p.name])];
  if(fields.bmsMode.value!=='off')choices.push(['bms','BMS']);
  if(!choices.some(([id])=>id===pickedObject))pickedObject='battery';
  const menu=$('objectPick');
  if(menu.length!==choices.length||choices.some(([id,name],i)=>menu.options[i].value!==id||menu.options[i].text!==name))menu.replaceChildren(...choices.map(([id,name])=>new Option(name,id)));
  menu.value=pickedObject;
  const key=$('poseMode').value,axis=+$('poseAxis').value,part=frameParts.find(p=>p.id===pickedObject);
  const bms=pickedObject==='bms';
  const n=bms?(bmsWorldPose()?.[key][axis]??0):(part||placements[pickedObject])[key][axis];
  const value=$('poseValue'),slider=$('poseSlider'),limit=key==='rotation'?360:100000;
  value.min=bms&&key==='position'?-10000:-limit;value.max=bms&&key==='position'?10000:limit;
  if(document.activeElement!==value)value.value=Number(n.toFixed(3));
  const span=key==='rotation'?Math.max(90,Math.abs(n)):Math.max(500,Math.ceil(Math.abs(n)/100)*100);
  slider.min=-span;slider.max=span;slider.step=key==='rotation'?.5:1;slider.value=n;
  $('poseUnit').textContent=key==='rotation'?'°':'mm';
  value.disabled=slider.disabled=bms&&fields.bmsLock.value==='lock';
}
function selectPlacement(id){
  pickedObject=id;
  const part=frameParts.find(p=>p.id===id);
  if(part){selectedFrameId=id;syncFrameUI();}
  if(!part)$('frameDrag').checked=false;
  syncPlacementControls();
}
function initPlacementControls(){
  const mode=$('poseMode'),axis=$('poseAxis'),value=$('poseValue'),slider=$('poseSlider');
  $('objectPick').onchange=e=>selectPlacement(e.target.value);
  mode.onchange=axis.onchange=syncPlacementControls;
  function change(n){
    if(!current||!Number.isFinite(n))return;
    const key=mode.value,i=+axis.value;
    const part=frameParts.find(p=>p.id===pickedObject);
    if(part){
      const vector=[...part[key]];vector[i]=n;replaceFramePart(part.id,{[key]:vector});syncFrameUI();orbitView?.refreshFrame(false);scheduleSave();
    }else if(pickedObject==='bms'){
      if(fields.bmsLock.value==='lock')return;
      const pose=bmsWorldPose();if(!pose)return;
      pose[key][i]=n;setBmsWorldPose(pose);
    }else{
      const p=placements[pickedObject];if(p[key][i]===n){render();return;}
      if(current.c.mode==='pack'){
        for(const k of ['length','width','high','low'])fields[k].value=current.c[k];
        fields.mode.value='inner';
      }
      p[key][i]=n;holdingCamera=true;try{render();}finally{holdingCamera=false;}
    }
    value.value=Number(n.toFixed(3));syncPlacementControls();
  }
  slider.oninput=()=>{
    const n=slider.valueAsNumber;
    value.value=n;
    if(placements[pickedObject]){
      const preview=structuredClone(placements[pickedObject]);
      preview[mode.value][+axis.value]=n;
      orbitView?.previewPlacement(pickedObject,preview);
      $('contacts').textContent='Release the slider to check the fit.';
    }else change(n);
  };
  slider.onchange=()=>change(slider.valueAsNumber);
  value.oninput=()=>{if(value.value&&value.checkValidity())change(value.valueAsNumber);};
  value.onblur=()=>{if(!value.value||!value.checkValidity())syncPlacementControls();};
  $('batteryTilt').onclick=()=>{mode.value='rotation';axis.value=caseSketch?.endFace?'0':'1';selectPlacement('battery');slider.focus();};
}

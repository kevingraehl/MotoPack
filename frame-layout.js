// Frame layout components share the case's millimeter coordinate system.
let frameParts=[],selectedFrameId=null,frameRevision=0;
const frameColors={Frame:0x86a8bc,Motor:0x8c8a9e,Controller:0xcc9762,Other:0x83ae99};
const activeFramePart=()=>frameParts.find(p=>p.id===selectedFrameId);
function replaceFramePart(id,changes){
  frameParts=frameParts.map(p=>p.id===id?{...p,...changes}:p);
}
function resetFrameLayout(parts=[]){
  frameRevision++;
  const legacy=p=>['Motor','MotorSTL'].includes(p.asset?.sample);
  frameParts=parts.some(legacy)?parts.map(p=>{
    if(!legacy(p))return p;
    const pose=new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation.map(THREE.MathUtils.degToRad)));
    pose.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
    const e=new THREE.Euler().setFromQuaternion(pose);
    return {...p,name:motorLibrary.qsTop.name+' (check previous placement)',asset:{sample:'qsTop'},rotation:[e.x,e.y,e.z].map(THREE.MathUtils.radToDeg)};
  }):parts;
  selectedFrameId=frameParts[0]?.id||null;
  $('frameDrag').checked=false;$('frameDragMode').value='move';$('motorContinue').hidden=true;$('frameStatus').textContent='';syncFrameUI();
}
function validateFrameParts(parts){
  if(!Array.isArray(parts))throw Error('Invalid frame layout.');
  const seen=new Set(),finite3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  for(const p of parts){
    if(!p||typeof p.id!=='string'||seen.has(p.id)||typeof p.name!=='string'||!Object.hasOwn(frameColors,p.role)||!finite3(p.position)||!finite3(p.rotation))throw Error('Invalid frame part placement.');
    seen.add(p.id);
    if(p.asset?.sample && (['Frame','Motor','MotorSTL'].includes(p.asset.sample)||Object.hasOwn(motorLibrary,p.asset.sample)))continue;
    const a=p.asset;
    if(a?.image){
      if(typeof a.image!=='string'||!a.image.startsWith('data:image/png;base64,')||![a.width,a.height].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid frame side drawing.');
    }else if(!a||!finite3(a.lo)||!finite3(a.hi)||!Array.isArray(a.v)||!a.v.length||a.v.length%3||!a.v.every(Number.isFinite)||!Array.isArray(a.i)||!a.i.length||a.i.length%3||a.i.length>750000||!a.i.every(v=>Number.isInteger(v)&&v>=0&&3*v<a.v.length))throw Error('Invalid frame part mesh.');
  }
}
async function readLayoutStl(file,scale){
  return layoutStlMesh(await file.arrayBuffer(),scale);
}
function layoutStlMesh(data,scale){
  const reader=new DataView(data);
  const count=data.byteLength>=84?reader.getUint32(80,true):0;
  const v=[],i=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  const add=(x,y,z)=>{
    if(i.length>=750000)throw Error('Use a mesh with 250,000 triangles or fewer.');
    i.push(v.length/3);
    for(const [axis,n] of [x,y,z].entries()){
      const mm=n*scale;if(!Number.isFinite(mm))throw Error('The STL contains an invalid coordinate.');
      v.push(mm);lo[axis]=Math.min(lo[axis],mm);hi[axis]=Math.max(hi[axis],mm);
    }
  };
  if(count&&84+50*count===data.byteLength){
    if(count>250000)throw Error('Use a mesh with 250,000 triangles or fewer.');
    for(let t=0;t<count;t++)for(let k=0;k<3;k++){
      const off=84+50*t+12+k*12;add(reader.getFloat32(off,true),reader.getFloat32(off+4,true),reader.getFloat32(off+8,true));
    }
  }else{
    const text=new TextDecoder().decode(data);
    if(!/^\s*solid\b/i.test(text)||!(/\bendsolid\b/i.test(text)))throw Error('This is not a complete ASCII or binary STL.');
    for(const match of text.matchAll(/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi))add(+match[1],+match[2],+match[3]);
  }
  if(!i.length||i.length%3)throw Error('The STL does not contain complete triangles.');
  return {v,i,lo,hi};
}
async function frameDrawing(file){
  const xml=new DOMParser().parseFromString(await file.text(),'image/svg+xml'),root=xml.documentElement;
  if(root.localName!=='svg'||xml.querySelector('parsererror'))throw Error('Invalid SVG drawing.');
  const w=(root.getAttribute('width')||'').trim().match(/^([\d.+e-]+)\s*(mm|cm|in|pt|pc)$/i);
  const physical=w?+w[1]*sketchUnits[w[2].toLowerCase()]:null;
  const img=new Image(),url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'}));
  try{
    img.src=url;await img.decode();
    const box=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
    const ratio=root.hasAttribute('height')&&root.hasAttribute('width')?img.naturalWidth/img.naturalHeight:box.length===4?box[2]/box[3]:img.naturalWidth/img.naturalHeight;
    if(!(ratio>0&&Number.isFinite(ratio)))throw Error('Give the SVG a valid viewBox or drawing dimensions.');
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(2048*Math.min(1,ratio)));canvas.height=Math.max(1,Math.round(2048*Math.min(1,1/ratio)));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return {image:canvas.toDataURL('image/png'),ratio,physical};
  }finally{URL.revokeObjectURL(url);}
}
function syncFrameUI(){
  syncPlacementControls();
  const menu=$('frameList'),part=activeFramePart();
  menu.replaceChildren(...frameParts.map(p=>new Option(p.role+' · '+p.name,p.id)));
  $('frameEdits').hidden=!part;if(!part)return;
  $('shapeEdit').hidden=!part.primitive;menu.value=part.id;$('frameVisible').checked=part.visible;
  for(const key of ['position','rotation'])part[key].forEach((v,i)=>{$('frame'+key+i).value=Number(v.toFixed(4));});
}
function initFrameLayout(){
  const panel=$('framePanel'),prompt=$('partPrompt');let file,drawing,token=0;
  $('goFrame').onclick=()=>{panel.open=true;panel.scrollIntoView({block:'center'});$('frameImport').focus({preventScroll:true});};
  $('frameImport').onclick=()=>$('frameFile').click();
  $('frameFile').onchange=async()=>{
    const input=$('frameFile'),candidate=input.files[0];input.value='';if(!candidate)return;
    const attempt=++token,version=frameRevision;
    try{
      const ext=candidate.name.split('.').pop().toLowerCase();
      if(!['svg','stl','stp','step'].includes(ext))throw Error('Choose an SVG, STL or STEP file.');
      const preview=ext==='svg'?await frameDrawing(candidate):null;
      if(attempt!==token||version!==frameRevision)return;
      file=candidate;drawing=preview;
      $('partFileName').textContent=file.name;$('partUnitsLabel').hidden=ext!=='stl';$('partWidthLabel').hidden=!preview;
      $('partWidth').value=preview?.physical||'';$('partUnits').value='1';$('partError').textContent=preview&&!preview.physical?'Enter the measured width of the full drawing to set its scale.':'';
      $('partRole').value=Object.keys(frameColors).find(r=>file.name.toLowerCase().includes(r.toLowerCase()))||(!frameParts.length?'Frame':'Other');
      $('partAdd').disabled=false;prompt.showModal();
    }catch(e){$('frameStatus').textContent=e.message;}
  };
  $('partCancel').onclick=()=>prompt.close();prompt.onclose=()=>{token++;file=null;drawing=null;};
  $('partAdd').onclick=async()=>{
    if(!file)return;
    const attempt=token,version=frameRevision,name=file.name,role=$('partRole').value;
    try{
      $('partAdd').disabled=true;let asset;
      if(drawing){
        const width=$('partWidth').valueAsNumber;if(!(width>0&&$('partWidth').checkValidity()))throw Error('Enter a positive drawing width in millimeters.');
        asset={image:drawing.image,width,height:width/drawing.ratio};
      }else{
        $('partError').textContent='Reading model…';
        asset=/\.stl$/i.test(name)?await readLayoutStl(file,+$('partUnits').value):await importStepMesh(file);
      }
      if(attempt!==token||version!==frameRevision)return;
      const position=current?[current.c.length/2,current.c.width/2,current.shell.peak/2]:[0,0,0];
      const part={id:crypto.randomUUID(),role,name,position,rotation:[0,0,0],visible:true,asset};
      validateFrameParts([part]);frameParts=[...frameParts,part];selectPlacement(part.id);
      orbitView?.refreshFrame(true);scheduleSave();$('frameStatus').textContent=name+' added.';prompt.close();
    }catch(e){if(attempt===token){$('partError').textContent=e.message;$('partAdd').disabled=false;}}
  };
  for(const key of ['position','rotation'])for(let i=0;i<3;i++){
    const label=document.createElement('label'),box=document.createElement('input');
    label.textContent=(key==='position'?'Center ':'Rotate ')+'XYZ'[i]+(key==='position'?' (mm)':' (°)');
    box.type='number';box.id='frame'+key+i;box.min=key==='position'?-100000:-360;box.max=-box.min;box.step='any';box.required=true;
    box.dataset.hint=key==='position'?'Part center in assembly coordinates. Enter millimeters or use the arrows.':'Rotation about the part center in degrees.';
    label.append(box);$('framePose').append(label);
    box.oninput=()=>{const p=activeFramePart();if(p&&box.checkValidity()){const values=[...p[key]];values[i]=box.valueAsNumber;replaceFramePart(p.id,{[key]:values});orbitView?.refreshFrame(false);scheduleSave();}};
  }
  panel.addEventListener('input',e=>e.stopPropagation());
  $('frameList').onchange=e=>{selectPlacement(e.target.value);};
  $('frameVisible').onchange=e=>{replaceFramePart(selectedFrameId,{visible:e.target.checked});orbitView?.refreshFrame(false);scheduleSave();};
  $('frameRemove').onclick=()=>{frameParts=frameParts.filter(p=>p.id!==selectedFrameId);selectedFrameId=frameParts[0]?.id||null;syncFrameUI();orbitView?.refreshFrame(true);scheduleSave();};
}
function makeFrameLayer(scene,paint){
  const group=new THREE.Group(),objects=new Map();scene.add(group);
  let photo=null;
  function syncPhoto(){
    const d=caseSketch,src=d?.showPhoto&&d.image?.url;
    if(photo&&photo.userData.src!==src){
      group.remove(photo);photo.material.map.dispose();photo.material.dispose();photo.geometry.dispose();photo=null;
    }
    if(!src||!current)return;
    if(!photo){
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));geo.setIndex([0,1,2,0,2,3]);
      const tex=new THREE.TextureLoader().load(src,paint);
      photo=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:true,opacity:.62,depthWrite:false}));
      photo.userData.src=src;photo.renderOrder=-1;group.add(photo);
    }
    const toCase=sketchTransform(d),{w,h}=d.image,depth=d.endFace?current.c.length:current.c.width;
    const points=[[0,0],[w,0],[w,h],[0,h]].flatMap(p=>{
      const [x,z]=toCase(p).map((v,i)=>v+(d.frameOrigin?.[i]||0));return d.endFace?[-current.c.wall-1,x,z]:[x,depth+current.c.wall+1,z];
    });
    photo.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    photo.visible=$('showFrame').checked;photo.geometry.computeBoundingBox();photo.geometry.computeBoundingSphere();
  }
  function refresh(){
    syncPhoto();
    const live=new Set(frameParts.map(p=>p.id));
    for(const [id,obj] of objects)if(!live.has(id)||obj.userData.asset!==frameParts.find(p=>p.id===id)?.asset){
      group.remove(obj);
      for(const material of [obj.material].flat()){material.map?.dispose();material.dispose();}
      obj.geometry.dispose();objects.delete(id);
    }
    for(const part of frameParts){
      let obj=objects.get(part.id);
      if(!obj){
        const a=resolvedFrameAsset(part.asset);let geo,mat;
        if(a.image){
          const texture=new THREE.TextureLoader().load(a.image,paint);
          geo=new THREE.PlaneGeometry(a.width,a.height);geo.rotateX(Math.PI/2);
          mat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,depthWrite:false});
        }else{
          geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(a.v,3));geo.setIndex(a.i);geo.center();geo.computeVertexNormals();
          mat=new THREE.MeshStandardMaterial({color:a.sprocketFaces?0x94a0a8:frameColors[part.role],side:THREE.DoubleSide,roughness:.65});
          if(a.sprocketFaces){
            // Keep the alignment mark legible even on the unlit side of the assembly.
            mat=[mat,new THREE.MeshBasicMaterial({color:0x158fff,side:THREE.DoubleSide})];
            let start=0;
            for(let t=1;t<=a.sprocketFaces.length;t++){
              if(a.sprocketFaces[t]===a.sprocketFaces[start])continue;
              geo.addGroup(start*3,(t-start)*3,a.sprocketFaces[start]);start=t;
            }
          }
        }
        obj=new THREE.Mesh(geo,mat);obj.userData.pick=part.id;obj.userData.asset=part.asset;objects.set(part.id,obj);group.add(obj);
      }
      obj.visible=part.visible&&(part.role==='Frame'?$('showFrame').checked:part.role==='Motor'?$('showMotor').checked:true);obj.position.fromArray(part.position);obj.rotation.set(...part.rotation.map(v=>v*Math.PI/180));
    }
  }
  return {refresh,group};
}

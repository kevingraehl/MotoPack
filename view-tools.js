const mouseActions=['Orbit','Pan','Zoom'];
function setScope(c){
  const menu=$('scope'),key=c.axis+c.banks;
  if(menu.dataset.key===key)return;
  const selection=menu.value;menu.replaceChildren(new Option('Whole pack','all'));
  for(let b=0;b<c.banks;b++)menu.add(new Option((c.axis==='vertical'?'Stack ':'Bank ')+(b+1)+' of '+c.banks,b));
  menu.value=selection!==''&&Array.from(menu.options).some(o=>o.value===selection)?selection:'all';
  menu.dataset.key=key;
  const group=$('layerBanks'),old=new Map([...group.querySelectorAll('input')].map(input=>[input.value,input.checked]));
  const faces=Object.fromEntries([...group.querySelectorAll('select')].map(el=>[el.dataset.bank,el.value]));
  group.replaceChildren();
  for(let b=0;b<c.banks;b++){
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.value=b;input.checked=old.get(String(b))??true;
    label.append(input,(c.axis==='vertical'?'Stack ':'Bank ')+(b+1));
    const face=document.createElement('select');
    face.dataset.bank=b;face.setAttribute('aria-label','Holder ends for bank '+(b+1));
    const up=c.axis==='vertical';
    for(const [value,text] of [['both','Both ends'],['top',up?'Top only':'Near end (+ axis)'],['bottom',up?'Bottom only':'Far end (− axis)']])face.add(new Option(text,value));
    face.value=faces[b]||'both';group.append(label,face);
  }
}
function drawAxisCube(camera){
  const basis=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,i));
  const project=p=>[p.dot(basis[0])*25,-p.dot(basis[1])*25];
  const faces=[];
  for(const [axis,names,color] of [[0,['Front','Back'],'#b7ceb5'],[1,['Right','Left'],'#a5d2cf'],[2,['Bottom','Top'],'#e4d4af']]){
    for(const sign of [-1,1]){
      const n=new THREE.Vector3().setComponent(axis,sign);
      if(n.dot(basis[2])<.001)continue;
      const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>project(n.clone().setComponent((axis+1)%3,a).setComponent((axis+2)%3,b)));
      const [x,y]=project(n),name=names[Number(sign>0)];
      faces.push('<polygon data-view="'+name+'" fill="'+color+'" points="'+points.join(' ')+'"><title>'+name+'</title></polygon><text text-anchor="middle" x="'+x+'" y="'+(y+3)+'">'+name+'</text>');
    }
  }
  $('axisCube').innerHTML=faces.join('');
}
function addSheetPreview(parts,c,m,s,first,count,force=false){
  for(const place of selectedSheets(c))if(place==='rows'||place==='banks')addSheetLayer(parts,{...c,place},m,s,first,count,force);
}
function addSheetLayer(parts,c,m,s,first,count,force){
  if(c.place.includes('/')||c.material==='none'||c.sheet<=0||(!force&&!$('showSheets').checked))return;
  const upright=c.axis==='vertical',lip=c.holder?c.lip:0,bankLength=c.len+2*lip;
  const pitch=bankLength+m.axialSheet,edgeU=c.holder?c.edgeU:0,edgeV=c.holder?c.edgeV:0;
  const color=c.material==='FR4'?0x368d50:0xbf803a;
  // The cross-section uses U across the case, V along rows and A along the cells.
  function sheet(shape,length,axialStart,instances){
    if(!instances)return;
    const g=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false});
    const mesh=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide}),instances);
    const matrix=new THREE.Matrix4();
    for(let i=0;i<instances;i++){
      const [x,y,z]=s.origin,a=axialStart+(first+i)*pitch;
      if(upright)matrix.set(0,1,0,x,1,0,0,y,0,0,1,z+a,0,0,0,1);
      else if(c.axis==='cross')matrix.set(1,0,0,x,0,0,1,y+a,0,1,0,z,0,0,0,1);
      else matrix.set(0,0,1,x+a,1,0,0,y,0,1,0,z,0,0,0,1);
      mesh.setMatrixAt(i,matrix);
    }
    parts.add(mesh);
  }
  if(c.place==='banks'){
    const shape=new THREE.Shape();const inset=c.sheetTrim/2;shape.moveTo(inset,0);shape.lineTo(m.U-inset,0);shape.lineTo(m.U-inset,m.V);shape.lineTo(inset,m.V);shape.closePath();
    sheet(shape,c.sheet,bankLength+c.deckGap/2,Math.min(count,c.banks-1-first));return;
  }
  const rows=Array.from({length:c.rows},()=>[]);
  for(const cell of m.cells)rows[cell.r].push(cell.u-m.u0+edgeU);
  const half=c.sheet/2,radius=c.d/2+half,depth=c.holder?c.plate:0;
  for(let r=1;r<c.rows;r++){
    if(!rows[r].length||!rows[r-1].length)continue;
    const center=i=>edgeV-m.v0+m.cells.find(p=>p.r===i).v;
    const bottom=center(r-1),top=center(r),mid=(bottom+top)/2;
    if(mid<=edgeV||mid>=edgeV+m.vSpan)continue;
    const u0=edgeU+c.sheetTrim/2,u1=edgeU+m.uSpan-c.sheetTrim/2;
    const n=c.mediaShape==='flex'&&c.pattern!=='regular'?Math.ceil(m.uSpan/(c.d/36)):1;
    const path=[];
    for(let i=0;i<=n;i++){
      const u=u0+(u1-u0)*i/n;
      let v=mid;
      if(n>1){
        const arc=centers=>Math.sqrt(Math.max(0,radius**2-Math.min(...centers.map(x=>(u-x)**2))));
        v=Math.min(top-arc(rows[r]),Math.max(bottom+arc(rows[r-1]),mid));
      }
      path.push(new THREE.Vector2(u,v));
    }
    const upper=[],lower=[];
    path.forEach((point,i)=>{
      const tangent=path[Math.min(n,i+1)].clone().sub(path[Math.max(0,i-1)]).normalize();
      const normal=new THREE.Vector2(-tangent.y,tangent.x).multiplyScalar(half);
      for(const [side,sign] of [[upper,1],[lower,-1]]){
        const p=point.clone().addScaledVector(normal,sign);p.x=Math.max(u0,Math.min(u1,p.x));side.push(p);
      }
    });
    sheet(new THREE.Shape(upper.concat(lower.reverse())),bankLength-2*depth,depth,count);
  }
}

function visibleHolderEnds(bank){
  const face=$('layerBanks').querySelector('select[data-bank="'+bank+'"]')?.value;
  return face==='top'?[true]:face==='bottom'?[false]:[false,true];
}
let holderCache;
function addHolderPreview(parts,c,m,s,first,count){
  const problem=c.holder?holderProblem(c,m):'';
  const blocked=!!problem,visible=c.holder&&!blocked;
  const available=visible||c.squiggleOn;
  $('spacers').disabled=!available;
  if(!available)$('spacers').checked=false;
  else if($('spacers').dataset.available!=='yes')$('spacers').checked=true;
  $('spacers').dataset.available=available?'yes':'no';
  $('holderNote').textContent=c.squiggleOn?($('spacers').checked?'Teal squiggles · two per stack.':'Squiggles enabled, hidden in view.'):
    !c.holder?'Holders are off in the pack design.':problem||($('spacers').checked?'Orange end plates · two per bank.':'Holders included in dimensions, hidden in view.');
  const fix=$('holderAction');fix.hidden=visible||c.squiggleOn;
  fix.textContent=!c.holder?'Include holders':problem.startsWith('Pockets touch')?'Set gaps for 1 mm pocket web':'Edit holder dimensions';
  fix.onclick=()=>{if(!c.holder){$('holder').click();}else if(problem.startsWith('Pockets touch'))$('web').click();else fields.edgeU.focus();};
  if(!count||!c.holder||problem||!$('spacers').checked)return;
  const key=JSON.stringify([m.cells.map(p=>[p.u,p.v]),c.edgeU,c.edgeV,c.plate,c.d,c.lip,c.land,c.slack,c.cornerRadius,c.holderShape]);
  if(holderCache?.key!==key)holderCache={key,points:new Float32Array(holderTriangles(c,m).flat(2))};
  const bankLength=c.len+2*c.lip;
  for(const far of visibleHolderEnds(first)){
    const pos=holderCache.points.slice();
    for(let i=0;i<pos.length;i+=3){
      const u=pos[i],v=pos[i+1],a=far?bankLength-pos[i+2]:pos[i+2];
      pos.set(cellXYZ(c,u,v,a),i);
    }
    const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(pos,3));geom.computeVertexNormals();
    const mesh=new THREE.InstancedMesh(geom,new THREE.MeshStandardMaterial({color:0xd88835,side:THREE.DoubleSide}),count);
    for(let i=0;i<count;i++){
      const origin=[...s.origin];origin[cellBases[c.axis].a]+=(first+i)*(bankLength+m.axialSheet);
      mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(...origin));
    }
    parts.add(mesh);
  }
}
function addSquigglePreview(parts,c,m,s,bank,count){
  if(!c.squiggleOn||!$('spacers').checked||!count)return;
  let model,sq;
  try{model=squiggleBankModel(c,m,bank);sq=squiggleHolder(model.c,model.m,c.squiggleGuards,false,{buildReinforcement:c.sqRootLive});}
  catch(error){$('holderNote').textContent='Squiggle preview: '+error.message;return;}
  const over=sq.outsideWidth>c.sqMaxWidth+1e-6,lip=c.holder?c.lip:0,bankLength=c.len+2*lip;
  const stride=bankLength+m.axialSheet,edgeU=c.holder?c.edgeU:0,edgeV=c.holder?c.edgeV:0;
  const material=new THREE.MeshStandardMaterial({color:over?0xd84d3f:0x2bb7a9,roughness:.55,metalness:0,side:THREE.DoubleSide});
  const rails=c.sqStyle==='rails';
  for(const top of (rails?[false]:visibleHolderEnds(bank))){
    const pos=new Float32Array(sq.triangles.flat(2));
    for(let i=0;i<pos.length;i+=3){
      const u=pos[i]+edgeU+((rails||c.sqGroupsOnly)?sq.minU-m.u0:0),v=pos[i+1]+edgeV+((rails||c.sqGroupsOnly)?sq.minV-m.v0:0),z=pos[i+2];
      const cellBottom=bank*stride+lip,cellTop=cellBottom+c.len;
      const axial=rails?cellBottom+(c.len-c.sqRailLength)/2+z:top?cellTop-c.sqDepth+z:cellBottom+c.sqDepth-z;
      const xyz=cellXYZ(c,u,v,axial);for(let q=0;q<3;q++)pos[i+q]=xyz[q]+s.origin[q];
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));geometry.computeVertexNormals();
    parts.add(new THREE.Mesh(geometry,material.clone()));
  }
  $('holderNote').textContent='Teal squiggles · stack '+(bank+1)+(model.partial?' partial':'')+' · '+fmt(sq.outsideWidth)+' mm outside width'+(over?' · over limit (red)':'');
}
function captureView(){
  return {preset:$('viewPreset').value,opacity:$('opacity').value,bank:$('bankView').value,scope:$('scope').value,
    layers:Object.fromEntries(['showFrame','showMotor','showCells','showBMS'].map(id=>[id,$(id).checked])),bankEnds:[...$('layerBanks').querySelectorAll('select')].map(el=>el.value),hiddenBanks:[...$('layerBanks').querySelectorAll('input:not(:checked)')].map(input=>+input.value),showCase:$('showCase').checked,showSheets:$('showSheets').checked,spacers:$('spacers').checked,locked:$('locked').checked,camera:orbitView?.cameraState()};
}
function initViewTools(){
  const dialog=document.createElement('dialog'),wizard=document.createElement('dialog');
  for(const el of [dialog,wizard]){el.className='cbDialog';document.body.append(el);}
  const btn=(parent,label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;parent.append(b);return b;};
  dialog.innerHTML='<h2>View setup</h2><h3>Drag controls</h3>';
  for(const [i,name] of ['Left','Middle','Right'].entries()){
    const label=document.createElement('label'),menu=document.createElement('select');
    for(const action of ['Orbit','Pan','Zoom'])menu.add(new Option(action));
    let saved;try{saved=localStorage.getItem('cellbench.mouse.'+i);}catch{}
    if(['Orbit','Pan','Zoom'].includes(saved))mouseActions[i]=saved;
    menu.value=mouseActions[i];menu.onchange=()=>{mouseActions[i]=menu.value;try{localStorage.setItem('cellbench.mouse.'+i,menu.value);}catch{}};
    label.append(name+' drag ',menu);dialog.append(label);
  }
  dialog.insertAdjacentHTML('beforeend','<h3>Saved camera views</h3>');
  for(const [i,name] of ['⚀','⚁'].entries()){
    let saved;const key='cellbench.view.'+i;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
    const recall=btn(dialog,name+' Recall',()=>{restoreSessionView(saved);dialog.close();});recall.disabled=!saved;
    btn(dialog,'Save view '+(i+1),()=>{saved=captureView();recall.disabled=false;try{localStorage.setItem(key,JSON.stringify(saved));}catch{}});
  }
  btn(dialog,'Fit view',()=>{orbitView?.preset($('viewPreset').value,fields.axis.value);dialog.close();});
  btn(dialog,'Done',()=>dialog.close());$('viewOptions').onclick=()=>dialog.showModal();
  $('sceneLayers').onchange=e=>{
    if(e.target.matches('#layerBanks input'))$('scope').value='all';

    if(current){const {c,m,shell}=current;orbitView?.update(c,m,shell,caseMesh(c,shell),false);}
  };
  $('axisCube').onclick=e=>{const view=e.target.closest('[data-view]')?.dataset.view;if(view){$('viewPreset').value=view;orbitView?.preset(view,fields.axis.value);}};
  $('shot').onclick=()=>{
    if(!orbitView)return;
    const w=window.open('','_blank');if(!w){$('holderNote').textContent='Allow a new tab for the screenshot.';return;}
    w.opener=null;const src=orbitView.image(),d=w.document;d.title='motoPack · screenshot';
    const img=d.createElement('img'),link=d.createElement('a');img.src=src;img.style.cssText='display:block;max-width:100%;background:#edf1ed';link.href=src;link.download='cellbench-view.png';link.textContent='Download PNG';d.body.append(link,img);
  };
  wizard.innerHTML='<h2>Start a pack</h2><p>Choose a starting orientation. You can change the rows, cells and banks afterward.</p><div class="cards"></div>';
  for(const [axis,banks,name] of [['vertical',1,'Single stack'],['vertical',2,'Double stack'],['vertical',3,'Triple stack'],['flat',1,'Flat · one bank'],['flat',2,'Flat · two banks']]){
    const b=btn(wizard.querySelector('.cards'),name,()=>{
      $('newDesign').click();apply({...defaults,mode:'pack',axis,banks,pattern:'regular'});$('scope').value='all';render();wizard.close();
    });
    const up=axis==='vertical';let shapes='';
    for(let n=0;n<banks;n++)for(let i=0;i<3;i++){
      const x=up?22+i*14:6+n*48,y=up?42-n*17:4+i*13,w=up?12:44,h=up?14:11;
      shapes+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="3" fill="#88bbab" stroke="#355e53"/><ellipse cx="'+(up?x+6:x+w-2)+'" cy="'+(up?y+2:y+5.5)+'" rx="'+(up?6:2.5)+'" ry="'+(up?2.5:5.5)+'" fill="#dcebe5" stroke="#355e53"/>';
    }
    b.insertAdjacentHTML('afterbegin','<svg aria-hidden="true" viewBox="0 0 105 60">'+shapes+'</svg>');
  }
  btn(wizard,'Plan a dirt bike conversion',()=>{wizard.close();$('conversionOpen').click();});
  btn(wizard,'Start from a case drawing or photo',()=>{wizard.close();$('openSketch').click();});
  btn(wizard,'Continue current design',()=>wizard.close());
  btn($('newTop').parentElement,'Setup wizard',()=>wizard.showModal());
  queueMicrotask(()=>$('welcome').showModal());
}

// An optical crop keeps the camera outside the model at inspection magnification.
// Offset the full-image window so the point under the wheel or pinch stays put.
function inspectionLens(host,diameter,spanAtFit,paint){
  let scale=1,x=0,y=0;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function set(value,px=.5,py=.5){
    const min=Math.min(1,diameter()*.65/Math.max(.001,spanAtFit()));
    const next=clamp(value,min,4),old=Math.min(1,scale),crop=Math.min(1,next);
    x=clamp(x+(px-.5)*(old-crop),-(1-crop)/2,(1-crop)/2);
    y=clamp(y+(py-.5)*(old-crop),-(1-crop)/2,(1-crop)/2);
    scale=next;
  }
  function zoomBy(factor,cx,cy){
    const rect=host.getBoundingClientRect();
    set(scale*factor,(cx-rect.left)/rect.width,(cy-rect.top)/rect.height);paint();
  }
  function wheel(e){
    e.preventDefault();
    const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1);
    zoomBy(Math.exp(clamp(pixels*.0015,-4,4)),e.clientX,e.clientY);
  }
  const touches=new Map();let pinching=false,dist=0;
  function pinch(e){
    if(e.pointerType!=='touch')return;
    if(e.type==='pointerdown')touches.set(e.pointerId,[e.clientX,e.clientY]);
    else if(!touches.has(e.pointerId))return;
    if(e.type==='pointermove')touches.set(e.pointerId,[e.clientX,e.clientY]);
    if(touches.size===2){
      const [a,b]=touches.values(),next=Math.hypot(a[0]-b[0],a[1]-b[1]);
      if(e.type==='pointerdown'){pinching=true;host.setPointerCapture(e.pointerId);}
      if(e.type==='pointermove'&&dist>0&&next>0)zoomBy(dist/next,(a[0]+b[0])/2,(a[1]+b[1])/2);
      dist=next;
    }
    if(pinching){e.preventDefault();e.stopImmediatePropagation();}
    if(e.type==='pointercancel'||e.type==='pointerup'){
      touches.delete(e.pointerId);dist=0;if(!touches.size)pinching=false;
    }
  }
  const events=['pointerdown','pointermove','pointerup','pointercancel'];
  for(const type of events)host.addEventListener(type,pinch,true);
  host.addEventListener('wheel',wheel,{passive:false});
  return {get scale(){return scale;},set,zoomBy,
    state:()=>[x,y],restore(value,offset){
      set(value);const limit=(1-Math.min(1,scale))/2;
      x=clamp(Number(offset?.[0])||0,-limit,limit);y=clamp(Number(offset?.[1])||0,-limit,limit);
    },
    project(camera,w,h){
      const crop=Math.min(1,scale);
      camera.setViewOffset(w,h,w*((1-crop)/2+x),h*((1-crop)/2+y),w*crop,h*crop);
    },
    dispose(){for(const type of events)host.removeEventListener(type,pinch,true);host.removeEventListener('wheel',wheel);}
  };
}

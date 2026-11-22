let cachedCellParts;
function cellRenderParts(count){
  // Use one shared CAD asset per material. Very large arrays use a lighter terminal model.
  if(count>600){
    const positive=new THREE.CylinderGeometry(.265,.30,.012,24).translate(0,.494,0);
    const base=new THREE.CylinderGeometry(.397,.397,.004,24).translate(0,-.498,0);
    return [[new THREE.CylinderGeometry(.5,.5,.984,24),{roughness:.55}],[positive,{color:0xc5cbd0,metalness:.35}],[base,{color:0xaab5ba,metalness:.35}]];
  }
  if(cachedCellParts)return cachedCellParts;
  const decode=(s,Type)=>new Type(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
  cachedCellParts=['wrap','metal'].map(key=>{
    const [p,n,i]=cellCAD[key],pos=decode(p,Int16Array);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(pos,(v,j)=>j%3===1?v/400/70.45-.5:v/400/21.72),3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from(decode(n,Int8Array),v=>v/127),3));g.setIndex(new THREE.BufferAttribute(decode(i,Uint16Array),1));
    // Normals live in normalized mesh coordinates; instance scaling returns them to physical space.
    const normals=g.attributes.normal;
    for(let k=0;k<normals.count;k++){const vec=new THREE.Vector3().fromBufferAttribute(normals,k);vec.multiply(new THREE.Vector3(21.72,70.45,21.72)).normalize();normals.setXYZ(k,vec.x,vec.y,vec.z);}
    g.userData.shared=true;
    return [g,key==='wrap'?{roughness:.48}:{color:0xbec5cc,metalness:.38,roughness:.32}];
  });
  return cachedCellParts;
}

const editHistory={past:[],future:[],last:null,paused:false};
function recordEdit(){
  if(editHistory.paused)return;
  const {caseSketch:sketch,frameParts:frame,...project}=snapshot();
  const text=JSON.stringify(project);
  if(text!==editHistory.last?.text||sketch!==editHistory.last?.sketch||frame!==editHistory.last?.frame){
    if(editHistory.last!==null){editHistory.past.push(editHistory.last);if(editHistory.past.length>100)editHistory.past.shift();}
    editHistory.future=[];editHistory.last={text,sketch,frame};
  }
  $('undo').disabled=!editHistory.past.length;$('redo').disabled=!editHistory.future.length;
}
function stepHistory(redo){
  const from=redo?editHistory.future:editHistory.past,to=redo?editHistory.past:editHistory.future;
  if(!from.length)return;
  to.push(editHistory.last);editHistory.last=from.pop();editHistory.paused=true;
  try{restore({...JSON.parse(editHistory.last.text),caseSketch:editHistory.last.sketch,frameParts:editHistory.last.frame},buildAutosave?.id);}finally{editHistory.paused=false;recordEdit();}
}

function snapProfile(drag,x,z,bypass){
  const free={x,z,label:''},now=performance.now(),px=Math.abs(drag.matrix.a)||1;
  if(bypass){drag.lock=null;return free;}
  if(drag.lock&&now<drag.lock.until)return drag.lock.point;
  const a=drag.roof[drag.i-1],b=drag.roof[drag.i+1],options=[];
  for(const p of [a,b])if(p)options.push({x,z:p[1],label:'Level segment'});
  if(a&&b){
    // Points on the circle with diameter AB form a right angle at the dragged corner.
    const cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,r=Math.hypot(a[0]-cx,a[1]-cz);
    const d=Math.hypot(x-cx,z-cz);
    if(d>0){const sx=cx+(x-cx)*r/d,sz=cz+(z-cz)*r/d;
      if(sx>a[0]+drag.c.length*.002&&sx<b[0]-drag.c.length*.002&&sz>=10&&sz<=1000)
        options.push({x:sx,z:sz,label:'90° corner'});}
  }else options.forEach(o=>o.label='90° at case wall');
  const distance=o=>Math.hypot(o.x-x,o.z-z);
  options.sort((p,q)=>distance(p)-distance(q));
  if(!options.length||distance(options[0])>5*px){drag.lock=null;return free;}
  const point=options[0];
  if(!drag.lock||drag.lock.point.label!==point.label)drag.lock={until:now+1000,point};
  return point;
}
function restoreSessionView(v){
  if(!v||!current)return;
  if([...$('scope').options].some(o=>o.value===v.scope))$('scope').value=v.scope;
  for(const el of $('layerBanks').querySelectorAll('select'))el.value=['top','bottom'].includes(v.bankEnds?.[el.dataset.bank])?v.bankEnds[el.dataset.bank]:'both';
  for(const input of $('layerBanks').querySelectorAll('input'))input.checked=(!v.scope||v.scope==='all'||input.value===v.scope)&&!v.hiddenBanks?.includes(+input.value);
  for(const id of ['showFrame','showMotor','showCells','showBMS'])$(id).checked=v.layers?.[id]!==false;
  for(const id of ['showCase','showSheets'])if(typeof v[id]==='boolean')$(id).checked=v[id];
  if(typeof v.spacers==='boolean')$('spacers').checked=v.spacers;
  if(typeof v.locked==='boolean')$('locked').checked=v.locked;
  render();
  if([...$('viewPreset').options].some(o=>o.value===v.preset)){
    $('viewPreset').value=v.preset;orbitView?.preset(v.preset,current.c.axis);
  }
  if(Number.isFinite(+v.opacity)){$('opacity').value=v.opacity;orbitView?.opacity();}
  $('bankView').value=Math.min(current.c.banks-1,Math.max(0,Number(v.bank)||0));diagram(current.c,current.m);
  orbitView?.setCamera(v.camera);
}
function initWorkbench(){
  $('newTop').onclick=()=>$('newDesign').click();$('saveSession').onclick=()=>$('exportDesign').click();$('openSession').onclick=()=>$('importDesign').click();
  $('undo').onclick=()=>stepHistory(false);$('redo').onclick=()=>stepHistory(true);
  document.addEventListener('keydown',e=>{
    if(!(e.metaKey||e.ctrlKey)||e.altKey)return;
    const k=e.key.toLowerCase();
    if(k==='z'||k==='y'){e.preventDefault();if(!e.repeat)stepHistory(k==='y'||e.shiftKey);}
    if(k==='s'){e.preventDefault();$('saveSession').click();}
  });
  $('mirror').onclick=()=>{
    if(!current)return;
    const {c,shell}=current,left=shell.roof.filter(([x])=>x>0&&x<c.length/2);
    corners=[...left,[c.length/2,shell.height(c.length/2)],...left.slice().reverse().map(([x,h])=>[c.length-x,h])].map(([x,h])=>[x/c.length,h-c.high]);
    if(c.mode==='pack')endLift[1]=endLift[0];else fields.low.value=c.high;render();
  };
  setupHints();
  for(const button of document.querySelectorAll('[data-tip]'))button.onclick=()=>$('tipDialog').showModal();
  setupSectionOrder();
}

const helpText={
  framePhoto:'Display the calibrated reference behind the case in the assembly viewer.',
  caseAngle:'Rotate the imported enclosure in its sketch plane. Fit checks and exported case geometry follow this angle.',
  relativeAxis:'Choose the cell direction in relation to the case sketch. Changes the cell axis while the case and frame stay in position.',
  frameList:'Select the component whose placement you want to change.',frameVisible:'Show this part in the viewer.',frameDrag:'Enable the left-drag action for the selected part. Move follows the view plane. Rotate changes the selected X, Y or Z angle.',
  partRole:'Identify this component in the scene.',partUnits:'STL coordinates do not specify physical units. Choose the units used at export.',partWidth:'Measured physical width across the complete SVG canvas, including its margins.',
  groupPlan:'Continuous path fills groups through the whole pack. Complete rows makes each row one parallel group, ideal for five-cell nickel strips. Complete columns makes each long column one group, ideal for eight-cell strips. Separate banks keeps equal subpacks inside each stack; Mirror reverses every second stack.',
  bmsTool:'Choose an axis and drag in the 3D view to move the BMS. Dragging detaches a mounted box. Pick mode attaches to the nearest cardinal face of the clicked cell’s bank.',
  bmsMount:'Attach to a pack, bank or row face. The mounted box follows layout changes and can be rotated after attachment.',
  rx:'BMS X rotation in degrees.',ry:'BMS Y rotation in degrees.',rz:'BMS Z rotation in degrees.',
  sheetTrim:'Total material removed across the width. A 10 mm trim takes 5 mm from each side and keeps the separator centered.',
  bmsMode:'Above finished pack follows the highest installed layer. Fixed coordinates are measured from the inside case corner.',
  bmsRule:'A fixed box can flag interference, stop an array, or shift whole physical row groups beyond its reserved space.',
  bmsL:'Outside length along the case X axis.',bmsW:'Outside width along Y.',bmsH:'Outside height along Z.',
  bx:'X position of the front face of the fixed box.',by:'Y position of its left face.',bz:'Z height of its bottom face.',
  bmsLock:'Disable XYZ editing to keep this case location while changing the pack.',
  bmsGap:'Clearance around the BMS keep-out and under an above-pack installation.',
  bmsWall:'The printed open-top enclosure uses this thickness for all walls and its floor.',
  showCase:'Show the enclosure in the assembly. Its measured dimensions still apply when hidden.',
  showSheets:'Show the selected separator material between rows or bank ends. Hiding it keeps its thickness in the fit calculation.',
  parallel:'Number of parallel cells wanted in every series group.',
  capacityMode:'Enter parallel count directly or request a minimum capacity in amp-hours.',
  cellAh:'Rated capacity of one cell. Used to convert your Ah target to complete parallel groups.',
  desiredAh:'Minimum pack capacity. The builder rounds up to the next whole parallel count.',
  targetMode:'Lock a series count directly, or find the nearest whole series count to your desired nominal pack voltage.',
  volts:'Desired nominal pack voltage. Divide by nominal cell voltage and round to the nearest whole series count.',
  nominal:'Nominal operating voltage of one cell. Use the value for the cell you are quoting.',
  scope:'Inspect the whole assembly or isolate one axial bank, including its visible end holders.',
  spacers:'Show both printable end plates on each visible bank when holder geometry is valid.',
  locked:'Keep the camera angle fixed during dragging. Pan and zoom remain available.',
  axis:'Vertical points the long cell axis upward. Flat points it along the length of the case. Axis labels on the gap fields update to match.',
  pattern:'Regular rows align their centers. Offset centers every second row exactly halfway between its neighbors. Choose Custom shift for a different percentage. Short offset rows remove the last cell of each shifted row to keep the section narrower.',
  cols:'Number of cell positions across a full row, before omitted positions. The case width must accommodate this row and any stagger.',
  rows:'Number of rows in the cross-section of a single bank. For upright cells these run along the floor. For flat cells they stack upward.',
  banks:'Number of times this cross-section repeats end-to-end along the cell axis. For upright cells these are stacked decks.',
  shift:'Sideways displacement of every second row, as a percentage of the across-row center pitch (cell diameter + side gap). At 22 mm pitch, 50% moves the row 11 mm. A 0% shift aligns the rows.',
  d:'Outside diameter of one wrapped cell. This drives packing, holder bores and the scaled 3D preview. Use the measured maximum when checking fit.',
  len:'Overall cell length including terminals. Each axial bank consumes this length, plus any specified holder lips and gaps.',
  gap:'Clear space between adjacent cell bodies within one row. Center spacing equals diameter plus this value.',
  rowGap:'Minimum body separation between neighboring rows before adding sheet thickness. Staggering lets the row centers nest closer together along the row-stacking axis.',
  deckGap:'Free space between the ends of adjacent banks. Three decks have two joints. Bank separator thickness is additional.',
  groupRows:'Number of physical rows in each repeating block. This controls where extra separator space appears, independently of electrical group labels.',
  groupSpace:'Extra distance at each boundary between blocks of rows. For two rows per block, this appears after rows 2, 4, 6 and so on.',
  series:'Requested number of series groups. Each gets the same whole number of parallel cells. Remaining positions are spares.',
  grouping:'Show parallel-group identifiers and wrapper colors in the diagrams. These assignments help with a quote or layout review.',
  material:'Choose a starting separator material. Its suggested thickness and behavior can be changed to match the actual sheet.',
  sheet:'Thickness of one separator. Measure your actual material; the effect on pitch depends on where you put it.',
  mediaShape:'A rigid sheet takes the full row-to-row clearance. Conforming material follows the nearest contact between staggered rows.',
  place:'Place the sheet between adjacent rows or between end-to-end banks. The separate free deck gap is added at bank joints.',
  edgeU:'Distance from the outside of the outermost cell to the printed plate edge across the row, on each side.',
  edgeV:'Distance from the outer cell envelope to each end of the holder in the row-stacking direction.',
  plate:'Total printed holder thickness, including its retaining lip. The recessed portion slides over the cell.',
  slack:'Extra diameter of the cell pocket. A 0.4 mm diametral allowance gives 0.2 mm on each side of a centered cell.',
  lip:'Thickness of plastic beyond each cell end. Two end holders add two lip thicknesses to the length of each bank.',
  cornerRadius:'Rounds all four outside corners of each end plate. Zero gives square corners.',
  land:'The lip overlaps the end rim of each cell. When both plates are secured, the cell cannot slide past the ledges. A wider lip leaves a smaller terminal opening.',
  mode:'Use measured inside dimensions, measured inside and outside dimensions, or a case sized automatically around the pack and clearances.',
  wall:'Thickness of each side and end wall for a generated case. Overall length and width each include two walls.',
  base:'Material below the cavity floor. It adds to the total outside height of the open-top case.',
  outL:'Outside distance between the two end walls. Compared with the inside length to infer centered end-wall thickness.',
  outW:'Outside distance between the two side walls. The difference from the inside width is shared by both walls.',
  outH:'Maximum outside height, measured from the underside of the floor to the highest rim point.',
  holderReserve:'Extra unused space per face for holder-related features. If holders are already included, use only the additional allowance needed.',
  miscReserve:'Extra space per face for wrap, copper, foam or balance leads. One millimeter per face adds two millimeters across each axis in automatic mode.',
  length:'Usable inside length between the front and rear walls. The rim extends along this axis.',
  width:'Clear inside width between side walls. This is the dimension consumed by a full row of cells.',
  high:'Inner floor to the rim at the first end of the side profile. The opposite end has its own height.',
  low:'Inner floor to the rim at the opposite end of the side profile. Unequal end heights form a slope.',
  ref:'Height of the bare reference stack used for your independent bench measurement. Enter the height you actually measured.',
  headroom:'Measured space above that reference stack. The bench comparison subtracts the proposed pack height from the reference stack plus this gap.',
  hard:'Lock case dimensions and report each cell touching or crossing the cavity. Turning this off sizes the case around the pack.',
  holder:'Include a pair of printed end plates per bank. Edge offsets enlarge the section and the retaining lips extend the axial length.',
  bankView:'Choose the bank shown in the editable end view. Individual cell flips apply to this bank.',
  cellTool:'Click a filled or empty position to edit the displayed bank. Select all banks to repeat that edit throughout the pack.',
  batch:'Choose an orientation pattern, then press Apply orientation. Alternate series groups aligns all members of a group in the same direction.',
  viewPreset:'Choose an orthographic inspection direction or the perspective assembly view. Drag the model to orbit.',
  opacity:'Change visibility of the case shell. At zero the shell and its edges are hidden so the cells are easy to inspect.',
  library:'Choose a locally saved named design and click Open saved. Export a session file to move it to another browser or computer.',
  projectName:'Name used for saved copies and downloaded session files. Use a different name for each customer or pack.',
  themePick:'Choose light, dark, or follow the system appearance. Your browser remembers the selection.'
};
function setupHints(){
  const tip=document.createElement('div');tip.className='hintBox';tip.id='fieldHint';tip.role='tooltip';tip.hidden=true;document.body.append(tip);
  function hide(){tip.hidden=true;}
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.help'))hide();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
  for(const control of document.querySelectorAll('input:not([type=file]), select')){
    if(control.id==='themePick'||control.closest('#batteryWizard,#sheetChecks,#sceneLayers,#skLayers,#visitorDialog'))continue;
    const id=control.id,wrap=control.closest('label')||control.parentElement;
    const label=control.getAttribute('aria-label')||wrap.firstChild.textContent.trim()||id;
    const msg=control.dataset.hint||helpText[id]||('Additional clearance at the '+id+' face of the pack in millimeters. Automatic sizing adds this value on this face only; fixed-case mode checks the requested allowance.');
    const hint=document.createElement('button');hint.type='button';hint.className='help';hint.textContent='?';hint.setAttribute('aria-label','Help: '+label);
    function show(){tip.textContent=msg;tip.hidden=false;const r=hint.getBoundingClientRect();tip.style.left=Math.max(4,Math.min(innerWidth-tip.offsetWidth-6,r.left))+'px';tip.style.top=(r.bottom+tip.offsetHeight+8>innerHeight?Math.max(4,r.top-tip.offsetHeight-4):r.bottom+4)+'px';}
    hint.onmouseenter=hint.onfocus=show;hint.onmouseleave=hint.onblur=hide;hint.onclick=e=>{e.preventDefault();show();};
    control.title=msg;
    if(wrap.tagName==='LABEL'){
      wrap.htmlFor=control.id;
      const cap=document.createElement('span');cap.className='fieldHelp';wrap.insertBefore(cap,control);cap.append(hint);
    }else control.insertAdjacentElement('afterend',hint);
    if(control.type==='number')installNumberArrows(control,wrap,label);
  }
}

function installNumberArrows(control,wrap,label){
  function advance(dir){
    if(control.disabled)return false;
    const before=control.value;
    const min=control.min===''?-Infinity:Number(control.min),max=control.max===''?Infinity:Number(control.max);
    const next=Math.max(min,Math.min(max,(control.valueAsNumber||0)+dir*Number(control.dataset.nudge||1)));
    control.value=Number(next.toFixed(7));
    if(before===control.value)return false;
    control.dispatchEvent(new Event('input',{bubbles:true}));return true;
  }
  control.addEventListener('keydown',e=>{
    if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();advance(e.key==='ArrowUp'?1:-1);}
  });
      wrap.classList.add('hasSteps');
      const arrows=document.createElement('span');arrows.className='arrows';
      for(const dir of [1,-1]){
        const btn=document.createElement('button');btn.type='button';btn.textContent=dir>0?'▲':'▼';btn.setAttribute('aria-label',(dir>0?'Increase ':'Decrease ')+label);
        let timer;
        const stop=()=>{clearTimeout(timer);window.removeEventListener('blur',stop);};
        btn.style.touchAction='none';
        btn.onpointerdown=e=>{
          if(e.button!==0||!e.isPrimary)return;
          e.preventDefault();stop();btn.setPointerCapture(e.pointerId);
          window.addEventListener('blur',stop);
          function repeat(){if(advance(dir))timer=setTimeout(repeat,90);}
          if(advance(dir))timer=setTimeout(repeat,400);
        };
        btn.onpointerup=btn.onpointercancel=btn.onlostpointercapture=stop;
        btn.onclick=e=>{e.preventDefault();if(e.detail===0)advance(dir);};
        arrows.append(btn);
      }
      wrap.append(arrows);
}

function setupSectionOrder(){
  const sidebar=$('controls'),panel=document.createElement('div'),key='cellbench.sectionOrder';
  panel.append(...sidebar.children);
  const picker=document.createElement('details'),summary=document.createElement('summary'),choices=document.createElement('div');
  picker.className='settingsPicker';picker.open=true;choices.className='settingsChoices';
  summary.textContent='What do you want to edit?';
  picker.append(summary,choices);sidebar.append(picker,panel);
  const groups=[
    ['Pack size and cells',['Pack target','Cell array']],
    ['Case and fit',['Case builder','Inside dimensions and bench reference']],
    ['Insulation and holders',['Separator','Fishpaper, wrap and balance wires','Cell holders · STL','Squigglies™ spacers · STEP / STL']],
    ['Battery management',['ANT / custom BMS editor']],
    ['Bike and motor',['Parts library & frame layout']],
    ['Presets and saved builds',['Starting layouts','Series layouts','My designs']]
  ];
  for(const [topic,title] of [...groups.map(([name])=>[name,name]),['all','All settings · customize order']]){
    const button=document.createElement('button');
    button.type='button';button.textContent=title;button.dataset.topic=topic;
    button.onclick=()=>showTopic(topic);choices.append(button);
  }
  const sections=[...panel.children].map(content=>{
    const row=document.createElement('div');row.className='setupGroup';content.replaceWith(row);row.append(content);return row;
  }),titles=new Map();
  let dragged=null;
  function persist(){
    refresh();
    try{localStorage.setItem(key,JSON.stringify([...panel.children].map(el=>el.dataset.orderId)));}catch{}
  }
  for(const section of sections){
    const header=section.querySelector('h2,summary'),title=header.textContent;
    const id=section.firstElementChild.querySelector('[id]')?.id||title;
    titles.set(id,section);section.dataset.orderId=id;
    section.dataset.topic=groups.find(([,names])=>names.includes(title.trim()))?.[0]||'Pack size and cells';
    const buttons=document.createElement('span');buttons.className='orderButtons';
    for(const [action,icon] of [['to top','⇈'],['up','↑'],['down','↓']]){
      const button=document.createElement('button');
      button.type='button';button.textContent=icon;button.title='Move '+title+' '+action;button.setAttribute('aria-label',button.title);
      button.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        const before=action==='to top'?panel.firstElementChild:action==='up'?section.previousElementSibling:section.nextElementSibling?.nextElementSibling;
        panel.insertBefore(section,before||null);persist();
      };
      buttons.append(button);
    }
    section.append(buttons);header.draggable=true;header.title='Drag to reorder';header.style.cursor='grab';
    header.ondragstart=e=>{dragged=section;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);};
    const clear=()=>{for(const s of sections)s.style.boxShadow='';};
    header.ondragend=()=>{dragged=null;clear();};
    section.ondragover=e=>{
      if(!dragged||dragged===section)return;e.preventDefault();clear();
      const r=section.getBoundingClientRect();section.style.boxShadow=e.clientY<r.top+r.height/2?'inset 0 3px #42a599':'inset 0 -3px #42a599';
    };
    section.ondrop=e=>{
      if(!dragged||dragged===section)return;e.preventDefault();
      const r=section.getBoundingClientRect();panel.insertBefore(dragged,e.clientY<r.top+r.height/2?section:section.nextElementSibling);
      clear();dragged=null;persist();
    };
  }
  try{for(const id of JSON.parse(localStorage.getItem(key)||'[]'))if(titles.has(id))panel.append(titles.get(id));}catch{}
  function refresh(){
    for(const section of sections){
      const [top,up,down]=section.querySelectorAll('.orderButtons button');top.disabled=up.disabled=!section.previousElementSibling;down.disabled=!section.nextElementSibling;
    }
  }
  function showTopic(topic){
    for(const button of choices.children)button.setAttribute('aria-pressed',String(button.dataset.topic===topic));
    for(const section of sections){
      section.hidden=topic!=='all'&&section.dataset.topic!==topic;
      section.querySelector('.orderButtons').hidden=topic!=='all';
      const header=section.querySelector('h2,summary');
      header.draggable=topic==='all';header.style.cursor=topic==='all'?'grab':'';
      header.title=topic==='all'?'Drag to reorder':'';
    }
    sidebar.scrollTop=0;
  }

  document.addEventListener('click',event=>{
    const targets={goFrame:'frameImport',editBms:'bmsSetup',wWires:'surfaceEditor',wLiner:'surfaceEditor'};
    const section=$(targets[event.target.closest('button')?.id])?.closest('.setupGroup');
    if(section?.hidden)showTopic(section.dataset.topic);
  },true);
  showTopic(groups[0][0]);
  refresh();
}

// Merge end-cap quads into one mesh per bank, using a shared atlas for all group labels.
let seriesAtlas;
function addSeriesLabels(parts,c,m,s,bank,groups){
  if(c.grouping!=='on')return;
  if(!seriesAtlas){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=640;
    const ctx=canvas.getContext('2d');ctx.font='bold 26px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    for(let g=0;g<=150;g++){
      const x=g%16*64,y=Math.floor(g/16)*64;
      ctx.fillStyle='#182536';ctx.fillRect(x+1,y+14,62,36);ctx.fillStyle='white';ctx.fillText(g?'S'+g:'·',x+32,y+33,60);
    }
    seriesAtlas=new THREE.CanvasTexture(canvas);
  }
  const vertices=[],uv=[],indices=[],axis=cellBases[c.axis].a;
  for(const [i,cell] of m.bankCells[bank].entries()){
    const center=s.cells[m.bankOffsets[bank]+i].xyz,g=groups.get(cell.id+'/'+bank)||0;
    for(const sign of [-1,1]){
      const normal=new THREE.Vector3().setComponent(axis,sign);
      const up=new THREE.Vector3(0,axis===2?1:0,axis===2?0:1),right=new THREE.Vector3().crossVectors(up,normal);
      const pos=new THREE.Vector3(...center).addScaledVector(normal,c.len/2+.12),first=vertices.length/3;
      for(const [x,y] of [[0,0],[1,0],[1,1],[0,1]]){
        vertices.push(...pos.clone().addScaledVector(right,(x-.5)*c.d*.77).addScaledVector(up,(y-.5)*c.d*.77).toArray());
        uv.push((g%16+x)/16,1-(Math.floor(g/16)+1-y)/10);
      }
      indices.push(first,first+1,first+2,first,first+2,first+3);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setIndex(indices);geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:seriesAtlas,transparent:true,alphaTest:.45}));mesh.name='Series labels';parts.add(mesh);
}

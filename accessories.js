// Coordinates are millimeters from the inner front / left / floor corner.
let surfaceItems=[];
const faceAxes={Top:[2,1],Bottom:[2,-1],Right:[1,1],Left:[1,-1],Rear:[0,1],Front:[0,-1]};
const mountChoices=[];
for(let bank=0;bank<=12;bank++)for(const face of Object.keys(faceAxes)){
  mountChoices.push([bank+'/'+face,(bank?'Bank '+bank:'Whole pack')+' · '+face]);
}
for(let row=1;row<=30;row++)for(const face of Object.keys(faceAxes)){
  mountChoices.push(['r'+row+'/'+face,'Row '+row+' across banks · '+face]);
}
function mountPlane(c,m,key){
  const [bankId,face]=key.split('/'),bank=Number(bankId);
  if(bank>c.banks)throw Error('Choose a surface on an existing bank.');
  const base=[0,0,0],extent=[m.x,m.y,m.z],axis=cellBases[c.axis].a;
  if(bankId.startsWith('r')){
    const row=m.cells.filter(cell=>cell.r===Number(bankId.slice(1))-1);
    if(!row.length)throw Error('That row is empty. Choose another surface.');
    const v=axis===2?0:2,r=c.d/2;
    base[v]=row[0].v-r-m.v0+(c.holder?c.edgeV:0);extent[v]=c.d;
    const centers=row.map(p=>p.u),u=cellBases[c.axis].u;base[u]=Math.min(...centers)-r-m.u0+(c.holder?c.edgeU:0);
    extent[u]=Math.max(...centers)-Math.min(...centers)+c.d;
    return {base,extent,axes:faceAxes[face],bank:0};
  }
  if(bank){extent[axis]=c.len+(c.holder?2*c.lip:0);base[axis]=(bank-1)*(extent[axis]+m.axialSheet);}
  return {base,extent,axes:faceAxes[face],bank};
}
function surfaceBounds(c,m,key,dimensions,gap){
  const {base,extent,axes:[n,sign]}=mountPlane(c,m,key);
  return base.map((v,i)=>i===n?v+(sign>0?extent[i]+gap:-dimensions[i]-gap):v+(extent[i]-dimensions[i])/2);
}
function rotationBounds(c){
  const rot=new THREE.Euler(...[c.rx,c.ry,c.rz].map(a=>a*Math.PI/180));
  const matrix=new THREE.Matrix4().makeRotationFromEuler(rot),size=[c.bmsL,c.bmsW,c.bmsH];
  const dim=size.map((_,i)=>size.reduce((sum,v,j)=>sum+Math.abs(matrix.elements[4*j+i])*v,0));
  return {matrix,size,dim};
}
function mountRotation(key){
  const face=key.split('/')[1];
  const [x,y]=({Top:[0,0],Bottom:[180,0],Front:[0,-90],Rear:[0,90],Left:[90,0],Right:[-90,0]})[face];
  fields.rx.value=x;fields.ry.value=y;fields.rz.value=0;
}

const bmsFields=[
  ['bmsMode','BMS placement',[['off','No box'],['after','Above finished pack'],['fixed','Fixed case coordinates'],['mount','Stick to surface']]],
  ['bmsMount','Mount surface',mountChoices],
  ...['rx','ry','rz'].map((k,i)=>[k,'Rotate '+('XYZ'[i])+' (degrees)',[-360,360,'any']]),
  ['bmsRule','At a fixed box',[['check','Flag interference'],['split','Leave space between row groups'],['stop','Stop before intersecting group']]],
  ...[['bmsL','Box length'],['bmsW','Box width'],['bmsH','Box height']].map(([k,n])=>[k,n+' (mm)',[0.1,1500,'any']]),
  ...[['bx','Front X'],['by','Left Y'],['bz','Floor Z'],['bmsGap','Clearance']].map(([k,n])=>[k,n+' (mm)',k==='bmsGap'?[0,3000,'any']:[-10000,10000,'any']]),
  ['bmsWall','Box walls and floor (mm)',[0.1,50,'any']],
  ['bmsLock','Position controls',[['edit','Editable'],['lock','Lock box position']]]
];
function validateSurfaceItems(items){
  if(!Array.isArray(items)||items.length>1000)throw Error('Invalid surface placement list.');
  for(const p of items){
    if(!p||!['Wire','Paper','Wrap','FR4','G10','ABS'].includes(p.kind)||!Object.hasOwn(faceAxes,p.face)||typeof p.turn!=='boolean'||
      !Number.isInteger(p.bank)||p.bank<0||p.bank>12||!['width','length','thickness','tape','across','along','lift'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=3000)||
      p.thickness<=0||Math.min(p.width,p.length,p.tape)<0)throw Error('Invalid paper, wire or tape placement.');
  }
}
function bmsBoxMesh(c){
  const w=c.bmsWall,length=c.bmsL-2*w,width=c.bmsW-2*w,h=c.bmsH-w;
  if(Math.min(length,width,h)<=0)throw Error('BMS walls and floor must leave room inside the box.');
  return caseMesh({length,width,high:h,low:h},{tx:w,ty:w,floor:w,roof:[[0,h],[length,h]]})
    .map(t=>t.map(p=>p.map(v=>v+w)));
}
function makeSurfaceParts(c,m){
  const size=[m.x,m.y,m.z],ax=cellBases[c.axis].a;
  const bankLength=c.len+(c.holder?2*c.lip:0),parts=[],warnings=[];
  for(const item of c.surfaceItems||[]){
    const {kind,bank,thickness,width,length,across,along,lift,tape,turn}=item;
    if(bank>c.banks){warnings.push('Placement references absent bank '+bank);continue;}
    const base=[0,0,0],extent=[...size];
    if(bank){base[ax]=(bank-1)*(bankLength+m.axialSheet);extent[ax]=bankLength;}
    for(const face of kind==='Wrap'?Object.keys(faceAxes):[item.face]){
      const [n,sign]=faceAxes[face],plane=[0,1,2].filter(i=>i!==n);
      if(turn)plane.reverse();
      const [u,v]=plane,full=kind==='Wrap',wire=kind==='Wire';
      const add=(name,thick,offset,w,l)=>{
        const min=[...base],dim=[0,0,0];dim[n]=thick;dim[u]=w;dim[v]=l;
        min[u]+=full?0:across;min[v]+=full?0:along;
        min[n]+=sign>0?extent[n]+offset:-offset-thick;
        parts.push({name,min,dim,bank,run:v,materialName:kind,color:({FR4:0x368d50,G10:0x898152,ABS:0x637184})[kind]});
      };
      const w=wire?thickness:full?extent[u]:(width||extent[u]),l=full?extent[v]:(length||extent[v]);
      if(wire&&tape>0)add('Tape',tape,lift,Math.max(width,w),l);
      add(wire?'Wire':['FR4','G10','ABS'].includes(kind)?'Separator':'Paper',thickness,lift+(wire?tape:0),w,l);
    }
  }
  for(const place of selectedSheets(c)){
    if(!place.includes('/')||c.material==='none'||!c.sheet)continue;
    const {extent,axes:[n],bank}=mountPlane(c,m,place),dim=[...extent];
    const trimAxis=n===1?0:1;
    dim[n]=c.sheet;dim[trimAxis]-=c.sheetTrim;
    if(dim[trimAxis]<=0)throw Error('Width trim leaves no material on that surface.');
    parts.push({name:'Separator',color:c.material==='FR4'?0x368d50:0xb77d4c,min:surfaceBounds(c,m,place,dim,0),dim,bank});
  }
  return {parts,warnings};
}
function applyBoxKeepout(c,grid,axialSheet){
  if(c.bmsMode!=='fixed'||c.bmsRule==='check')return 0;
  const reserve=c.miscReserve+c.holderReserve;
  const r=c.d/2,gap=c.bmsGap,edge=c.holder?c.edgeV:0;
  const start=[c.front,c.left,c.bottom].map(x=>x+reserve);
  const cells=grid.filter(p=>p.on);if(!cells.length)return 0;
  const minU=Math.min(...cells.map(p=>p.u))-r,minV=Math.min(...cells.map(p=>p.v))-r;
  const bank=c.len+(c.holder?2*c.lip:0);
  const {a:axial,v:row,u}=cellBases[c.axis],box=[c.bx,c.by,c.bz],dims=rotationBounds(c).dim;
  const hits=(a,b,i)=>b>box[i]-gap+1e-7&&a<box[i]+dims[i]+gap-1e-7;
  if(!Array.from({length:c.banks},(_,i)=>start[axial]+i*(bank+axialSheet)).some(x=>hits(x,x+bank,axial)))return 0;
  let moved=0;
  for(let i=0;i<c.rows;i+=c.groupRows){
    const group=cells.filter(p=>p.r>=i&&p.r<i+c.groupRows);if(!group.length)continue;
    const left=start[u]+(c.holder?c.edgeU:0)-minU;
    const lo=start[row]+edge+Math.min(...group.map(p=>p.v))-minV-r+moved;
    const hi=start[row]+edge+Math.max(...group.map(p=>p.v))-minV+r+moved;
    if(hits(lo,hi,row)&&hits(left+Math.min(...group.map(p=>p.u))-r,left+Math.max(...group.map(p=>p.u))+r,u)){
      if(c.bmsRule==='stop'){for(const p of grid)if(p.r>=i)p.on=false;break;}
      moved+=box[row]+dims[row]+gap-lo;
    }
    for(const p of grid)if(p.r>=i&&p.r<i+c.groupRows)p.v+=moved;
  }
  return moved;
}
function accessoryMesh(parts,item,origin){
  const {name,min,dim,run}=item,wire=name==='Wire';
  if(name==='BMS'){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(item.triangles.flat(2),3));g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x527da9}));mesh.name='BMS';mesh.position.set(...min.map((v,i)=>v+origin[i]));parts.add(mesh);return;
  }
  const geometry=wire?new THREE.CylinderGeometry(dim[(run+1)%3]/2,dim[(run+1)%3]/2,dim[run],16):new THREE.BoxGeometry(...dim);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:({BMS:0x527da9,Separator:item.color||0xb77d4c,Paper:0xb77d4c,Wire:0xce4942,Tape:0xe3d399})[name],transparent:name==='Paper',opacity:name==='Paper'?.65:1}));
  if(wire&&run===0)mesh.rotation.z=Math.PI/2;if(wire&&run===2)mesh.rotation.x=Math.PI/2;
  mesh.position.set(...min.map((x,i)=>origin[i]+x+dim[i]/2));parts.add(mesh);
}
function setupSurfaceEditor(){
  const panel=$('surfaceEditor');
  panel.innerHTML='<div class="fields">'+[
    ['kind','Add material',['Paper','FR4','G10','ABS','Wrap','Wire']],['face','Face',Object.keys(faceAxes)],['bank','Bank (0 = whole pack)',0],
    ['thickness','Material thickness / wire Ø (mm)',0.25],['width','Patch / tape width (0 = full sheet)',0],
    ['length','Run length (0 = full face)',0],['across','Across face offset (mm)',0],['along','Along face offset (mm)',0],
    ['lift','Outward offset (mm)',0],['turn','Run direction',['Default','Quarter turn']],['tape','Carpet tape under wire (mm, 0 = none)',0]
  ].map(([k,n,val])=>'<label>'+n+(Array.isArray(val)?'<select data-part="'+k+'">'+val.map(x=>'<option>'+x+'</option>').join('')+'</select>':'<input data-part="'+k+'" type="number" min="'+(['across','along','lift'].includes(k)?-3000:k==='thickness'?.01:0)+'" max="'+(k==='bank'?12:3000)+'" step="'+(k==='bank'?1:'any')+'" required value="'+val+'">')+'</label>').join('')+'</div><button type="button">Add placement</button><div class="partList"></div>';
  const inputs=[...panel.querySelectorAll('[data-part]')],commit=panel.querySelector('button');
  for(const el of inputs)if(el.type==='number')installNumberArrows(el,el.parentElement,el.parentElement.firstChild.textContent);
  let edit=-1;
  function list(){
    const list=panel.querySelector('.partList');list.replaceChildren();
    surfaceItems.forEach((item,i)=>{
      const row=document.createElement('div');row.append(item.kind+' · '+(item.kind==='Wrap'?'six faces':item.face)+' · '+(item.bank?'bank '+item.bank:'whole pack')+' ');
      for(const label of ['Edit','Remove']){
        const b=document.createElement('button');b.textContent=label;b.onclick=()=>{
          if(label==='Remove'){surfaceItems.splice(i,1);reset();render();}
          else{edit=i;for(const el of inputs){const k=el.dataset.part;el.value=k==='turn'?(item.turn?'Quarter turn':'Default'):item[k];}commit.textContent='Update placement';}
        };row.append(b);
      }list.append(row);
    });
  }
  function reset(){edit=-1;commit.textContent='Add placement';list();}
  panel.resetParts=reset;
  panel.oninput=e=>{e.stopPropagation();if(e.target.dataset.part==='kind')panel.querySelector('[data-part=thickness]').value=({Wire:1.5,FR4:1.6,G10:1,ABS:1})[e.target.value]??.25;};
  commit.onclick=()=>{
    if(!inputs.every(el=>el.reportValidity()))return;
    if(edit<0&&surfaceItems.length>=1000)return;
    const item=Object.fromEntries(inputs.map(el=>[el.dataset.part,el.type==='number'?el.valueAsNumber:el.value]));
    item.turn=item.turn==='Quarter turn';if(edit<0)surfaceItems.push(item);else surfaceItems[edit]=item;reset();render();
  };
}

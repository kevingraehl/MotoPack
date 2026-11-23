// AP203 faceted B-rep. Reuse shared Cartesian points across the closed shell.
function stepSolid(name,triangles){
  const entities=[],points=new Map();
  function add(expr){entities.push('#'+(entities.length+1)+'='+expr+';');return '#'+entities.length;}
  function real(v){return Number(v.toFixed(8)).toFixed(8);}
  function vertex(v){
    const key=v.map(real).join(',');
    if(!points.has(key))points.set(key,add("CARTESIAN_POINT('',("+key+"))"));
    return points.get(key);
  }
  const vertices=new Map(),edges=new Map(),directions=new Map();
  function direction(vec){
    const unit=vec.map(n=>real(n/Math.hypot(...vec))).join(',');
    if(!directions.has(unit))directions.set(unit,add("DIRECTION('',("+unit+"))"));
    return directions.get(unit);
  }
  function edge(a,b){
    const pa=vertex(a),pb=vertex(b),key=[pa,pb].sort().join('/');
    for(const p of [pa,pb])if(!vertices.has(p))vertices.set(p,add("VERTEX_POINT('',"+p+")"));
    if(!edges.has(key)){
      const delta=b.map((x,i)=>x-a[i]);
      const vector=add("VECTOR('',"+direction(delta)+",1.)"),line=add("LINE('',"+pa+","+vector+")");
      edges.set(key,{start:pa,id:add("EDGE_CURVE('',"+[vertices.get(pa),vertices.get(pb),line]+",.T.)")});
    }
    const record=edges.get(key);
    return add("ORIENTED_EDGE('',*,*,"+record.id+","+(record.start===pa?".T.":".F.")+")");
  }
  const components=typeof triangles?.[0]?.[0]?.[0]==='number'?[triangles]:triangles;
  const solids=components.map((component,index)=>{
    const faces=component.map(tri=>{
      const [a,b,c]=tri,u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const surface=add("PLANE('',"+add("AXIS2_PLACEMENT_3D('',"+[vertex(a),direction(normal),direction(u)]+")")+")");
      const loop=add("EDGE_LOOP('',("+tri.map((p,i)=>edge(p,tri[(i+1)%3])).join(',')+"))");
      const bound=add("FACE_OUTER_BOUND('',"+loop+",.T.)");
      return add("ADVANCED_FACE('',("+bound+"),"+surface+",.T.)");
    });
    const shell=add("CLOSED_SHELL('',("+faces.join(',')+"))");
    return add("MANIFOLD_SOLID_BREP('"+name+"-"+(index+1)+"',"+shell+")");
  });
  stepContext(add,name,solids,"ADVANCED_BREP_SHAPE_REPRESENTATION");
  return ["ISO-10303-21;","HEADER;","FILE_DESCRIPTION(('motoPack faceted solid'),'2;1');","FILE_NAME('"+name+".step','"+new Date().toISOString().slice(0,19)+"',('motoPack'),(''),'motoPack','motoPack','');","FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));","ENDSEC;","DATA;",...entities,"ENDSEC;","END-ISO-10303-21;"].join('\n');
}

function stepContext(add,name,solids,kind){
  const length=add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))');
  const angle=add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))');
  const space=add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
  const tol=add("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),"+length+",'accuracy','')");
  const ctx=add("(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT(("+tol+")) GLOBAL_UNIT_ASSIGNED_CONTEXT(("+[length,angle,space]+")) REPRESENTATION_CONTEXT('','3D'))");
  const origin=add("CARTESIAN_POINT('',(0.,0.,0.))"),z=add("DIRECTION('',(0.,0.,1.))"),x=add("DIRECTION('',(1.,0.,0.))");
  const axes=add("AXIS2_PLACEMENT_3D('',"+[origin,z,x]+")");
  const rep=add(kind+"('',("+[axes,...solids]+"),"+ctx+")");
  const app=add("APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies')");
  add("APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,"+app+")");
  const pc=add("MECHANICAL_CONTEXT('',"+app+",'mechanical')");
  const prod=add("PRODUCT('"+name+"','"+name+"','',("+pc+"))");
  const form=add("PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',"+prod+",.NOT_KNOWN.)");
  const dc=add("DESIGN_CONTEXT('',"+app+",'design')");
  const def=add("PRODUCT_DEFINITION('design','',"+[form,dc]+")");
  const shape=add("PRODUCT_DEFINITION_SHAPE('','',"+def+")");
  add("SHAPE_DEFINITION_REPRESENTATION("+[shape,rep]+")");
}

function activeParallel(count,c,m){
  const target=Math.min(Math.floor(count/c.series),targetParallel(c));
  if(!m)return target;
  const plan=effectiveGroupPlan(c);
  if(c.groupPlan==='auto'||!c.groupPlan){
    let lo=0,hi=target;
    while(lo<hi){
      const p=Math.ceil((lo+hi)/2);
      if(m.bankCells.reduce((sum,bank)=>sum+Math.floor(bank.length/p),0)>=c.series)lo=p;
      else hi=p-1;
    }
    return lo;
  }
  if(['split','mirror','folded'].includes(plan)){
    const perBank=c.series/c.banks;
    if(!Number.isInteger(perBank))return 0;
    return Math.min(target,...m.bankCells.map(cells=>Math.floor(cells.length/perBank)));
  }
  if(plan==='rowGroups'||plan==='columnGroups'){
    const axis=plan==='rowGroups'?'r':'k',sizes=[];
    for(const bank of m.bankCells){
      const lines=new Map();
      for(const cell of bank)lines.set(cell[axis],(lines.get(cell[axis])||0)+1);
      sizes.push(...lines.values());
    }
    sizes.sort((a,b)=>b-a);
    return Math.min(target,sizes[c.series-1]||0);
  }
  return target;
}
function effectiveGroupPlan(c){
  if(c.groupPlan&&c.groupPlan!=='auto')return c.groupPlan;
  return c.banks===2&&c.axis!=='vertical'&&c.series%2===0?'folded':'bankLocal';
}
// Rank eight row/column sweeps. Penalize long jumps around cutouts and
// count the two parallel faces when travelling inside a group.
function rankedSweeps(c,m){
  const parallel=activeParallel(m.count,c,m);
  const used=Math.min(m.cells.length,Math.ceil(parallel*c.series/c.banks));
  const candidates=[];
  for(const major of ['r','k'])for(const forward of [1,-1])for(const start of [1,-1]){
    const minor=major==='r'?'k':'r';
    const cells=[...m.cells].sort((a,b)=>forward*(a[major]-b[major])||start*(a[major]%2?-1:1)*(a[minor]-b[minor]));
    let score=0;
    for(let i=1;i<used;i++){
      const dx=cells[i].u-cells[i-1].u,dy=cells[i].v-cells[i-1].v;
      score+=(dx*dx+dy*dy)*(i%parallel===0?1:2);
    }
    candidates.push({cells,score});
  }
  return candidates.sort((a,b)=>a.score-b.score);
}
function bankGroupCounts(series,parallel,banks,fillLowerFirst=false){
  const counts=banks.map(()=>0);
  if(!parallel)return counts;
  let allocated=0;
  while(allocated<series){
    const before=allocated;
    for(let b=0;b<banks.length&&allocated<series;b++){
      if((counts[b]+1)*parallel>banks[b].length)continue;
      const n=fillLowerFirst?Math.min(series-allocated,Math.floor(banks[b].length/parallel)-counts[b]):1;
      counts[b]+=n;allocated+=n;
    }
    if(allocated===before)break;
  }
  return counts;
}
function groupMap(c,m){
  const parallel=activeParallel(m.count,c,m),groups=new Map();
  const plan=effectiveGroupPlan(c);
  const ordered=c.groupPlan==='auto'?rankedSweeps(c,m)[c.routeChoice||0].cells:[...m.cells].sort((a,b)=>a.r-b.r || (a.r%2?b.k-a.k:a.k-b.k));
  for(let b=0;b<c.banks;b++)for(const cell of m.bankCells[b])groups.set(cell.id+'/'+b,0);
  if(c.groupPlan==='rowGroups'){
    let group=1;
    for(let b=0;b<c.banks;b++)for(let r=0;r<c.rows;r++){
      const row=m.bankCells[b].filter(cell=>cell.r===r).sort((a,b)=>a.k-b.k);
      if(row.length<parallel)continue;
      if(group<=c.series)for(const cell of row.slice(0,parallel))groups.set(cell.id+'/'+b,group);
      group++;
    }
    return groups;
  }
  if(c.groupPlan==='columnGroups'){
    let group=1;
    for(let b=0;b<c.banks;b++)for(let k=0;k<c.cols;k++){
      const column=m.bankCells[b].filter(cell=>cell.k===k).sort((a,b)=>a.r-b.r);
      if(column.length<parallel)continue;
      if(group<=c.series)for(const cell of column.slice(0,parallel))groups.set(cell.id+'/'+b,group);
      group++;
    }
    return groups;
  }
  if(c.groupPlan==='auto'||!c.groupPlan){
    if(!parallel)return groups;
    const quota=bankGroupCounts(c.series,parallel,m.bankCells,c.axis==='vertical'&&c.fillLowerFirst!==false);
    let first=1;
    m.bankCells.forEach((bank,b)=>{
      const end=quota[b]*parallel;
      const cells=ordered.filter(cell=>groups.has(cell.id+'/'+b)).slice(0,end);
      if(plan==='folded'&&b%2)cells.reverse();
      cells.forEach((cell,i)=>groups.set(cell.id+'/'+b,first+Math.floor(i/parallel)));
      first+=quota[b];
    });
    return groups;
  }
  const separate=plan!=='across';
  const perBank=c.series/c.banks;
  const indexes=Array(c.banks).fill(0);
  let acrossIndex=0;
  ordered.forEach((cell,i)=>{
    for(let step=0;step<c.banks;step++){
      const b=!separate&&i%2?c.banks-1-step:step;
      if(!groups.has(cell.id+'/'+b))continue;
      let group=0;
      if(separate){
        const local=indexes[b]++;
        let index=plan==='mirror'&&b%2?m.bankCells[b].length-1-local:local;
        if(plan==='folded'&&b%2&&local<parallel*perBank)index=parallel*perBank-1-local;
        if(Number.isInteger(perBank)&&parallel>0&&index<parallel*perBank)
          group=b*perBank+1+Math.floor(index/parallel);
      }else{
        const index=acrossIndex++;
        if(parallel&&index<c.series*parallel)group=1+Math.floor(index/parallel);
      }
      groups.set(cell.id+'/'+b,group);
    }
  });
  return groups;
}

const reversedCells=new Set();
function groupColor(g){return g?'hsl('+Math.round(g*137.508%360)+', 54%, 69%)':'#b9c1bf';}
function toggleCell(key){if(reversedCells.has(key))reversedCells.delete(key);else reversedCells.add(key);}

// Closed, lightweight cell bodies with a raised positive terminal, in millimeters.
function cellEnvelope(c){
  const r=c.d/2,h=c.len/2,cap=Math.min(.6,c.len*.01),body=[];
  const rings=[[-h,r],[h-cap,r],[h-cap,r*.43],[h,r*.43]].map(([z,rad])=>
    Array.from({length:32},(_,i)=>[rad*Math.cos(i*Math.PI/16),rad*Math.sin(i*Math.PI/16),z]));
  for(let i=0;i<32;i++){
    const j=(i+1)%32;
    body.push([[0,0,-h],rings[0][j],rings[0][i]],[[0,0,h],rings[3][i],rings[3][j]]);
    for(let k=0;k<3;k++)body.push([rings[k][i],rings[k][j],rings[k+1][j]],[rings[k][i],rings[k+1][j],rings[k+1][i]]);
  }
  return body;
}
function* assemblyBodies(design){
  const {c,shell:s}=design;
  for(const [name,triangles] of localAssemblyBodies(design)){
    const mat=name==='Case'||(name==='BMS'&&c.bmsMode==='fixed')?s.caseMatrix:s.batteryMatrix;
    const moved=mat.elements.some((n,i)=>Math.abs(n-(i%5===0?1:0))>1e-10);
    yield [name,moved?triangles.map(t=>t.map(p=>placedPoint(mat,p))):triangles];
  }
}
function* localAssemblyBodies({c,m,shell:s}){
  yield ['Case',caseMesh(c,s)];
  const upright=c.axis==='vertical',cell=cellEnvelope(c),bankLength=c.len+(c.holder?2*c.lip:0);
  const plate=c.holder?holderTriangles(c,m):null;
  for(let bank=0;bank<c.banks;bank++){
    const start=bank*(bankLength+m.axialSheet);
    for(const [i,p] of m.bankCells[bank].entries()){
      const key=p.id+'/'+bank,sign=reversedCells.has(key)?-1:1,center=s.cells[m.bankOffsets[bank]+i].xyz;
      yield ['Cell '+(bank+1)+' '+p.id,cell.map(t=>t.map(([x,y,z])=>(upright?[x*sign,y,z*sign]:c.axis==='cross'?[x,z*sign,-y*sign]:[z*sign,y,-x*sign]).map((a,k)=>a+center[k])))];
    }
    if(plate)for(const far of [false,true]){
      const tris=plate.map(t=>{
        const points=t.map(([u,v,z])=>{
          const a=start+(far?bankLength-z:z);return cellXYZ(c,u,v,a).map((x,k)=>x+s.origin[k]);
        });return (c.axis!=='flat')!==far?points.reverse():points;
      });
      yield ['Holder '+(bank+1)+(far?' B':' A'),tris];
    }
  }
  const group=new THREE.Group();addSheetPreview(group,c,m,s,0,c.banks,true);
  for(const item of s.parts)accessoryMesh(group,item,s.origin);
  for(const mesh of group.children){
    mesh.updateMatrixWorld();
    const g=mesh.geometry,position=g.attributes.position,index=g.index;
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
      const matrix=new THREE.Matrix4();if(mesh.isInstancedMesh)mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);
      const tris=[],point=new THREE.Vector3(),reverse=matrix.determinant()<0;
      for(let j=0;j<(index?index.count:position.count);j+=3){
        const t=[0,1,2].map(k=>point.fromBufferAttribute(position,index?index.getX(j+k):j+k).applyMatrix4(matrix).toArray());
        if(t.some((p,k)=>p.every((v,n)=>Math.abs(v-t[(k+1)%3][n])<1e-8)))continue;
        tris.push(reverse?t.reverse():t);
      }
      yield [mesh.name||'Accessory',tris];
    }
    g.dispose();mesh.material.dispose();mesh.dispose?.();
  }
}
function assemblyFile(format,bodies=assemblyBodies(current)){
  if(format==='stl'){
    const header=new ArrayBuffer(84),chunks=[header];let count=0;
    for(const [,tris] of bodies){chunks.push(new Uint8Array(binarySTL(tris),84));count+=tris.length;}
    new DataView(header).setUint32(80,count,true);return new Blob(chunks);
  }
  // Each physical component has its own closed shell in a multi-solid representation.
  let id=0;const solids=[],chunks=[],lines=[];
  function add(expr){lines.push('#'+(++id)+'='+expr+';\n');return '#'+id;}
  chunks.push("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('motoPack assembly'),'2;1');\nFILE_NAME('whole-battery.step','"+new Date().toISOString().slice(0,19)+"',('motoPack'),(''),'motoPack','motoPack','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\n");
  for(const [name,tris] of bodies){
    const points=new Map(),directions=new Map(),faces=[];
    function direction(vector){
      const length=Math.hypot(...vector),key=vector.map(n=>(n/length).toFixed(8)).join(',');
      if(!directions.has(key))directions.set(key,add("DIRECTION('',("+key+"))"));
      return directions.get(key);
    }
    for(const t of tris){
      const [a,b,c]=t,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      if(Math.hypot(...normal)<1e-12)continue;
      const vertices=t.map(p=>{
        const key=p.map(v=>v.toFixed(7)).join(',');
        if(!points.has(key))points.set(key,add("CARTESIAN_POINT('',("+key+"))"));
        return points.get(key);
      });
      const loop=add("POLY_LOOP('',("+vertices+"))"),bound=add("FACE_OUTER_BOUND('',"+loop+",.T.)");
      const axes=add("AXIS2_PLACEMENT_3D('',"+[vertices[0],direction(normal),direction(u)]+")");
      const plane=add("PLANE('',"+axes+")");
      faces.push(add("FACE_SURFACE('',("+bound+"),"+plane+",.T.)"));
    }
    solids.push(add("FACETED_BREP('"+name.replace(/'/g,"''")+"',"+add("CLOSED_SHELL('',("+faces+"))")+")"));
    chunks.push(lines.join(''));lines.length=0;
  }
  stepContext(add,'Battery',solids,'FACETED_BREP_SHAPE_REPRESENTATION');
  chunks.push(lines.join(''),'ENDSEC;\nEND-ISO-10303-21;');return new Blob(chunks);
}

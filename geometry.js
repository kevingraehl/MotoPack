// Map cell-local column (u), row (v) and axial (a) coordinates into assembly XYZ.
const cellBases={vertical:{u:1,v:0,a:2},flat:{u:1,v:2,a:0},cross:{u:0,v:2,a:1}};
function cellXYZ(c,u,v,a){
  const basis=cellBases[c.axis],xyz=[];
  xyz[basis.u]=u;xyz[basis.v]=v;xyz[basis.a]=a;return xyz;
}
function columnRoom(c){return c.axis==='cross'?c.length-c.front-c.rear:c.width-c.left-c.right;}
function endsFaceProfile(c){return !!caseSketch&&cellBases[c.axis].a===(caseSketch.endFace?0:1);}
/* Plane coordinates: u across the case, v along rows, a along the cell axis. */
function locationAvailable(key,c){
  if(key==='rows'||key==='banks')return true;
  const target=key.split('/')[0];return target.startsWith('r')?+target.slice(1)<=c.rows:+target<=c.banks;
}
function selectedSheets(c){return (c.locations??[c.place]).filter(key=>locationAvailable(key,c));}
function layout(c, omitted = new Set()) {
  const p = c.d + c.gap;
  const shifted = c.pattern !== 'regular';
  const custom = c.pattern === 'custom' || c.pattern === 'customShort';
  const shift = shifted ? p * (custom ? c.shift / 100 : 0.5) : 0;
  const sheet = c.material === 'none' ? 0 : c.sheet;
  const rowSheet = selectedSheets(c).includes('rows') ? sheet : 0;
  const axialSheet = (c.deckGap || 0) + (selectedSheets(c).includes('banks') ? sheet : 0);
  const between=c.d+c.rowGap+rowSheet;
  const rowPitch = c.mediaShape === 'rigid' && rowSheet > 0
    ? between
    : Math.max(between/2,Math.sqrt(Math.max(0,between**2-shift**2)));
  const grid = [];
  for (let r = 0; r < c.rows; r++) {
    const alternate = shifted && r % 2 === 1;
    const count = c.cols - Number(alternate && (c.pattern === 'short' || c.pattern === 'customShort'));
    for (let k = 0; k < count; k++) {
      const id = r + '-' + k;
      grid.push({id,r,k,u:c.d/2 + k*p + (alternate ? shift : 0),
        v:c.d/2 + r*rowPitch + Math.floor(r/c.groupRows)*c.groupSpace, on:!omitted.has(id)});
    }
  }
  const originalMin=Math.min(...grid.filter(p=>p.on).map(p=>p.v))-c.d/2;
  const moved=applyBoxKeepout(c,grid,axialSheet);
  const bankCells=Array.from({length:c.banks},(_,bank)=>grid.filter(cell=>cell.on&&!omitted.has(cell.id+'/'+bank)));
  const used=new Set(bankCells.flat());
  const cells=grid.filter(cell=>used.has(cell));
  let count=0;
  const bankOffsets=bankCells.map(bank=>{const start=count;count+=bank.length;return start;});
  if (!cells.length) throw Error(c.bmsMode==='fixed'?'The BMS keep-out leaves no complete row group. Move the box or change its placement rule.':'Keep at least one cell in the section.');
  const extents = axis => {
    const values = cells.map(cell => cell[axis]);
    return [Math.min(...values)-c.d/2,Math.max(...values)+c.d/2];
  };
  const [u0,u1] = extents('u'), [firstV,v1] = extents('v');
  const v0=moved?originalMin:firstV;
  const uSpan=u1-u0, vSpan=v1-v0;
  const U=uSpan+(c.holder?2*c.edgeU:0), V=vSpan+(c.holder?2*c.edgeV:0);
  const A=c.banks*(c.len+(c.holder?2*c.lip:0))+(c.banks-1)*axialSheet;
  const [x,y,z]=cellXYZ(c,U,V,A);
  const roof=c.high+(c.low-c.high)*Math.min(1,x/c.length);
  const margins=[c.length-x,c.width-y,Math.min(c.high,roof)-z];
  return {grid,cells,u0,u1,v0,v1,uSpan,vSpan,U,V,A,x,y,z,margins,rowPitch,
    bankCells,bankOffsets,count, axialSheet, p, shift};
}

// Rounded profiles follow the exposed pockets. Fill internal gaps to form a single plate.
function cellContour(c,m){
  if(m.cellContour)return m.cellContour;
  const rx=c.d/2+(c.holder?c.edgeU:0),ry=c.d/2+(c.holder?c.edgeV:0);
  const rings=m.cells.map(cell=>Array.from({length:32},(_,i)=>{
    const a=i*Math.PI/16;
    return {X:Math.round(1000*(cell.u-m.u0+rx-c.d/2+rx*Math.cos(a))),
      Y:Math.round(1000*(cell.v-m.v0+ry-c.d/2+ry*Math.sin(a)))};
  }));
  const clip=new ClipperLib.Clipper(),paths=[];
  clip.AddPaths(rings,ClipperLib.PolyType.ptSubject,true);
  clip.Execute(ClipperLib.ClipType.ctUnion,paths,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
  const outer=paths.filter(p=>ClipperLib.Clipper.Orientation(p)).map(path=>path.map(p=>[p.X/1000,p.Y/1000]));
  m.cellContour=outer.length===1?outer[0]:hull2(outer.flat());
  return m.cellContour;
}
function holderProblem(c,m) {
  const radius=(c.d+c.slack)/2/Math.cos(Math.PI/48);
  if (c.edgeU<=radius-c.d/2 || c.edgeV<=radius-c.d/2)
    return 'Increase the outer offsets so every pocket has a surrounding wall.';
  const corner=c.holderShape==='contour'?0:c.cornerRadius||0,w=m.uSpan+2*c.edgeU,h=m.vSpan+2*c.edgeV;
  if(corner>Math.min(w,h)/2)return 'Corner radius exceeds half the shorter holder dimension.';
  if(corner>0){
    // The tessellated corner sits slightly inside the ideal quarter circle.
    const sag=corner*(1-Math.cos(Math.PI/48));
    for(const cell of m.cells){
      const x=cell.u-m.u0+c.edgeU,y=cell.v-m.v0+c.edgeV;
      const dx=Math.abs(x-w/2)-(w/2-corner),dy=Math.abs(y-h/2)-(h/2-corner);
      const distance=Math.hypot(Math.max(dx,0),Math.max(dy,0))+Math.min(Math.max(dx,dy),0)-corner;
      if(distance+radius+sag>=0)return 'Corner rounding reaches a cell pocket. Reduce the radius or increase the outer offsets.';
    }
  }
  if(c.holderShape==='contour'&&Math.min(c.d/2+c.edgeU,c.d/2+c.edgeV)*Math.cos(Math.PI/32)<=radius+.002)
    return 'Increase the contour margin around the cell pockets.';
  if(c.lip>=c.plate || c.plate-c.lip>=c.len/2 || c.land>=c.d/2)
    return 'Check plate thickness, axial lip and radial lip. Opposing pockets must clear each other.';
  for (let i=0;i<m.cells.length;i++) for(let j=0;j<i;j++){
    const a=m.cells[i],b=m.cells[j];
    if(Math.hypot(a.u-b.u,a.v-b.v)<=2*radius+0.001)
      return 'Pockets touch. Increase the cell gap or reduce the bore allowance before exporting.';
  }
  return '';
}

/* A stepped pocket grips the end radially; the open centre exposes the terminal.
   Each planar face is triangulated with the same boundary vertices as its walls. */
function holderTriangles(c,m) {
  const problem=holderProblem(c,m);
  if(problem) throw Error(problem);
  const facets=[], steps=48;
  const width=m.uSpan+2*c.edgeU, height=m.vSpan+2*c.edgeV;
  let outline=[[0,0],[width,0],[width,height],[0,height]];
  const r=c.cornerRadius||0;
  if(c.holderShape==='contour')outline=cellContour(c,m);
  else if(r){
    outline=[];
    for(const [cx,cy,start] of [[width-r,r,-1],[width-r,height-r,0],[r,height-r,1],[r,r,2]]){
      for(let i=0;i<=12;i++){
        const a=(start+i/12)*Math.PI/2,p=[cx+r*Math.cos(a),cy+r*Math.sin(a)];
        if(!outline.length||Math.hypot(p[0]-outline.at(-1)[0],p[1]-outline.at(-1)[1])>1e-8)outline.push(p);
      }
    }
    if(Math.hypot(outline[0][0]-outline.at(-1)[0],outline[0][1]-outline.at(-1)[1])<1e-8)outline.pop();
  }
  const ring=(cell,radius,index)=>Array.from({length:steps},(_,j)=>{
    const t=2*Math.PI*(j+0.19+(index%17)/61)/steps;
    return [cell.u-m.u0+c.edgeU+radius*Math.cos(t),cell.v-m.v0+c.edgeV+radius*Math.sin(t)];
  });
  const inner=m.cells.map((cell,i)=>ring(cell,(c.d/2-c.land)/Math.cos(Math.PI/steps),i));
  const outer=m.cells.map((cell,i)=>ring(cell,(c.d+c.slack)/2/Math.cos(Math.PI/steps),i));
  const point=(xy,z)=>[xy[0],xy[1],z];
  function face(holes,z,up){
    const points=outline.concat(...holes);
    const indices=earcut(points.flat(),holes.map((_,i)=>outline.length+i*steps));
    for(let n=0;n<indices.length;n+=3){
      const tri=indices.slice(n,n+3).map(i=>point(points[i],z));
      facets.push(up?tri:tri.reverse());
    }
  }
  function strip(lower,z0,upper,z1,reverse){
    for(let i=0;i<lower.length;i++){
      const j=(i+1)%lower.length;
      const a=point(lower[i],z0), b=point(lower[j],z0);
      const d=point(upper[i],z1), e=point(upper[j],z1);
      for(const tri of [[a,b,e],[a,e,d]]) facets.push(reverse?tri.reverse():tri);
    }
  }
  face(inner,0,false); face(outer,c.plate,true);
  strip(outline,0,outline,c.plate,false);
  for(let i=0;i<m.cells.length;i++){
    strip(inner[i],0,inner[i],c.lip,true);
    strip(inner[i],c.lip,outer[i],c.lip,true);
    strip(outer[i],c.lip,outer[i],c.plate,true);
  }
  return facets;
}

// Thin end cap and wrapped wavy separators for tightly packed staggered cells.
// Each returned component is a closed printable solid; overlapping components
// are intentionally kept separate in STEP and share one mesh in STL.
// Cut diamond windows through the finished (possibly trimmed) footprint. Slice
// its triangles at the diamond tips and centers so each roof is planar.
function ventedRail(poly, depth, width, shape='diamond', sheetDown=false) {
  const extents=[0,1].map(axis=>{
    const coords=poly.map(p=>p[axis]);
    return [Math.min(...coords),Math.max(...coords)];
  });
  const span=extents.map(([lo,hi])=>hi-lo),axis=span[1]>span[0]?1:0;
  const pitch=20, margin=2, count=Math.floor((span[axis]-2*margin-width)/pitch)+1;
  if(count<1||depth<width+2*margin)return null;
  const rows=Math.max(1,Math.floor((depth-margin)/(Math.max(24,width*1.5)+margin)));
  const rowPitch=(depth-margin)/rows, halfHeight=(rowPitch-margin)/2;
  const first=(extents[axis][0]+extents[axis][1]-(count-1)*pitch)/2;
  // Each profile point is [horizontal fraction, lower height, upper height].
  // Both surfaces meet at each tip, closing the cut through the wall.
  let profile=[[-1,0,0],[0,-halfHeight,halfHeight],[1,0,0]];
  if(shape==='v'){
    profile=[[-1,0,0],[-.72,-.30,.23],[0,-1,-.45],[.72,-.30,.23],[1,0,0]]
      .map(([x,low,high])=>[x,low*halfHeight,high*halfHeight]);
  }else if(['round','oval','teardrop'].includes(shape)){
    const radius=width/2;
    profile=Array.from({length:17},(_,i)=>{
      const angle=Math.PI*i/16,x=-Math.cos(angle),arc=i===16?0:Math.sin(angle);
      const h=shape==='round'?radius:shape==='oval'?Math.min(halfHeight,radius*.6):halfHeight;
      return [x,-arc*h,shape==='teardrop'?h*(1-Math.abs(x)):arc*h];
    });
  }
  const stations=[[extents[axis][0],0,0,false]];
  for(let i=0;i<count;i++){
    const center=first+i*pitch;
    profile.forEach(([x,low,high],j)=>stations.push([center+x*width/2,
      sheetDown?-high:low,sheetDown?-low:high,j<profile.length-1]));
  }
  stations.push([extents[axis][1],0,0,false]);
  const indices=earcut(poly.flat()),mesh=[];
  const at=(a,b,u)=>{
    const t=(u-a[axis])/(b[axis]-a[axis]);
    const p=[0,0];p[axis]=u;p[1-axis]=a[1-axis]+t*(b[1-axis]-a[1-axis]);return p;
  };
  function clip(points,u,keepAbove){
    const out=[];
    for(let i=0;i<points.length;i++){
      const a=points[(i+points.length-1)%points.length],b=points[i];
      if((a[axis]<u&&b[axis]>u)||(b[axis]<u&&a[axis]>u))out.push(at(a,b,u));
      if(keepAbove?b[axis]>=u:b[axis]<=u)out.push(b);
    }
    return out;
  }
  const lift=(p,z)=>[...p,z];
  for(let s=0;s<stations.length-1;s++){
    const [lo,low0,high0,active]=stations[s],[hi,low1,high1]=stations[s+1];
    const levels=p=>{
      const t=(p[axis]-lo)/(hi-lo),z=[0];
      for(let r=0;r<rows;r++){
        const mid=margin+r*rowPitch+halfHeight;
        z.push(mid+low0+(low1-low0)*t,mid+high0+(high1-high0)*t);
      }
      return [...z,depth];
    };
    for(let i=0;i<indices.length;i+=3){
      const triangle=indices.slice(i,i+3).map(j=>poly[j]);
      const face=clip(clip(triangle,lo,true),hi,false);
      const zs=face.map(levels);
      for(let k=1;k+1<face.length;k++){
        const corners=[0,k,k+1];
        const [a,b,c]=corners.map(j=>face[j]);
        if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-12)continue;
        for(let layer=0;layer<zs[0].length;layer++){
          if(!active&&layer!==0&&layer!==zs[0].length-1)continue;
          const surface=corners.map(j=>lift(face[j],zs[j][layer]));
          mesh.push(layer%2?surface:surface.reverse());
        }
      }
    }
    for(let i=0;i<poly.length;i++){
      let a=poly[i],b=poly[(i+1)%poly.length];
      if(Math.max(a[axis],b[axis])<lo||Math.min(a[axis],b[axis])>hi)continue;
      if(a[axis]<lo)a=at(a,b,lo);else if(a[axis]>hi)a=at(a,b,hi);
      if(b[axis]<lo)b=at(a,b,lo);else if(b[axis]>hi)b=at(a,b,hi);
      if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-10)continue;
      if(a[axis]===hi&&b[axis]===hi&&s+2<stations.length)continue;
      const za=levels(a),zb=levels(b);
      for(let k=0;k<za.length;k+=2){
        const p=lift(a,za[k]),q=lift(b,zb[k]),v=lift(b,zb[k+1]),w=lift(a,za[k+1]);
        mesh.push([p,q,v],[p,v,w]);
      }
    }
  }
  return mesh;
}

function squiggleHolder(c,m,guards=true,enforceWidth=true,{includeCells=false,buildReinforcement=false}={}) {
  const rails=c.sqStyle==='rails',depth=rails?c.sqRailLength:c.sqDepth;
  const ventWidth=rails?c.sqVentWidth:c.sqCapVentWidth;
  if(rails&&depth>c.len+.001)throw Error('Choose a strip length at or below the cell length ('+fmt(c.len)+' mm).');
  if(!rails&&!c.sqGroupsOnly&&c.pattern==='regular')throw Error('Choose an offset row pattern for a squiggle spacer.');
  if(!rails&&c.sqOpening>=c.d)throw Error('Terminal opening must be smaller than the cell diameter.');
  if(c.sqWall>=c.d/3)throw Error('Squiggle wall is too thick for this cell diameter.');
  if(ventWidth>0){
    // Check the actual bank centers, including custom shifts and imported layouts.
    const pitch=c.d+c.sqWall,bins=new Map();
    for(const cell of m.cells){
      const x=Math.floor(cell.u/pitch),y=Math.floor(cell.v/pitch);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        const nearby=bins.get([x+dx,y+dy].join('/'))||[];
        if(nearby.some(p=>(c.sqDirection==='columns'?p.k!==cell.k:p.r!==cell.r)&&Math.hypot(p.u-cell.u,p.v-cell.v)<pitch-.0001))
          throw Error('Vented walls need room for the wall between cells. Increase the row or cell gap, or reduce the row offset.');
      }
      const key=[x,y].join('/');
      if(!bins.has(key))bins.set(key,[]);
      bins.get(key).push(cell);
    }
  }
  const activeByRow=[];
  for(let r=0;r<c.rows;r++)activeByRow.push(m.cells.filter(cell=>cell.r===r).sort((a,b)=>a.u-b.u));
  if(!c.sqGroupsOnly&&activeByRow.some(row=>row.length!==c.cols))throw Error('Squiggle export needs equal, complete rows with no omitted cells.');
  const R=c.d/2,wall=c.sqWall,steps=32;
  const minU=Math.min(...m.cells.map(p=>p.u-R)),maxU=Math.max(...m.cells.map(p=>p.u+R));
  const minV=Math.min(...m.cells.map(p=>p.v-R)),maxV=Math.max(...m.cells.map(p=>p.v+R));
  const outsideWidth=maxU-minU;
  if(enforceWidth&&outsideWidth>c.sqMaxWidth+1e-6)
    throw Error('Physical cells require '+fmt(outsideWidth)+' mm; width limit is '+fmt(c.sqMaxWidth)+' mm. Reduce the row shift, gap, diameter or cells per row.');
  const xy=point=>[point[0]-minU,point[1]-minV];
  const circle=(cx,cy,r,n=steps,phase=0)=>Array.from({length:n},(_,i)=>{
    const a=phase+2*Math.PI*i/n;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];
  });
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  function hull(points){
    const p=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lower=[],upper=[];
    for(const q of p){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q);}
    for(const q of [...p].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q);}
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  }
  let outline=hull(m.cells.flatMap(cell=>circle(cell.u,cell.v,R,steps)).map(xy));
  const holes=m.cells.map(cell=>circle(cell.u-minU,cell.v-minV,c.sqOpening/2,steps,.17));
  function loopStrip(loop,z0,z1,reverse=false){
    const out=[];
    for(let i=0;i<loop.length;i++){
      const j=(i+1)%loop.length,a=[...loop[i],z0],b=[...loop[j],z0],d=[...loop[i],z1],e=[...loop[j],z1];
      for(const tri of [[a,b,e],[a,e,d]])out.push(reverse?tri.reverse():tri);
    }
    return out;
  }
  function prismRegion(outer,inner,z0,z1){
    const out=[],points=outer.concat(...inner),starts=[];let n=outer.length;
    for(const hole of inner){starts.push(n);n+=hole.length;}
    const indices=earcut(points.flat(),starts);
    for(let i=0;i<indices.length;i+=3){
      const bottom=indices.slice(i,i+3).map(k=>[...points[k],z0]);
      const top=indices.slice(i,i+3).map(k=>[...points[k],z1]);
      out.push(bottom.reverse(),top);
    }
    out.push(...loopStrip(outer,z0,z1));
    for(const hole of inner)out.push(...loopStrip(hole,z0,z1,true));
    return out;
  }
  function ribbon(path,thickness){
    const upper=[],lower=[],half=thickness/2;
    path.forEach((p,i)=>{
      const previous=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)];
      const normal=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1;return [-dy/length,dx/length];};
      const before=normal(previous,p),after=normal(p,next);let nx,ny,amount=half;
      if(i===0)[nx,ny]=after;
      else if(i===path.length-1)[nx,ny]=before;
      else{
        nx=before[0]+after[0];ny=before[1]+after[1];const length=Math.hypot(nx,ny)||1;nx/=length;ny/=length;
        amount=Math.min(half*2.5,half/Math.max(.4,nx*after[0]+ny*after[1]));
      }
      upper.push([p[0]+nx*amount,p[1]+ny*amount]);lower.push([p[0]-nx*amount,p[1]-ny*amount]);
    });
    return upper.concat(lower.reverse());
  }
  const prism=(poly,z0,z1)=>prismRegion(poly,[],z0,z1);
  function cylinder(cx,cy,r,z0,z1,n=48){
    const out=[],bottom=[cx,cy,z0],top=[cx,cy,z1];
    for(let i=0;i<n;i++){
      const a=2*Math.PI*i/n,b=2*Math.PI*(i+1)/n;
      const p0=[cx+r*Math.cos(a),cy+r*Math.sin(a),z0],p1=[cx+r*Math.cos(b),cy+r*Math.sin(b),z0];
      const q0=[p0[0],p0[1],z1],q1=[p1[0],p1[1],z1];
      out.push([bottom,p1,p0],[top,q0,q1],[p0,p1,q1],[p0,q1,q0]);
    }
    return out;
  }
  function cubic(a,b,c,d,n=14){
    return Array.from({length:n},(_,i)=>{const t=i/(n-1),q=1-t;return [q*q*q*a[0]+3*q*q*t*b[0]+3*q*t*t*c[0]+t*t*t*d[0],q*q*q*a[1]+3*q*q*t*b[1]+3*q*t*t*c[1]+t*t*t*d[1]];});
  }
  function smoothBetween(a,b,n=18){
    return Array.from({length:n},(_,i)=>{const t=i/(n-1),blend=(1-Math.cos(Math.PI*t))/2;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*blend];});
  }
  function boundaryPath(rowA,rowB){
    if(rowA[0].v>rowB[0].v)[rowA,rowB]=[rowB,rowA];
    const aMin=rowA[0].u-R,aMax=rowA.at(-1).u+R,bMin=rowB[0].u-R,bMax=rowB.at(-1).u+R;
    const middle=(rowA[0].v+rowB[0].v)/2,amplitude=R*(1-Math.sqrt(3)/2);
    const controls=[...rowA.map(cell=>[cell.u,middle+amplitude]),...rowB.map(cell=>[cell.u,middle-amplitude])].sort((a,b)=>a[0]-b[0]);
    const core=[];for(let i=0;i<controls.length-1;i++)core.push(...smoothBetween(controls[i],controls[i+1]).slice(i?1:0));
    const leftCell=aMin<bMin?rowA[0]:rowB[0],rightCell=aMax>bMax?rowA.at(-1):rowB.at(-1);
    const l0=[Math.min(aMin,bMin)+wall/2,leftCell.v],l3=core[0],ldx=l3[0]-l0[0];
    const r0=core.at(-1),r3=[Math.max(aMax,bMax)-wall/2,rightCell.v],rdx=r3[0]-r0[0];
    const leftWrap=cubic(l0,[l0[0],l0[1]+(l3[1]-l0[1])*.65],[l3[0]-ldx*.28,l3[1]],l3);
    const rightWrap=cubic(r0,[r0[0]+rdx*.28,r0[1]],[r3[0],r3[1]+(r0[1]-r3[1])*.65],r3);
    return leftWrap.slice(0,-1).concat(core,rightWrap.slice(1));
  }
  function columnBoundary(k){
    const controls=activeByRow.map(row=>[(row[k].u+row[k+1].u)/2,(row[k].v+row[k+1].v)/2]);
    const core=[];for(let i=0;i<controls.length-1;i++)core.push(...smoothBetween(controls[i],controls[i+1]).slice(i?1:0));
    const radius=R-wall/2,kappa=.55228475,topCell=activeByRow[0][k],bottomCell=activeByRow.at(-1)[k];
    const top=[topCell.u,topCell.v-radius],topJoin=core[0];
    const topWrap=cubic(top,[top[0]+kappa*radius,top[1]],[topJoin[0],topJoin[1]-kappa*radius],topJoin);
    const bottomJoin=core.at(-1),bottom=[bottomCell.u,bottomCell.v+radius];
    const bottomWrap=cubic(bottomJoin,[bottomJoin[0],bottomJoin[1]+kappa*radius],[bottom[0]+kappa*radius,bottom[1]],bottom);
    return topWrap.slice(0,-1).concat(core,bottomWrap.slice(1));
  }
  function columnGuard(right){
    const radius=R-wall/2,kappa=.55228475,cells=activeByRow.map(row=>right?row.at(-1):row[0]);
    const controls=cells.map(cell=>[cell.u+(right?radius:-radius),cell.v]),core=[];
    for(let i=0;i<controls.length-1;i++)core.push(...smoothBetween(controls[i],controls[i+1]).slice(i?1:0));
    const topCell=cells[0],bottomCell=cells.at(-1),top=[topCell.u,topCell.v-radius],topJoin=core[0];
    const topWrap=cubic(top,[top[0]+(right?1:-1)*kappa*radius,top[1]],[topJoin[0],topJoin[1]-kappa*radius],topJoin);
    const bottomJoin=core.at(-1),bottom=[bottomCell.u,bottomCell.v+radius];
    const bottomWrap=cubic(bottomJoin,[bottomJoin[0],bottomJoin[1]+kappa*radius],[bottom[0]+(right?1:-1)*kappa*radius,bottom[1]],bottom);
    return topWrap.slice(0,-1).concat(core,bottomWrap.slice(1));
  }
  function outsideGuard(row,top){
    const path=[],radius=R-wall/2,amplitude=R*(1-Math.sqrt(3)/2),first=row[0],last=row.at(-1),half=steps/2;
    for(let i=0;i<=half;i++){const angle=top?Math.PI+Math.PI/2*i/half:Math.PI-Math.PI/2*i/half;path.push([first.u+radius*Math.cos(angle),first.v+radius*Math.sin(angle)]);}
    const start=first.u,end=last.u,samples=Math.max(32,(row.length-1)*steps);
    for(let i=1;i<=samples;i++){const x=start+(end-start)*i/samples,phase=2*Math.PI*(x-first.u)/(c.d+c.gap);path.push([x,first.v+(top?-1:1)*(radius-amplitude*(1-Math.cos(phase)))]);}
    for(let i=1;i<=half;i++){const angle=top?3*Math.PI/2+Math.PI/2*i/half:Math.PI/2-Math.PI/2*i/half;path.push([last.u+radius*Math.cos(angle),last.v+radius*Math.sin(angle)]);}
    return path;
  }
  const height=maxV-minV;
  // Top in the flat-bank diagram points toward increasing V.
  const lowV=c.axis==='vertical'?c.sqTop:c.sqBottom,highV=c.axis==='vertical'?c.sqBottom:c.sqTop;
  function clipEdges(poly,depth){
    const left=c.sqLeft?depth:0,right=outsideWidth-(c.sqRight?depth:0);
    const bottom=lowV?depth:0,top=height-(highV?depth:0);
    const scale=10000,toPath=pts=>pts.map(([x,y])=>({X:Math.round(x*scale),Y:Math.round(y*scale)}));
    const clip=new ClipperLib.Clipper(),result=[];
    clip.AddPath(toPath(poly),ClipperLib.PolyType.ptSubject,true);
    clip.AddPath(toPath([[left,bottom],[right,bottom],[right,top],[left,top]]),ClipperLib.PolyType.ptClip,true);
    clip.Execute(ClipperLib.ClipType.ctIntersection,result,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
    return result.map(path=>path.map(p=>[p.X/scale,p.Y/scale]));
  }
  const fullOutline=outline;
  const trimming=c.sqLeft||c.sqRight||lowV||highV;
  if(!rails&&trimming&&c.sqTrimSheet){
    const sheetCut=Math.max(0,R-c.sqOpening/2-wall);
    if(sheetCut>0)outline=clipEdges(outline,sheetCut)[0];
  }
  // Clip each cell's nearest-center region. An interior edge belongs to two
  // neighbors; keep one wall only when those neighbors need separation.
  function groupWalls(){
    const centers=m.cells.map(cell=>[cell.u-minU,cell.v-minV]);
    for(let i=0;i<centers.length;i++){
      const [x,y]=centers[i];
      let poly=fullOutline.map(([u,v])=>({u,v,neighbor:-1}));
      for(let j=0;j<centers.length&&poly.length;j++){
        if(j===i)continue;
        const dx=centers[j][0]-x,dy=centers[j][1]-y,limit=(dx*dx+dy*dy)/2;
        const dist=p=>(p.u-x)*dx+(p.v-y)*dy-limit;
        const next=[];
        for(let k=0;k<poly.length;k++){
          const a=poly[(k+poly.length-1)%poly.length],b=poly[k],da=dist(a),db=dist(b);
          if((da<=0)!==(db<=0)){
            const t=da/(da-db);
            next.push({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t,neighbor:da>0?j:b.neighbor});
          }
          if(db<=0)next.push(b);
        }
        poly=next;
      }
      for(let k=0;k<poly.length;k++){
        const b=poly[k],a=poly[(k+poly.length-1)%poly.length],j=b.neighbor;
        if(j<0?!guards:j<=i||(m.cells[i].seriesGroup&&m.cells[i].seriesGroup===m.cells[j].seriesGroup))continue;
        if(Math.hypot(a.u-b.u,a.v-b.v)<.001)continue;
        if(j>=0&&Math.hypot(x-centers[j][0],y-centers[j][1])<c.d+wall-.001)
          throw Error('Two different groups are too close for this wall. Increase the cell or row gap.');
        wallPolygons.push(ribbon([[a.u,a.v],[b.u,b.v]],wall));
      }
    }
  }
  const zPlate=c.sqDepth-.01,components=rails?[]:[prismRegion(outline,holes,zPlate,zPlate+c.sqFace)],wallPolygons=[];
  if(c.sqGroupsOnly){
    groupWalls();
  }else if(rails&&(c.pattern==='regular'||(c.sqDirection==='columns'&&c.rows===1))){
    const columns=c.sqDirection==='columns',lines=columns?activeByRow[0]:activeByRow.map(row=>row[0]);
    for(let i=0;i<=lines.length;i++){
      if(!guards&&(i===0||i===lines.length))continue;
      const centers=lines.map(cell=>columns?cell.u-minU:cell.v-minV);
      const pos=i===0?centers[0]-R+wall/2:i===lines.length?centers[i-1]+R-wall/2:(centers[i-1]+centers[i])/2;
      wallPolygons.push(ribbon(columns?[[pos,0],[pos,height]]:[[0,pos],[outsideWidth,pos]],wall));
    }
  }else if(c.sqDirection==='columns'){
    for(let k=0;k<c.cols-1;k++)wallPolygons.push(ribbon(columnBoundary(k).map(xy),wall));
    if(guards){wallPolygons.push(ribbon(columnGuard(false).map(xy),wall));wallPolygons.push(ribbon(columnGuard(true).map(xy),wall));}
  }else{
    for(let r=0;r<activeByRow.length-1;r++)wallPolygons.push(ribbon(boundaryPath(activeByRow[r],activeByRow[r+1]).map(xy),wall));
    if(guards){wallPolygons.push(ribbon(outsideGuard(activeByRow[0],true).map(xy),wall));wallPolygons.push(ribbon(outsideGuard(activeByRow.at(-1),false).map(xy),wall));}
  }
  const cutDepth=Math.min(R*.8,(outsideWidth-wall)/2,(height-wall)/2);
  const finishedWalls=wallPolygons.flatMap(poly=>clipEdges(poly,trimming?cutDepth:0));
  let ventedCount=0;
  for(const polygon of finishedWalls){
    const mesh=ventWidth>0?ventedRail(polygon,depth,ventWidth,c.sqVentShape,!rails):null;
    if(mesh)ventedCount++;
    components.push(mesh||prism(polygon,0,depth));
  }
  if(ventWidth>0&&!ventedCount)throw Error('Walls too small for this opening and its end bands. Reduce vent width or increase wall depth.');
  const rounded=c.sqRootStyle==='fillet';
  const chamfer=!rails&&(rounded||c.sqRootStyle==='chamfer')?c.sqRootChamfer||0:0;
  if(chamfer&&chamfer>=zPlate)throw Error('Choose a reinforcement size smaller than the wall depth.');
  if(chamfer&&buildReinforcement){
    // Build the sloping foot around each wall. Intersect its footprint with the
    // trimmed terminal sheet so the bevel stops at its edges and openings.
    const scale=10000;
    const path=poly=>poly.map(([x,y])=>({X:Math.round(x*scale),Y:Math.round(y*scale)}));
    const coords=loop=>loop.map(p=>[p.X/scale,p.Y/scale]);
    const lib=ClipperLib,fill=lib.PolyFillType.pftEvenOdd;
    const sheet=[path(outline),...holes.map(path)];
    for(const poly of finishedWalls){
      const original=path(poly),offset=new lib.ClipperOffset();
      offset.AddPath(original,lib.JoinType.jtMiter,lib.EndType.etClosedPolygon);
      // Sample a quarter circle at equal angles. A chamfer uses one straight span.
      const bands=rounded?6:1;
      let previous=[original];
      for(let band=1;band<=bands;band++){
        const reach=rounded?chamfer*(1-Math.cos(band*Math.PI/(2*bands))):chamfer;
        const expanded=[];offset.Execute(expanded,reach*scale);
        const clip=new lib.Clipper(),tree=new lib.PolyTree();
        clip.AddPaths([...expanded,...previous],lib.PolyType.ptSubject,true);
        clip.AddPaths(sheet,lib.PolyType.ptClip,true);
        clip.Execute(lib.ClipType.ctIntersection,tree,fill,fill);
        previous=expanded;
        for(let node=tree.GetFirst();node;node=node.GetNext()){
          if(node.IsHole())continue;
          const outer=coords(node.Contour()),inner=node.Childs().map(h=>coords(h.Contour()).reverse());
          const surface=prismRegion(outer,inner,0,1),heights=new Map();
          for(const v of new Set(surface.flat())){
            if(v[2]===1){v[2]=zPlate+.005;continue;}
            const key=v[0]+','+v[1];
            if(!heights.has(key)){
              let distance=chamfer;
              for(let k=0;k<poly.length;k++){
                const a=poly[k],b=poly[(k+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1];
                const t=Math.max(0,Math.min(1,((v[0]-a[0])*dx+(v[1]-a[1])*dy)/(dx*dx+dy*dy)));
                distance=Math.min(distance,Math.hypot(v[0]-a[0]-t*dx,v[1]-a[1]-t*dy));
              }
              const rise=rounded?Math.sqrt(Math.max(0,chamfer**2-(chamfer-distance)**2)):distance;
                heights.set(key,zPlate-chamfer+rise);
            }
            v[2]=heights.get(key);
          }
          components.push(surface);
        }
      }
    }
  }
  if(!components.length)throw Error('No spacer walls in this bank. Enable the outer wrap or select another separator direction.');
  if(includeCells){
    const cellTop=rails?(depth+c.len)/2:c.sqDepth,cellBottom=cellTop-c.len;
    for(const cell of m.cells)components.push(cylinder(cell.u-minU,cell.v-minV,R,cellBottom,cellTop));
  }
  return {components,triangles:components.flat(),outsideWidth,height:maxV-minV+wall/2,wallPolygons:finishedWalls,outline,holes,minU,minV};
}

function binarySTL(triangles) {
  const data=new ArrayBuffer(84+50*triangles.length), view=new DataView(data);
  view.setUint32(80,triangles.length,true);
  let offset=84;
  for(const [a,b,c] of triangles){
    const u=b.map((x,i)=>x-a[i]), v=c.map((x,i)=>x-a[i]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const norm=Math.hypot(...normal);
    for(const value of [...normal.map(x=>x/norm),...a,...b,...c]){
      view.setFloat32(offset,value,true); offset+=4;
    }
    offset+=2;
  }
  return data;
}

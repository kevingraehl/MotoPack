// Sketch coordinates are right/down in the editor. Assembly coordinates are X/Z, with Y across the bike.
let caseSketch = null;
const sketchArea = p => p.reduce((a,v,i) => {const w=p[(i+1)%p.length];return a+v[0]*w[1]-v[1]*w[0];},0)/2;
function sketchBounds(points) {
  const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
  for(const p of points)for(let i=0;i<2;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}
  return {lo,hi,w:hi[0]-lo[0],h:hi[1]-lo[1]};
}
function pathDistance(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function segmentsCross(a,b,c,d){
  const cross=(u,v,w)=>(v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0]);
  return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
}
function cleanLoop(raw,epsilon=.00001){
  const p=[];
  for(const v of raw)if(!p.length||Math.hypot(v[0]-p.at(-1)[0],v[1]-p.at(-1)[1])>epsilon)p.push(v);
  if(p.length>1&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<=epsilon)p.pop();
  let i=0;
  while(p.length>3&&i<p.length){if(pathDistance(p[i],p[(i+p.length-1)%p.length],p[(i+1)%p.length])<=epsilon){p.splice(i,1);i=Math.max(0,i-1);}else i++;}
  return p;
}
function validateCaseSketch(d){
  if(!d)return;
  const p=d.points;
  if(!Array.isArray(p)||p.length<3||p.length>1500||!p.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite))||!Number.isFinite(d.scale)||d.scale<=0)throw Error('Draw and scale a closed outline first.');
  const b=sketchBounds(p);
  if([b.h*d.scale,b.w*d.scale].some(v=>v<10||v>1000.000001))throw Error('The scaled case length and height must each be 10–1000 mm.');
  if(Math.abs(sketchArea(p))*d.scale*d.scale<1)throw Error('The outline needs an enclosed area.');
  for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++){
    if(!i&&j===p.length-1)continue;
    const a=p[i],b=p[(i+1)%p.length],c=p[j],e=p[(j+1)%p.length];
    if(segmentsCross(a,b,c,e)||[pathDistance(a,c,e),pathDistance(b,c,e),pathDistance(c,a,b),pathDistance(e,a,b)].some(n=>n*d.scale<.000001))throw Error('The outline crosses or touches itself. Move or remove the crossing points.');
  }
  if(d.image&&(!/^data:image\/(?:jpeg|png|webp);base64,/.test(d.image.url)||![d.image.w,d.image.h].every(n=>Number.isFinite(n)&&n>0)))throw Error('Invalid sketch reference.');
  if(d.loops&&(!Array.isArray(d.loops)||!d.loops.every(loop=>Array.isArray(loop)&&loop.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(Number.isFinite)))))throw Error('Invalid source contours.');
  if(d.step){
    const mesh=d.step;
    if(![mesh.lo,mesh.hi].every(bound=>Array.isArray(bound)&&bound.length===3&&bound.every(Number.isFinite)))throw Error('Invalid STEP bounds.');
    if(!['XY','YZ','XZ'].includes(d.plane)||!Array.isArray(mesh.v)||mesh.v.length%3||!mesh.v.every(Number.isFinite)||!Array.isArray(mesh.i)||mesh.i.length%3||!mesh.i.every(i=>Number.isInteger(i)&&i>=0&&3*i<mesh.v.length))throw Error('Invalid STEP reference mesh.');
  }
}
function sketchTransform(d){
  const radians=(d.angle||0)*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  const rotate=([x,y])=>[(x*cos+y*sin)*d.scale,(x*sin-y*cos)*d.scale];
  const bounds=sketchBounds(d.points.map(rotate));
  return p=>rotate(p).map((value,i)=>value-bounds.lo[i]);
}
function caseProfile(d){
  const ring=d.points.map(sketchTransform(d));
  if(sketchArea(ring)<0)ring.reverse();
  return ring;
}
function rectangleInProfile(p,x0,z0,x1,z1){
  const rect=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
  let touch=false;
  for(const q of rect){
    let inside=false,on=false;
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length];
      if(pathDistance(q,a,b)<=.00001)on=true;
      if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<a[0]+(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1]))inside=!inside;
    }
    if(!inside&&!on)return 'outside';
    touch ||= on;
  }
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length];
    if(a[0]>x0+.00001&&a[0]<x1-.00001&&a[1]>z0+.00001&&a[1]<z1-.00001)return 'outside';
    for(let j=0;j<4;j++)if(segmentsCross(a,b,rect[j],rect[(j+1)%4]))return 'outside';
  }
  return touch?'touching':'clear';
}
function stepAxes(plane){return plane==='YZ'?[1,2,0,-1]:plane==='XY'?[0,1,2,-1]:[0,2,1,1];}
const stepGeometryCache=new WeakMap();
function outsideSketchContour(inner,wall){
  const offset=new ClipperLib.ClipperOffset(3);
  offset.AddPath(inner.map(([x,y])=>({X:Math.round(x*10000),Y:Math.round(y*10000)})),ClipperLib.JoinType.jtMiter,ClipperLib.EndType.etClosedPolygon);
  const result=[];offset.Execute(result,wall*10000);
  if(result.length!==1)throw Error('The side wall closes a narrow feature. Reduce wall thickness.');
  const outer=result[0].map(({X,Y})=>[X/10000,Y/10000]);if(sketchArea(outer)<0)outer.reverse();
  return outer;
}
function fixedCaseMesh(c,s,plate=null){
  const d=caseSketch;
  const depth=d.endFace?c.length:c.width;
  const world=([x,y,z])=>d.endFace?[depth-y,x,z]:[x,y,z];
  if(d.step&&d.original){
    const cached=stepGeometryCache.get(d);if(cached?.depth===depth)return cached.tris;
    const transform=sketchTransform(d),[u,v,n,sign]=stepAxes(d.plane),m=d.step;
    const middle=(m.lo[n]+m.hi[n])/2,vertices=[],side=d.reverse?-1:1;
    for(let i=0;i<m.v.length;i+=3){
      const [x,z]=transform([side*m.v[i+u],-m.v[i+v]]);
      vertices.push(world([x,(m.v[i+n]-middle)*sign*side*d.scale+depth/2,z]));
    }
    const tris=[];for(let i=0;i<m.i.length;i+=3)tris.push([vertices[m.i[i]],vertices[m.i[i+1]],vertices[m.i[i+2]]]);
    stepGeometryCache.set(d,{depth,tris});return tris;
  }
  const inner=s.profile,outer=outsideSketchContour(inner,c.wall);
  const triangles=[],xyz=([x,z],y)=>world([x,y,z]);
  function face(rings,y,positive){
    const flat=rings.flat(),indices=earcut(flat.flat(),rings.length>1?[rings[0].length]:undefined,2);
    for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3).map(k=>flat[k]);if((sketchArea(tri)>0)===positive)tri.reverse();triangles.push(tri.map(p=>xyz(p,y)));}
  }
  function shellStrip(ring,y0,y1){
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];triangles.push([xyz(a,y0),xyz(a,y1),xyz(b,y1)],[xyz(a,y0),xyz(b,y1),xyz(b,y0)]);}
  }
  if(plate!==null){
    const low=plate===0?-c.base:depth,high=low+c.base;
    face([outer],low,false);face([outer],high,true);shellStrip(outer,low,high);
    return triangles;
  }
  const lowClosed=casePanelMode(c,0,true)==='attached',highClosed=casePanelMode(c,1,true)==='attached';
  const low=lowClosed?-c.base:0,high=highClosed?depth+c.base:depth;
  if(lowClosed){face([outer],low,false);face([inner],0,true);}else face([outer,inner],0,false);
  if(highClosed){face([outer],high,true);face([inner],depth,false);}else face([outer,inner],depth,true);
  shellStrip(outer,low,high);shellStrip(inner,depth,0);
  return triangles;
}
function diskInProfile(p,x,z,r){
  let inside=false,nearest=Infinity;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length];
    nearest=Math.min(nearest,pathDistance([x,z],a,b));
    if((a[1]>z)!==(b[1]>z)&&x<a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]))inside=!inside;
  }
  if(r===0&&nearest<.00001)return 'touching';
  if(!inside||nearest<r-.00001)return 'outside';
  return nearest<=r+.01?'touching':'clear';
}
// Find a position for a repeating bank envelope. Keep manual lower/upper reserves inside the contour.
function positionInSketch(p,w,h,maxW,maxH){
  const freeW=maxW-w,freeH=maxH-h;
  if(freeW<0||freeH<0)return [0,0];
  const fractions=[.5,.25,.75,0,1,.125,.375,.625,.875];
  for(const fv of fractions)for(const fu of fractions){
    const x=freeW*fu,z=freeH*fv;
    if(rectangleInProfile(p,x,z,x+w,z+h)!=='outside')return [x,z];
  }
  return [freeW/2,freeH/2];
}
function fillSketchSection(){
  if(!current||!endsFaceProfile(current.c))return;
  const output=$('skFillResult'),c={...current.c},profile=current.shell.profile;
  c.pattern=$('fillPattern').value;
  try{
    const relative=current.shell.relative,h=caseSketch.endFace?1:0;
    const direction=new THREE.Vector3().setComponent(h,1).transformDirection(relative);
    const angle=THREE.MathUtils.radToDeg(Math.atan2(direction.z,direction.getComponent(h)));
    const fit=buildContourPack(c,profile,{relative,angle});
    if(!fit)throw Error('No layout clears the case at this tilt and spacing. Check the cell holder outline and clearances.');
    fields.pattern.value=c.pattern;fields.rows.value=fit.c.rows;fields.cols.value=fit.c.cols;
    placements=fit.pose;
    omitted.clear();for(const id of fit.skip)omitted.add(id);
    reversedCells.clear();render();
    output.textContent=fit.count+' cell positions across '+c.banks+' bank'+(c.banks===1?'':'s')+'.';
  }catch(e){output.textContent=e.message;}
}
// Triangle bounds reject distant STEP faces. Clip nearby faces to the cell's axial span,
// then measure the distance from the cell axis to the projected, clipped polygon.
function stepCellTest(c,s){
  const tris=fixedCaseMesh(c,s),cache=stepGeometryCache.get(caseSketch);
  function tree(items){
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const t of items)for(const p of t)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],p[j]);hi[j]=Math.max(hi[j],p[j]);}
    if(items.length<=24)return {lo,hi,items};
    const spans=hi.map((v,j)=>v-lo[j]),a=spans.indexOf(Math.max(...spans)),mid=(lo[a]+hi[a])/2,left=[],right=[];
    for(const t of items)((t[0][a]+t[1][a]+t[2][a])/3<mid?left:right).push(t);
    if(!left.length||!right.length)return {lo,hi,items};
    return {lo,hi,left:tree(left),right:tree(right)};
  }
  let index;
  if(s.posed){
    const inverse=s.relative.clone().invert(),key=inverse.elements.join(',');
    if(cache.poseKey!==key){cache.poseTree=tree(tris.map(t=>t.map(p=>placedPoint(inverse,p))));cache.poseKey=key;}
    index=cache.poseTree;
  }else index=cache.tree??=tree(tris);
  const {a:axis,u,v}=cellBases[c.axis];
  function crosses(t,xyz,r,l){
    let p=t;
    for(const sign of [-1,1]){
      const boundary=xyz[axis]+sign*l,q=[];
      for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length],da=(a[axis]-boundary)*sign,db=(b[axis]-boundary)*sign;
        if(da<=0)q.push(a);
        if((da<=0)!==(db<=0)){const f=da/(da-db);q.push(a.map((value,j)=>value+f*(b[j]-value)));}
      }
      p=q;if(!p.length)return false;
    }
    const center=[xyz[u],xyz[v]],outline=p.map(a=>[a[u],a[v]]);
    let inside=false;
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length];
      if(pathDistance(center,a,b)<=r)return true;
      if((a[1]>center[1])!==(b[1]>center[1])&&center[0]<a[0]+(b[0]-a[0])*(center[1]-a[1])/(b[1]-a[1]))inside=!inside;
    }
    return inside;
  }
  function hit(node,xyz,r,l){
    for(let i=0;i<3;i++){const half=i===axis?l:r;if(xyz[i]+half<node.lo[i]||xyz[i]-half>node.hi[i])return false;}
    return node.items?node.items.some(t=>crosses(t,xyz,r,l)):hit(node.left,xyz,r,l)||hit(node.right,xyz,r,l);
  }
  return xyz=>{
    const r=c.d/2,l=c.len/2;
    if(!hit(index,xyz,r+.01,l+.01))return Infinity;
    return hit(index,xyz,r-.01,l-.01)?-1:0;
  };
}

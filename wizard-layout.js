function frameProjection(asset,rotation,name){
  const mesh=resolvedFrameAsset(asset),center=mesh.hi.map((n,i)=>(n+mesh.lo[i])/2),rot=new THREE.Euler(...rotation.map(n=>n*Math.PI/180));
  const vertices=[];
  for(let i=0;i<mesh.v.length;i+=3){
    const v=new THREE.Vector3(mesh.v[i]-center[0],mesh.v[i+1]-center[1],mesh.v[i+2]-center[2]).applyEuler(rot);
    vertices.push([v.x,-v.z]);
  }
  const bounds=sketchBounds(vertices),scale=Math.max(bounds.w,bounds.h)/1100;
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(bounds.w/scale)+20;canvas.height=Math.ceil(bounds.h/scale)+20;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f7f4';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#53645e';
  const project=([x,y])=>[(x-bounds.lo[0])/scale+10,(y-bounds.lo[1])/scale+10];
  const px=vertices.map(project);
  for(let i=0;i<mesh.i.length;i+=3){
    ctx.beginPath();ctx.moveTo(...px[mesh.i[i]]);ctx.lineTo(...px[mesh.i[i+1]]);ctx.lineTo(...px[mesh.i[i+2]]);ctx.fill();
  }
  return {drawing:{points:[],loops:[],scale,scaleSource:'cad',closed:false,endFace:false,autoPlace:true,image:sketchRaster(canvas),name},center:project([0,0])};
}
function motorOutlineAsset(d,depth){
  const profile=caseProfile(d),shape=new THREE.Shape(profile.map(p=>new THREE.Vector2(...p)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});
  geometry.rotateX(Math.PI/2);geometry.computeBoundingBox();
  const v=Array.from(geometry.attributes.position.array),bounds=geometry.boundingBox;
  const asset={v,i:Array.from({length:v.length/3},(_,i)=>i),lo:bounds.min.toArray(),hi:bounds.max.toArray()};
  geometry.dispose();return asset;
}

// One lattice is used for the sketch dots, the assembly and the exported holder.
function sketchPackConfig(d,base,banks){
  const dia=base.d;
  const c={...base,axis:d.endFace?'flat':'cross',
    pattern:'offset',shift:50,banks,rows:1,cols:1,holderShape:'contour',mode:'inner'};
  const web=d.wizardSpacing??1;
  c.gap=c.rowGap=Math.ceil((web+(c.holder?(dia+c.slack)/Math.cos(Math.PI/48)-dia:0))*100)/100;
  if(d.entry==='top'&&d.upright){c.axis='vertical';c.holderShape='rectangle';}
  return c;
}
function flatPackDepth(c){
  const margin=c.axis==='cross'?c.left+c.right:c.front+c.rear;
  return layout({...c,rows:1,cols:1,bmsRule:'check'}).A+margin+2*(c.holderReserve+c.miscReserve);
}
function fittedLattices(profile,c,quick=false,fixedAngle=null){
  const m=layout({...c,rows:1,cols:1,bmsRule:'check'});
  const radius=c.d/2+(c.holder?Math.max(c.edgeU,c.edgeV):0)+c.holderReserve+c.miscReserve+
    Math.max(c.top,c.bottom,...(c.axis==='cross'?[c.front,c.rear]:[c.left,c.right]))+.04;
  const path=profile.map(([x,y])=>({X:Math.round(x*1000),Y:Math.round(y*1000)}));
  if(!ClipperLib.Clipper.Orientation(path))path.reverse();
  const offset=new ClipperLib.ClipperOffset(2,10);
  offset.AddPath(path,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
  const inner=[];offset.Execute(inner,-radius*1000);
  if(!inner.length)return [];
  const angles=new Set(fixedAngle!==null?[fixedAngle]:quick?[0]:Array.from({length:24},(_,i)=>i*7.5-90));
  if(!quick&&fixedAngle===null)profile.forEach(([x,y],i)=>{
    const [u,v]=profile[(i+1)%profile.length];
    if(Math.hypot(u-x,v-y)>2*c.d)angles.add(Math.round((((Math.atan2(v-y,u-x)*180/Math.PI+270)%180)-90)*10)/10);
  });
  const best=[];
  for(const deg of angles){
    const a=deg*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
    const rings=inner.map(path=>path.map(({X,Y})=>[(X*cos+Y*sin)/1000,(Y*cos-X*sin)/1000]));
    const bounds=sketchBounds(rings.flat());
    const phases=quick?[0]:[0,.33,.67];
    let winner=null;
    for(const fy of phases)for(const fx of phases){
      const cells=[],x0=bounds.lo[0]-.5*m.p+fx*m.p,y0=bounds.lo[1]+.005+fy*m.rowPitch;
      for(let r=0;r<30;r++){
        const y=y0+r*m.rowPitch+Math.floor(r/c.groupRows)*c.groupSpace;
        if(y>bounds.hi[1])break;
        const intersections=[];
        for(const ring of rings)for(let i=0;i<ring.length;i++){
          const v=ring[i],w=ring[(i+1)%ring.length];
          if((v[1]>y)!==(w[1]>y))intersections.push(v[0]+(y-v[1])*(w[0]-v[0])/(w[1]-v[1]));
        }
        intersections.sort((a,b)=>a-b);
        const start=x0+(r%2)*m.shift;
        for(let i=0;i+1<intersections.length;i+=2){
          const first=Math.max(0,Math.ceil((intersections[i]-start)/m.p)),last=Math.min(29-shortRow(c,r),Math.floor((intersections[i+1]-start)/m.p));
          for(let k=first;k<=last;k++){
            const x=start+k*m.p;
            cells.push({r,k,id:r+'-'+k,point:[x*cos-y*sin,x*sin+y*cos]});
          }
        }
      }
      if(cells.length&&(!winner||cells.length>winner.cells.length))winner={deg,cells};
    }
    if(winner)best.push(winner);
  }
  return best.sort((a,b)=>b.cells.length-a.cells.length||Math.abs(a.deg)-Math.abs(b.deg));
}
function shortRow(c,r){
  return r%2 && (c.pattern==='short'||c.pattern==='customShort') ? 1 : 0;
}
function buildContourPack(c,profile,lockedPose=null){
  if(c.axis==='vertical'||!endsFaceProfile(c)){
    const along=c.axis!=='vertical',section=along?profile.map(([x,z])=>[z,x]):profile;
    for(const candidate of uprightLayouts(section,c,caseSketch.endFace,false,along)){
      const {config}=candidate,angle=along?-candidate.angle:candidate.angle,target=along?[candidate.target[1],candidate.target[0]]:candidate.target,model=layout(config);
      if(config.holder&&holderProblem(config,model))continue;
      const pose=sketchBatteryPose(config,model,angle,[0,0,0],target),shell=makeShell(config,model,pose);
      if(shell.warnings.length||shell.cells.some(p=>p.status!=='clear')||shell.allowanceMargins.some(v=>v<-.00001))continue;
      return {c:config,count:model.count,skip:new Set(),pose,angle};
    }
    return null;
  }
  if(flatPackDepth(c)>c[c.axis==='cross'?'width':'length']+1e-6)throw Error('This layout needs '+fmt(flatPackDepth(c))+' mm of inside width. Measure the opening or choose fewer cells across.');
  for(const {deg,cells} of fittedLattices(profile,c,false,lockedPose?.angle)){
    const config={...c,cols:1+Math.max(...cells.map(p=>p.k+shortRow(c,p.r))),rows:1+Math.max(...cells.map(p=>p.r))};
    const keys=new Set(cells.map(p=>p.id)),skip=new Set(layout(config).grid.filter(p=>!keys.has(p.id)).map(p=>p.id));
    const model=layout(config,skip);
    if(config.holder&&holderProblem(config,model))continue;
    const gridCell=model.cells[0],target=cells.find(p=>p.id===gridCell.id).point;
    const local=cellXYZ(c,gridCell.u-model.u0+(c.holder?c.edgeU:0),gridCell.v-model.v0+(c.holder?c.edgeV:0),0);
    const pose=sketchBatteryPose(config,model,deg,local,target,lockedPose);
    const shell=makeShell(config,model,pose);
    if(shell.warnings.length||shell.cells.some(p=>p.status!=='clear')||shell.allowanceMargins.some(v=>v<-.00001))continue;
    return {c:config,count:model.count,skip,pose,angle:deg};
  }
  return null;
}

function sketchBatteryPose(c,m,deg,local,target,lockedPose){
  const depth=caseSketch.endFace?0:1,h=1-depth,initial=makeShell(c,m);
  const center=[m.x,m.y,m.z].map((n,i)=>initial.origin[i]+n/2);
  const relative=zeroPlacement();relative.rotation[depth]=deg*(depth===0?1:-1);
  if(lockedPose)relative.rotation=new THREE.Euler().setFromRotationMatrix(lockedPose.relative).toArray().slice(0,3).map(THREE.MathUtils.radToDeg);
  const aligned=placedPoint(placementMatrix(relative,center),local.map((n,i)=>n+initial.origin[i]));
  relative.position[h]=target[0]-aligned[h];relative.position[2]=target[1]-aligned[2];
  const matrix=initial.caseMatrix.clone().multiply(placementMatrix(relative,center));
  const pose=structuredClone(placements);
  pose.battery.position=placedPoint(matrix,center).map((n,i)=>n-center[i]);
  const rot=new THREE.Euler().setFromRotationMatrix(matrix);
  if(!lockedPose)pose.battery.rotation=[rot.x,rot.y,rot.z].map(THREE.MathUtils.radToDeg);
  return pose;
}

// Upright cells share horizontal holders. Intersect the available span at each
// polygon vertex height in a band, so a concave edge cannot cut through a bank.
function uprightLayouts(profile,c,endFace,quick=false,along=false){
  const space=endFace?c.length-c.front-c.rear:c.width-c.left-c.right;
  const pad=c.miscReserve+c.holderReserve,margin=pad+Math.max(c.top,c.bottom,...(endFace?[c.left,c.right]:[c.front,c.rear]))+.04;
  const single=layout({...c,banks:1,rows:1,cols:1,bmsRule:'check'}),sizes=[];
  for(let rows=1;rows<=30;rows++)for(let cols=1;cols<=30;cols++){
    const u=single.U+(cols-1)*single.p+(rows>1?single.p/2:0);
    const v=single.V+(rows-1)*single.rowPitch+Math.floor((rows-1)/c.groupRows)*c.groupSpace;
    if((!along&&endFace?v:u)+2*pad<=space)sizes.push({cols,rows,width:!along&&endFace?u:v,count:cols*rows});
  }
  sizes.sort((a,b)=>b.count-a.count||a.width-b.width);
  const best=[];
  for(const angle of quick?[0]:[0,10,-10,20,-20,30,-30]){
    const rad=angle*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad);
    const ring=profile.map(([x,y])=>[cs*x+sn*y,cs*y-sn*x]),bounds=sketchBounds(ring);
    function spans(y){
      const xs=[];
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length];
        if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      xs.sort((a,b)=>a-b);
      return xs.filter((_,i)=>i%2===0).map((x,i)=>[x,xs[2*i+1]]);
    }
    for(let banks=1;banks<=12;banks++){
      const height=banks*single.A+(banks-1)*single.axialSheet;
      if(height+2*margin>bounds.h)break;
      let winner=null;
      for(let z=bounds.lo[1]+margin+.01;z+height+margin<bounds.hi[1];z+=quick?10:4){
        const low=z-margin,high=z+height+margin;
        let slots=spans(low);
        const levels=[high,...ring.filter(p=>p[1]>low&&p[1]<high).flatMap(p=>[Math.max(low,p[1]-.001),Math.min(high,p[1]+.001)])];
        for(const y of levels){
          const cuts=spans(y);slots=slots.flatMap(([l,r])=>cuts.map(([a,b])=>[Math.max(a,l),Math.min(b,r)]).filter(([a,b])=>b>a));
          if(!slots.length)break;
        }
        for(const [l,r] of slots){
          const fit=sizes.find(s=>s.width+2*margin<=r-l);
          if(!fit||winner&&fit.count*banks<=winner.count)continue;
          const x=(l+r-fit.width)/2,target=[x*cs-z*sn,x*sn+z*cs];
          winner={config:{...c,cols:fit.cols,rows:fit.rows,banks},count:fit.count*banks,angle,target};
        }
      }
      if(winner)best.push(winner);
    }
  }
  return best.sort((a,b)=>b.count-a.count||Math.abs(a.angle)-Math.abs(b.angle));
}

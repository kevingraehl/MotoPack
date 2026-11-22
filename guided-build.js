// The motor and the outline use the same calibrated side-view coordinate system.
function guidedMotorBoard(){
  const board=$('motorBoard'),glyph=$('motorDrawing'),background=$('motorBackground');
  let reference=null,motor=null,drag=null;
  function paint(){
    $('motorCanvasWrap').hidden=!reference||!motor;
    const view=$('referenceView');view.toggleAttribute('hidden',!reference);
    $('emptyHint').hidden=!!reference;
    if(!reference){$('referenceBackdrop').removeAttribute('href');$('referenceMotor').removeAttribute('href');return;}
    const {image,scale}=reference;
    for(const svg of [board,view])svg.setAttribute('viewBox',[0,0,image.w,image.h].join(' '));
    for(const img of [background,$('referenceBackdrop')]){
      for(const [key,value] of Object.entries({href:image.url,width:image.w,height:image.h}))img.setAttribute(key,value);
    }
    if(!motor){$('referenceMotor').removeAttribute('href');return;}
    const w=motor.width/scale,h=motor.height/scale;
    for(const img of [glyph,$('referenceMotor')]){
      for(const [key,value] of Object.entries({href:motor.preview,x:-w/2,y:-h/2,width:w,height:h,transform:'translate('+motor.point.join(' ')+') rotate('+motor.angle+')'}))img.setAttribute(key,value);
    }
    $('motorAngle').value=motor.angle;$('motorAngleText').value=motor.angle+'°';
  }
  board.onpointerdown=e=>{
    if(!motor||e.button!==0)return;
    board.focus();board.setPointerCapture(e.pointerId);
    const cursor=new DOMPoint(e.clientX,e.clientY).matrixTransform(board.getScreenCTM().inverse());
    drag=e.target===glyph?[motor.point[0]-cursor.x,motor.point[1]-cursor.y]:[0,0];
    move(e);
  };
  function move(e){
    if(!drag)return;
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(board.getScreenCTM().inverse());
    motor.point=[p.x+drag[0],p.y+drag[1]];paint();board.dispatchEvent(new Event('input'));
  }
  board.onpointermove=move;board.onpointerup=board.onpointercancel=()=>drag=null;
  board.onkeydown=e=>{
    const shift={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(shift&&motor){e.preventDefault();motor.point=motor.point.map((n,i)=>n+shift[i]/reference.scale);paint();board.dispatchEvent(new Event('input'));}
  };
  $('motorAngle').oninput=e=>{if(motor){motor.angle=+e.target.value;paint();}};
  return {
    get motor(){return motor;},
    setReference(d){reference=d;motor=null;paint();},
    clear(){motor=null;paint();},
    place(asset,name,placement){
      const prior=motor;
      const preview=asset.image?{preview:asset.image,width:asset.width,height:asset.height}:motorElevation(asset);
      motor={asset,name,...preview,point:placement?.point||prior?.point||[reference.image.w*.52,reference.image.h*.67],angle:placement?.angle??prior?.angle??0};
      paint();if(!placement){board.focus({preventScroll:true});board.scrollIntoView({block:'nearest'});}
    },
    restorePart(part,d){
      const tr=sketchTransform(d),o=tr([0,0]),u=tr([1,0]),v=tr([0,1]);
      const inverse=new DOMMatrix([u[0]-o[0],u[1]-o[1],v[0]-o[0],v[1]-o[1],...o]).inverse();
      const pos=inverse.transformPoint(new DOMPoint(part.position[d.endFace?1:0]-(d.frameOrigin?.[0]||0),part.position[2]-(d.frameOrigin?.[1]||0)));
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation.map(THREE.MathUtils.degToRad)));
      if(d.endFace)q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
      const x=new THREE.Vector3(1,0,0).applyQuaternion(q);
      const angle=Math.atan2(-x.z,x.x)*180/Math.PI+(d.angle||0);
      this.place(part.asset,part.name,{point:[pos.x,pos.y],angle});
      motor.basePose={angle,rotation:part.rotation.slice(),depth:part.position[d.endFace?0:1]};
    },
    stamp(d,commit,id){
      if(!motor)return;
      const [x,z]=sketchTransform(d)(motor.point).map((v,i)=>v+(d.frameOrigin?.[i]||0)),across=d.endFace?current.c.length:current.c.width;
      const pose=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(motor.angle-(d.angle||0))*Math.PI/180);
      if(d.endFace)pose.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2));
      if(motor.basePose){
        const base=new THREE.Quaternion().setFromEuler(new THREE.Euler(...motor.basePose.rotation.map(THREE.MathUtils.degToRad)));
        const axis=d.endFace?new THREE.Vector3(-1,0,0):new THREE.Vector3(0,1,0);
        pose.setFromAxisAngle(axis,(motor.angle-motor.basePose.angle)*Math.PI/180).multiply(base);
      }
      const depth=motor.basePose?.depth??across/2;
      const r=new THREE.Euler().setFromQuaternion(pose);
      commit({asset:motor.asset,role:'Motor',name:motor.name,position:d.endFace?[depth,x,z]:[x,depth,z],rotation:[r.x,r.y,r.z].map(THREE.MathUtils.radToDeg)},id);
      return selectedFrameId;
    }
  };
}
function motorElevation(asset){
  const mesh=resolvedFrameAsset(asset),width=mesh.hi[0]-mesh.lo[0],height=mesh.hi[2]-mesh.lo[2];
  if(!(width>0&&height>0))throw Error('The motor needs a side profile with measurable width and height.');
  const canvas=document.createElement('canvas'),factor=512/Math.max(width,height);
  canvas.width=Math.max(1,Math.ceil(width*factor));canvas.height=Math.max(1,Math.ceil(height*factor));
  const ctx=canvas.getContext('2d');
  for(const mark of [false,true]){
    ctx.fillStyle=mark?'#138aff':'#526681';
    for(let t=0;t<mesh.i.length;t+=3){
      if(Boolean(mesh.sprocketFaces?.[t/3])!==mark)continue;
      ctx.beginPath();
      for(let k=0;k<3;k++){
        const i=mesh.i[t+k]*3,x=(mesh.v[i]-mesh.lo[0])*factor,y=(mesh.hi[2]-mesh.v[i+2])*factor;
        if(k)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      }
      ctx.closePath();ctx.fill();
    }
  }
  return {width,height,preview:canvas.toDataURL('image/png')};
}
function initBuildLanding(){
  const welcome=$('welcome'),labels=['Gas donor','Bare frame','Motor placed','Empty case','First cell layout','Tilted offset pack','Finished conversion'];
  function select(i){
    const position=(i%4)*100/3+'% '+(i<4?0:100)+'%';
    const plate=measuredPlates[i-1];
    $('heroImage').style.backgroundImage=plate?'url('+plate+')':'';
    $('heroImage').style.backgroundSize=plate?'contain':'';
    $('heroImage').style.backgroundPosition=plate?'center':position;
    $('heroImage').setAttribute('aria-label',labels[i]+' concept render');
    $('heroCaption').textContent=labels[i]+(plate?' · scaled KTM CAD side view':' · concept render');
    [...$('buildStory').children].forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));
  }
  labels.forEach((label,i)=>{
    const btn=document.createElement('button'),thumb=document.createElement('span'),caption=document.createElement('span');
    btn.className='storyCard';thumb.className='storyImage';thumb.style.backgroundPosition=(i%4)*100/3+'% '+(i<4?0:100)+'%';
    if(measuredPlates[i-1]){thumb.style.backgroundImage='url('+measuredPlates[i-1]+')';thumb.style.backgroundSize='contain';thumb.style.backgroundPosition='center';}
    caption.textContent=label;btn.append(thumb,caption);btn.onclick=()=>select(i);$('buildStory').append(btn);
  });
  select(6);

  $('homeLink').onclick=()=>welcome.showModal();
  for(const [id,offset] of [['straightExample',false],['offsetExample',true]]){
    const cx=$(id).getContext('2d');
    for(let row=0;row<3;row++)for(let col=0;col<7;col++){
      const x=17+col*26+(offset&&row%2?13:0),y=16+row*26*(offset?Math.sqrt(3)/2:1);
      cx.beginPath();cx.arc(x,y,11,0,2*Math.PI);cx.fillStyle='#f5c542';cx.fill();
      cx.beginPath();cx.arc(x,y,6,0,2*Math.PI);cx.fillStyle='#465a74';cx.fill();
    }
  }
}

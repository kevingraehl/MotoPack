// The draft preview has its own scene and never writes to the open project.
let wizardPreviewFrame=0,wizardView;
function wizardCaseBounds(c,m){
  const pack=[m.x,m.y,m.z],min=[0,0,0],max=[...pack];
  if(c.bmsMode==='mount'){
    const dim=rotationBounds(c).dim,pos=surfaceBounds(c,m,c.bmsMount,dim,c.bmsGap);
    dim.forEach((v,i)=>{min[i]=Math.min(0,pos[i]);max[i]=Math.max(max[i],pos[i]+v);});
  }
  const near=[c.front,c.left,c.bottom],far=[c.rear,c.right,c.top];
  const inside=c.mode==='inner'?[c.length,c.width,c.high]:max.map((v,i)=>v-min[i]+near[i]+far[i]);
  const outside=[inside[0]+2*c.wall,inside[1]+2*c.wall,inside[2]+c.base];
  const start=near.map((v,i)=>(c.mode==='inner'?0:min[i])-v-(i===2?c.base:c.wall));
  return {pack,inside,outside,start};
}
function createWizardView(host){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  host.replaceChildren(renderer.domElement);
  const scene=new THREE.Scene(),model=new THREE.Group(),camera=new THREE.OrthographicCamera();
  scene.add(model,new THREE.AmbientLight(0xffffff,.8));
  const light=new THREE.DirectionalLight(0xffffff,1.1);light.position.set(1,-2,3);scene.add(light);
  const center=new THREE.Vector3();let radius=1,yaw=-.85,pitch=.5,last;
  function paint(){
    const w=host.clientWidth,h=host.clientHeight;
    if(!w||!h)return;
    renderer.setSize(w,h,false);
    const aspect=w/h,half=radius/Math.min(1,aspect);
    Object.assign(camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half,near:.01,far:10*radius+1});
    camera.position.set(Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)).multiplyScalar(3*radius).add(center);
    camera.up.set(0,0,1);camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);
  }
  host.onpointerdown=e=>{host.setPointerCapture(e.pointerId);last=[e.clientX,e.clientY];};
  host.onpointermove=e=>{if(last){yaw-=(e.clientX-last[0])*.012;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-last[1])*.012));last=[e.clientX,e.clientY];paint();}};
  host.onlostpointercapture=()=>last=null;
  const observer=new ResizeObserver(paint);observer.observe(host);
  function clear(){
    model.traverse(o=>{o.geometry?.dispose();o.material?.dispose();if(o.isInstancedMesh)o.dispose?.();});
    model.clear();renderer.clear();
  }
  function update({c,m},shell){
    clear();
    const groups=groupMap(c,m),obj=new THREE.Object3D(),color=new THREE.Color();
    const cells=new THREE.InstancedMesh(new THREE.CylinderGeometry(c.d/2,c.d/2,c.len,18),new THREE.MeshStandardMaterial({roughness:.8}),m.count);
    if(c.axis==='vertical')obj.rotation.x=Math.PI/2;
    if(c.axis==='flat')obj.rotation.z=Math.PI/2;
    let i=0;
    m.bankCells.forEach((bank,b)=>bank.forEach(p=>{
      obj.position.fromArray(cellXYZ(c,p.u-m.u0+(c.holder?c.edgeU:0),p.v-m.v0+(c.holder?c.edgeV:0),b*(c.len+(c.holder?2*c.lip:0)+m.axialSheet)+c.len/2+(c.holder?c.lip:0)));
      obj.updateMatrix();cells.setMatrixAt(i,obj.matrix);
      cells.setColorAt(i++,color.set(groupColor(groups.get(p.id+'/'+b))));
    }));
    model.add(cells);
    const origin={origin:[0,0,0]};
    if(c.holder)drawHolderEnds(model,c,m,origin,0,c.banks,[false,true]);
    if(c.squiggleOn)for(let bank=0;bank<c.banks;bank++){
      if(!m.bankCells[bank].length)continue;
      const draft=squiggleBankModel(c,m,bank);
      const spacer=squiggleHolder(draft.c,draft.m,c.squiggleGuards,false,{buildReinforcement:false});
      drawSquiggleEnds(model,c,m,origin,bank,spacer,[false,true]);
    }
    addSheetPreview(model,c,m,{origin:[0,0,0]},0,c.banks,true);
    if(c.bmsMode==='mount'){
      const dim=rotationBounds(c).dim,pos=surfaceBounds(c,m,c.bmsMount,dim,c.bmsGap);
      const box=new THREE.Mesh(new THREE.BoxGeometry(...dim),new THREE.MeshStandardMaterial({color:0x477cb8}));
      box.position.fromArray(pos.map((v,i)=>v+dim[i]/2));model.add(box);
    }
    const bounds=new THREE.Box3().setFromObject(model);
    if(c.mode==='inner'||bwPage>=5){
      const dim=shell.outside,base=new THREE.BoxGeometry(...dim);
      const box=new THREE.LineSegments(new THREE.EdgesGeometry(base),new THREE.LineBasicMaterial({color:0x829bad}));base.dispose();
      box.position.fromArray(dim.map((v,i)=>v/2+shell.start[i]));model.add(box);bounds.expandByObject(box);
    }
    bounds.getCenter(center);radius=Math.max(1,bounds.getSize(new THREE.Vector3()).length()*.54);paint();
  }
  function dispose(){observer.disconnect();clear();renderer.dispose();renderer.forceContextLoss();host.replaceChildren();host.onpointerdown=host.onpointermove=host.onlostpointercapture=null;}
  return {update,clear,dispose};
}
function queueWizardPreview(){
  cancelAnimationFrame(wizardPreviewFrame);
  wizardPreviewFrame=requestAnimationFrame(()=>{
    if(!batteryWizard.open)return;
    const host=$('bwStage'),status=$('bwLiveStatus');
    $('bwSize').textContent='Pack size unavailable'+(bwForm.elements.bwBasis.value==='cavity'?' · Inside space '+bwDimensions(['bwL','bwW','bwH'].map(bwNumber)):'');
    try{
      const invalid=[...bwForm.querySelectorAll('input[type=number]')].some(el=>!el.parentElement.closest('[hidden]')&&!el.validity.valid);
      if(invalid)throw Error('Enter a value in the highlighted field to see the layout.');
      const c=bwConfig(),plan=bwMakePlan(c,bwLayout(c));
      const shell=wizardCaseBounds(c,plan.m);
      $('bwSize').textContent='Pack '+bwDimensions(shell.pack)+' · Case outside '+bwDimensions(shell.outside)+' (L × W × H)';
      wizardView??=createWizardView(host);wizardView.update(plan,shell);
      let first=1;
      status.textContent=c.series+'S'+c.parallel+'P · '+plan.m.bankCells.map((cells,b)=>{
        const n=cells.length/c.parallel,start=first;first+=n;
        return 'Bank '+(b+1)+': '+(n?'S'+start+(n>1?'–S'+(first-1):''):'empty');
      }).join(' · ');
    }catch(error){wizardView?.clear();status.textContent=error.message;}
  });
}
document.getElementById('batteryWizard').addEventListener('close',()=>{
  cancelAnimationFrame(wizardPreviewFrame);wizardView?.dispose();wizardView=null;
});

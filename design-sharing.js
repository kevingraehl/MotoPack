// Share visible geometry only. Project records can also contain personal photos and file names.
function captureSharedGeometry(roots){
  const cells=[],solids=[],matrix=new THREE.Matrix4(),color=new THREE.Color(),point=new THREE.Vector3();
  let bytes=0;
  for(const root of roots){
    root.updateMatrixWorld(true);
    root.traverseVisible(obj=>{
      if(!obj.isMesh||obj.material.map||obj.material.opacity===0)return;
      if(obj.isInstancedMesh){
        if(!obj.userData.cellBodies)return;
        for(let i=0;i<obj.count;i++){
          obj.getMatrixAt(i,matrix);matrix.premultiply(obj.matrixWorld);
          obj.getColorAt(i,color);cells.push([...matrix.elements,color.getHex()]);
        }
        return;
      }
      const g=obj.geometry,pos=g.attributes.position,index=g.index,n=index?index.count:pos.count;
      if(!n)return;
      bytes+=n*12;
      if(bytes>8*1024*1024)throw Error('This view is too large. Hide a detailed part and try again.');
      const data=new Float32Array(n*3);
      for(let i=0;i<n;i++)point.fromBufferAttribute(pos,index?index.getX(i):i).applyMatrix4(obj.matrixWorld).toArray(data,i*3);
      const raw=new Uint8Array(data.buffer),chunks=[];
      for(let i=0;i<raw.length;i+=16384)chunks.push(String.fromCharCode(...raw.subarray(i,i+16384)));
      solids.push({points:btoa(chunks.join('')),tint:obj.material.color.getHex(),opacity:obj.material.opacity});
    });
  }
  if(!cells.length&&!solids.length)throw Error('Show at least one 3D part before sharing.');
  return {solids,cells};
}
function drawSharedDesign(host,design){
  const renderer=new THREE.WebGLRenderer({antialias:true});
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,100000);
  const bounds=new THREE.Box3(),matrix=new THREE.Matrix4();
  renderer.setClearColor(0x101a25);renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.replaceChildren(renderer.domElement);
  for(const solid of design.solids){
    const points=new Float32Array(Uint8Array.from(atob(solid.points),c=>c.charCodeAt(0)).buffer);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(points,3));geo.computeVertexNormals();geo.computeBoundingBox();bounds.union(geo.boundingBox);
    scene.add(new THREE.Mesh(geo,new THREE.MeshPhongMaterial({color:solid.tint,opacity:solid.opacity,transparent:solid.opacity<1,depthWrite:solid.opacity===1,side:THREE.DoubleSide})));
  }
  if(design.cells.length){
    const geo=new THREE.CylinderGeometry(.5,.5,1,24);geo.computeBoundingBox();
    const mesh=new THREE.InstancedMesh(geo,new THREE.MeshPhongMaterial(),design.cells.length);
    design.cells.forEach((cell,i)=>{
      matrix.fromArray(cell);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new THREE.Color(cell[16]));bounds.union(geo.boundingBox.clone().applyMatrix4(matrix));
    });mesh.frustumCulled=false;scene.add(mesh);
  }
  scene.add(new THREE.HemisphereLight(0xffffff,0x79949f,1.65));
  const light=new THREE.DirectionalLight(0xffffff,1.3);light.position.set(2,1,4);scene.add(light);
  const center=bounds.getCenter(new THREE.Vector3()),r=Math.max(1,bounds.getSize(new THREE.Vector3()).length()/2);
  let yaw=-.85,pitch=.49,drag=null;
  camera.up.set(0,0,1);
  const cell=design.cells[0],diameter=cell?Math.hypot(...cell.slice(0,3)):21;
  const lens=inspectionLens(host,()=>diameter,()=>6.8*r*Math.tan(19*Math.PI/180),paint);
  function paint(){
    const {clientWidth:w,clientHeight:h}=host;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;
    const d=3.4*r*Math.max(1,lens.scale)/Math.min(1,w/h);camera.near=Math.max(.001,r*.001);camera.far=d+3*r;lens.project(camera,w,h);
    camera.position.set(Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)).multiplyScalar(d).add(center);
    camera.lookAt(center);renderer.render(scene,camera);
  }
  host.onpointerdown=e=>{host.setPointerCapture(e.pointerId);drag=[e.clientX,e.clientY];};
  host.onpointermove=e=>{if(!drag)return;yaw-=(e.clientX-drag[0])*.01;pitch=Math.max(-1.55,Math.min(1.55,pitch+(e.clientY-drag[1])*.01));drag=[e.clientX,e.clientY];paint();};
  host.onlostpointercapture=()=>{drag=null;};

  const resize=new ResizeObserver(paint);resize.observe(host);paint();
  return ()=>{lens.dispose();resize.disconnect();host.onpointerdown=host.onpointermove=host.onwheel=host.onlostpointercapture=null;
    scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();o.dispose?.();});renderer.dispose();renderer.forceContextLoss();host.replaceChildren();};
}
(()=>{
  const share=$('shareDesign'),library=$('designLibrary'),viewer=$('sharedViewer');
  let dispose,cursor=null,viewRequest=0;
  async function api(suffix='',options){
    const response=await fetch(builderApi+'/designs'+suffix,options);
    const data=await response.json().catch(()=>({error:'Design sharing is unavailable on this host.'}));
    if(!response.ok||data.error)throw Error(data.error||'Could not load designs.');return data;
  }
  const message=e=>e.message||'Please try again.';
  $('openShare').onclick=()=>{
    $('shareTitle').value=$('projectName').value;$('shareOwner').value=localStorage.getItem('motopack.shareNickname')||'';
    $('shareScope').value='unlisted';$('shareResult').hidden=true;$('shareStatus').textContent='';share.showModal();
  };
  $('shareForm').onsubmit=async e=>{
    e.preventDefault();$('createShare').disabled=true;$('shareResult').hidden=true;$('shareStatus').textContent='Creating your 3D view…';
    try{
      if(!current||!orbitView)throw Error('Open a design with a 3D view first.');
      const owner=$('shareOwner').value.trim(),data={...orbitView.shareGeometry(),title:$('shareTitle').value.trim(),owner,bike:$('shareBike').value.trim(),notes:$('shareNotes').value.trim(),scope:$('shareScope').value};
      const {id}=await api('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const link=new URL(location.pathname,location.origin);link.searchParams.set('design',id);
      $('shareLink').value=link.href;$('previewShare').href=link.href;$('shareResult').hidden=false;
      $('shareStatus').textContent=data.scope==='public'?'Published to the public library.':'Link created. Anyone with this link can view the design.';localStorage.setItem('motopack.shareNickname',owner);
    }catch(e){$('shareStatus').textContent=message(e);}finally{$('createShare').disabled=false;}
  };
  $('copyShare').onclick=async()=>{try{await navigator.clipboard.writeText($('shareLink').value);$('shareStatus').textContent='Link copied.';}catch{$('shareLink').select();$('shareStatus').textContent='Copy the selected link.';}};
  async function loadLibrary(more=false){
    if(!library.open)library.showModal();
    const list=$('publicBuilds');if(!more){list.replaceChildren();cursor=null;}
    $('moreDesigns').hidden=true;$('libraryStatus').textContent='Loading designs…';
    try{
      const data=await api(cursor?'?cursor='+encodeURIComponent(cursor):'');
      for(const item of data.items){
        const button=document.createElement('button');button.className='secondary';button.textContent=item.title+' · by '+item.owner+(item.bike?' · '+item.bike:'');
        button.onclick=()=>openView(item.id);list.append(button);
      }
      cursor=data.cursor;$('moreDesigns').hidden=!cursor;$('libraryStatus').textContent=list.children.length?'Select a design to explore in 3D.':'No designs have been published yet.';
    }catch(e){$('libraryStatus').textContent=message(e);}
  }
  async function openView(id){
    const token=++viewRequest;dispose?.();dispose=null;
    if(!viewer.open)viewer.showModal();
    $('sharedStatus').textContent='Loading 3D view…';$('sharedTitle').textContent='Shared design';$('sharedBy').textContent=$('sharedNotes').textContent='';
    try{
      const data=await api('/'+encodeURIComponent(id));if(token!==viewRequest)return;
      $('sharedTitle').textContent=data.title;$('sharedBy').textContent='By '+data.owner+(data.bike?' · '+data.bike:'');$('sharedNotes').textContent=data.notes;
      dispose=drawSharedDesign($('sharedScene'),data);$('sharedStatus').textContent='Drag to rotate. Scroll or pinch to zoom.';
    }catch(e){if(token===viewRequest)$('sharedStatus').textContent=message(e);}
  }
  viewer.addEventListener('close',()=>{viewRequest++;dispose?.();dispose=null;});
  document.querySelectorAll('[data-close-share]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
  document.querySelectorAll('[data-open-library]').forEach(button=>button.onclick=()=>{if(viewer.open)viewer.close();loadLibrary();});
  $('moreDesigns').onclick=()=>loadLibrary(true);
  const id=new URLSearchParams(location.search).get('design');if(id)window.addEventListener('load',()=>openView(id));
})();

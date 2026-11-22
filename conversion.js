let openConversionPhoto,openConversionEditor,setSketchPractice;
const sampleMeshes=new Map();
const motorLibrary={
  qsTop:{name:'QS138 V3 70H · top mount',file:'qs138with top mount.stl',shaft:[175,133.4]},
  qsCut:{name:'QS138 V3 70H · top mount removed',file:'138v370h top cutoff.stl',shaft:[162.7,133.35]}
};
function motorStlBytes(key){return Uint8Array.from(atob(qsMotorStls[key]),c=>c.charCodeAt(0));}
function libraryMotorMesh(key){
  const bytes=motorStlBytes(key);
  // The cut-off export also contains the discarded lug as its last disconnected body.
  // Keep the original bytes for download and omit that body from the mounted assembly.
  let mounted=bytes;
  if(key==='qsCut'){
    const motorTriangles=6234;
    mounted=bytes.slice(0,84+50*motorTriangles);
    new DataView(mounted.buffer).setUint32(80,motorTriangles,true);
  }
  const mesh=layoutStlMesh(mounted.buffer,1),[cx,cz]=motorLibrary[key].shaft;
  const faces=new Uint8Array(mesh.i.length/3);
  for(let t=0;t<faces.length;t++){
    // The disc spans 16–23 mm behind the shaft tip on both corrected exports.
    const face=mesh.v.slice(t*9,t*9+9);
    const y=[face[1],face[4],face[7]].map(n=>n-mesh.lo[1]);
    const radii=[0,3,6].map(k=>Math.hypot(face[k]-cx,face[k+2]-cz));
    faces[t]=Math.min(...y)>15.99&&Math.max(...y)<23.01&&Math.max(...radii)>25;
  }
  mesh.sprocketFaces=faces;
  return mesh;
}
function resolvedFrameAsset(asset){
  if(!asset.sample)return asset;
  if(!sampleMeshes.has(asset.sample)){
    if(Object.hasOwn(motorLibrary,asset.sample)){
      const motor=libraryMotorMesh(asset.sample);
      sampleMeshes.set(asset.sample,motor);
      return motor;
    }
    const src=conversionSamples[asset.sample],decode=(str,ArrayType)=>new ArrayType(Uint8Array.from(atob(str),c=>c.charCodeAt(0)).buffer);
    sampleMeshes.set(asset.sample,{lo:src.lo,hi:src.hi,ends:src.ends,
      v:Array.from(decode(src.v,Int32Array),x=>x/1000),i:Array.from(decode(src.i,Uint32Array))});
  }
  return sampleMeshes.get(asset.sample);
}
function* conversionBodies(){
  yield* assemblyBodies(current);
  for(const part of frameParts){
    const asset=resolvedFrameAsset(part.asset);
    if(asset.image)continue;
    const center=asset.lo.map((n,i)=>(n+asset.hi[i])/2);
    const rot=new THREE.Euler(...part.rotation.map(n=>n*Math.PI/180)),pos=new THREE.Vector3(...part.position);
    const vertices=[];
    for(let k=0;k<asset.v.length;k+=3){
      vertices.push(new THREE.Vector3(...center.map((n,j)=>asset.v[k+j]-n)).applyEuler(rot).add(pos).toArray());
    }
    let start=0,body=0;
    for(const end of asset.ends||[asset.i.length]){
      const triangles=[];
      for(let i=start;i<end;i+=3)triangles.push([vertices[asset.i[i]],vertices[asset.i[i+1]],vertices[asset.i[i+2]]]);
      if(triangles.length)yield [part.name.replace(/[^ -~]/g,' ')+(asset.ends?.length>1?' '+(++body):''),triangles];
      start=end;
    }
  }
}
function designSummary(){
  const {c,m,shell}=current;
  return {dimensions:[c.length,c.width,shell.peak].map(v=>+v.toFixed(2)),outline:(shell.profile||shell.roof).map(p=>p.map(v=>+v.toFixed(2))),
    axis:c.axis,pattern:c.pattern,cells:m.count,series:c.series,banks:c.banks,parts:frameParts.map(p=>p.role)};
}
const money=n=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
let refillWizardDirection;
function initConversion(){
  const dialog=$('conversion'),steps=[...$('convSteps').children],pages=[...dialog.querySelectorAll('[data-page]')];
  $('controls').before(dialog);
  function openDock(){if(!dialog.open)dialog.show();}
  function finishDock(){
    dialog.close();
    if($('controls').hidden)$('toggleSetup').click();
    $('guidedReturn').hidden=false;
  }
  let fitTimer;
  let step=0,editingId=null,shapeRole='Other',needsFit=false;
  initBuildLanding();

  const board=guidedMotorBoard();
  $('guidedReturn').onclick=()=>{if(caseSketch?.closed&&caseSketch!==reference?.drawing)resumeBuild();else showStep(step);};
  let reference=null,outlineReady=false,motorOK=false,motorId=null,motorPhoto=null;
  const stepNames=['Frame','Motor','Enclosure','Battery','Current paths','Protection','Export'];
  const nextNames=['Place motor','Draw enclosure','Size battery','Plan current paths','Plan protection','Print & export','Open advanced builder'];
  function page(n){
    dialog.dataset.step=n;step=n;
    pages.forEach((p,i)=>p.hidden=i!==n);steps.forEach((b,i)=>{
      b.disabled=false;b.classList.toggle('secondary',i!==n);b.setAttribute('aria-current',i===n?'step':'false');
    });
    $('convTitle').textContent='Step '+(n+1)+' of '+steps.length+' · '+stepNames[n];
    $('guidedReturn').hidden=true;
    $('convPrev').disabled=n===0;$('convNext').textContent=nextNames[n]+(n<6?' →':'');
    clearTimeout(fitTimer);
    if(n===3&&needsFit)scheduleFit();
    if(n===4&&current)$('routingTarget').textContent=seriesFit(current.m.count,current.c,current.m)+' · Each S number identifies one parallel group.';
    if(n===6)showPrintQuote();
    updateNavigation();dialog.scrollTop=0;
    if(n===1){
      showOrientation();
      const part=frameParts.find(p=>p.id===motorId);
      if(outlineReady&&part&&caseSketch)board.restorePart(part,caseSketch);
      const menu=$('wizardMotor'),value=menu.value;
      menu.replaceChildren(...Object.entries(motorLibrary).map(([key,m])=>new Option(m.name,key)));
      const upcoming=document.createElement('optgroup');upcoming.label='Coming soon';
      for(const label of ['QS geared motor lineup','Sotion geared motor lineup']){
        const option=new Option(label);option.disabled=true;upcoming.append(option);
      }
      menu.append(upcoming);menu.value=motorLibrary[value]?value:'qsTop';showMotorPreview();
    }
    if(n===2){
      $('convDraw').textContent=outlineReady?'Edit enclosure outline':'Draw enclosure outline';
      $('outlineGuide').textContent=reference?.drawing.scaleSource==='cad'?'Your frame CAD supplied the scale. Trace the inside opening in the side view.':'Your photo is scaled. Trace the usable space above the motor in the side view.';
      $('outlineState').textContent=outlineReady?'Closed and scaled. Continue to battery sizing.':'A scaled, closed outline is required to continue.';
    }

  }
  function showOrientation(){
    const d=reference?.drawing;
    $('frameOrientation').hidden=!d?.image||outlineReady||!!reference.projected||d.scaleSource==='cad';
    const flipped=!!reference?.originalPhoto;
    $('flipFramePhoto').textContent=flipped?'Restore original photo':'Flip frame photo';
    $('orientationHint').textContent=flipped
      ? 'Frame photo mirrored for motor layout. The motor keeps its actual sprocket orientation. Confirm the chain side on your bike.'
      : 'Check the chain side before placing the motor. If your photo faces the opposite way from the motor’s sprocket view, flip the photo.';
  }
  async function flippedPhoto(image){
    const source=new Image();source.src=image.url;await source.decode();
    const canvas=document.createElement('canvas');canvas.width=image.w;canvas.height=image.h;
    const ctx=canvas.getContext('2d');ctx.translate(image.w,0);ctx.scale(-1,1);ctx.drawImage(source,0,0,image.w,image.h);
    return {...image,url:canvas.toDataURL('image/png')};
  }
  function flipGuide(guide){
    if(!guide)return guide;
    const reflect=points=>points?.map(([x,y])=>[guide.width-x,y]);
    return {...guide,anchors:reflect(guide.anchors),outline:reflect(guide.outline)};
  }
  $('flipFramePhoto').onclick=async()=>{
    const ref=reference,button=$('flipFramePhoto');
    if(!ref||outlineReady)return;
    button.disabled=true;
    try{
      const original=ref.originalPhoto,prior=ref.drawing.image;
      const next=original||ref.flippedImage||await flippedPhoto(prior);
      if(reference!==ref||outlineReady)return;
      ref.originalPhoto=original?null:prior;ref.flippedImage=original?prior:next;
      ref.drawing={...ref.drawing,image:next};ref.practice=flipGuide(ref.practice);
      board.flipPhoto(ref.drawing);showOrientation();
    }catch(e){$('orientationHint').textContent='Could not flip this image. '+e.message;}
    finally{button.disabled=false;}
  };
  function pickReference(d,extra={}){
    if(outlineReady&&caseSketch){
      if(d.image?.url===reference?.drawing.image?.url&&d.scale===reference.drawing.scale){
        showStep(1);return;
      }
      if(!confirm('Replace the frame reference? The current outline and motor placement use its coordinates. A copy of your current build will be kept in the design library.')){
        showStep(0);return;
      }
      $('newDesign').click();
      delete extra.frameId;
    }
    $('shareFramePanel').hidden=!!extra.practice||!!extra.projected?.asset.sample; $('allowFrame').checked=false;$('publicFrameName').value='';$('publishFrame').disabled=false;$('frameShareStatus').textContent='';
    $('batteryMountStatus').textContent='';reference={drawing:d,...extra};board.setReference(d);motorPhoto=null;motorId=null;outlineReady=false;motorOK=false;
    $('rescaleMotor').hidden=true;$('modelStatus').textContent='';showStep(1);
  }
  function prerequisite(destination){
    if(destination>0&&!reference)return [0,'Choose a frame or photo and set its scale.'];
    if(destination>1&&!board.motor&&!motorOK)return [1,'Place a motor or choose “Skip motor” to leave it out.'];
    if(destination>2&&!outlineReady)return [2,'Draw the usable enclosure and connect the last dot to the first.'];
    if(destination>3&&needsFit)return [3,$('wizardFitResult').textContent||'Enter a valid voltage and parallel count, then use AUTO to fit the battery.'];
    return null;
  }
  function updateNavigation(){
    dialog.dataset.outline=String(outlineReady);
    steps.forEach((button,i)=>button.dataset.pending=String(!!prerequisite(i)));
    $('convNext').hidden=false;$('convNext').disabled=false;
  }
  let helpTarget=0;
  function navigate(destination){
    if(step===2&&destination>=3&&outlineReady){
      if(!$('earlyVoltage').reportValidity()||!$('earlySeries').reportValidity())return;
      if(+$('earlyVoltage').value!==caseSketch.targetVolts){
        caseSketch.targetVolts=+$('earlyVoltage').value;readPackControls();needsFit=true;
      }
    }
    if(destination>3&&step===3&&needsFit)fitBattery();
    const block=prerequisite(destination);
    if(block){
      helpTarget=block[0];$('stepHelpReason').textContent=block[1];
      $('stepHelpGo').textContent='Go to '+stepNames[helpTarget];$('stepHelp').showModal();return;
    }
    if(destination===7)finishDock();else page(destination);
  }
  $('stepHelpClose').onclick=()=>$('stepHelp').close();
  $('stepHelpGo').onclick=()=>{$('stepHelp').close();page(helpTarget);};
  function resetWizard(){
    clearTimeout(fitTimer);step=0;reference=motorPhoto=motorId=editingId=null;outlineReady=motorOK=false;
    $('landingResume').hidden=!cloud;board.setReference(null);needsFit=true;
    for(const input of $('sceneLayers').querySelectorAll('input[type=checkbox]'))input.checked=true;
    $('scope').value='all';$('wizardMotor').value='qsTop';updateMotorLinks();orbitView?.refreshFrame(false);
    for(const id of ['earlyVoltage','packVoltage'])$(id).value=72;
    for(const id of ['earlySeries','packSeries'])$(id).value=20;
    $('packPrice').value=5;$('packParallel').value='';$('wCell').value='p42a';
    $('groupProtection').value='';$('protectionWarning').hidden=true;
    for(const id of ['wizardFitResult','packStats','shareStatus','frameWizardStatus','modelStatus'])$(id).textContent='';
    $('guidedReturn').hidden=true;
  }
  $('newDesign').addEventListener('click',resetWizard);
  const cloud=location.hostname==='electricmotogarage.com'||location.hostname==='www.electricmotogarage.com';
  let signedIn=false,entry,verifiedEmail='';

  async function api(path,data){
    const response=await fetch('/MotoPack/account/'+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(verifiedEmail?{'X-MotoPack-Account':verifiedEmail}:{})},body:data?JSON.stringify(data):undefined});
    if(response.status===409&&verifiedEmail){location.reload();throw Error('Account changed. Reopening your workspace.');}
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Account service unavailable. Use Save session to keep a local copy.');
    return response.json();
  }
  function startMoto(){$('newDesign').click();openDock();page(0);}
  function startBattery(){
    if(dialog.open)finishDock();
    openBatteryWizard();
  }
  document.addEventListener('sketchbatterybuild',()=>{
    if(dialog.open)finishDock();
    const c=read();
    document.querySelector('#controls .targetPack').click();
    $('batteryOnlyFields').hidden=false;
    $('batteryName').value=$('projectName').value||'Battery pack';
    const models=$('batteryModel');
    models.querySelector('[value=custom]')?.remove();
    if(c.cellModel==='custom')models.add(new Option('Current custom cell','custom'));
    models.value=c.cellModel;
    $('targetAxis').value=caseSketch.upright?'vertical':caseSketch.endFace?'flat':'cross';
    $('targetBanks').value=caseSketch.flatBanks||c.banks;
    $('targetText').value=Math.round((caseSketch.targetVolts||c.series*c.nominal)/c.nominal)+'S '+targetParallel(c)+'P';
    describeBanks();$('targetText').focus();
  });
  const dashboard=setupBuildDashboard(api,startMoto,startBattery);
  $('landingDashboard').onclick=()=>begin('dashboard');$('landingBattery').onclick=()=>begin('battery');
  $('topDashboard').onclick=()=>{if(dialog.open)finishDock();dashboard.show(true);};
  $('cloudSave').onclick=async()=>{try{const name=await dashboard.save();$('cloudStatus').textContent='Saved '+name+' to My builds.';}catch(e){$('cloudStatus').textContent=e.message;}};
  $('loadCommunity').onclick=async()=>{const list=$('communityList');list.replaceChildren();
    if(!signedIn){list.textContent='Shared frames are available on the signed-in website.';return;}
    try{const entries=await api('frames');if(!entries.length)list.textContent='No frames shared yet.';
      for(const item of entries){const b=document.createElement('button');b.textContent=item.name;list.append(b);b.onclick=async()=>{try{const d=await api(item.id);if(d.model)startFrame(d.model.asset,d.model.rotation,d.name);else pickReference({...d,points:[],loops:[],closed:false,scaleSource:'photo'});}catch(e){list.textContent=e.message;}};}
    }catch(e){list.textContent=e.message;}
  };
  $('publishFrame').onclick=async()=>{
    if(!$('allowFrame').checked||!$('publicFrameName').value.trim()){$('frameShareStatus').textContent='Check the sharing permission and enter a public frame name.';return;}
    if(!signedIn){$('frameShareStatus').textContent='Community publishing requires the signed-in website.';return;}
    try{const d=reference.drawing,p=reference.projected;await api('frames',{consent:true,name:$('publicFrameName').value,drawing:{image:d.image,scale:d.scale},model:p?{asset:p.asset,rotation:p.rotation}:null});$('publishFrame').disabled=true;$('frameShareStatus').textContent='Frame published.';}catch(e){$('frameShareStatus').textContent=e.message;}
  };
  async function begin(destination){
    entry=destination;$('visitorName').value='';$('visitError').textContent='';
    if(location.protocol==='file:')$('visitorNotice').textContent='This offline copy runs on your device. Verified email sign-in is available in the hosted wizard.';
    else if(cloud||builderApi!=='/MotoPack')$('visitorNotice').textContent='Enter your email to start. Electric Moto Garage records your email and connection IP at check-in. Your builds stay in this browser until you download or share them.';
    $('localName').hidden=false;$('visitorName').required=true;$('visitStart').hidden=false;$('cloudLogin').hidden=true;
    $('visitorDialog').showModal();
  }
  $('visitCancel').onclick=()=>$('visitorDialog').close();
  $('visitorForm').onsubmit=async e=>{
    e.preventDefault();
    const name=$('visitorName').value.trim();
    if(!name){$('visitError').textContent='Enter your email to start.';return;}
    $('visitStart').disabled=true;$('visitCancel').disabled=true;
    try{
      if(location.protocol!=='file:'){
        const res=await fetch(cloud&&signedIn?'/MotoPack/account/visit':builderApi+'/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,agreed:true})});
        if(!res.ok)throw Error('Could not save your check-in. Please try again.');
      }
      $('visitorDialog').close();$('visitorName').value='';
      if($('welcome').open)$('welcome').close();
      if(entry==='dashboard'){await dashboard.show();return;}
      if(entry==='battery'){startBattery();return;}
      if(entry==='resume'){resumeBuild();return;}
      if(entry==='advanced'){if(dialog.open)finishDock();return;}
      $('newDesign').click();openDock();page(0);
    }catch(error){$('visitError').textContent=error.message;}finally{$('visitStart').disabled=false;$('visitCancel').disabled=false;}
  };
  $('conversionOpen').onclick=$('landingStart').onclick=()=>begin('wizard');
  if(cloud)$('landingResume').hidden=false;
  $('landingResume').onclick=()=>begin('resume');
  document.addEventListener('designrestored',()=>{
    const available=!!(caseSketch?.closed&&caseSketch.image&&caseSketch.scale);
    $('landingResume').hidden=!available&&!cloud;$('guidedReturn').hidden=!available;
    if(dialog.open&&available)resumeBuild();
    else if(!available){resetWizard();if(dialog.open)page(0);}
  });
  function resumeBuild(){
    if(!caseSketch?.closed||!caseSketch.image)return;
    reference={drawing:caseSketch,frameId:frameParts.find(p=>p.role==='Frame')?.id};
    board.setReference(caseSketch);
    const part=frameParts.find(p=>p.id===caseSketch.wizardMotorId)||frameParts.find(p=>p.role==='Motor');
    motorId=part?.id;motorPhoto=null;
    if(part){board.restorePart(part,caseSketch);if(motorLibrary[part.asset.sample])$('wizardMotor').value=part.asset.sample;}
    motorOK=outlineReady=true;readPackControls();
    $('packParallel').value=caseSketch.requestedParallel??'';
    $('groupProtection').value=caseSketch.groupProtection||'';$('protectionWarning').hidden=$('groupProtection').value!=='none';
    const {c,m,shell}=current;
    const parallel=activeParallel(m.count,c,m);
    describeFit(c,m.count,parallel,$('relativeAxis').value,null,$('packParallel').valueAsNumber);
    $('seriesHint').textContent=c.series+' series groups · '+fmt(c.series*c.nominal)+' V nominal';
    $('packParallel').placeholder='Auto · '+Math.floor(m.count/c.series)+'P';
    if(shell.cells.some(cell=>cell.status!=='clear')){
      $('wizardFitResult').textContent+=' Check the highlighted enclosure contacts or use AUTO to recalculate.';
      needsFit=true;
    }
    showStep(needsFit?2:3);
  }
  $('landingBuilder').onclick=()=>begin('advanced');
  $('convClose').onclick=finishDock;steps.forEach((b,i)=>b.onclick=()=>navigate(i));
  $('convPrev').onclick=()=>page(step-1);
  dialog.addEventListener('click',e=>{
    if(['wBms','wWires','wPower','wLiner','demoEdit'].includes(e.target.id))$('guidedReturn').hidden=false;
  },true);
  $('convNext').onclick=()=>navigate(step+1);
  $('ktmPreview').src=conversionSamples.photo;$('frameThumb').src=conversionSamples.frameDrawing;
  document.querySelector('.uploadPic').style.backgroundImage='linear-gradient(#11243b55,#11243b66),url("'+conversionSamples.photo+'")';
  const practiceBike={width:2078,height:1460,anchors:[[641,791],[965,668]],mm:214.5573,
    outline:[[637,817],[623,684],[641,591],[845,545],[886,557],[914,606],[929,647],[954,696],[1008,714],[1096,848],[738,983],[731,945],[692,927],[649,833]]};
  async function photo(file,distance,scaleGuide){
    const fromWizard=dialog.open;
    if(fromWizard){
      try{
        if(/\.(step|stp|stl)$/i.test(file.name)){
          const stl=/\.stl$/i.test(file.name);
          const asset=stl?await readLayoutStl(file,1):await importStepMesh(file);
          const spans=asset.hi.map((n,i)=>n-asset.lo[i]),n=spans.indexOf(Math.min(...spans));
          startFrame(asset,n===2?[-90,0,0]:n===0?[0,0,90]:[0,0,0],file.name);return;
        }
        let drawing;
        if(/\.svg$/i.test(file.name)){
          const v=await frameDrawing(file),img=new Image();img.src=v.image;await img.decode();
          drawing={name:file.name,image:{url:v.image,w:img.width,h:img.height},scale:v.physical?v.physical/img.width:null,points:[],loops:[],closed:false,endFace:false,autoPlace:true};
          if(drawing.scale){drawing.scaleSource='cad';pickReference(drawing);return;}
        }
        dialog.close();
        openConversionEditor({drawing,scaleOnly:'frame',async finish(applied,d){
          if(!applied){showStep(0);return;}
          if(scaleGuide===excTape){
            try{
              const image=await flippedPhoto(d.image);
              pickReference({...d,image},{originalPhoto:d.image,flippedImage:image,practice:flipGuide(excTape)});
            }catch(e){showStep(0);$('frameWizardStatus').textContent='Could not prepare the KTM photo. '+e.message;}
          }else pickReference(d,{practice:scaleGuide||(distance===214.5573?practiceBike:null)});
        }});
        if(drawing){$('skScale').click();return;}
      }catch(e){$('frameWizardStatus').textContent=e.message;return;}
    }
    await openConversionPhoto(file);
    if(distance){
      const spec=scaleGuide||(distance===214.5573?practiceBike:{width:1526,height:1502,anchors:[[762,1158],[1084,785]]});
      setSketchPractice({...spec,mm:distance});
      $('skDistance').value=distance;$('skScale').click();
      $('skStatus').textContent='Click the two blue endpoints of the orange line, then set the marked '+distance+' mm distance.';
    }

  }
  $('bikeUpload').onclick=()=>$('bikeFile').click();
  $('bikeFile').onchange=()=>{const f=$('bikeFile').files[0];$('bikeFile').value='';if(f)photo(f);};
  async function referencePhoto(src,name,type,distance,guide){
    const data=src.startsWith('data:')
      ? Uint8Array.from(atob(src.slice(src.indexOf(',')+1)),c=>c.charCodeAt(0))
      : await (await fetch(src)).blob();
    await photo(new File([data],name,{type}),distance,guide);
  }
  function practicePhoto(key,name,distance){
    return ()=>referencePhoto(conversionSamples[key],name,'image/jpeg',distance);
  }
  $('bikeSample').onclick=practicePhoto('photo','KTM 85cc small-wheel.jpg',214.5573);
  const excTape={width:1070,height:1156,anchors:[[332,709],[758,690]],mm:200};
  $('excSample').onclick=$('libExc').onclick=()=>referencePhoto(
    $('excSide').src,'KTM 450 EXC circa 2005.webp','image/webp',excTape.mm,excTape);
  $('skBikePhoto').onclick=$('bikeSample').onclick;
  $('skFrameDrawing').onclick=practicePhoto('frameDrawing','Older KTM frame - measured CAD side view.jpg',249.3983);
  $('getFrame').onclick=async()=>{
    const button=$('getFrame');button.disabled=true;
    try{
      const bytes=Uint8Array.from(atob(conversionSamples.Frame.source),c=>c.charCodeAt(0));
      const decoded=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      saveBlob('KTM 2016.step',await new Response(decoded).blob(),'application/step');
    }catch(e){$('frameStatus').textContent='Could not open the original STEP. '+e.message;}finally{button.disabled=false;}
  };
  $('getMotorStl').onclick=()=>{
    const key=$('libraryMotorVariant').value;
    saveBlob(motorLibrary[key].file,motorStlBytes(key),'application/octet-stream');
  };
  function commitPart(changes,id){
    if(!current)throw Error('Complete the current pack dimensions before placing a part.');
    if(id)replaceFramePart(id,changes);
    else{
      const part={id:crypto.randomUUID(),position:[current.c.length/2,current.c.width/2,current.shell.peak/2],rotation:[0,0,0],visible:true,...changes};
      validateFrameParts([part]);frameParts=[...frameParts,part];id=part.id;
    }
    selectPlacement(id);$('frameDrag').checked=true;orbitView?.refreshFrame(true);scheduleSave();
  }
  function demo(sample,name){
    try{
      const role=sample==='Frame'?'Frame':'Motor';
      const copies=frameParts.filter(p=>p.role===role).length;
      let copyName=name;
      for(let n=2;frameParts.some(p=>p.name===copyName);n++)copyName=name+' '+n;
      const center=[current.c.length/2,current.c.width/2,current.shell.peak/2];
      // Start with the head tube above the cradle and the shaft across the frame.
      const position=sample==='Frame'?[center[0],center[1],center[2]-35]:[center[0]+70,center[1],-90];
      const mesh=resolvedFrameAsset({sample}),widthAxis=role==='Frame'?2:1;
      position[1]+=copies*(mesh.hi[widthAxis]-mesh.lo[widthAxis]+10);
      commitPart({role,name:copyName,asset:{sample},position,rotation:[role==='Frame'?-90:0,0,0]});
      if(dialog.open)page(step);
      $('frameStatus').textContent=$('modelStatus').textContent=copyName+' added. Drag in the viewer or use the position fields.';
      return activeFramePart();
    }catch(e){$('frameStatus').textContent=$('modelStatus').textContent=e.message;}
  }
  $('libFrame').onclick=()=>demo('Frame','Older KTM frame');
  for(const [key,model] of Object.entries(motorLibrary))$('libraryMotorVariant').add(new Option(model.name,key));
  $('libMotor').onclick=()=>{const key=$('libraryMotorVariant').value;demo(key,motorLibrary[key].name);};
  $('qsMountPhoto').src=qsMountPhoto;
  function showMotorPreview(){
    const value=$('wizardMotor').value,key=frameParts.find(p=>p.id===value)?.asset.sample||value;
    $('qsPreview').hidden=!Object.hasOwn(motorLibrary,key);
    if(!$('qsPreview').hidden)drawMotorProfile($('motorProfile'),key);
  }
  $('wizardMotor').onchange=showMotorPreview;
  function setMotor(asset,name,photoDraft=null){
    const existing=frameParts.find(p=>p.id===motorId);
    if(outlineReady&&existing){
      const position=[...existing.position];
      if(motorLibrary[asset.sample]&&motorLibrary[existing.asset.sample]){
        // Both library meshes have a measured output shaft. Keep its center fixed through a swap.
        function shaftOffset(a){
          const mesh=resolvedFrameAsset(a),[x,z]=motorLibrary[a.sample].shaft;
          return new THREE.Vector3(x,mesh.lo[1]+19.5,z).sub(new THREE.Vector3(...mesh.lo.map((lo,i)=>(lo+mesh.hi[i])/2)));
        }
        const delta=shaftOffset(existing.asset).sub(shaftOffset(asset)).applyEuler(new THREE.Euler(...existing.rotation.map(THREE.MathUtils.degToRad)));
        position.forEach((_,i)=>position[i]+=delta.getComponent(i));
      }
      commitPart({asset,name,role:'Motor',position},motorId);
    }
    board.place(asset,name);motorPhoto=photoDraft;motorOK=true;
    if(!existing)syncMountedMotor();
    $('rescaleMotor').hidden=!photoDraft;$('modelStatus').textContent=name+(outlineReady?' installed. Your enclosure and cell layout are saved.':' ready to position.');
    page(1);$('motorBoard').scrollIntoView({block:'nearest'});
  }
  $('demoMotor').onclick=()=>{const key=$('wizardMotor').value;setMotor({sample:key},motorLibrary[key].name);};
  async function scaleMotor(drawing,file){
    dialog.close();openConversionEditor({drawing,scaleOnly:'motor',finish:async(applied,d)=>{
      showStep(1);if(!applied)return;
      const img=new Image();img.src=d.image.url;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
      canvas.getContext('2d').drawImage(img,0,0);
      setMotor({image:canvas.toDataURL('image/png'),width:d.image.w*d.scale,height:d.image.h*d.scale},d.name,d);
    }});
    if(file)await openConversionPhoto(file);$('skScale').click();
  }
  $('uploadMotor').onclick=()=>$('motorFile').click();
  $('motorFile').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    try{
      if(/\.stl$/i.test(file.name))setMotor(await readLayoutStl(file,1),file.name);
      else if(/\.(step|stp)$/i.test(file.name))setMotor(await importStepMesh(file),file.name);
      else if(/\.svg$/i.test(file.name)){
        const v=await frameDrawing(file),img=new Image();img.src=v.image;await img.decode();
        const d={name:file.name,image:{url:v.image,w:img.width,h:img.height},points:[],loops:[],closed:false,scale:v.physical?v.physical/img.width:null};
        if(v.physical)setMotor({image:v.image,width:v.physical,height:v.physical/v.ratio},file.name);
        else await scaleMotor(d);
      }else await scaleMotor(null,file);
    }catch(error){$('modelStatus').textContent=error.message;}
  };
  function syncMountedMotor(){
    if(!outlineReady||!caseSketch||!board.motor)return;
    motorId=board.stamp(caseSketch,commitPart,motorId);caseSketch.wizardMotorId=motorId;
    $('frameDrag').checked=false;
  }
  // Stamp on release to keep dragging responsive on large frame meshes.
  $('motorBoard').addEventListener('pointerup',syncMountedMotor);
  $('motorBoard').addEventListener('keyup',syncMountedMotor);
  $('motorAngle').addEventListener('change',syncMountedMotor);
  $('rescaleMotor').onclick=()=>scaleMotor(structuredClone(motorPhoto));
  $('motorContinue').onclick=()=>showStep(2);
  $('demoEdit').onclick=()=>{dialog.close();$('goFrame').click();if(activeFramePart())$('frameDrag').checked=true;};
  function shape(edit=false,role='Other'){
    const part=edit&&activeFramePart(),spec=part?.primitive||{kind:'tray',L:180,W:110,H:25,Wall:2};
    shapeRole=part?.role||role;
    if(!part&&shapeRole==='Motor'){spec.kind='block';spec.L=180;spec.W=160;spec.H=160;}
    editingId=part?.id||null;$('shapeKind').value=spec.kind;$('shapeName').value=part?.name||(shapeRole==='Motor'?'Custom motor':'Battery tray');
    for(const key of ['L','W','H','Wall'])$('shape'+key).value=spec[key];
    $('shapeWall').disabled=spec.kind==='block';$('shapeError').textContent='';$('shapeSave').textContent=editingId?'Update object':'Add to assembly';$('partShape').showModal();
  }
  for(const id of ['customPart','convTray','skCustomPart','batteryTray'])$(id).onclick=()=>shape();
  for(const button of document.querySelectorAll('.addKtmPack')){
    button.onclick=()=>{
      const status=button.nextElementSibling;button.disabled=true;
      try{
        const asset=structuredClone(ktmPrebuiltPackMesh);
        commitPart({name:'KTM 20S12P prebuilt battery',role:'Other',asset,rotation:[90,0,0]});
        status.textContent='Pack added. Use Parts and frame layout to move or rotate it.';
      }catch(e){status.textContent='Could not add the pack. '+e.message;}
      finally{button.disabled=false;}
    };
  }
  $('batteryBar').onclick=()=>{
    shape();$('shapeKind').value='block';$('shapeWall').disabled=true;
    $('shapeName').value='Battery hold-down bar';
    $('shapeL').value=20;$('shapeW').value=Math.ceil(current?.c.width||110);$('shapeH').value=4;
  };
  $('shapeEdit').onclick=()=>shape(true);$('shapeCancel').onclick=()=>$('partShape').close();
  $('shapeKind').onchange=()=>{$('shapeWall').disabled=$('shapeKind').value==='block';};
  $('shapeSave').onclick=()=>{
    try{
      const kind=$('shapeKind').value,spec={kind};
      for(const key of ['L','W','H','Wall']){
        const input=$('shape'+key);if(!input.disabled&&!(input.valueAsNumber>0&&input.checkValidity()))throw Error('Enter a positive dimension within the field limits.');
        spec[key]=input.valueAsNumber||2;
      }
      const {L,W,H,Wall}=spec;let triangles;
      if(kind==='tray')triangles=bmsBoxMesh({bmsWall:Wall,bmsL:L,bmsW:W,bmsH:H});
      else{
        const geo=new THREE.BoxGeometry(L,W,H).toNonIndexed(),p=geo.attributes.position;triangles=[];
        for(let i=0;i<p.count;i+=3)triangles.push([0,1,2].map(j=>[p.getX(i+j)+L/2,p.getY(i+j)+W/2,p.getZ(i+j)+H/2]));
        geo.dispose();
      }
      const v=triangles.flat(2),asset={v,i:Array.from({length:v.length/3},(_,i)=>i),lo:[0,0,0],hi:[L,W,H]};
      if(dialog.open&&shapeRole==='Motor'&&!editingId){$('partShape').close();setMotor(asset,$('shapeName').value.trim()||'Custom motor');return;}
      commitPart({asset,primitive:spec,name:$('shapeName').value.trim()||'Custom object',role:shapeRole},editingId);
      if(dialog.open&&step===2)$('batteryMountStatus').textContent=activeFramePart().name+' added to the assembly.';
      $('partShape').close();$('frameStatus').textContent=activeFramePart().name+(outlineReady?' installed. Your enclosure and cell layout are saved.':' ready to position.');if(dialog.open)page(step);
    }catch(e){$('shapeError').textContent=e.message;}
  };
  $('quickDepth').oninput=e=>{
    if(caseSketch&&e.target.value&&e.target.checkValidity()){
      fields[caseSketch.endFace?'length':'width'].value=e.target.value;render();
    }
  };
  $('quickDepth').onblur=()=>{if(caseSketch&&current)$('quickDepth').value=current.c[caseSketch.endFace?'length':'width'];};
  for(const option of fields.pattern.options)$('fillPattern').add(new Option(option.text,option.value));
  $('fillPattern').oninput=e=>{e.stopPropagation();$('skFillResult').textContent='Press Fill to apply this pattern.';};
  function showStep(n){openDock();page(n);}
  document.addEventListener('wallchanged',()=>{
    if(reference){reference.drawing=caseSketch;needsFit=true;if(step===3&&dialog.open)scheduleFit();}
  });
  function startEnclosure(){
    if(!$('earlyVoltage').reportValidity()||!$('earlySeries').reportValidity())return;
    reference.drawing.targetVolts=+$('earlyVoltage').value;
    const {projected}=reference;
    dialog.close();
    openConversionEditor({drawing:structuredClone(reference.drawing),overlay:board.motor,finish(applied,d){
      if(!applied){showStep(2);return;}
      if(projected){
        const [x,z]=sketchTransform(d)(projected.center),depth=d.endFace?current.c.length:current.c.width;
        const position=d.endFace?[depth/2,x,z]:[x,depth/2,z];
        const rot=new THREE.Quaternion().setFromEuler(new THREE.Euler(...projected.rotation.map(THREE.MathUtils.degToRad)));
        if(d.endFace)rot.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2));
        const angles=new THREE.Euler().setFromQuaternion(rot);
        commitPart({asset:projected.asset,role:'Frame',name:d.name,position,rotation:[angles.x,angles.y,angles.z].map(THREE.MathUtils.radToDeg)},reference.frameId);
        reference.frameId=selectedFrameId;
      }
      if(board.motor){motorId=board.stamp(d,commitPart,motorId);d.wizardMotorId=motorId;}
      $('landingResume').hidden=false;
      $('frameDrag').checked=false;reference.drawing=d;outlineReady=true;render();readPackControls();needsFit=true;showStep(3);
    }});
    if(reference.practice)setSketchPractice(reference.practice);
  }
  function startFrame(asset,rotation,name){
    const projected={...frameProjection(asset,rotation,name),asset,rotation};
    pickReference(projected.drawing,{projected,frameId:frameParts.find(p=>asset.sample&&p.asset.sample===asset.sample)?.id});
  }
  $('demoFrame').onclick=()=>startFrame({sample:'Frame'},[-90,0,0],'Older KTM frame');
  $('convDraw').onclick=startEnclosure;
  $('skipMotor').onclick=()=>{if(motorId){frameParts=frameParts.filter(p=>p.id!==motorId);motorId=null;render();}board.clear();motorPhoto=null;$('rescaleMotor').hidden=true;motorOK=true;page(2);};
  $('motorBlock').onclick=()=>shape(false,'Motor');
  $('motorTrace').onclick=()=>{
    dialog.close();let asset;
    openConversionEditor({motor:true,drawing:{...(motorPhoto||reference.drawing),points:[],closed:false},makeMotor(d,depth){asset=motorOutlineAsset(d,depth);},
      finish(applied){showStep(1);if(applied)setMotor(asset,'Traced motor');}});
  };
  function cellVoltage(){return cellById.get($('wCell').value)?.nominal||current?.c.nominal||3.6;}
  function setVoltageRange(){for(const id of ['earlyVoltage','packVoltage']){$(id).min=fmt(10*cellVoltage());$(id).max=fmt(32*cellVoltage());}}
  function readPackControls(){
    if(!current)return;
    $('wCell').value=current.c.cellModel;
    setVoltageRange();
    $('earlyVoltage').value=$('packVoltage').value=caseSketch.targetVolts||current.c.series*current.c.nominal;
    $('earlySeries').value=$('packSeries').value=Math.round(+$('packVoltage').value/cellVoltage());
    $('packPrice').value=caseSketch.unitPrice??5;
    $('wCell').querySelector('[value=custom]').hidden=current.c.cellModel!=='custom';
  }
  for(const [volts,series] of [['earlyVoltage','earlySeries'],['packVoltage','packSeries']]){
    $(volts).oninput=()=>{if($(volts).value&&$(volts).checkValidity())$(series).value=Math.round(+$(volts).value/cellVoltage());if(step===3)scheduleFit();};
    $(series).oninput=()=>{if($(series).value&&$(series).checkValidity())$(volts).value=fmt(+$(series).value*cellVoltage());if(step===3)scheduleFit();};
  }
  function scheduleFit(){
    clearTimeout(fitTimer);needsFit=true;
    updateNavigation();
    const v=$('packVoltage').valueAsNumber,series=Math.round(v/cellVoltage());
    $('seriesHint').textContent=$('packVoltage').checkValidity()?series+' series groups · '+fmt(series*cellVoltage())+' V nominal':'Choose a voltage between '+$('packVoltage').min+' and '+$('packVoltage').max+' V.';
    $('wizardFitResult').textContent='';$('packStats').textContent='';
    if(['packVoltage','packSeries','packPrice','packParallel'].every(id=>$(id).checkValidity()))fitTimer=setTimeout(fitBattery,100);
  }
  function describeFit(cfg,total,parallel,chosen,angle,wanted){
    const out=$('wizardFitResult'),series=cfg.series,maxP=Math.floor(total/series),spare=total-series*parallel;
      out.textContent=total+' cell positions · '+(cfg.axis==='vertical'?cfg.banks+' upright tiers':(chosen==='along'?cfg.banks+' end to end':cfg.banks+' across'))+' · '+(angle==null?'current placement. ':fmt(angle)+'° tilt. ')+
        (parallel?series+'S'+parallel+'P · '+fmt(parallel*cfg.cellAh)+' Ah · '+(total-spare)+' active cells'+(spare?' + '+spare+' spare positions.':'.'):
        'This voltage needs at least '+series+' cells. Choose a lower voltage or a larger enclosure.');
      const count=series*parallel,cell=cellById.get(cfg.cellModel),amps=cell?.amps*parallel;
      const stats=['Active cells '+money(count*(caseSketch.unitPrice??5))];
      if(amps)stats.push(fmt(amps)+' A cell-based ceiling'+(cell.condition?' ('+cell.condition+')':''),fmt(amps*series*cfg.nominal)+' W nominal');
      if(cell)stats.push(fmt(count*cell.grams/453.59237+2)+' lb including 2 lb consumables');
      $('packStats').textContent=parallel?stats.join(' · '):'';
      $('cellStore').hidden=cfg.cellModel!=='p42a';
      needsFit=!parallel||wanted>maxP;
      if(wanted>maxP)out.textContent+=' Requested '+series+'S'+wanted+'P needs '+(series*wanted-total)+' more positions. Reduce P or enlarge the enclosure.';
  }
  document.addEventListener('viewerarrayedited',()=>{
    if(!dialog.open||step<3||!caseSketch)return;
    clearTimeout(fitTimer);
    if(!current){needsFit=true;$('wizardFitResult').textContent='Check the cell array dimensions.';}
    else{
      const {c,m,shell}=current;
      caseSketch.flatBanks=c.banks;
      describeFit(c,m.count,activeParallel(m.count,c,m),caseSketch.guidedDirection,null,$('packParallel').valueAsNumber);
      if(shell.cells.some(cell=>cell.status!=='clear')||shell.warnings.length){
        needsFit=true;$('wizardFitResult').textContent+=' Check the enclosure contacts or use AUTO to refit.';
      }
      $('routingTarget').textContent=seriesFit(m.count,c,m)+' · Each S number identifies one parallel group.';
    }
    updateNavigation();
  });
  document.addEventListener('packtargetbuilt',()=>{
    clearTimeout(fitTimer);readPackControls();
    const {c,m}=current;$('packParallel').value=c.parallel;
    describeFit(c,m.count,c.parallel,caseSketch.guidedDirection,null,c.parallel);
    page(4);
  });
  function fitBattery(direction){
    clearTimeout(fitTimer);
    if(!caseSketch||!current||step!==3||!dialog.open||!['packVoltage','packSeries','packParallel','packPrice'].every(id=>$(id).reportValidity()))return;
    const out=$('wizardFitResult'),series=Math.round($('packVoltage').valueAsNumber/cellVoltage());
    const cfg=sketchPackConfig(caseSketch,{...current.c,...(cellById.has($('wCell').value)?cellSettings($('wCell').value):{})},caseSketch.flatBanks||2);
    const chosen=typeof direction==='string'?direction:caseSketch.guidedDirection;
    if(chosen){cfg.axis=chosen==='up'?'vertical':(chosen==='through')===!!caseSketch.endFace?'flat':'cross';cfg.holderShape=chosen==='through'?'contour':'rectangle';}
    Object.assign(cfg,{series,volts:series*cellVoltage(),nominal:cellVoltage(),targetMode:'series',capacityMode:'parallel'});
    try{
      const fit=buildContourPack(cfg,caseProfile(caseSketch));
      if(!fit)throw Error('No layout cleared the case and its current allowances. Go back to adjust the enclosure or its width.');
      const maxP=Math.floor(fit.count/series),wanted=$('packParallel').valueAsNumber;
      const parallel=Number.isFinite(wanted)?Math.min(wanted,maxP):maxP;
      Object.assign(caseSketch,{guidedDirection:chosen||$('relativeAxis').value,targetVolts:+$('packVoltage').value,unitPrice:+$('packPrice').value,limitParallel:true,requestedParallel:Number.isFinite(wanted)?wanted:null});
      if(!chosen)caseSketch.guidedDirection=cfg.axis==='vertical'?'up':'through';
      $('packParallel').placeholder='Auto · '+maxP+'P';
      fit.c.parallel=Math.max(1,parallel);placements=fit.pose;
      apply(fit.c);omitted.clear();for(const id of fit.skip)omitted.add(id);
      alternateGroupEnds(fit.c,layout(fit.c,omitted));render();
      describeFit(cfg,fit.count,parallel,chosen,fit.angle,wanted);
      $('earlyVoltage').value=$('packVoltage').value;$('earlySeries').value=series;
    }catch(e){needsFit=true;out.textContent=e.message;$('packStats').textContent='';}
    updateNavigation();
  }
  $('packParallel').oninput=$('packPrice').oninput=scheduleFit;
  $('wCell').oninput=()=>{setVoltageRange();$('packVoltage').value=fmt(+$('packSeries').value*cellVoltage());scheduleFit();};
  refillWizardDirection=value=>{
    if(!dialog.open||step!==3)return false;
    fitBattery(value);return true;
  };
  $('groupProtection').onchange=()=>{
    $('protectionWarning').hidden=$('groupProtection').value!=='none';
    if(caseSketch){caseSketch.groupProtection=$('groupProtection').value;scheduleSave();}
  };
  const merchantId=document.querySelector('meta[name=paypal-merchant]')?.content;
  function paypalLink(sku,title,amount,shipping,custom){
    if(!merchantId)return 'https://electricmotogarage.com/';
    const params=new URLSearchParams({cmd:'_xclick',business:merchantId,currency_code:'USD',item_number:sku,item_name:title,
      amount:amount.toFixed(2),shipping:shipping.toFixed(2),no_shipping:'2',custom,
      notify_url:'https://electricmotogarage.com/api/paypal-ipn',return:'https://electricmotogarage.com/shop/thanks/',cancel_return:'https://electricmotogarage.com/MotoPack/'});
    return 'https://www.paypal.com/cgi-bin/webscr?'+params;
  }
  function updateMotorLinks(){
    const installed=frameParts.find(p=>p.id===motorId)?.asset.sample;
    for(const link of document.querySelectorAll('.motorCheckout')){
      const key=link.closest('[data-page="6"]')&&motorLibrary[installed]?installed:$('wizardMotor').value;
      const variant=(motorLibrary[key]||motorLibrary.qsTop).name;
      if(!merchantId)link.textContent='Ask EMG about the $39 shipped motor print';
      link.href=paypalLink('motopack-qs138-print','QS138 V3 70H fit-check print - '+variant,29,10,variant);
    }
  }
  $('wizardMotor').addEventListener('change',updateMotorLinks);updateMotorLinks();
  $('orderCaseFile').onclick=()=>$('caseSTL').click();
  document.addEventListener('casepanelschanged',()=>{if(dialog.open&&step===6)showPrintQuote();});
  function showPrintQuote(){
    updateMotorLinks();
    if(!current)return;
    const area=Math.round(cardboardPanels(current.c,current.shell,'all').reduce((sum,p)=>sum+Math.abs(sketchArea(p.points)),0));
    const price=Math.max(20,Math.round(area*8/62500*100)/100);
    $('asaEstimate').textContent=Math.round(area).toLocaleString()+' mm² total panel area · '+money(price)+' estimated print charge. $8 per 62,500 mm², $20 minimum. Shipping extra.';
    if(!merchantId)$('printCheckout').textContent='Contact EMG about this print quote';
    $('printCheckout').href=paypalLink('motopack-asa-print','Custom ASA battery case printing (shipping billed separately)',price,0,'area-mm2='+Math.round(area));
  }
  $('convFit').onclick=fitBattery;
  $('wBms').onclick=()=>{dialog.close();if(fields.bmsMode.value==='off'){fields.bmsMode.value='after';render();}$('editBms').click();};
  function openSurface(kind){
    dialog.close();const editor=$('surfaceEditor'),panel=editor.closest('details');panel.open=true;panel.scrollIntoView({block:'center'});
    const type=editor.querySelector('[data-part=kind]');type.value=kind;type.dispatchEvent(new Event('input',{bubbles:true}));
    const thickness=editor.querySelector('[data-part=thickness]');thickness.focus({preventScroll:true});thickness.select();return thickness;
  }
  $('wWires').onclick=()=>openSurface('Wire');
  $('wLiner').onclick=()=>openSurface($('wLinerMaterial').value);
  $('wPower').onclick=()=>{const diameter=openSurface('Wire');diameter.value='';diameter.placeholder='Measured cable OD';};
  for(const id of ['templateOpen','convPrint'])$(id).onclick=()=>{$('paperError').textContent='';$('paperDialog').showModal();};
  $('paperClose').onclick=()=>$('paperDialog').close();
  $('paperDownload').onclick=()=>{
    try{
      if(!current)throw Error('Complete the case dimensions before printing.');
      saveBlob('motoPack-'+$('paperPanels').value+'-'+$('paperSize').value+'.pdf',cardboardPDF(current,$('paperPanels').value,$('paperSize').value),'application/pdf');
    }catch(e){$('paperError').textContent=e.message;}
  };
  for(const id of ['convStep','sceneStep'])$(id).onclick=()=>{
    if(current)saveBlob('dirt-bike-conversion.step',assemblyFile('step',conversionBodies()),'application/step');
  };
  $('exportBrief').onclick=()=>{
    if(!current)return;
    const {c,m,shell}=current,parallel=targetParallel(c),model=cellById.get(c.cellModel)?.name||'Custom';
    const lines=['motoPack conversion · builder notes',caseSketch?.name||'Custom enclosure','',
      'Requested pack: '+c.series+'S'+parallel+'P · '+fmt(c.series*c.nominal)+' V nominal · '+fmt(parallel*c.cellAh)+' Ah',
      'Cell-only price: '+money((caseSketch?.unitPrice??5)*c.series*parallel),'Protection plan: '+(caseSketch?.groupProtection||'Not selected'),'Cell: '+model+' · '+fmt(c.cellAh)+' Ah · '+fmt(c.d)+' mm diameter × '+fmt(c.len)+' mm long',
      'Layout: '+m.count+' positions · up to '+Math.floor(m.count/c.series)+'P at '+c.series+'S · '+c.banks+' bank(s) · '+c.pattern+' rows',
      'Case inside bounds: '+[c.length,c.width,shell.peak].map(fmt).join(' × ')+' mm',
      'Holders: '+(c.holder?'included':'off')+' · row separator: '+c.material,
      'BMS: '+(c.bmsMode==='off'?'space still to plan':[c.bmsL,c.bmsW,c.bmsH].map(fmt).join(' × ')+' mm'),
      'Layout parts: '+(frameParts.map(p=>p.name+(p.asset.image?' (2D reference)':'')).join(', ')||'none'),'',
      'Confirm the printed outline, available depth, motor mounting, cable access and installation path on the bike.'];
    saveBlob('motoPack-builder-notes.txt',lines.join('\n'),'text/plain');
  };
  const hosted=builderApi!=='/MotoPack'||location.protocol.startsWith('http')&&/^\/(?:MotoPack|battery-layout-wizard)\/?$/i.test(location.pathname);
  if(!hosted)$('shareStudy').textContent='Download my summary';
  $('shareStudy').onclick=async()=>{
    const button=$('shareStudy');button.disabled=true;
    try{
      if(!current)throw Error('Complete the case dimensions before sharing.');
      const data=JSON.stringify(designSummary());
      if(!hosted){saveBlob('conversion-summary.json',data,'application/json');$('shareStatus').textContent='Saved locally. You can review the file before sharing it.';return;}
      const res=await fetch(builderApi+'/summary',{method:'POST',headers:{'Content-Type':'application/json'},body:data});
      if(res.status!==201)throw Error('The summary could not be saved. Try again later.');
      $('shareStatus').textContent='Thank you. Electric Moto Garage received your summary.';
    }catch(e){$('shareStatus').textContent=e.message;}finally{button.disabled=false;}
  };
  page(0);
  const start=new URLSearchParams(location.search).get('start');
  if(start==='battery'||start==='motorcycle')setTimeout(()=>begin(start==='battery'?'battery':'wizard'),0);

  if(cloud&&new URLSearchParams(location.search).get('account')==='ready'){
    history.replaceState(null,'',location.pathname);
    queueMicrotask(()=>begin(sessionStorage.getItem('motopack-entry')||'resume'));
  }
}

// Render the selected placement mesh in a fixed sprocket-side elevation.
function drawMotorProfile(canvas,key){
  if(canvas.dataset.variant===key)return;
  canvas.dataset.variant=key;
  const {v,i,lo,hi,sprocketFaces}=resolvedFrameAsset({sample:key});
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const scale=Math.min((w-30)/(hi[0]-lo[0]),(h-22)/(hi[2]-lo[2]));
  const x=n=>w/2+(n-(lo[0]+hi[0])/2)*scale;
  const z=n=>h/2-(n-(lo[2]+hi[2])/2)*scale;
  const triangles=[];
  for(let t=0;t<i.length/3;t++){
    const k=t*9,ax=v[k+3]-v[k],ay=v[k+4]-v[k+1],az=v[k+5]-v[k+2];
    const bx=v[k+6]-v[k],by=v[k+7]-v[k+1],bz=v[k+8]-v[k+2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    if(ny>=0)continue;
    const light=(.25*nx-.65*ny+.5*nz)/Math.hypot(nx,ny,nz);
    const depth=(v[k+1]+v[k+4]+v[k+7])/3;
    const forward=(hi[1]-depth)/(hi[1]-lo[1]);
    const tone=Math.round(35+60*Math.max(0,light)+75*forward);
    triangles.push({k,depth,
      color:sprocketFaces[t]?'#108bff':'rgb('+[tone,tone+8,tone+14].join(',')+')'});
  }
  ctx.clearRect(0,0,w,h);
  for(const {k,color} of triangles.sort((a,b)=>b.depth-a.depth)){
    ctx.beginPath();ctx.moveTo(x(v[k]),z(v[k+2]));ctx.lineTo(x(v[k+3]),z(v[k+5]));ctx.lineTo(x(v[k+6]),z(v[k+8]));ctx.closePath();
    ctx.fillStyle=ctx.strokeStyle=color;ctx.lineWidth=.45;ctx.fill();ctx.stroke();
  }
}

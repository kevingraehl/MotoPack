// The public builder keeps projects on the device until customer account sign-in is configured.
const hostedProjects=false;
const transientProjects=new Map();
const projectStorage=hostedProjects?{
  getItem:key=>transientProjects.get(key)??null,setItem:(key,value)=>transientProjects.set(key,value)
}:localStorage;
let localBuildDB;
function deviceBuilds(method,value){
  localBuildDB??=new Promise((resolve,reject)=>{
    const req=indexedDB.open('motopack-builds',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('builds',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return localBuildDB.then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('builds',method==='put'?'readwrite':'readonly');
    const store=tx.objectStore('builds'),req=method==='getAll'?store.getAll():store[method](value);
    tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error||Error('Device storage unavailable.'));
  }));
}
let buildAutosave;
function setupBuildDashboard(api,openMoto,openBattery){
  const modal=$('buildDashboard'),status=$('dashboardStatus'),list=$('dashboardList');
  let activeId=null,lastDesign=null,pending=null,timer,queue=Promise.resolve(),paused=false,blank=false;
  const notice=text=>{$('autoSaveState').textContent=text;};
  function flush(){
    clearTimeout(timer);
    if(!pending)return queue;
    const item=pending;pending=null;
    const write=queue.catch(()=>{}).then(async()=>{
      if(hostedProjects)await api(item.id==='legacy'?'project':'builds/'+item.id,item.doc);
      else await deviceBuilds('put',item);
      if(item.id===activeId&&!pending){lastSavedView=JSON.stringify(item.doc.view);notice('Saved '+new Date(item.updated).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));}
    });
    queue=write;
    write.catch(()=>{
      if(item.id===activeId&&!pending){pending=item;notice('Autosave failed · export a copy');}
    });
    return write;
  }
  function checkpoint(doc,force=false){
    if(paused)return;
    const signature=JSON.stringify(doc);
    if(lastDesign===null&&!force)lastDesign=signature;
    if(force||signature!==lastDesign){
      lastDesign=signature;blank=false;activeId??=crypto.randomUUID();
      doc.buildId=activeId;
      const date=new Date().toISOString();
      pending={id:activeId,name:doc.name.slice(0,100),updated:date,count:current.m.count,doc:structuredClone({...doc,view:captureView()})};
      notice('Saving…');clearTimeout(timer);timer=setTimeout(flush,1500);
    }
    doc.buildId=activeId;
  }
  function switchBuild(id,isBlank=false){
    flush();activeId=id||null;lastDesign=null;paused=true;blank=isBlank;
  }
  function ready(){
    paused=false;lastSavedView=JSON.stringify(captureView());
    if(current&&activeId)lastDesign=JSON.stringify(snapshot());
  }
  function save(){
    if(!current)throw Error('Finish the current edit before saving.');
    checkpoint(snapshot(),true);scheduleSave();return flush();
  }
  function syncDraft(doc){
    if(!current||(!doc.buildId&&current.m.count===1&&!caseSketch&&!frameParts.length)){
      blank=true;return;
    }
    // A reload can happen between writing the draft and committing its dashboard row.
    const id=activeId,design=lastDesign;
    const sync=async()=>{
      const prior=id&&!hostedProjects?await deviceBuilds('get',id):null;
      if(id!==activeId||design!==lastDesign)return;
      if(prior&&JSON.stringify(prior.doc.settings)===JSON.stringify(doc.settings)&&
         JSON.stringify({...prior.doc,buildId:null,view:null})===JSON.stringify({...doc,buildId:null,view:null}))return;
      await save();
    };
    sync().catch(()=>notice('Autosave failed · export a copy'));
  }
  function minuteSave(){
    if(!paused&&current&&!document.hidden){
      try{
        const viewChanged=activeId&&!pending&&JSON.stringify(captureView())!==lastSavedView;
        checkpoint(snapshot(),!!viewChanged);
        if(pending)scheduleSave();
      }catch{/* Keep the last valid design while a numeric field is being edited. */}
    }
    return flush();
  }
  let lastSavedView='';
  setInterval(minuteSave,60000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  window.addEventListener('pagehide',flush);
  async function show(saveCurrent=false){
    if(!modal.open)modal.showModal();
    list.replaceChildren();status.textContent='Loading builds…';
    $('dashboardScope').textContent=hostedProjects?'Private builds saved to your signed-in account.':'Builds saved on this browser.';
    for(const id of ['dashMoto','dashBattery'])$(id).disabled=true;
    try{
      if(saveCurrent&&current&&!blank)await save();else await flush();
      let items=[];
      if(hostedProjects){
        let cursor;do{const page=await api('builds'+(cursor?'?cursor='+encodeURIComponent(cursor):''));items.push(...page.items);cursor=page.cursor;}while(cursor);
      }else{
        items=await deviceBuilds('getAll');
        for(const [name,doc] of JSON.parse(projectStorage.getItem(storageKey+'.library')||'[]'))items.push({name,doc,updated:'',named:true});
      }
      items.sort((a,b)=>b.updated.localeCompare(a.updated));
      status.textContent=items.length?'Select a build to continue.':'Your saved builds will appear here.';
      for(const item of items){
        const button=document.createElement('button');button.className='secondary';
        let count=item.count;
        if(count==null&&item.doc){try{count=layout({...defaults,...item.doc.settings},new Set(item.doc.omitted)).count;}catch{}}
        button.textContent=[item.name,count!=null?count+(count===1?' cell':' cells'):'',item.updated?new Date(item.updated).toLocaleString():item.named?'Named copy':''].filter(Boolean).join(' · ');
        button.onclick=async()=>{try{
          button.disabled=true;
          const doc=hostedProjects?await api(item.id==='legacy'?'project':'builds/'+item.id):item.doc;
          restore(doc,item.id||null);modal.close();
        }catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
        list.append(button);
      }
      for(const id of ['dashMoto','dashBattery'])$(id).disabled=false;
    }catch(e){status.textContent='Could not save or load builds. '+e.message;}
  }
  $('dashClose').onclick=()=>modal.close();
  $('dashMoto').onclick=()=>{modal.close();openMoto();};
  $('dashBattery').onclick=()=>{modal.close();openBattery();};
  return buildAutosave={show,save:async()=>{const name=snapshot().name;await save();return name;},checkpoint,flush,switchBuild,ready,syncDraft,get id(){return activeId;}};
}

(function(){
  const badge=document.getElementById('releaseNumber');
  const revision=badge.dataset.revision;
  badge.textContent='Rev '+revision;
  if(!location.pathname.startsWith('/motopack-lithium-battery-builder/app'))return;
  const box=document.getElementById('releaseNotice');
  const action=document.getElementById('releaseReload');
  const status=document.getElementById('releaseMessage');
  let latest,checking=false,dismissed;
  async function check(){
    if(document.hidden||checking)return;
    checking=true;
    try{
      const response=await fetch('/motopack-lithium-battery-builder/version.json',{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      if(!/^\d{1,13}$/.test(data.revision)||data.revision===revision||data.revision===dismissed||box.open)return;
      latest=data.revision;
      const editing=!!document.querySelector('dialog[open]');
      status.textContent='Revision '+latest+' is ready. '+(editing?'Finish or apply your current edit before reloading.':'Save your current build and reload to use the latest tools.');
      action.hidden=editing;
      box.showModal();
    }catch{/* Offline users can keep designing. */}
    finally{checking=false;}
  }
  box.addEventListener('close',()=>{dismissed=latest;});
  document.getElementById('releaseLater').onclick=()=>box.close();
  action.onclick=async()=>{
    action.disabled=true;
    try{
      await buildAutosave.save();
      const saved=JSON.parse(projectStorage.getItem(storageKey+'.draft'));
      if(saved?.buildId!==buildAutosave.id||!saved?.settings)throw Error();
      const url=new URL(location.href);url.searchParams.delete('start');location.replace(url.href);
    }catch{status.textContent='The save could not be confirmed. Keep working and download a build file before reloading.';action.disabled=false;}
  };
  badge.onclick=()=>{dismissed=null;check();};
  window.addEventListener('focus',check);
  setInterval(check,60000);
  check();
})();
